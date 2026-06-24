import type { InputSources } from "../context/PatentWorkflowContext";
import { ApiError, connectConfluence, scrapeUrl } from "../services/api";

export interface CachedRemoteSources {
  website?: { url: string; content: string };
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

function formatWebsiteError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message.trim() || "Could not scrape the website URL.";
  }
  return "Could not scrape the website URL.";
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

/**
 * Build combined source text for extraction.
 * Fetches website and Confluence in parallel when needed; reuses cached text when URLs match.
 */
export async function gatherCombinedSourceText(
  params: GatherSourceTextParams,
): Promise<GatherSourceTextResult> {
  const { buildLocalText, inputSources, cached = {}, onProgress } = params;
  const parts: string[] = [];
  const local = buildLocalText().trim();
  if (local) parts.push(local);

  const nextCache: CachedRemoteSources = { ...cached };
  const websiteUrl = inputSources.websiteUrl.trim();
  const confluenceKey = confluenceCacheKey(inputSources);

  const tasks: Promise<void>[] = [];

  const needsWebsite =
    Boolean(websiteUrl) && !(cached.website?.url === websiteUrl && cached.website.content);
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
    onProgress?.("Scraping website…");
  }

  if (websiteUrl) {
    if (cached.website?.url === websiteUrl) {
      parts.push(formatWebsiteBlock(cached.website.url, cached.website.content));
    } else {
      tasks.push(
        (async () => {
          if (!needsConfluence) {
            onProgress?.("Scraping website…");
          }
          try {
            const scraped = await scrapeUrl(websiteUrl);
            const url = scraped.url ?? websiteUrl;
            const content = scraped.content;
            nextCache.website = { url, content };
            parts.push(formatWebsiteBlock(url, content));
          } catch (err) {
            throw new SourceGatherError("website", formatWebsiteError(err));
          }
        })(),
      );
    }
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

  return {
    combined: parts.join("\n\n"),
    cache: nextCache,
  };
}
