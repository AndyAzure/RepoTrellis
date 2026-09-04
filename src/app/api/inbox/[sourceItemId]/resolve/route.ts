import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { resolveSourceItem } from "@/ingest";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();

interface ResolveRouteContext {
  params: Promise<{ sourceItemId: string }>;
}

export async function POST(_request: Request, context: ResolveRouteContext) {
  const parsed = idSchema.safeParse((await context.params).sourceItemId);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_source_item_id",
          message: "Source item ID must be a positive integer.",
        },
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const result = await resolveSourceItem(sqlite, parsed.data, {
      token: process.env.GITHUB_TOKEN,
      signal: controller.signal,
    });
    return NextResponse.json(
      { data: result },
      { status: statusForResolution(result.status) },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function statusForResolution(status: string): number {
  if (status === "not_found") return 404;
  if (status === "not_accepted" || status === "stale") return 409;
  if (status === "busy") return 202;
  if (status === "retry_wait") return 429;
  if (status === "failed") return 502;
  return 200;
}
