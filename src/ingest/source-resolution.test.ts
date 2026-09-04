import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestManualSource } from "./source-items";
import {
  normalizeGithubReference,
  normalizeGithubReferences,
  resolveSourceItem,
} from "./source-resolution";
import { updateSourceReview } from "../domain/inbox/source-library";

const repositoryPayload = (fullName = "acme/repotrellis") => {
  const [owner, name] = fullName.split("/");
  return {
    id: 101,
    full_name: fullName,
    owner: { login: owner },
    name,
    html_url: `https://github.com/${fullName}`,
    description: "Repository intelligence",
    default_branch: "main",
    language: "TypeScript",
    stargazers_count: 120,
    forks_count: 8,
    license: { spdx_id: "MIT" },
    archived: false,
    updated_at: "2026-09-03T12:00:00Z",
  };
};

describe("source repository resolution", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => sqlite.close());

  it("accepts repository names GitHub allows and rejects URL escape hatches", () => {
    expect(normalizeGithubReference("https://github.com/Acme/ui-kit_v2")).toEqual({
      owner: "Acme",
      name: "ui-kit_v2",
      fullName: "Acme/ui-kit_v2",
    });
    expect(normalizeGithubReference("https://github.com/acme/repo?redirect=evil")).toBeNull();
    expect(normalizeGithubReference("https://github.com/acme/repo/tree/main")).toBeNull();
    expect(normalizeGithubReference("https://evil.example/acme/repo")).toBeNull();
    expect(
      normalizeGithubReferences([
        "acme/repo",
        "https://github.com/ACME/repo",
        "https://github.com/acme/other",
      ]),
    ).toHaveLength(2);
  });

  it("resolves accepted references once and links provenance", async () => {
    const source = ingestManualSource(sqlite, {
      url: "https://notes.example.com/one",
      title: "Try https://github.com/acme/repotrellis and acme/repotrellis",
    });
    updateSourceReview(sqlite, source.sourceItemId, "accepted");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(repositoryPayload()),
    );

    const result = await resolveSourceItem(sqlite, source.sourceItemId, { fetchImpl });
    expect(result).toMatchObject({ status: "resolved", created: 1, linked: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sqlite.prepare("select count(*) as count from repositories").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("select count(*) as count from repo_mentions").get()).toEqual({ count: 1 });

    const again = await resolveSourceItem(sqlite, source.sourceItemId, { fetchImpl });
    expect(again).toMatchObject({ status: "resolved", linked: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not call GitHub before human acceptance", async () => {
    const source = ingestManualSource(sqlite, {
      url: "https://notes.example.com/two",
      title: "https://github.com/acme/repotrellis",
    });
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await resolveSourceItem(sqlite, source.sourceItemId, { fetchImpl });
    expect(result.status).toBe("not_accepted");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reuses a local repository and preserves its user metadata", async () => {
    const first = ingestManualSource(sqlite, {
      url: "https://notes.example.com/local-one",
      title: "https://github.com/acme/repotrellis",
    });
    updateSourceReview(sqlite, first.sourceItemId, "accepted");
    await resolveSourceItem(sqlite, first.sourceItemId, {
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(repositoryPayload()),
      ),
    });
    sqlite
      .prepare(
        "update user_repository_meta set note = 'keep this note' where repository_id = (select id from repositories limit 1)",
      )
      .run();

    const second = ingestManualSource(sqlite, {
      url: "https://notes.example.com/local-two",
      title: "https://github.com/ACME/repotrellis",
    });
    updateSourceReview(sqlite, second.sourceItemId, "accepted");
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await resolveSourceItem(sqlite, second.sourceItemId, { fetchImpl });

    expect(result).toMatchObject({ status: "resolved", created: 0, linked: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sqlite.prepare("select note from user_repository_meta").get()).toEqual({ note: "keep this note" });
  });

  it("keeps the transaction atomic when one repository lookup fails", async () => {
    const source = ingestManualSource(sqlite, {
      url: "https://notes.example.com/three",
      title: "https://github.com/acme/repotrellis https://github.com/acme/missing",
    });
    updateSourceReview(sqlite, source.sourceItemId, "accepted");
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(repositoryPayload()))
      .mockResolvedValueOnce(new Response("no", { status: 404 }));

    const result = await resolveSourceItem(sqlite, source.sourceItemId, { fetchImpl });
    expect(result).toMatchObject({ status: "failed", error: "GitHub repository was not found." });
    expect(sqlite.prepare("select count(*) as count from repositories").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("select processing_status as status from source_items").get()).toEqual({ status: "failed" });
  });
});
