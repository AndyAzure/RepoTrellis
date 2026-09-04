import { describe, expect, it } from "vitest";

import { formatRssOpml, rssExportFilename } from "./rss-export";
import type { RssFeedSummary } from "./source-library";

function feed(overrides: Partial<RssFeedSummary> = {}): RssFeedSummary {
  return {
    id: 1,
    url: "https://example.com/feed.xml",
    title: "Example feed",
    lastFetchedAt: null,
    status: "active",
    lastError: null,
    updatedAt: "2026-09-04 00:00:00",
    ...overrides,
  };
}

describe("RSS OPML export", () => {
  it("exports a stable, escaped OPML document", () => {
    const xml = formatRssOpml([
      feed({ id: 2, url: "https://z.example/feed.xml", title: "Zed" }),
      feed({
        id: 3,
        url: "https://a.example/feed?a=1&b=2",
        title: `A & <B> \"quoted\" 'feed'`,
      }),
    ]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml.indexOf('xmlUrl="https://a.example/feed?a=1&amp;b=2"')).toBeLessThan(
      xml.indexOf('xmlUrl="https://z.example/feed.xml"'),
    );
    expect(xml).toContain('text="A &amp; &lt;B&gt; &quot;quoted&quot; &apos;feed&apos;"');
    expect(xml).not.toContain("lastError");
    expect(rssExportFilename).toBe("repotrellis-rss-feeds.opml");
  });

  it("skips unsafe feed URLs and falls back to the URL for untitled feeds", () => {
    const xml = formatRssOpml([
      feed({ id: 1, url: "javascript:alert(1)", title: "unsafe" }),
      feed({ id: 2, url: "https://user:password@example.com/feed.xml", title: "private" }),
      feed({ id: 3, url: "https://safe.example/feed.xml", title: "   " }),
    ]);

    expect(xml).not.toContain("unsafe");
    expect(xml).not.toContain("password");
    expect(xml).toContain('text="https://safe.example/feed.xml"');
  });

  it("produces a valid empty document", () => {
    const xml = formatRssOpml([]);
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('    <outline text="RepoTrellis RSS" title="RepoTrellis RSS">');
    expect(xml).not.toContain('type="rss"');
  });
});
