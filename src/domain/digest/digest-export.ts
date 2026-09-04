import type { DigestItemDecision, DigestSnapshot, DigestSnapshotItem } from "./digest";

export const digestExportScopes = ["active", "all"] as const;
export type DigestExportScope = (typeof digestExportScopes)[number];
export const digestExportFormats = ["markdown", "json"] as const;
export type DigestExportFormat = (typeof digestExportFormats)[number];

const decisionLabels: Record<DigestItemDecision, string> = {
  pending: "待定",
  kept: "保留",
  dismissed: "已移除",
};

export function selectDigestExportItems(
  digest: DigestSnapshot,
  scope: DigestExportScope,
): DigestSnapshotItem[] {
  return digest.items
    .filter((item) => scope === "all" || item.decision !== "dismissed")
    .sort((left, right) => left.position - right.position || left.id - right.id);
}

export function digestExportFilename(id: number, scope: DigestExportScope): string {
  return `repotrellis-digest-${id}-${scope}.md`;
}

export function digestExportFilenameWithFormat(
  id: number,
  scope: DigestExportScope,
  format: DigestExportFormat,
): string {
  return `repotrellis-digest-${id}-${scope}.${format === "json" ? "json" : "md"}`;
}

export function formatDigestExport(
  digest: DigestSnapshot,
  scope: DigestExportScope = "active",
  format: DigestExportFormat = "markdown",
): string {
  return format === "json"
    ? formatDigestJson(digest, scope)
    : formatDigestMarkdown(digest, scope);
}

export function formatDigestMarkdown(
  digest: DigestSnapshot,
  scope: DigestExportScope = "active",
): string {
  const items = selectDigestExportItems(digest, scope);
  const lines = [
    "# RepoTrellis 周报复盘",
    "",
    `周期：${escapeText(digest.periodStart)} — ${escapeText(digest.periodEnd)}`,
    `快照：#${digest.id} · 保存时间：${escapeText(digest.createdAt)}`,
    `导出范围：${scope === "all" ? "完整复盘记录" : "未移除项目（待定 + 保留）"} · ${items.length} 个项目`,
    "",
    "> 位置、分数与理由来自保存时的快照，未重新计算。决定为当前已保存值。",
    "> 项目名称、链接、描述和下一步行动取自当前收藏库，不代表保存时状态。",
    "> 本文件不含私人笔记与兴趣配置；下载不会发布周报。",
    "",
  ];

  if (items.length === 0) lines.push("此范围内没有项目。", "");

  for (const item of items) {
    const repository = item.repository;
    const url = safeLink(repository.url);
    lines.push(
      `## ${item.position}. ${escapeText(repository.fullName)}`,
      "",
      `- 复盘决定：${decisionLabels[item.decision]}`,
      `- 快照分数：${item.score === null ? "未评分" : `${item.score} / 100`}`,
      `- 项目链接：${url ? `[打开项目](<${url}>)` : "链接不可用"}`,
      `- 当前描述：${escapeText(repository.description?.trim() || "暂无描述")}`,
      `- 当前下一步：${escapeText(repository.nextAction?.trim() || "尚未填写")}`,
      "",
      "### 保存时的推荐理由",
      "",
      ...(
        item.reasons.length
          ? item.reasons.map((reason) => `- ${escapeText(reason)}`)
          : ["- 未保存推荐理由。"]
      ),
      "",
    );
  }

  return lines.join("\n");
}

export function formatDigestJson(
  digest: DigestSnapshot,
  scope: DigestExportScope = "active",
): string {
  const items = selectDigestExportItems(digest, scope).map((item) => ({
    position: item.position,
    score: item.score,
    decision: item.decision,
    reasons: item.reasons,
    currentRepository: {
      fullName: item.repository.fullName,
      url: safeLink(item.repository.url),
      description: item.repository.description,
      nextAction: item.repository.nextAction,
      language: item.repository.language,
      tags: item.repository.tags,
      sources: item.repository.sources,
    },
  }));
  return JSON.stringify(
    {
      exportVersion: "repotrellis-digest-export-v1",
      scope,
      digest: {
        id: digest.id,
        periodStart: digest.periodStart,
        periodEnd: digest.periodEnd,
        status: digest.status,
        createdAt: digest.createdAt,
        updatedAt: digest.updatedAt,
      },
      items,
    },
    null,
    2,
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()#+.!|~-])/g, "\\$1");
}

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.href.replace(/[<>\s\\]/g, (character) => encodeURIComponent(character));
  } catch {
    return null;
  }
}
