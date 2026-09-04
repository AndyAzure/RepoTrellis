import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { retryDueSourceItems } from "@/jobs";

export const runtime = "nodejs";

const retryRequestSchema = z
  .object({ limit: z.number().int().min(1).max(10).optional() })
  .strict();

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
    body = JSON.parse(await request.text()) as unknown;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Request body must contain valid JSON." } },
      { status: 400 },
    );
  }

  const parsed = retryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Retry options are invalid." } },
      { status: 400 },
    );
  }

  try {
    const result = await retryDueSourceItems(sqlite, { limit: parsed.data.limit });
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "source_retry_failed",
          message: "Due source retries could not be completed.",
        },
      },
      { status: 500 },
    );
  }
}
