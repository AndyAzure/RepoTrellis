import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchRssFeed, RssConnectorError } from "@/connectors";
import { sqlite } from "@/db";
import {
  getRssFeedMetadata,
  ingestRssFeed,
  markRssFeedNotModified,
  markRssFeedFailure,
  normalizeSourceUrl,
} from "@/ingest";

export const runtime = "nodejs";

const rssRequestSchema = z.object({ url: z.string().trim().url().max(2_000) }).strict();

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      {
        error: {
          code: "unsupported_media_type",
          message: "Expected an application/json request body.",
        },
      },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4_096) {
      return NextResponse.json(
        {
          error: { code: "body_too_large", message: "Request body is too large." },
        },
        { status: 413 },
      );
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Request body must contain valid JSON." } },
      { status: 400 },
    );
  }

  const parsed = rssRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: "RSS feed URL is invalid.",
        },
      },
      { status: 400 },
    );
  }

  const normalizedUrl = normalizeSourceUrl(parsed.data.url);
  try {
    const metadata = normalizedUrl
      ? getRssFeedMetadata(sqlite, normalizedUrl)
      : null;
    const feed = await fetchRssFeed({
      url: parsed.data.url,
      etag: metadata?.etag,
      lastModified: metadata?.lastModified,
      signal: AbortSignal.timeout(15_000),
    });
    if (feed.notModified) {
      return NextResponse.json(
        { data: markRssFeedNotModified(sqlite, feed) },
        { status: 200 },
      );
    }
    return NextResponse.json({ data: ingestRssFeed(sqlite, feed) }, { status: 201 });
  } catch (error) {
    if (error instanceof RssConnectorError) {
      rememberRssFailure(normalizedUrl, error.message);
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      rememberRssFailure(
        normalizedUrl,
        "RSS feed did not respond before the import timed out.",
      );
      return NextResponse.json(
        {
          error: {
            code: "rss_timeout",
            message: "RSS feed did not respond before the import timed out.",
          },
        },
        { status: 504 },
      );
    }

    rememberRssFailure(normalizedUrl, "RSS feed could not be imported.");
    return NextResponse.json(
      {
        error: {
          code: "rss_ingest_failed",
          message: "RSS feed could not be imported.",
        },
      },
      { status: 500 },
    );
  }
}

function rememberRssFailure(url: string | null, error: string): void {
  if (!url) return;
  try {
    markRssFeedFailure(sqlite, { url, error });
  } catch {
    // Preserve the original connector response if status persistence fails.
  }
}
