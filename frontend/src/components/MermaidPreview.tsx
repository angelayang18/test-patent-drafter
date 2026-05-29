import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaidInit } from "../utils/mermaidPatentTheme";
import { sanitizeMermaidSource } from "../utils/mermaidSanitize";
import { enqueueMermaidRender } from "../utils/mermaidRenderQueue";

interface MermaidPreviewProps {
  source: string;
  className?: string;
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
    <div className={className}>
      {error && (
        <p className="text-error font-body-sm text-body-sm mb-2">
          Preview error: {error}
        </p>
      )}
      <div
        ref={containerRef}
        className="patent-mermaid-preview overflow-x-auto bg-white border border-outline-variant rounded-lg p-4 min-h-[200px] flex items-center justify-center"
      />
    </div>
  );
}
