import { NextResponse } from "next/server";
import { z } from "zod";

import { sqlite } from "@/db";
import { getDigestSnapshot } from "@/domain/digest/digest-library";
import {
  digestExportFilename,
  digestExportFilenameWithFormat,
  digestExportFormats,
  digestExportScopes,
  formatDigestExport,
} from "@/domain/digest/digest-export";

export const runtime = "nodejs";

const idSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive());
const querySchema = z
  .object({
    scope: z.enum(digestExportScopes).default("active"),
    format: z.enum(digestExportFormats).default("markdown"),
  })
  .strict();
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(
  request: Request,
  context: { params: Promise<{ digestId: string }> },
) {
  const params = await context.params;
  const id = idSchema.safeParse(params.digestId);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!id.success || !query.success) {
    return NextResponse.json(
      { error: { code: "invalid_export", message: "Digest ID or export scope is invalid." } },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const digest = getDigestSnapshot(sqlite, id.data);
    if (!digest) {
      return NextResponse.json(
        { error: { code: "digest_not_found", message: "Digest snapshot was not found." } },
        { status: 404, headers: privateHeaders },
      );
    }
    const body = formatDigestExport(digest, query.data.scope, query.data.format);
    const filename =
      query.data.format === "markdown"
        ? digestExportFilename(digest.id, query.data.scope)
        : digestExportFilenameWithFormat(digest.id, query.data.scope, query.data.format);
    return new Response(body, {
      headers: {
        ...privateHeaders,
        "Content-Type": query.data.format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "digest_export_failed", message: "Digest snapshot could not be exported." } },
      { status: 500, headers: privateHeaders },
    );
  }
}
