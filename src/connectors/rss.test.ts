import { describe, expect, it, vi } from "vitest";

import { extractGithubRefs, fetchRssFeed, RssConnectorError } from "./rss";

describe("RSS connector", () => {
  it("parses RSS entries and extracts canonical GitHub references", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?>
          <rss version="2.0"><channel>
            <title>Engineering Notes</title>
            <description>Practical project notes</description>
            <item>
              <title>Build a better workbench</title>
              <link>https://notes.example.com/workbench</link>
              <pubDate>Wed, 03 Sep 2026 12:00:00 GMT</pubDate>
              <description><![CDATA[Try acme/repotrellis and https://github.com/acme/sqlite-notes.]]></description>
            </item>
          </channel></rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      ),
    );

    const result = await fetchRssFeed({
      url: "https://notes.example.com/feed.xml#fragment",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      url: "https://notes.example.com/feed.xml",
      title: "Engineering Notes",
      items: [
        {
          url: "https://notes.example.com/workbench",
          title: "Build a better workbench",
          githubRefs: [
            "https://github.com/acme/repotrellis",
            "https://github.com/acme/sqlite-notes",
          ],
        },
      ],
    });
    if (result.notModified) throw new Error("Expected a parsed RSS feed.");
    expect(result.items[0]?.publishedAt).toBe("2026-09-03T12:00:00.000Z");
  });

  it("rejects unsupported protocols before fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      fetchRssFeed({ url: "file:///tmp/feed.xml", fetchImpl }),
    ).rejects.toMatchObject({ code: "invalid_url", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not leak upstream response bodies", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("private error details", { status: 500 }),
    );

    await expect(
      fetchRssFeed({ url: "https://notes.example.com/feed.xml", fetchImpl }),
    ).rejects.toMatchObject({
      code: "upstream",
      status: 502,
      message: "RSS feed returned an error response.",
    } satisfies Partial<RssConnectorError>);
  });

  it("deduplicates URL and shorthand references", () => {
    expect(
      extractGithubRefs(
        "https://github.com/acme/RepoTrellis and acme/repotrellis plus acme/sqlite-utils.",
      ),
    ).toEqual([
      "https://github.com/acme/RepoTrellis",
      "https://github.com/acme/sqlite-utils",
    ]);
    });
  });

  it("uses validators and returns a lightweight 304 result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 304,
        headers: {
          etag: '"feed-v2"',
          "last-modified": "Thu, 04 Sep 2026 10:00:00 GMT",
        },
      }),
    );

    const result = await fetchRssFeed({
      url: "https://notes.example.com/feed.xml",
      etag: '"feed-v1"',
      lastModified: "Wed, 03 Sep 2026 10:00:00 GMT",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://notes.example.com/feed.xml",
      expect.objectContaining({
        headers: expect.objectContaining({
          "If-None-Match": '"feed-v1"',
          "If-Modified-Since": "Wed, 03 Sep 2026 10:00:00 GMT",
        }),
      }),
    );
    expect(result).toEqual({
      url: "https://notes.example.com/feed.xml",
      notModified: true,
      etag: '"feed-v2"',
      lastModified: "Thu, 04 Sep 2026 10:00:00 GMT",
    });
  });
