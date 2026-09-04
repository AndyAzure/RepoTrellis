import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { getRepositoryRecommendation } from "@/ranking/repository-ranking";

export const runtime = "nodejs";

const repositoryIdSchema = z.coerce.number().int().positive();

interface RecommendationRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export async function GET(
  _request: Request,
  context: RecommendationRouteContext,
) {
  const { repositoryId } = await context.params;
  const parsed = repositoryIdSchema.safeParse(repositoryId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_repository_id", message: "Repository ID must be a positive integer." } },
      { status: 400 },
    );
  }

  const recommendation = getRepositoryRecommendation(sqlite, parsed.data);
  if (!recommendation) {
    return NextResponse.json(
      { error: { code: "repository_not_found", message: "Repository was not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: recommendation });
}
