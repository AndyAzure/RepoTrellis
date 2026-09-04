import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { digestItemDecisions, listDigestSnapshots } from "@/domain";

export const runtime = "nodejs";

const limitSchema = z.coerce.number().int().min(1).max(20).default(10);
const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).default(10),
    decision: z.enum(digestItemDecisions).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "from must be before or equal to to",
      });
    }
  });

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const rawLimit = searchParams.get("limit") ?? undefined;
  const parsedLimit = limitSchema.safeParse(rawLimit);
  const parsed = querySchema.safeParse({
    limit: rawLimit,
    decision: searchParams.get("decision") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  if (!parsedLimit.success || !parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_limit", message: "Digest history limit is invalid." } },
      { status: 400 },
    );
  }

  return NextResponse.json({
    data: listDigestSnapshots(sqlite, {
      limit: parsed.data.limit,
      decision: parsed.data.decision,
      periodFrom: parsed.data.from,
      periodTo: parsed.data.to,
    }),
  });
}
