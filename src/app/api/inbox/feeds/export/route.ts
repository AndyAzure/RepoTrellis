import { NextResponse } from "next/server";

import { sqlite } from "@/db";
import { formatRssOpml, listAllRssFeeds, rssExportFilename } from "@/domain";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function GET(request: Request) {
  if (new URL(request.url).searchParams.size > 0) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_export",
          message: "OPML export does not accept query parameters.",
        },
      },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const body = formatRssOpml(listAllRssFeeds(sqlite));
    return new Response(body, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${rssExportFilename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "rss_export_failed",
          message: "RSS feeds could not be exported.",
        },
      },
      { status: 500, headers: privateHeaders },
    );
  }
}
