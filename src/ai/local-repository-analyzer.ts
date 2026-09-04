import type {
  RepositoryAnalysisInput,
  RepositoryAnalyzer,
} from "./index";
import type { RepositoryAnalysisOutput } from "@/domain/analysis/repository-analysis";

const topicRules = [
  { label: "人工智能", terms: ["ai", "llm", "machine learning", "人工智能", "模型"] },
  { label: "数据工程", terms: ["database", "sqlite", "postgres", "mysql", "数据", "etl"] },
  { label: "前端开发", terms: ["react", "next.js", "nextjs", "frontend", "tailwind", "vue"] },
  { label: "开发工具", terms: ["developer tool", "cli", "sdk", "library", "framework", "开发工具"] },
  { label: "自动化", terms: ["automation", "workflow", "pipeline", "自动化", "agent"] },
] as const;

const stackRules = [
  { label: "TypeScript", terms: ["typescript"] },
  { label: "JavaScript", terms: ["javascript"] },
  { label: "Python", terms: ["python"] },
  { label: "Rust", terms: ["rust"] },
  { label: "Go", terms: ["golang", " go "] },
  { label: "React", terms: ["react"] },
  { label: "Next.js", terms: ["next.js", "nextjs"] },
  { label: "Tailwind CSS", terms: ["tailwind"] },
  { label: "SQLite", terms: ["sqlite"] },
  { label: "Drizzle ORM", terms: ["drizzle"] },
  { label: "Docker", terms: ["docker", "container"] },
  { label: "LLM", terms: ["llm", "large language model"] },
] as const;

const useCaseRules = [
  { label: "快速验证项目价值", terms: ["prototype", "starter", "template", "boilerplate"] },
  { label: "构建内部工具", terms: ["internal tool", "dashboard", "admin", "workflow"] },
  { label: "接入 AI 能力", terms: ["ai", "llm", "embedding", "rag", "agent"] },
  { label: "本地运行与部署", terms: ["self-hosted", "local", "docker", "sqlite"] },
  { label: "作为开发依赖复用", terms: ["library", "sdk", "package", "framework"] },
] as const;

export const localRepositoryAnalyzer: RepositoryAnalyzer = {
  provider: "local-rules-v1",
  analyze: analyzeRepositoryLocally,
};

export function analyzeRepositoryLocally(
  input: RepositoryAnalysisInput,
): RepositoryAnalysisOutput {
  const description = input.repository.description?.trim() ?? "";
  const evidenceText = input.evidence
    .flatMap((item) => [item.title, item.excerpt, item.mentionText, item.evidence])
    .filter((item): item is string => Boolean(item))
    .join(" ");
  const tagsText = input.metadata.tags.join(" ");
  const haystack = ` ${[
    input.repository.fullName,
    description,
    input.repository.language,
    tagsText,
    input.metadata.note,
    input.metadata.nextAction,
    evidenceText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()} `;

  const topics: string[] = topicRules
    .filter((rule) => rule.terms.some((term) => haystack.includes(term)))
    .map((rule) => rule.label);
  if (topics.length === 0) topics.push(input.repository.language ? "软件开发" : "待识别");

  const techStack = unique([
    input.repository.language,
    ...stackRules
      .filter((rule) => rule.terms.some((term) => haystack.includes(term)))
      .map((rule) => rule.label),
  ]).slice(0, 12);

  const useCases: string[] = useCaseRules
    .filter((rule) => rule.terms.some((term) => haystack.includes(term)))
    .map((rule) => rule.label);
  if (useCases.length === 0) useCases.push("阅读源码后再决定是否试用");

  const risks: string[] = [];
  if (input.repository.isArchived) risks.push("仓库已归档，依赖和安全更新可能停止。");
  if (!input.repository.license) risks.push("未读取到许可证，商用前需要确认授权边界。");
  if (!description) risks.push("仓库描述缺失，当前判断主要依赖名称和来源证据。");
  if (input.evidence.length === 0) risks.push("暂无来源证据，建议先补充项目出处再评估。");
  if (risks.length === 0) risks.push("这是基于有限元数据的初筛，仍需运行示例验证。");

  const confidence = Math.min(
    0.95,
    0.35 +
      (description ? 0.2 : 0) +
      (input.repository.language ? 0.15 : 0) +
      Math.min(input.evidence.length, 3) * 0.08 +
      Math.min(topics.length, 3) * 0.05,
  );

  const summary = description
    ? `${input.repository.fullName} 是一个${input.repository.language ? `以 ${input.repository.language} 为主的` : ""}开源项目：${trimSummary(description)}`
    : `${input.repository.fullName} 暂缺项目描述，目前根据仓库名称、语言和已保存来源做初步归类。`;

  return {
    summary,
    topics: unique(topics).slice(0, 8),
    techStack,
    useCases: unique(useCases).slice(0, 8),
    risks: unique(risks).slice(0, 8),
    confidence: Number(confidence.toFixed(2)),
  };
}

function trimSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}…` : normalized;
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value) return false;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) return false;
    seen.add(normalized.toLowerCase());
    return true;
  });
}
