import { expect, test } from "@playwright/test";

const pendingItems = [
  {
    id: 101,
    kind: "article",
    url: "https://notes.example.com/tool",
    title: "一篇值得保留的工具介绍",
    excerpt: "介绍一个可本地运行的开源 TypeScript 工具。",
    publishedAt: "2026-09-04",
    processingStatus: "ready",
    reviewStatus: "pending",
    parseAttempts: 0,
    nextRetryAt: null,
    lastError: null,
    resolvedAt: null,
    resolutionStartedAt: null,
    linkedRepositoryCount: 0,
    extractedGithubRefs: ["https://github.com/acme/tool"],
    discoveredAt: "2026-09-04 10:00:00",
    updatedAt: "2026-09-04 10:00:00",
  },
  {
    id: 102,
    kind: "article",
    url: "https://notes.example.com/other",
    title: "一条需要判断的线索",
    excerpt: "这是一段有技术背景但没有明确项目引用的长摘要，用于人工复核。",
    publishedAt: "2026-09-04",
    processingStatus: "ready",
    reviewStatus: "pending",
    parseAttempts: 0,
    nextRetryAt: null,
    lastError: null,
    resolvedAt: null,
    resolutionStartedAt: null,
    linkedRepositoryCount: 0,
    extractedGithubRefs: [],
    discoveredAt: "2026-09-04 09:00:00",
    updatedAt: "2026-09-04 09:00:00",
  },
];

test("configures BYOK and triages the inbox in batches", async ({ page }) => {
  await page.route("**/api/inbox?*", (route) =>
    route.fulfill({ json: { data: pendingItems } }),
  );
  await page.route("**/api/ai/triage", (route) =>
    route.fulfill({
      json: {
        data: {
          model: "sample-model",
          analyzedCount: 2,
          requestedCount: 2,
          items: [
            {
              sourceItemId: 101,
              verdict: "keep",
              summary: "本地优先的 TypeScript 工具",
              reason: "来源包含明确的 GitHub 项目引用。",
              projectRefs: ["https://github.com/acme/tool"],
            },
            {
              sourceItemId: 102,
              verdict: "review",
              summary: "有技术信号但缺少项目引用",
              reason: "需要人工确认是否值得继续追踪。",
              projectRefs: [],
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/inbox/batch-review", (route) =>
    route.fulfill({
      json: {
        data: {
          updated: 1,
          items: [{ ...pendingItems[0], reviewStatus: "accepted" }],
        },
      },
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "AI 梳理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "配置 AI" })).toBeVisible();
  await page.getByLabel("模型 ID").fill("sample-model");
  await page.getByLabel("API Key").fill("test-key");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByText("AI 配置已保存在当前浏览器。", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "批量 AI 梳理" })).toBeEnabled();
  await page.getByRole("button", { name: "批量 AI 梳理" }).click();
  await expect(page.getByRole("heading", { name: "这一轮梳理完成" })).toBeVisible();
  await expect(page.getByText("建议接受 1", { exact: true })).toBeVisible();
  await expect(page.getByText("需要复核 1", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "批量接受" }).click();
  await expect(page.getByText("已接受 1 条来源。", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "清除 Key" }).click();
  await expect(page.getByLabel("API Key")).toHaveValue("");
});
