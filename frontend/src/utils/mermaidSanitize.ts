/** Fix common invalid Mermaid patterns from LLM figure generation. */

const EMPTY_SUBGRAPH_TITLE = /(\bsubgraph\s+[\w-]+)\s*\[\s*(?:""|'')\s*\]/gi;
const SUBGRAPH_DIRECTION = /^\s*direction\s+(?:TB|TD|LR|RL|BT)\s*$/gim;

const MERMAID_INIT_BLOCK = /%%\{init:[\s\S]*?\}%%\s*/g;

export function sanitizeMermaidSource(mermaid: string): string {
  let source = mermaid.trim();
  if (!source) {
    return source;
  }

  source = source.replace(EMPTY_SUBGRAPH_TITLE, "$1");
  source = source.replace(SUBGRAPH_DIRECTION, "");
  source = source.replace(/\n{3,}/g, "\n\n");
  return source.trim();
}

/** Prepare Mermaid for PNG rasterization (svg text labels, not HTML foreignObject). */
export function prepareMermaidForPngExport(mermaid: string): string {
  let source = sanitizeMermaidSource(mermaid);
  // Per-diagram init blocks from the backend can re-enable htmlLabels / foreignObject,
  // which taints canvas export. Theme is applied via mermaid.initialize("png") instead.
  source = source.replace(MERMAID_INIT_BLOCK, "");
  // htmlLabels:false uses the two-character \n sequence for line breaks in labels.
  source = source.replace(/<br\s*\/?>/gi, "\\n");
  return source.trim();
}
