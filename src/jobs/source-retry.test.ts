import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestManualSource } from "../ingest";
import { updateSourceReview } from "../domain/inbox/source-library";
import { retryDueSourceItems } from "./source-retry";

describe("source retry job", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => sqlite.close());

  it("only retries accepted sources whose backoff has elapsed", async () => {
    const due = ingestManualSource(sqlite, {
      url: "https://notes.example.com/due",
      title: "https://github.com/acme/repotrellis",
    });
    updateSourceReview(sqlite, due.sourceItemId, "accepted");
    sqlite
      .prepare(
        "update source_items set processing_status = 'failed', next_retry_at = datetime('now', '-1 minute'), last_error = 'temporary' where id = ?",
      )
      .run(due.sourceItemId);

    const waiting = ingestManualSource(sqlite, {
      url: "https://notes.example.com/waiting",
      title: "https://github.com/acme/waiting",
    });
    updateSourceReview(sqlite, waiting.sourceItemId, "accepted");
    sqlite
      .prepare(
        "update source_items set processing_status = 'failed', next_retry_at = datetime('now', '+10 minutes'), last_error = 'temporary' where id = ?",
      )
      .run(waiting.sourceItemId);

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 101,
        full_name: "acme/repotrellis",
        owner: { login: "acme" },
        name: "repotrellis",
        html_url: "https://github.com/acme/repotrellis",
        description: "Repository intelligence",
        default_branch: "main",
        language: "TypeScript",
        stargazers_count: 120,
        forks_count: 8,
        license: { spdx_id: "MIT" },
        archived: false,
        updated_at: "2026-09-03T12:00:00Z",
      }),
    );

    const result = await retryDueSourceItems(sqlite, { fetchImpl });

    expect(result.scanned).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.results[0]).toMatchObject({ status: "resolved", sourceItemId: due.sourceItemId });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(
      sqlite.prepare("select processing_status as status from source_items where id = ?").get(due.sourceItemId),
    ).toEqual({ status: "ready" });
    expect(
      sqlite.prepare("select processing_status as status from source_items where id = ?").get(waiting.sourceItemId),
    ).toEqual({ status: "failed" });
  });
});
