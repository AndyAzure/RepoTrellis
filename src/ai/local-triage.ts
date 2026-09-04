import type { AiTriageItem, AiTriageSourceInput } from "./triage";

const technicalTerms = [
  "api",
  "cli",
  "code",
  "database",
  "developer",
  "docker",
  "framework",
  "github",
  "javascript",
  "llm",
  "open source",
  "python",
  "react",
  "rust",
  "sdk",
  "self-hosted",
  "sqlite",
  "typescript",
  "开发",
  "开源",
  "模型",
  "工具",
  "自动化",
];

export function triageLocally(sources: AiTriageSourceInput[]): AiTriageItem[] {
  return sources.map((source) => {
    const label = source.title?.trim() || source.url;
    const text = [source.title, source.excerpt, source.url]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const hasProjectReference = source.extractedGithubRefs.length > 0;
    const hasTechnicalSignal = technicalTerms.some((term) => text.includes(term));
    const verdict = hasProjectReference
      ? "keep"
      : hasTechnicalSignal && (source.excerpt?.trim().length ?? 0) >= 60
        ? "review"
        : "skip";

    return {
      sourceItemId: source.sourceItemId,
      verdict,
      summary: `${label.slice(0, 180)}${label.length > 180 ? "…" : ""}`,
      reason: hasProjectReference
        ? `已发现 ${source.extractedGithubRefs.length} 个 GitHub 引用，值得先进入项目库。`
        : verdict === "review"
          ? "内容有技术信号，但没有明确 GitHub 项目引用，建议快速复核。"
          : "当前摘要缺少明确项目线索，先降低处理优先级。",
      projectRefs: source.extractedGithubRefs,
    } satisfies AiTriageItem;
  });
}
