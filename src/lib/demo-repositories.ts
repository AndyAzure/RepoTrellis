export const repositoryStatuses = [
  "candidate",
  "trying",
  "adopted",
  "reference",
] as const;

export type RepositoryStatus = (typeof repositoryStatuses)[number];
export type RepositorySource = "github" | "rss" | "manual";

export type DemoRepository = {
  id: string;
  fullName: string;
  description: string;
  language: string;
  languageColor: string;
  stars: string;
  updated: string;
  status: RepositoryStatus;
  source: RepositorySource;
  tags: string[];
  score: number;
  nextAction: string;
  evidence: string;
};

export const demoRepositories: DemoRepository[] = [
  {
    id: "playwright",
    fullName: "microsoft/playwright",
    description: "可靠的端到端测试和浏览器自动化工具。",
    language: "TypeScript",
    languageColor: "#3178c6",
    stars: "72.4k",
    updated: "今天",
    status: "trying",
    source: "github",
    tags: ["测试", "浏览器"],
    score: 91,
    nextAction: "为核心流程补一条 smoke test",
    evidence: "与你关注的 TypeScript、测试基础设施主题匹配。",
  },
  {
    id: "ai-sdk",
    fullName: "vercel/ai",
    description: "面向 TypeScript 应用的 AI SDK 和流式 UI 工具。",
    language: "TypeScript",
    languageColor: "#3178c6",
    stars: "16.8k",
    updated: "昨天",
    status: "candidate",
    source: "rss",
    tags: ["AI", "Next.js"],
    score: 87,
    nextAction: "对比当前 Provider 接口设计",
    evidence: "来自 RSS 文章《Building reliable AI products》。",
  },
  {
    id: "langgraph",
    fullName: "langchain-ai/langgraph",
    description: "用图结构编排有状态、可恢复的 AI Agent 工作流。",
    language: "Python",
    languageColor: "#3572a5",
    stars: "12.1k",
    updated: "3 天前",
    status: "reference",
    source: "manual",
    tags: ["Agent", "工作流"],
    score: 79,
    nextAction: "记录与 jobs 表的映射方式",
    evidence: "手动添加，与你的后台任务架构研究相关。",
  },
  {
    id: "ollama",
    fullName: "ollama/ollama",
    description: "在本地运行大型语言模型的轻量工具。",
    language: "Go",
    languageColor: "#00add8",
    stars: "146k",
    updated: "上周",
    status: "candidate",
    source: "github",
    tags: ["本地模型", "AI"],
    score: 76,
    nextAction: "确认 Ollama Provider 的最小适配面",
    evidence: "与你偏好的本地优先和 Provider 抽象一致。",
  },
  {
    id: "zed",
    fullName: "zed-industries/zed",
    description: "面向协作和智能编码的高性能编辑器。",
    language: "Rust",
    languageColor: "#dea584",
    stars: "65.7k",
    updated: "2 周前",
    status: "adopted",
    source: "github",
    tags: ["编辑器", "Rust"],
    score: 68,
    nextAction: "整理当前使用笔记",
    evidence: "已标记为 adopted，保留最近一次复盘入口。",
  },
  {
    id: "sqlite-utils",
    fullName: "simonw/sqlite-utils",
    description: "从 Python 和命令行操作 SQLite 数据的工具集。",
    language: "Python",
    languageColor: "#3572a5",
    stars: "7.9k",
    updated: "上月",
    status: "reference",
    source: "rss",
    tags: ["SQLite", "数据"],
    score: 64,
    nextAction: "评估是否用于演示数据导入",
    evidence: "来自 SQLite 生态周报，保留来源证据。",
  },
];
