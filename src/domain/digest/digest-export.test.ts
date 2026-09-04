import { describe, expect, it } from "vitest";

import type { DigestSnapshot, DigestSnapshotItem } from "./digest";
import {
  digestExportFilename,
  formatDigestJson,
  formatDigestMarkdown,
  selectDigestExportItems,
} from "./digest-export";

function snapshot(): DigestSnapshot {
  return {
    id: 7,
    periodStart: "2026-08-29",
    periodEnd: "2026-09-04",
    status: "draft",
    configSnapshot: { privateConfig: "PRIVATE_CONFIG" },
    createdAt: "2026-09-04 10:00:00",
    updatedAt: "2026-09-04 10:00:00",
    items: [item(3, "kept"), item(1, "pending"), item(2, "dismissed")],
  };
}

function item(position: number, decision: DigestSnapshotItem["decision"]): DigestSnapshotItem {
  return {
    id: position,
    repositoryId: position,
    score: 70 + position,
    reasons: ["命中兴趣规则", "来自已确认来源"],
    position,
    decision,
    repository: {
      id: position,
      githubId: position,
      fullName: `acme/project${position}`,
      owner: "acme",
      name: `project${position}`,
      url: `https://github.com/acme/project${position}`,
      description: "项目描述",
      defaultBranch: "main",
      language: "TypeScript",
      stars: 1,
      forks: 0,
      license: "MIT",
      isArchived: false,
      remoteUpdatedAt: null,
      createdAt: "2026-09-04 10:00:00",
      updatedAt: "2026-09-04 10:00:00",
      status: "candidate",
      tags: [],
      note: "PRIVATE_NOTE",
      priority: 0,
      nextAction: "验证最小用例",
      sources: ["manual"],
    },
  };
}

describe("digest Markdown export", () => {
  it("excludes dismissed items by default and preserves original positions without mutating input", () => {
    const digest = snapshot();
    const markdown = formatDigestMarkdown(digest);
    expect(selectDigestExportItems(digest, "active").map((entry) => entry.position)).toEqual([1, 3]);
    expect(digest.items.map((entry) => entry.position)).toEqual([3, 1, 2]);
    expect(markdown.indexOf("## 1. acme/project1")).toBeLessThan(markdown.indexOf("## 3. acme/project3"));
    expect(markdown).not.toContain("acme/project2");
    expect(markdown).toContain("快照分数：71 / 100");
    expect(markdown).toContain("复盘决定：待定");
    expect(markdown).toContain("复盘决定：保留");
    expect(markdown).toContain("命中兴趣规则");
  });

  it("includes removed decisions only in the complete record", () => {
    const markdown = formatDigestMarkdown(snapshot(), "all");
    expect(markdown).toContain("完整复盘记录 · 3 个项目");
    expect(markdown).toContain("## 2. acme/project2");
    expect(markdown).toContain("复盘决定：已移除");
  });

  it("produces stable machine-readable JSON without private fields", () => {
    const payload = JSON.parse(formatDigestJson(snapshot())) as {
      exportVersion: string;
      scope: string;
      digest: { id: number; periodStart: string };
      items: Array<{
        position: number;
        score: number;
        decision: string;
        currentRepository: { fullName: string; note?: string; nextAction: string };
      }>;
    };
    expect(payload.exportVersion).toBe("repotrellis-digest-export-v1");
    expect(payload.scope).toBe("active");
    expect(payload.digest).toMatchObject({ id: 7, periodStart: "2026-08-29" });
    expect(payload.items.map((item) => item.position)).toEqual([1, 3]);
    expect(payload.items[0]).toMatchObject({
      score: 71,
      decision: "pending",
      currentRepository: {
        fullName: "acme/project1",
        nextAction: "验证最小用例",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("PRIVATE_NOTE");
    expect(JSON.stringify(payload)).not.toContain("PRIVATE_CONFIG");
    expect(payload.items[0]?.currentRepository.note).toBeUndefined();
  });

  it("labels current metadata and never exports private notes or configuration", () => {
    const markdown = formatDigestMarkdown(snapshot());
    expect(markdown).toContain("不代表保存时状态");
    expect(markdown).toContain("当前下一步：验证最小用例");
    expect(markdown).not.toContain("PRIVATE_NOTE");
    expect(markdown).not.toContain("PRIVATE_CONFIG");
    expect(markdown).toBe(formatDigestMarkdown(snapshot()));
    expect(digestExportFilename(7, "all")).toBe("repotrellis-digest-7-all.md");
  });

  it("supports empty selections and missing optional fields", () => {
    const digest = snapshot();
    digest.items = [item(1, "dismissed")];
    expect(formatDigestMarkdown(digest)).toContain("此范围内没有项目。");
    digest.items[0].score = null;
    digest.items[0].reasons = [];
    digest.items[0].repository.description = null;
    digest.items[0].repository.nextAction = null;
    const markdown = formatDigestMarkdown(digest, "all");
    expect(markdown).toContain("未评分");
    expect(markdown).toContain("未保存推荐理由");
    expect(markdown).toContain("暂无描述");
    expect(markdown).toContain("尚未填写");
  });

  it("escapes embedded HTML, Markdown and multiline text", () => {
    const digest = snapshot();
    digest.items[0].repository.description = '<img src="https://external.example/pixel">\n![image](https://external.example/image)';
    digest.items[0].reasons = ["safe\r\n# injected heading", "<script>alert(1)</script>"];
    const markdown = formatDigestMarkdown(digest);
    expect(markdown).not.toContain("<img");
    expect(markdown).not.toContain("<script>");
    expect(markdown).toContain("&lt;img");
    expect(markdown).toContain("\\!\\[image\\]");
    expect(markdown).toContain("safe \\# injected heading");
  });

  it.each(["javascript:alert(1)", "file:///tmp/private", "https://user:password@example.com/repo", "invalid"])(
    "rejects unsafe project links: %s",
    (url) => {
      const digest = snapshot();
      digest.items = [item(1, "kept")];
      digest.items[0].repository.url = url;
      const markdown = formatDigestMarkdown(digest);
      expect(markdown).toContain("项目链接：链接不可用");
      expect(markdown).not.toContain(url);
    },
  );
});
