import Parser from "rss-parser";

export interface FetchRssFeedOptions {
  url: string;
  etag?: string | null;
  lastModified?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface RssFeedItem {
  url: string;
  title: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  githubRefs: string[];
}

export interface RssFeedResult {
  url: string;
  title: string | null;
  description: string | null;
  items: RssFeedItem[];
  notModified: false;
  etag: string | null;
  lastModified: string | null;
}

export interface RssFeedNotModifiedResult {
  url: string;
  notModified: true;
  etag: string | null;
  lastModified: string | null;
}

export type RssFetchResult = RssFeedResult | RssFeedNotModifiedResult;

export type RssConnectorErrorCode =
  | "invalid_url"
  | "upstream"
  | "invalid_feed";

export class RssConnectorError extends Error {
  constructor(
    message: string,
    public readonly code: RssConnectorErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RssConnectorError";
  }
}

export async function fetchRssFeed(
  options: FetchRssFeedOptions,
): Promise<RssFetchResult> {
  const url = normalizeHttpUrl(options.url);
  if (!url) {
    throw new RssConnectorError(
      "RSS URL must use http or https.",
      "invalid_url",
      400,
    );
  }

  const headers: Record<string, string> = {
    Accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    "User-Agent": "RepoTrellis RSS connector",
  };
  if (options.etag) headers["If-None-Match"] = options.etag;
  if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      headers,
      signal: options.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw error;
    }
    throw new RssConnectorError(
      "RSS feed could not be reached.",
      "upstream",
      502,
    );
  }

  const etag = response.headers.get("etag") ?? options.etag ?? null;
  const lastModified =
    response.headers.get("last-modified") ?? options.lastModified ?? null;
  if (response.status === 304) {
    return { url, notModified: true, etag, lastModified };
  }

  if (!response.ok) {
    throw new RssConnectorError(
      "RSS feed returned an error response.",
      "upstream",
      502,
    );
  }

  let xml: string;
  try {
    xml = await response.text();
  } catch {
    throw new RssConnectorError(
      "RSS feed body could not be read.",
      "upstream",
      502,
    );
  }

  try {
    const feed = await new Parser().parseString(xml);
    return {
      url,
      title: cleanText(feed.title, 300),
      description: cleanText(feed.description, 1_000),
      notModified: false,
      etag,
      lastModified,
      items: feed.items
        .map((item) => {
          const itemUrl = normalizeHttpUrl(item.link ?? item.guid ?? "");
          if (!itemUrl) {
            return null;
          }

          const title = cleanText(item.title, 300);
          const excerpt = cleanText(
            item.contentSnippet ?? item.summary ?? item.content,
            1_000,
          );
          const publishedAt = normalizeDate(item.isoDate ?? item.pubDate);

          return {
            url: itemUrl,
            title,
            excerpt,
            publishedAt,
            githubRefs: extractGithubRefs(
              [item.title, item.contentSnippet, item.summary, item.content].join(
                "\n",
              ),
            ),
          } satisfies RssFeedItem;
        })
        .filter((item): item is RssFeedItem => item !== null)
        .slice(0, 100),
    };
  } catch {
    throw new RssConnectorError(
      "RSS feed is not valid RSS or Atom XML.",
      "invalid_feed",
      422,
    );
  }
}

export function extractGithubRefs(value: string): string[] {
  const occurrences: Array<{
    index: number;
    owner: string;
    repository: string;
  }> = [];
  const refs = new Map<string, string>();
  const githubUrlPattern =
    /https?:\/\/(?:www\.)?github\.com\/([^/#?\s"'<>]+)\/([^/#?\s"'<>]+)/gi;

  for (const match of value.matchAll(githubUrlPattern)) {
    occurrences.push({
      index: match.index ?? 0,
      owner: match[1] ?? "",
      repository: match[2] ?? "",
    });
  }
  const withoutUrls = value.replace(githubUrlPattern, (match) =>
    " ".repeat(match.length),
  );
  const shorthandPattern =
    /(?<![.\w-])([a-z\d](?:[a-z\d-]{0,38})?)\/([a-z\d][a-z\d._-]{0,99})(?![\w-])/gi;

  for (const match of withoutUrls.matchAll(shorthandPattern)) {
    occurrences.push({
      index: match.index ?? 0,
      owner: match[1] ?? "",
      repository: match[2] ?? "",
    });
  }

  occurrences.sort((left, right) => left.index - right.index);
  for (const occurrence of occurrences) {
    addRef(refs, occurrence.owner, occurrence.repository);
  }
  return [...refs.values()];
}

function addRef(refs: Map<string, string>, owner: string, repository: string) {
  const cleanOwner = owner.replace(/[.,;:!?)]$/, "");
  const cleanRepository = repository
    .replace(/\.git$/i, "")
    .replace(/[.,;:!?)]$/, "");

  if (!cleanOwner || !cleanRepository) {
    return;
  }

  const canonical = `https://github.com/${cleanOwner}/${cleanRepository}`;
  const key = canonical.toLowerCase();
  if (!refs.has(key)) {
    refs.set(key, canonical);
  }
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: string | undefined, maximumLength: number): string | null {
  if (!value) {
    return null;
  }

  const cleaned = decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}
