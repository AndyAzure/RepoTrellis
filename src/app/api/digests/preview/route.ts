import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  buildDigestPreview,
  saveDigestSnapshot,
} from "@/domain";

export const runtime = "nodejs";

const selectionSchema = z
  .object({
    repositoryIds: z.array(z.coerce.number().int().positive()).max(8),
  })
  .strict();

export async function GET() {
  return NextResponse.json({ data: buildDigestPreview(sqlite) });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: { code: "unsupported_media_type", message: "Expected an application/json request body." } },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4_096) {
      return NextResponse.json(
        { error: { code: "body_too_large", message: "Request body is too large." } },
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

  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Digest selection is invalid." } },
      { status: 400 },
    );
  }

  const result = saveDigestSnapshot(sqlite, {
    repositoryIds: parsed.data.repositoryIds,
  });
  if (result.status === "empty") {
    return NextResponse.json(
      { error: { code: "empty_selection", message: "Select at least one project before saving." } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: result.digest }, { status: 201 });
}
