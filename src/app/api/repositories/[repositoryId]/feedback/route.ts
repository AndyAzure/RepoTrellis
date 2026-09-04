import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  feedbackInputSchema,
  recordRepositoryFeedback,
} from "@/domain";

export const runtime = "nodejs";

const repositoryIdSchema = z.coerce.number().int().positive();
const MAX_BODY_LENGTH = 4_096;

interface FeedbackRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export async function POST(
  request: Request,
  context: FeedbackRouteContext,
) {
  const { repositoryId } = await context.params;
  const parsedId = repositoryIdSchema.safeParse(repositoryId);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: { code: "invalid_repository_id", message: "Repository ID must be a positive integer." } },
      { status: 400 },
    );
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: { code: "unsupported_media_type", message: "Expected an application/json request body." } },
      { status: 415 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_LENGTH) return bodyTooLarge();

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_LENGTH) return bodyTooLarge();
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Request body must contain valid JSON." } },
      { status: 400 },
    );
  }
  const parsed = feedbackInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Feedback event is invalid." } },
      { status: 400 },
    );
  }

  const event = recordRepositoryFeedback(sqlite, parsedId.data, parsed.data);
  if (!event) {
    return NextResponse.json(
      { error: { code: "repository_not_found", message: "Repository was not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: event }, { status: 201 });
}

function bodyTooLarge() {
  return NextResponse.json(
    { error: { code: "body_too_large", message: "Request body is too large." } },
    { status: 413 },
  );
}
