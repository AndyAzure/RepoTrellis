# RepoTrellis 项目上下文

> 本文记录项目启动阶段已经确认的目标、边界、技术决策和下一步路线。
> 后续开发前先阅读本文；如果决策发生变化，直接更新本文并记录原因。

## 1. 项目身份

- 项目名：RepoTrellis
- GitHub：<https://github.com/AndyAzure/RepoTrellis>
- 本地路径：`/Users/fangyueyu/Desktop/code2609/RepoTrellis`
- 中文定位：多源开源项目雷达
- Slogan：把分散的信息，编成值得保留的 GitHub 项目脉络。
- 当前状态：已完成本地单用户 MVP 的 Sprint 0–3 主闭环，以及周报预览/历史、Markdown/JSON/OPML 导出、BYOK AI 批量初筛、治理文档和 Docker Compose 本地运行切片；应用不自带云模型凭证，定时 Worker、在线发送与多人协作仍未启用。
- 当前许可证：MIT License。

## 2. 要解决的问题

GitHub 上有大量值得关注的项目，但它们分散在 Stars、书签、RSS、新闻、公众号、抖音、小红书和各种文章中。现有工具通常只解决其中一块：

- 只管理 GitHub Stars，不处理外部信息源。
- 只做 RSS 阅读，不识别文章里提到的 GitHub 项目。
- 只做推荐，不保留用户为什么关注、是否试用和最终是否采用。
- 只做收藏，不帮助用户定期发现新的高价值项目。

RepoTrellis 要形成一个闭环：

```text
多源输入 → 识别 GitHub 项目 → 去重与保留来源证据 → 用户筛选
       → 试用/采用/放弃 → 反馈学习 → 可控的定期推荐
```

## 3. 已确认的用户偏好

来自前期讨论的结论：

1. 第一优先级是快速找回已经看过、收藏过的项目。
2. 第二优先级是每周发现少量真正值得查看的新项目。
3. 知识沉淀重要，但暂不做成复杂知识库或知识图谱。
4. 项目范围以 GitHub 为核心，同时接入 RSS、新闻、博客、公众号文章、抖音/小红书分享链接等外部线索。
5. 推荐采用“规则 + 行为反馈 + AI 语义理解”的混合方式，并且必须能解释推荐原因。
6. 周报数量、主题配额、来源配额、更新时间窗口和最低置信度由用户控制。
7. 默认本地优先、只读 GitHub，不自动修改 Stars、Lists 或仓库内容。
8. 优先利用现有工具和官方接口，避免重复建设不必要的平台能力。
9. 衡量成功的标准：30 秒内找到目标项目；每周发现有价值项目；每周整理时间不超过 15 分钟。

## 4. MVP 必须做

### 4.1 数据和输入

- 导入并同步 GitHub Stars。
- 手动粘贴任意网页、文章、公众号、抖音或小红书链接。
- 支持 RSS/Atom 订阅。
- 从正文、摘要、标题和用户提供的文本中提取 GitHub URL 或 `owner/repo`。
- 对同一仓库的多条来源去重合并，同时保留来源 URL、标题、摘录和发现时间。

### 4.2 整理和搜索

- 仓库详情：README、语言、Stars、Forks、最近更新、License、归档状态。
- 标签、备注、优先级、下一步行动。
- 状态：`candidate` / `trying` / `adopted` / `dropped` / `reference`。
- 关键词全文搜索、主题筛选、来源筛选、健康度筛选和时间筛选。
- Markdown / JSON / OPML 导出。

### 4.3 AI 能力

- 识别文章或分享内容中提到的 GitHub 项目。
- 结构化提取项目主题、用途、技术栈、适用场景和风险提示。
- 根据用户主动描述的兴趣和正负向规则进行匹配。
- 生成摘要、推荐理由和“不推荐原因”。
- 根据 `keep`、`try`、`adopt`、`dismiss`、`block` 等反馈调整排序。

### 4.4 周报

- 默认每周 5–8 条，可由用户调整。
- 支持主题配额、来源配额、时间窗口、最低置信度和新颖度比例。
- 周报生成前允许预览和手动调整。
- 每条推荐显示来源证据、评分和最多 3 个推荐理由。

## 5. 明确不做（MVP 边界）

- 不做抖音、小红书、微信公众号的无授权全量爬取。
- 不登录第三方平台抓取私有内容。
- 不绕过验证码、反爬、访问控制或平台限制。
- 不自动下载并长期保存完整视频、图片或全文内容。
- 不自动修改 GitHub Stars、Lists 或取消 Star。
- 不做多人协作、公开社区、排行榜和社交关注。
- 不做复杂知识图谱、代码级深度分析和自动部署。

外部平台采用：**官方 API/RSS 优先，用户主动分享链接兜底**。所有连接器都需要保留来源和抓取时间。

## 6. 推荐技术栈

采用“AI 原生的模块化单体”，而不是一开始拆微服务：

```text
Node.js 当前 LTS + pnpm
TypeScript
Next.js App Router
Tailwind CSS + shadcn/ui
SQLite + Drizzle ORM
SQLite FTS5
Vercel AI SDK + Zod
Node Worker + SQLite jobs 表 + Croner
@mozilla/readability + jsdom
rss-parser
GitHub REST/GraphQL API（只读）
Vitest + Playwright
Docker Compose
```

### 技术取舍

- 全栈 TypeScript，减少前后端和 AI 代码之间的转换成本。
- SQLite 单文件即可运行和备份，适合本地优先。
- FTS5 先解决关键词和筛选，不在 MVP 阶段引入向量数据库。
- AI 通过结构化输出进入数据库，使用 Zod 校验，不让自然语言直接成为系统状态。
- 后台任务先使用单独 Worker 和任务表；云端规模上来后再考虑 Inngest 或 Trigger.dev。
- 模型通过 Provider 接口适配，可接 OpenAI-compatible 服务或本地 Ollama，不把模型供应商写死。

## 7. AI 原生架构原则

```text
来源连接器
    ↓
确定性 URL 提取、规范化、去重
    ↓
AI 结构化识别项目、主题、用途、风险
    ↓
保存项目、来源证据和置信度
    ↓
规则过滤 + 个性化评分
    ↓
AI 摘要、解释和周报
    ↓
用户反馈
```

AI 负责语义任务；确定性代码负责 URL、去重、权限、限流、调度和数据一致性。AI 不直接执行外部副作用，不直接修改 GitHub，不绕过第三方平台限制。

## 8. 初始评分模型

第一版使用可解释的加权模型，不急着训练复杂推荐模型：

```text
兴趣匹配       35%
用户反馈       20%
来源可信度     15%
仓库健康度     15%
新鲜度         10%
新颖度          5%
```

每条推荐保存评分快照和理由，确保未来可以回答：为什么推荐、来自哪里、当时依据是什么。

## 9. 数据模型方向

核心实体：

- `repositories`：GitHub 仓库及同步后的元数据。
- `source_items`：RSS、文章、手动链接和平台分享内容。
- `repo_mentions`：来源中提到仓库的证据、摘录和置信度。
- `user_repository_meta`：用户标签、备注、状态和下一步行动。
- `interests`：自然语言兴趣、正负向规则、硬过滤和周报配置。
- `feedback_events`：用户对推荐和仓库的处理行为。
- `digests` / `digest_items`：周报配置快照、入选结果、解释和处理结果。

## 10. 安全、合规和开源治理

- 当前代码使用 MIT，意味着别人可以免费使用、修改和商用。
- 不在 README 中声称 MIT 禁止商用；商业限制不能靠附加说明覆盖 MIT。
- 用 `RESPONSIBLE-USE.md` 说明禁止绕过权限、滥用平台接口、隐私侵犯、垃圾信息和骚扰等用途。
- 用 `SECURITY.md` 说明漏洞报告方式；优先开启 GitHub Private Vulnerability Reporting。
- 用 `TRADEMARKS.md` 说明 RepoTrellis 名称、Logo 和官方背书不随 MIT 自动授权。
- 不把用户的 GitHub Token、第三方凭证或 `.env` 文件提交到仓库。
- GitHub 连接默认使用最小只读权限。
- 服务端连接器需要限流、重试、超时和来源留痕。

## 11. 第一阶段开发顺序

### Sprint 0：骨架

- 初始化 Next.js + TypeScript + Tailwind + shadcn/ui。
- 配置 SQLite、Drizzle、迁移和测试。
- 建立 `src/domain`、`src/connectors`、`src/ingest`、`src/ai`、`src/ranking`、`src/jobs`。

### Sprint 1：收藏库

- GitHub Stars 导入。
- 仓库列表、详情、标签、备注、状态。
- SQLite FTS5 搜索和基础筛选。

### Sprint 2：多源收件箱

- RSS/Atom 订阅。
- 手动粘贴链接。
- 正文提取、GitHub URL 识别、仓库去重和来源证据。

### Sprint 3：AI 整理

- AI 结构化项目识别。
- 兴趣配置。
- 推荐评分、推荐理由和反馈事件。

### Sprint 4：周报

- 周报配置和预览。
- Worker 定时运行。
- 失败重试、幂等和历史记录。

### Sprint 5：可分享和可维护

- Markdown/JSON/OPML 导出。
- `SECURITY.md`、`RESPONSIBLE-USE.md`、`TRADEMARKS.md`。
- Docker Compose 一键运行。
- README、截图、演示数据和贡献指南。

## 12. 当前待决策项

以下问题留到真正开始编码时再决定：

1. 第一版只做本地单用户，还是同时支持登录和云端同步。
2. AI 默认使用云端模型，还是优先支持本地 Ollama。
3. 周报先在页面内生成，还是同时发送邮件/通知。
4. 浏览器扩展放在 MVP 之后，还是作为手动分享入口的下一步。
5. 是否把 RSS、文章和手动导入都放在同一个收件箱视图中。

默认选择：**先做本地单用户、页面内周报、手动分享入口，验证闭环后再扩展。**
