import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  listSourceItems,
  repositorySourceKinds,
  sourceProcessingStatuses,
  sourceReviewStatuses,
} from "@/domain";
import { ingestManualSource } from "@/ingest";

export const runtime = "nodejs";

const sourceQuerySchema = z.object({
  kind: z.enum(repositorySourceKinds).optional(),
  reviewStatus: z.enum(sourceReviewStatuses).optional(),
  processingStatus: z.enum(sourceProcessingStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const manualSourceSchema = z
  .object({
    url: z.string().trim().url().max(2_000),
    title: z.string().trim().max(300).nullable().optional(),
    excerpt: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

export function GET(request: NextRequest) {
  const parsed = sourceQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_query",
          message: "Inbox query parameters are invalid.",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    data: listSourceItems(sqlite, {
      kind: parsed.data.kind,
      reviewStatus: parsed.data.reviewStatus,
      processingStatus: parsed.data.processingStatus,
      limit: parsed.data.limit,
    }),
  });
}

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

  const body = await readJsonBody(request, 16_384);
  if (!body.ok) {
    return body.response;
  }

  const parsed = manualSourceSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: "Manual source details are invalid.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = ingestManualSource(sqlite, parsed.data);
    return NextResponse.json(
      { data: result },
      { status: result.created ? 201 : 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "source_ingest_failed",
          message: "Manual source could not be saved.",
        },
      },
      { status: 500 },
    );
  }
}

async function readJsonBody(
  request: Request,
  maximumLength: number,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumLength) {
    return bodyTooLarge();
  }

  const text = await request.text();
  if (text.length > maximumLength) {
    return bodyTooLarge();
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "invalid_json",
            message: "Request body must contain valid JSON.",
          },
        },
        { status: 400 },
      ),
    };
  }
}

function bodyTooLarge(): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: {
          code: "body_too_large",
          message: "Request body is too large.",
        },
      },
      { status: 413 },
    ),
  };
}
