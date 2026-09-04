import { expect, test } from "@playwright/test";

import type { DigestSnapshot } from "../src/domain/digest/digest";

function snapshots(): DigestSnapshot[] {
  return [
    snapshot(1, "2026-08-29", "2026-09-04", ["kept", "dismissed"]),
    snapshot(2, "2026-09-10", "2026-09-16", ["pending"]),
  ];
}

function snapshot(
  id: number,
  periodStart: string,
  periodEnd: string,
  decisions: Array<"pending" | "kept" | "dismissed">,
): DigestSnapshot {
  return {
    id,
    periodStart,
    periodEnd,
    status: "draft",
    configSnapshot: {},
    createdAt: `${periodEnd}T10:00:00Z`,
    updatedAt: `${periodEnd}T10:00:00Z`,
    items: decisions.map((decision, index) => ({
      id: id * 10 + index,
      repositoryId: id * 10 + index,
      score: 80 - index,
      reasons: ["保留的推荐理由"],
      position: index + 1,
      decision,
      repository: {
        id: id * 10 + index,
        githubId: id * 10 + index,
        fullName: `example/snapshot-${id}-${index + 1}`,
        owner: "example",
        name: `snapshot-${id}-${index + 1}`,
        url: `https://github.com/example/snapshot-${id}-${index + 1}`,
        description: "筛选样例项目",
        defaultBranch: "main",
        language: "TypeScript",
        stars: 0,
        forks: 0,
        license: "MIT",
        isArchived: false,
        remoteUpdatedAt: null,
        createdAt: `${periodEnd}T10:00:00Z`,
        updatedAt: `${periodEnd}T10:00:00Z`,
        status: "candidate",
        tags: [],
        note: null,
        priority: 0,
        nextAction: null,
        sources: ["manual"],
      },
    })),
  };
}

async function openHistory(page: import("@playwright/test").Page) {
  const data = snapshots();
  await page.route("**/api/digests/preview", (route) =>
    route.fulfill({
      json: {
        data: {
          periodStart: "2026-09-10",
          periodEnd: "2026-09-16",
          items: [],
        },
      },
    }),
  );
  await page.route("**/api/digests?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const decision = params.get("decision");
    const from = params.get("from");
    const to = params.get("to");
    const filtered = data.filter((digest) =>
      (!decision || digest.items.some((item) => item.decision === decision)) &&
      (!from || digest.periodEnd >= from) &&
      (!to || digest.periodStart <= to),
    );
    return route.fulfill({ json: { data: filtered } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "周报", exact: true }).click();
  await expect(page.getByRole("heading", { name: "历史快照", exact: true })).toBeVisible();
  return { data };
}

test("filters history by any decision and intersecting period, then clears filters", async ({ page }, testInfo) => {
  await openHistory(page);
  await expect(page.getByRole("article", { name: "周报快照 #1" })).toBeVisible();
  await expect(page.getByRole("article", { name: "周报快照 #2" })).toBeVisible();

  const keptResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/digests" && url.searchParams.get("decision") === "kept";
  });
  await page.getByLabel("按复盘决定筛选").selectOption("kept");
  await keptResponse;
  await expect(page.getByRole("article", { name: "周报快照 #1" })).toBeVisible();
  await expect(page.getByRole("article", { name: "周报快照 #2" })).toBeHidden();
  await expect(page.getByRole("button", { name: "清除筛选" })).toBeVisible();

  const periodResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/digests" &&
      url.searchParams.get("from") === "2026-09-05" &&
      url.searchParams.get("to") === "2026-09-12";
  });
  await page.getByLabel("按复盘决定筛选").selectOption("all");
  await page.getByLabel("周期从").fill("2026-09-05");
  await page.getByLabel("周期到").fill("2026-09-12");
  await periodResponse;
  await expect(page.getByRole("article", { name: "周报快照 #1" })).toBeHidden();
  await expect(page.getByRole("article", { name: "周报快照 #2" })).toBeVisible();
  await expect(page.getByText("没有匹配的周报快照")).toBeHidden();

  const clearResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/digests" &&
      !url.searchParams.has("decision") &&
      !url.searchParams.has("from") &&
      !url.searchParams.has("to");
  });
  await page.getByRole("button", { name: "清除筛选" }).click();
  await clearResponse;
  await expect(page.getByRole("article", { name: "周报快照 #1" })).toBeVisible();
  await expect(page.getByRole("article", { name: "周报快照 #2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "清除筛选" })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("digest-history-filter.png"), fullPage: true });
});

test("keeps the current history visible when a filtered request fails", async ({ page }) => {
  let failNext = false;
  await page.route("**/api/digests/preview", (route) =>
    route.fulfill({ json: { data: { periodStart: "2026-09-10", periodEnd: "2026-09-16", items: [] } } }),
  );
  await page.route("**/api/digests?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (failNext && params.get("decision") === "kept") {
      failNext = false;
      return route.fulfill({ status: 500, json: { error: { code: "history_failed", message: "历史读取暂时失败。" } } });
    }
    return route.fulfill({ json: { data: snapshots() } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "周报", exact: true }).click();
  await expect(page.getByRole("article", { name: "周报快照 #1" })).toBeVisible();

  failNext = true;
  const errorResponse = page.waitForResponse((response) => response.status() === 500);
  await page.getByLabel("按复盘决定筛选").selectOption("kept");
  await errorResponse;
  await expect(page.getByRole("alert").filter({ hasText: "历史读取暂时失败。" })).toBeVisible();
  await expect(page.getByRole("article", { name: "周报快照 #1" })).toBeVisible();
});
