import mermaid from "mermaid";

let lastInitMode: "preview" | "png" | null = null;

export const PATENT_THEME_VARIABLES = {
  primaryColor: "#ffffff",
  primaryTextColor: "#000000",
  primaryBorderColor: "#000000",
  lineColor: "#000000",
  secondaryColor: "#ffffff",
  tertiaryColor: "#ffffff",
  background: "#ffffff",
  mainBkg: "#ffffff",
  nodeBorder: "#000000",
  clusterBkg: "#ffffff",
  titleColor: "#000000",
  edgeLabelBackground: "#ffffff",
};

/**
 * Preview uses HTML labels (readable in the DOM). PNG export uses SVG text labels
 * because foreignObject-based HTML labels rasterize as solid black via canvas.
 */
export function ensureMermaidInit(mode: "preview" | "png" = "preview"): void {
  if (lastInitMode === mode) {
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: PATENT_THEME_VARIABLES,
    // Strict keeps HTML/foreignObject out of SVG so canvas export is not tainted.
    securityLevel: mode === "preview" ? "loose" : "strict",
    flowchart: { htmlLabels: mode === "preview", curve: "linear" },
  });
  lastInitMode = mode;
}

let renderCounter = 0;

export function nextMermaidRenderId(prefix = "mermaid"): string {
  renderCounter += 1;
  return `${prefix}-${renderCounter}`;
}
