import { Canvg } from "canvg";
import mermaid from "mermaid";
import { ensureMermaidInit, nextMermaidRenderId } from "./mermaidPatentTheme";
import { prepareMermaidForPngExport } from "./mermaidSanitize";
import { enqueueMermaidRender } from "./mermaidRenderQueue";

const PNG_SCALE = 2;
const MIN_PNG_BYTES = 400;
const MAX_CSS_DIMENSION = 2400;

function parseSvgDimensions(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgEl = doc.documentElement;

  const widthAttr = svgEl.getAttribute("width") ?? "";
  const heightAttr = svgEl.getAttribute("height") ?? "";

  let width =
    widthAttr && !widthAttr.includes("%")
      ? parseFloat(widthAttr.replace(/px$/, ""))
      : 0;
  let height =
    heightAttr && !heightAttr.includes("%")
      ? parseFloat(heightAttr.replace(/px$/, ""))
      : 0;

  if (!width || !height) {
    const viewBox = svgEl.getAttribute("viewBox")?.split(/\s+/).map(Number);
    if (viewBox && viewBox.length === 4) {
      width = viewBox[2] ?? 0;
      height = viewBox[3] ?? 0;
    }
  }

  width = width > 0 ? width : 800;
  height = height > 0 ? height : 600;

  const maxDim = Math.max(width, height);
  if (maxDim > MAX_CSS_DIMENSION) {
    const scale = MAX_CSS_DIMENSION / maxDim;
    width *= scale;
    height *= scale;
  }

  return { width, height };
}

/** Inline styles so canvas rasterization matches the on-screen preview. */
function prepareSvgForRasterization(svg: string): string {
  let prepared = svg.trim();
  if (!prepared.includes('xmlns="http://www.w3.org/2000/svg"')) {
    prepared = prepared.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const styleBlock =
    "<style>svg{background:#ffffff!important}.node rect,.node polygon,.node circle,.node path{fill:#ffffff!important;stroke:#000000!important}.edgePath path,.flowchart-link{stroke:#000000!important}.edgeLabel rect{fill:#ffffff!important}.nodeLabel,.label,text{fill:#000000!important}</style>";
  if (!prepared.includes("<style")) {
    prepared = prepared.replace(/<svg([^>]*)>/, `<svg$1>${styleBlock}`);
  }
  const { width, height } = parseSvgDimensions(prepared);
  if (!/\bwidth="/.test(prepared)) {
    prepared = prepared.replace(/<svg([^>]*)>/, `<svg$1 width="${width}" height="${height}">`);
  }
  return prepared;
}

/** Remove SVG constructs that break canvas export or pull in cross-origin resources. */
function sanitizeSvgForCanvasExport(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return svg;
  }

  const root = doc.documentElement;
  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!root.getAttribute("xmlns:xlink")) {
    root.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }

  doc.querySelectorAll("foreignObject").forEach((node) => node.remove());
  doc.querySelectorAll("script, iframe, object, embed").forEach((node) => node.remove());

  doc.querySelectorAll("image").forEach((node) => {
    const href =
      node.getAttribute("href") ??
      node.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
      "";
    if (href && !href.startsWith("data:")) {
      node.remove();
    }
  });

  doc.querySelectorAll("style").forEach((node) => {
    node.textContent = (node.textContent ?? "")
      .replace(/@import[\s\S]*?;/gi, "")
      .replace(/url\s*\(\s*['"]?https?:[^)]+\)/gi, "none");
  });

  return new XMLSerializer().serializeToString(root);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Failed to encode PNG."));
      },
      "image/png",
    );
  });
}

async function rasterizeWithCanvg(
  ctx: CanvasRenderingContext2D,
  prepared: string,
): Promise<void> {
  const canvg = await Canvg.from(ctx, prepared, {
    ignoreMouse: true,
    ignoreAnimation: true,
  });
  await canvg.render();
}

async function rasterizeWithImageBitmap(
  ctx: CanvasRenderingContext2D,
  prepared: string,
  width: number,
  height: number,
): Promise<void> {
  const svgBlob = new Blob([prepared], { type: "image/svg+xml;charset=utf-8" });
  const bitmap = await createImageBitmap(svgBlob);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
}

async function rasterizeWithBlobImage(
  ctx: CanvasRenderingContext2D,
  prepared: string,
  width: number,
  height: number,
): Promise<void> {
  const objectUrl = URL.createObjectURL(
    new Blob([prepared], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, width, height);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Failed to draw SVG on canvas."));
        }
      };
      img.onerror = () => reject(new Error("Failed to load SVG image."));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const prepared = sanitizeSvgForCanvasExport(prepareSvgForRasterization(svg));
  const { width, height } = parseSvgDimensions(prepared);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * PNG_SCALE);
  canvas.height = Math.ceil(height * PNG_SCALE);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(PNG_SCALE, PNG_SCALE);

  const errors: string[] = [];

  try {
    await rasterizeWithCanvg(ctx, prepared);
    return await canvasToPngBlob(canvas);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(PNG_SCALE, PNG_SCALE);
  }

  if (typeof createImageBitmap === "function") {
    try {
      await rasterizeWithImageBitmap(ctx, prepared, width, height);
      return await canvasToPngBlob(canvas);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(PNG_SCALE, PNG_SCALE);
    }
  }

  try {
    await rasterizeWithBlobImage(ctx, prepared, width, height);
    return await canvasToPngBlob(canvas);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    throw new Error(`Failed to rasterize SVG. ${errors.join(" ")}`.trim());
  }
}

/** Reject empty, tiny, or all-black PNGs (common when labels fail to render). */
export async function isValidFigurePngBlob(blob: Blob): Promise<boolean> {
  if (blob.size < MIN_PNG_BYTES) {
    return false;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const sampleW = Math.min(48, bitmap.width);
    const sampleH = Math.min(48, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return false;
    }
    ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
    bitmap.close();

    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
    let lightPixels = 0;
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r > 240 && g > 240 && b > 240) {
        lightPixels += 1;
      }
      if (r < 20 && g < 20 && b < 20) {
        darkPixels += 1;
      }
    }
    const total = sampleW * sampleH;
    const inkPixels = total - lightPixels;
    return inkPixels >= Math.max(8, total * 0.004) && darkPixels < total * 0.92;
  } catch {
    return false;
  }
}

/** Render Mermaid source to a PNG blob in the browser (no server round-trip). */
export async function renderMermaidToPngBlob(source: string): Promise<Blob> {
  const diagram = prepareMermaidForPngExport(source);
  if (!diagram) {
    throw new Error("Mermaid source is empty.");
  }

  ensureMermaidInit("png");
  const { svg } = await enqueueMermaidRender(() =>
    mermaid.render(nextMermaidRenderId("export"), diagram),
  );
  const blob = await svgToPngBlob(svg);
  if (!(await isValidFigurePngBlob(blob))) {
    throw new Error("Rasterized figure appears blank or invalid.");
  }
  return blob;
}

/** Render Mermaid source to a base64-encoded PNG string (no data: prefix). */
export async function renderMermaidToPngBase64(source: string): Promise<string> {
  const blob = await renderMermaidToPngBlob(source);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
