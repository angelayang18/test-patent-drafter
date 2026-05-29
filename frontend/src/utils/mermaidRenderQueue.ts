/**
 * Mermaid.js does not support concurrent mermaid.render() calls reliably.
 * Serialize all renders so multi-figure preview/export stays fast without races.
 */
let renderChain: Promise<unknown> = Promise.resolve();

export function enqueueMermaidRender<T>(task: () => Promise<T>): Promise<T> {
  const run = renderChain.then(task, task);
  renderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
