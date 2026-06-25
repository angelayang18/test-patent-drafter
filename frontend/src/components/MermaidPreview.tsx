import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaidInit } from "../utils/mermaidPatentTheme";
import { sanitizeMermaidSource } from "../utils/mermaidSanitize";
import { enqueueMermaidRender } from "../utils/mermaidRenderQueue";

interface MermaidPreviewProps {
  source: string;
  className?: string;
}

/** Scale rendered Mermaid SVG to fit its container instead of using fixed pixel dimensions. */
function scaleSvgToContainer(container: HTMLElement): void {
  const svgEl = container.querySelector("svg");
  if (!svgEl) return;
  svgEl.style.maxWidth = "100%";
  svgEl.style.maxHeight = "100%";
  svgEl.style.height = "auto";
  svgEl.style.width = "auto";
}

export default function MermaidPreview({ source, className = "" }: MermaidPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const diagram = sanitizeMermaidSource(source);
    if (!diagram) {
      setError(null);
      container.innerHTML = "";
      return;
    }

    let cancelled = false;
    ensureMermaidInit("preview");

    const render = async () => {
      try {
        setError(null);
        const { svg } = await enqueueMermaidRender(() =>
          mermaid.render(`mermaid-${renderId}`, diagram),
        );
        if (!cancelled) {
          container.innerHTML = svg;
          scaleSvgToContainer(container);
        }
      } catch (err) {
        if (!cancelled) {
          container.innerHTML = "";
          setError(err instanceof Error ? err.message : "Invalid Mermaid syntax");
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [source, renderId]);

  return (
    <div className={`flex flex-col ${className}`}>
      {error && (
        <p className="text-error font-body-sm text-body-sm mb-2">
          Preview error: {error}
        </p>
      )}
      <div
        ref={containerRef}
        className="patent-mermaid-preview flex-1 overflow-auto bg-white border border-outline-variant rounded-lg p-4 min-h-[200px] flex items-center justify-center"
      />
    </div>
  );
}
