import type { InputSources } from "../context/PatentWorkflowContext";
import { connectConfluence, scrapeUrl } from "../services/api";

export interface CachedRemoteSources {
  website?: { url: string; content: string };
  confluence?: { url: string; spaceKey: string; content: string };
}

export interface GatherSourceTextParams {
  buildLocalText: () => string;
  inputSources: InputSources;
  cached?: CachedRemoteSources;
}

export interface GatherSourceTextResult {
  combined: string;
  cache: CachedRemoteSources;
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
  const { buildLocalText, inputSources, cached = {} } = params;
  const parts: string[] = [];
  const local = buildLocalText().trim();
  if (local) parts.push(local);

  const nextCache: CachedRemoteSources = { ...cached };
  const websiteUrl = inputSources.websiteUrl.trim();
  const confluenceKey = confluenceCacheKey(inputSources);

  const tasks: Promise<void>[] = [];

  if (websiteUrl) {
    if (cached.website?.url === websiteUrl) {
      parts.push(formatWebsiteBlock(cached.website.url, cached.website.content));
    } else {
      tasks.push(
        scrapeUrl(websiteUrl).then((scraped) => {
          const url = scraped.url ?? websiteUrl;
          const content = scraped.content;
          nextCache.website = { url, content };
          parts.push(formatWebsiteBlock(url, content));
        }),
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
        connectConfluence(url, spaceKey, inputSources.confluenceToken.trim()).then(
          (pages) => {
            const content = formatConfluenceBlock(pages);
            nextCache.confluence = { url, spaceKey, content };
            parts.push(content);
          },
        ),
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
