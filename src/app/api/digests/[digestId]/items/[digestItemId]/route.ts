import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  digestItemDecisions,
  updateDigestItemDecision,
} from "@/domain";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();
const decisionSchema = z
  .object({ decision: z.enum(digestItemDecisions) })
  .strict();

interface DecisionRouteContext {
  params: Promise<{ digestId: string; digestItemId: string }>;
}

export async function PATCH(
  request: Request,
  context: DecisionRouteContext,
) {
  const params = await context.params;
  const digestId = idSchema.safeParse(params.digestId);
  const digestItemId = idSchema.safeParse(params.digestItemId);
  if (!digestId.success || !digestItemId.success) {
    return NextResponse.json(
      { error: { code: "invalid_digest_id", message: "Digest IDs must be positive integers." } },
      { status: 400 },
    );
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: { code: "unsupported_media_type", message: "Expected an application/json request body." } },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 1_024) {
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

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Digest item decision is invalid." } },
      { status: 400 },
    );
  }

  const digest = updateDigestItemDecision(
    sqlite,
    digestId.data,
    digestItemId.data,
    parsed.data.decision,
  );
  if (!digest) {
    return NextResponse.json(
      { error: { code: "digest_item_not_found", message: "Digest item was not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: digest });
}
