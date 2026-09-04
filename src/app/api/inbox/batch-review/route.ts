import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { getSourceItem, updateSourceReviews } from "@/domain";

export const runtime = "nodejs";

const requestSchema = z.object({
  sourceItemIds: z.array(z.number().int().positive()).min(1).max(30),
  reviewStatus: z.enum(["accepted", "rejected"]),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "批量审核请求格式无效。" } },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "来源或审核状态无效。" } },
      { status: 400 },
    );
  }

  const ids = [...new Set(parsed.data.sourceItemIds)];
  if (ids.some((id) => !getSourceItem(sqlite, id))) {
    return NextResponse.json(
      { error: { code: "source_not_found", message: "部分来源已不存在，请刷新后重试。" } },
      { status: 404 },
    );
  }

  const items = updateSourceReviews(sqlite, ids, parsed.data.reviewStatus);
  return NextResponse.json({ data: { updated: items.length, items } });
}
