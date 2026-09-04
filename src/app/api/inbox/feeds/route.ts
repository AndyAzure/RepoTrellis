import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { listRssFeeds } from "@/domain";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_query",
          message: "RSS feed query parameters are invalid.",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    data: listRssFeeds(sqlite, parsed.data.limit),
  });
}
