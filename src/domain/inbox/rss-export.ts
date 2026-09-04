import type { RssFeedSummary } from "./source-library";

export const rssExportFilename = "repotrellis-rss-feeds.opml";

export function formatRssOpml(feeds: RssFeedSummary[]): string {
  const outlines = feeds
    .map((feed) => ({ feed, url: safeFeedUrl(feed.url) }))
    .filter((entry): entry is { feed: RssFeedSummary; url: string } => Boolean(entry.url))
    .sort((left, right) => left.url.localeCompare(right.url))
    .map(({ feed, url }) => {
      const title = feed.title?.trim() || url;
      return `    <outline type="rss" text="${escapeXml(title)}" title="${escapeXml(title)}" xmlUrl="${escapeXml(url)}" htmlUrl="${escapeXml(url)}" />`;
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    "    <title>RepoTrellis RSS feeds</title>",
    "  </head>",
    "  <body>",
    '    <outline text="RepoTrellis RSS" title="RepoTrellis RSS">',
    ...outlines,
    "    </outline>",
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
}

function safeFeedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
