import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  getRepository,
  repositoryStatuses,
  updateRepositoryMeta,
} from "@/domain";

export const runtime = "nodejs";

const repositoryIdSchema = z.coerce.number().int().positive();
const repositoryMetaPatchSchema = z
  .object({
    status: z.enum(repositoryStatuses).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    note: z.string().max(4_000).nullable().optional(),
    priority: z.number().int().min(-10).max(10).optional(),
    nextAction: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

interface RepositoryRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export async function GET(
  _request: Request,
  context: RepositoryRouteContext,
) {
  const id = await parseRepositoryId(context);

  if (id === null) {
    return invalidRepositoryId();
  }

  const repository = getRepository(sqlite, id);
  if (!repository) {
    return repositoryNotFound();
  }

  return NextResponse.json({ data: repository });
}

export async function PATCH(
  request: Request,
  context: RepositoryRouteContext,
) {
  const id = await parseRepositoryId(context);

  if (id === null) {
    return invalidRepositoryId();
  }

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

  const parsed = repositoryMetaPatchSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_body",
          message: "Repository metadata is invalid.",
        },
      },
      { status: 400 },
    );
  }

  const repository = updateRepositoryMeta(sqlite, id, parsed.data);
  if (!repository) {
    return repositoryNotFound();
  }

  return NextResponse.json({ data: repository });
}

async function parseRepositoryId(
  context: RepositoryRouteContext,
): Promise<number | null> {
  const { repositoryId } = await context.params;
  const parsed = repositoryIdSchema.safeParse(repositoryId);
  return parsed.success ? parsed.data : null;
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

  const text = await request.text();
  if (text.length > maximumLength) {
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
