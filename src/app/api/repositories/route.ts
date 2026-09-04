import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import {
  repositorySourceKinds,
  repositoryStatuses,
  searchRepositories,
} from "@/domain";

export const runtime = "nodejs";

const repositoryQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(repositoryStatuses).optional(),
  source: z.enum(repositorySourceKinds).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export function GET(request: NextRequest) {
  const input = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = repositoryQuerySchema.safeParse(input);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_query",
          message: "Repository query parameters are invalid.",
        },
      },
      { status: 400 },
    );
  }

  const repositories = searchRepositories(sqlite, {
    query: parsed.data.q,
    status: parsed.data.status,
    source: parsed.data.source,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });

  return NextResponse.json({
    data: repositories,
    pagination: {
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      returned: repositories.length,
    },
  });
}
