import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("opens and dismisses the GitHub Stars import flow", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "收藏库", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("SQLite · 本地数据")).toBeVisible();

  await page
    .getByRole("button", { name: "导入 Stars", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "导入 Stars" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("GitHub 用户名或个人 URL")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("navigates to the source inbox without submitting external requests", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "收件箱", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "收件箱", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("添加来源", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "RSS / Atom" }).click();
  await expect(page.getByLabel("RSS / Atom Feed URL")).toBeVisible();
  await expect(page.getByText("不会长期保存正文")).toBeVisible();
});

test("exports RSS subscriptions as a local OPML download", async ({ page }) => {
  await page.route("**/api/inbox/feeds?*", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: 1,
            url: "https://reader.example.com/feed.xml",
            title: "Engineering Notes",
            lastFetchedAt: "2026-09-04 10:00:00",
            status: "active",
            lastError: null,
            updatedAt: "2026-09-04 10:00:00",
          },
        ],
      },
    });
  });
  await page.route("**/api/inbox/feeds/export", async (route) => {
    await route.fulfill({
      contentType: "application/xml; charset=utf-8",
      body: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0"><body>',
        '<outline type="rss" text="Engineering Notes" xmlUrl="https://reader.example.com/feed.xml" />',
        "</body></opml>",
      ].join("\n"),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "收件箱", exact: true }).click();
  await expect(page.getByRole("heading", { name: "RSS 同步状态" })).toBeVisible();

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 OPML" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("repotrellis-rss-feeds.opml");
  const path = await download.path();
  expect(path).toBeTruthy();
  const xml = await readFile(path!, "utf8");
  expect(xml).toContain('<opml version="2.0">');
  expect(xml).toContain("Engineering Notes");
});

test("opens the local interest rules editor", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "兴趣与规则", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "兴趣与规则", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("档案名称")).toBeVisible();
  await expect(page.getByLabel("正向规则")).toBeVisible();
  await expect(page.getByLabel("负向规则")).toBeVisible();
  await expect(page.getByText("本地单用户档案")).toBeVisible();
});

test("opens the weekly digest preview without submitting it", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "周报", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "周报", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "周报预览", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "历史快照", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/先看推荐理由，再决定哪些项目进入本周快照/),
  ).toBeVisible();
});
