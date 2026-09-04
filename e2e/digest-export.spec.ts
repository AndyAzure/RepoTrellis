import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

import type { DigestSnapshot } from "../src/domain/digest/digest";
import { formatDigestJson, formatDigestMarkdown } from "../src/domain/digest/digest-export";
import { digestFixture } from "./fixtures/digest";

async function openDigest(page: Page, digest = digestFixture()) {
  await page.route("**/api/digests/preview", (route) => route.fulfill({
    json: { data: { periodStart: digest.periodStart, periodEnd: digest.periodEnd, items: [] } },
  }));
  await page.route("**/api/digests?*", (route) => route.fulfill({ json: { data: [digest] } }));
  await page.goto("/");
  await page.getByRole("button", { name: "周报", exact: true }).click();
  return page.getByRole("article", { name: "周报快照 #7", exact: true });
}

function fulfillExport(route: Route, digest: DigestSnapshot) {
  const scope = new URL(route.request().url()).searchParams.get("scope") === "all" ? "all" : "active";
  const format = new URL(route.request().url()).searchParams.get("format") === "json" ? "json" : "markdown";
  return route.fulfill({
    contentType: format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
    body: format === "json" ? formatDigestJson(digest, scope) : formatDigestMarkdown(digest, scope),
  });
}

test("downloads only unremoved items and keeps controls disabled while exporting", async ({ page }, testInfo) => {
  const digest = digestFixture();
  let resolveRequest: (route: Route) => void = () => {};
  const pendingRequest = new Promise<Route>((resolve) => { resolveRequest = resolve; });
  await page.route("**/api/digests/7/export?*", resolveRequest);
  const card = await openDigest(page, digest);
  await expect(card.getByLabel("导出范围")).toHaveValue("active");
  await expect(card.getByText(/1 个项目 · 可读 Markdown · 仅下载到本地/)).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await card.getByRole("button", { name: "下载 Markdown" }).click();
  const route = await pendingRequest;
  expect(new URL(route.request().url()).searchParams.get("scope")).toBe("active");
  await expect(card.getByRole("button", { name: "正在导出" })).toBeDisabled();
  await expect(card.getByLabel("导出范围")).toBeDisabled();
  await fulfillExport(route, digest);
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("repotrellis-digest-7-active.md");
  const path = await download.path();
  expect(path).not.toBeNull();
  const markdown = await readFile(path!, "utf8");
  expect(markdown).toContain("example/project1");
  expect(markdown).toContain("82 / 100");
  expect(markdown).not.toContain("example/project2");
  expect(markdown).not.toContain("DO_NOT_EXPORT_PRIVATE_NOTE");
  await expect(card.getByRole("status")).toContainText("已发起下载");
  await expect(card.getByLabel("导出范围")).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("digest-desktop.png"), fullPage: true });
});

test("downloads a machine-readable JSON backup when the format changes", async ({ page }) => {
  const digest = digestFixture();
  await page.route("**/api/digests/7/export?*", (route) => fulfillExport(route, digest));
  const card = await openDigest(page, digest);
  await card.getByLabel("文件格式").selectOption("json");
  await expect(card.getByRole("button", { name: "下载 JSON" })).toBeVisible();
  await expect(card.getByText(/机器可读 JSON/)).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await card.getByRole("button", { name: "下载 JSON" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("repotrellis-digest-7-active.json");
  const path = await download.path();
  const payload = JSON.parse(await readFile(path!, "utf8")) as {
    exportVersion: string;
    items: Array<{ currentRepository: { fullName: string; note?: string } }>;
  };
  expect(payload.exportVersion).toBe("repotrellis-digest-export-v1");
  expect(payload.items[0]?.currentRepository.fullName).toBe("example/project1");
  expect(payload.items[0]?.currentRepository.note).toBeUndefined();
});

test("allows a full record download when every item is removed, including on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const digest = digestFixture();
  digest.items.forEach((item) => { item.decision = "dismissed"; });
  await page.route("**/api/digests/7/export?*", (route) => fulfillExport(route, digest));
  const card = await openDigest(page, digest);
  await expect(card.getByRole("button", { name: "下载 Markdown" })).toBeDisabled();
  await expect(card.getByText(/此范围内没有项目/)).toBeVisible();
  await card.getByLabel("导出范围").selectOption("all");
  await expect(card.getByRole("button", { name: "下载 Markdown" })).toBeEnabled();
  await card.getByLabel("导出范围").focus();
  await page.keyboard.press("Tab");
  await expect(card.getByLabel("文件格式")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(card.getByRole("button", { name: "下载 Markdown" })).toBeFocused();
  const downloadEvent = page.waitForEvent("download");
  await card.getByRole("button", { name: "下载 Markdown" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("repotrellis-digest-7-all.md");
  const path = await download.path();
  const markdown = await readFile(path!, "utf8");
  expect(markdown).toContain("example/project2");
  expect(markdown).toContain("复盘决定：已移除");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("digest-mobile.png"), fullPage: true });
});

test("shows an export error and lets the user retry without changing the snapshot", async ({ page }) => {
  const digest = digestFixture();
  let attempts = 0;
  await page.route("**/api/digests/7/export?*", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 500, json: { error: { code: "digest_export_failed", message: "导出暂时失败，请重试。" } } })
      : fulfillExport(route, digest);
  });
  const card = await openDigest(page, digest);
  await card.getByRole("button", { name: "下载 Markdown" }).click();
  await expect(card.getByRole("alert")).toHaveText("导出暂时失败，请重试。");
  await expect(card.getByRole("button", { name: "下载 Markdown" })).toBeEnabled();
  const downloadEvent = page.waitForEvent("download");
  await card.getByRole("button", { name: "下载 Markdown" }).click();
  await downloadEvent;
  await expect(card.getByRole("alert")).toHaveCount(0);
  await expect(card.getByText("草稿", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
