import { NextResponse } from "next/server";

import { sqlite } from "@/db";
import {
  getActiveInterest,
  interestInputSchema,
  saveActiveInterest,
} from "@/domain";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 16_384;

export async function GET() {
  return NextResponse.json({ data: getActiveInterest(sqlite) });
}

export async function PATCH(request: Request) {
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

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = interestInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: "Interest profile is invalid.",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: saveActiveInterest(sqlite, parsed.data) });
}

async function readJsonBody(
  request: Request,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_LENGTH) return bodyTooLarge();

  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) return bodyTooLarge();

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "invalid_json", message: "Request body must contain valid JSON." } },
        { status: 400 },
      ),
    };
  }
}

function bodyTooLarge(): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      { error: { code: "body_too_large", message: "Request body is too large." } },
      { status: 413 },
    ),
  };
}
