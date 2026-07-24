import type { InputSources } from "../context/PatentWorkflowContext";
import { ApiError, connectConfluence, scrapeUrl } from "../services/api";

export interface CachedRemoteSources {
  website?: { url: string; content: string }[];
  confluence?: { url: string; spaceKey: string; content: string };
}

export interface GatherSourceTextOptions {
  onProgress?: (message: string) => void;
}

export interface GatheredSourceText {
  combined: string;
  cache: CachedRemoteSources;
}

export interface GatherSourceTextParams {
  buildLocalText: () => string;
  inputSources: InputSources;
  cached?: CachedRemoteSources;
  onProgress?: (message: string) => void;
}

export interface GatherSourceTextResult {
  combined: string;
  cache: CachedRemoteSources;
}

export class SourceGatherError extends Error {
  readonly source: "confluence" | "website";

  constructor(source: "confluence" | "website", message: string) {
    super(message);
    this.name = "SourceGatherError";
    this.source = source;
  }
}

function formatConfluenceError(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.message.trim();
    if (/confluence/i.test(detail)) {
      return detail;
    }
    return `Could not connect to Confluence — ${detail}`;
  }
  return "Could not connect to Confluence — check your URL and credentials.";
}

function formatWebsiteError(err: unknown, url: string): string {
  if (err instanceof ApiError) {
    const detail = err.message.trim();
    if (detail) {
      return `Could not scrape ${url} — ${detail}`;
    }
  }
  return `Could not scrape ${url}.`;
}

function formatWebsiteBlock(url: string, content: string): string {
  return `--- ${url} ---\n${content}`;
}

function formatConfluenceBlock(pages: { title?: string; content: string }[]): string {
  return pages
    .map((p) => `--- ${p.title ?? "Confluence page"} ---\n${p.content}`)
    .join("\n\n");
}

function confluenceCacheKey(inputSources: InputSources): string | null {
  const url = inputSources.confluenceUrl.trim();
  const space = inputSources.confluenceSpaceKey.trim();
  const token = inputSources.confluenceToken.trim();
  if (!url || !space || !token) return null;
  return `${url}|${space}`;
}

function isValidWebsiteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build combined source text for extraction.
 * Fetches website URLs and Confluence in parallel when needed; reuses cached text per URL when unchanged.
 */
export async function gatherCombinedSourceText(
  params: GatherSourceTextParams,
): Promise<GatherSourceTextResult> {
  const { buildLocalText, inputSources, cached = {}, onProgress } = params;
  const parts: string[] = [];
  const local = buildLocalText().trim();
  if (local) parts.push(local);

  const nextCache: CachedRemoteSources = { ...cached };
  const websiteUrls = (inputSources.websiteUrls ?? [])
    .map((url) => url.trim())
    .filter((url) => url.length > 0 && isValidWebsiteUrl(url));
  const confluenceKey = confluenceCacheKey(inputSources);

  const tasks: Promise<void>[] = [];
  const cachedByUrl = new Map(
    (Array.isArray(cached.website) ? cached.website : []).map((entry) => [
      entry.url,
      entry.content,
    ]),
  );
  const websiteEntries: ({ url: string; content: string } | null)[] = websiteUrls.map(
    () => null,
  );

  const urlsNeedingScrape = websiteUrls.filter((url) => {
    const cachedContent = cachedByUrl.get(url);
    return !(typeof cachedContent === "string" && cachedContent.length > 0);
  });
  const needsWebsite = urlsNeedingScrape.length > 0;
  const needsConfluence = Boolean(confluenceKey) && !(
    cached.confluence?.url === inputSources.confluenceUrl.trim() &&
    cached.confluence?.spaceKey === inputSources.confluenceSpaceKey.trim() &&
    cached.confluence.content
  );

  if (needsWebsite && needsConfluence) {
    onProgress?.("Gathering website and Confluence sources…");
  } else if (needsConfluence) {
    onProgress?.("Connecting to Confluence…");
  } else if (needsWebsite) {
    onProgress?.(
      urlsNeedingScrape.length > 1 ? "Scraping websites…" : "Scraping website…",
    );
  }

  if (websiteUrls.length > 0) {
    websiteUrls.forEach((websiteUrl, index) => {
      const cachedContent = cachedByUrl.get(websiteUrl);
      if (typeof cachedContent === "string") {
        websiteEntries[index] = { url: websiteUrl, content: cachedContent };
        return;
      }

      tasks.push(
        (async () => {
          if (!needsConfluence) {
            onProgress?.(
              urlsNeedingScrape.length > 1 ? "Scraping websites…" : "Scraping website…",
            );
          }
          try {
            const scraped = await scrapeUrl(websiteUrl);
            const url = scraped.url ?? websiteUrl;
            const content = scraped.content;
            websiteEntries[index] = { url, content };
          } catch (err) {
            throw new SourceGatherError("website", formatWebsiteError(err, websiteUrl));
          }
        })(),
      );
    });
  } else {
    delete nextCache.website;
  }

  if (confluenceKey) {
    const [url, spaceKey] = [
      inputSources.confluenceUrl.trim(),
      inputSources.confluenceSpaceKey.trim(),
    ];
    if (
      cached.confluence?.url === url &&
      cached.confluence?.spaceKey === spaceKey &&
      cached.confluence.content
    ) {
      parts.push(cached.confluence.content);
    } else {
      tasks.push(
        (async () => {
          onProgress?.("Connecting to Confluence…");
          try {
            const pages = await connectConfluence(
              url,
              spaceKey,
              inputSources.confluenceToken.trim(),
            );
            const content = formatConfluenceBlock(pages);
            nextCache.confluence = { url, spaceKey, content };
            parts.push(content);
          } catch (err) {
            throw new SourceGatherError("confluence", formatConfluenceError(err));
          }
        })(),
      );
    }
  } else {
    delete nextCache.confluence;
  }

  await Promise.all(tasks);

  if (websiteUrls.length > 0) {
    const resolved = websiteEntries.filter(
      (entry): entry is { url: string; content: string } => entry !== null,
    );
    nextCache.website = resolved;
    for (const entry of resolved) {
      parts.push(formatWebsiteBlock(entry.url, entry.content));
    }
  }

  return {
    combined: parts.join("\n\n"),
    cache: nextCache,
  };
}
