import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  getSourceItem,
  sourceReviewStatuses,
  updateSourceReview,
} from "@/domain";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();
const reviewSchema = z.object({ reviewStatus: z.enum(sourceReviewStatuses) }).strict();

interface SourceRouteContext {
  params: Promise<{ sourceItemId: string }>;
}

export async function GET(_request: Request, context: SourceRouteContext) {
  const id = await parseId(context);
  if (id === null) return invalidId();

  const item = getSourceItem(sqlite, id);
  return item
    ? NextResponse.json({ data: item })
    : sourceNotFound();
}

export async function PATCH(request: Request, context: SourceRouteContext) {
  const id = await parseId(context);
  if (id === null) return invalidId();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
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
    body = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Request body must contain valid JSON." } },
      { status: 400 },
    );
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: "Review status is invalid.",
        },
      },
      { status: 400 },
    );
  }

  const item = updateSourceReview(sqlite, id, parsed.data.reviewStatus);
  return item ? NextResponse.json({ data: item }) : sourceNotFound();
}

async function parseId(context: SourceRouteContext): Promise<number | null> {
  const parsed = idSchema.safeParse((await context.params).sourceItemId);
  return parsed.success ? parsed.data : null;
}

function invalidId() {
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

function sourceNotFound() {
  return NextResponse.json(
    {
      error: {
        code: "source_item_not_found",
        message: "Source item was not found.",
      },
    },
    { status: 404 },
  );
}
