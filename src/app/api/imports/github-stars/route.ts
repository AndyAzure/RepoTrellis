import { NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchGithubStars,
  GithubConnectorError,
  type GithubRepository,
} from "@/connectors";
import { sqlite } from "@/db";
import { ingestGithubStars } from "@/ingest";

export const runtime = "nodejs";

const importRequestSchema = z
  .object({
    username: z.string().trim().min(1).max(39),
    startPage: z.number().int().min(1).max(1_000).default(1),
    maxPages: z.number().int().min(1).max(10).default(10),
  })
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

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) {
    return body.response;
  }

  const parsed = importRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: "GitHub Stars import settings are invalid.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const repositories: GithubRepository[] = [];
    let pageNumber: number | null = parsed.data.startPage;
    let pagesFetched = 0;
    let rateLimitRemaining: number | null = null;

    while (pageNumber !== null && pagesFetched < parsed.data.maxPages) {
      const page = await fetchGithubStars({
        username: parsed.data.username,
        page: pageNumber,
        perPage: 100,
        token: process.env.GITHUB_TOKEN,
        signal: AbortSignal.timeout(15_000),
      });

      repositories.push(...page.repositories);
      pageNumber = page.nextPage;
      rateLimitRemaining = page.rateLimitRemaining;
      pagesFetched += 1;
    }

    const uniqueRepositories = [
      ...new Map(
        repositories.map((repository) => [repository.githubId, repository]),
      ).values(),
    ];
    const result = ingestGithubStars(
      sqlite,
      parsed.data.username,
      uniqueRepositories,
    );

    return NextResponse.json({
      data: {
        ...result,
        pagesFetched,
        nextPage: pageNumber,
        rateLimitRemaining,
      },
    });
  } catch (error) {
    if (error instanceof GithubConnectorError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return NextResponse.json(
        {
          error: {
            code: "github_timeout",
            message: "GitHub did not respond before the import timed out.",
          },
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "import_failed",
          message: "GitHub Stars import failed.",
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
