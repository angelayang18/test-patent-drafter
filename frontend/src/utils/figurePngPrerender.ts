import type { PatentFigure } from "../types/patent";
import { prerenderExportFigures } from "../services/api";

/** Bump when rendering logic changes so stale PNGs are not reused. */
const PRERENDER_CACHE_VERSION = "v8";

export function figuresSignature(figures: PatentFigure[]): string {
  return `${PRERENDER_CACHE_VERSION}|${figures.map((f) => `${f.number}:${f.mermaid}`).join("|")}`;
}

let sessionCache: { signature: string; pngs: Record<string, string> } | null = null;
let inFlight: { signature: string; promise: Promise<Record<string, string>> } | null = null;

export function getCachedFigurePngs(signature: string): Record<string, string> | null {
  if (sessionCache?.signature === signature) {
    return sessionCache.pngs;
  }
  return null;
}

export function clearFigurePngSessionCache(): void {
  sessionCache = null;
  inFlight = null;
}

/**
 * Render figure Mermaid diagrams to base64 PNGs for export via the backend.
 *
 * Uses the /export/prerender-figures API endpoint (mmdc or Kroki) for reliable
 * server-side rasterization. Results are cached for the session so
 * Figures → Export navigation is instant.
 */
export async function prerenderFigurePngs(figures: PatentFigure[]): Promise<Record<string, string>> {
  if (figures.length === 0) {
    return {};
  }

  const signature = figuresSignature(figures);
  const cached = getCachedFigurePngs(signature);
  if (cached) {
    return cached;
  }

  if (inFlight?.signature === signature) {
    return inFlight.promise;
  }

  const promise = (async () => {
    const pngs = await prerenderExportFigures(figures);
    sessionCache = { signature, pngs };
    return pngs;
  })();

  inFlight = { signature, promise };
  try {
    return await promise;
  } finally {
    if (inFlight?.signature === signature) {
      inFlight = null;
    }
  }
}
