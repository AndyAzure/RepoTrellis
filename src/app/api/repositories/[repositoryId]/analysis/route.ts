import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { getRepository, getRepositoryAnalysis } from "@/domain";
import { generateRepositoryAnalysis } from "@/ai/repository-analysis-service";

export const runtime = "nodejs";

const repositoryIdSchema = z.coerce.number().int().positive();

interface AnalysisRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export async function GET(
  _request: Request,
  context: AnalysisRouteContext,
) {
  const id = await parseRepositoryId(context);
  if (id === null) return invalidRepositoryId();

  if (!getRepository(sqlite, id)) return repositoryNotFound();
  const analysis = getRepositoryAnalysis(sqlite, id);
  return NextResponse.json({ data: analysis });
}

export async function POST(
  _request: Request,
  context: AnalysisRouteContext,
) {
  const id = await parseRepositoryId(context);
  if (id === null) return invalidRepositoryId();

  const result = generateRepositoryAnalysis(sqlite, id);
  if (result.status === "not_found") {
    return NextResponse.json(
      { error: { code: "repository_not_found", message: "Repository was not found." } },
      { status: 404 },
    );
  }
  if (result.status === "busy") {
    return NextResponse.json(
      { error: { code: "analysis_in_progress", message: "Structured analysis is already running." }, data: result.analysis },
      { status: 409 },
    );
  }
  if (result.status === "failed") {
    return NextResponse.json(
      { error: { code: "analysis_failed", message: result.error ?? "Structured analysis failed." }, data: result.analysis },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.analysis });
}

async function parseRepositoryId(
  context: AnalysisRouteContext,
): Promise<number | null> {
  const { repositoryId } = await context.params;
  const parsed = repositoryIdSchema.safeParse(repositoryId);
  return parsed.success ? parsed.data : null;
}

function invalidRepositoryId() {
  return NextResponse.json(
    {
      error: {
        code: "invalid_repository_id",
        message: "Repository ID must be a positive integer.",
      },
    },
    { status: 400 },
  );
}

function repositoryNotFound() {
  return NextResponse.json(
    {
      error: {
        code: "repository_not_found",
        message: "Repository was not found.",
      },
    },
    { status: 404 },
  );
}
