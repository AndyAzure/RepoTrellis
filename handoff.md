# RepoTrellis 交接记录

## 现在做什么

RepoTrellis 已完成 Sprint 0 骨架、Sprint 1 GitHub Stars 收藏库闭环、Sprint 2 多来源收件箱闭环，以及本地分析、兴趣规则、推荐反馈和周报预览切片。目前已接上“动态推荐 → 人工确认 → 可追溯快照 → 复盘决定 → 本地 Markdown/JSON 导出”，也已提供到期解析重试入口和 RSS OPML 本地迁移导出。在线分享或发送仍待单独明确外发目标和权限，可选模型 provider 也待单独明确。

本轮收尾已用 `pnpm dev --hostname 127.0.0.1` 启动本地预览，`http://127.0.0.1:3000/` 验证返回 200。下轮先检查现有进程，不要重复启动或终止未知服务。

## 已完成什么

- 已从 `https://github.com/AndyAzure/RepoTrellis` 克隆到 `/Users/fangyueyu/Desktop/code2609/RepoTrellis`。
- 已确认 GitHub 仓库使用 MIT License。
- 已确定产品名 RepoTrellis。
- 已在 `docs/PROJECT_CONTEXT.md` 记录产品目标、用户偏好、MVP、边界、技术栈、AI 架构、评分模型和开发 Sprint。
- 已在 `README.md` 添加项目简介和上下文文档入口。
- 已完成 Next.js 16 App Router + TypeScript + Tailwind CSS 骨架，首页提供最小项目状态占位。
- 已配置 SQLite + Drizzle ORM：8 张核心表、初始迁移、`db:generate`/`db:migrate`/`db:studio` 脚本。
- 已建立 `src/domain`、`src/connectors`、`src/ingest`、`src/ai`、`src/ranking`、`src/jobs` 模块边界。
- 已配置 shadcn/ui 组件约定、Vitest 单测和 Playwright E2E 配置，并加入 SQLite 迁移验收测试。
- 已完成收藏库工作台 UI：桌面侧栏、移动端导航、统计卡、搜索/状态/来源筛选、项目详情、空状态和 GitHub 导入弹窗。
- 已增加 SQLite FTS5 外部内容表和 insert/update/delete 同步触发器，支持安全的前缀全文搜索。
- 已实现可注入 `fetch` 的 GitHub Stars 只读连接器，覆盖分页、响应校验、限流和错误映射；单测不访问外网。
- 已实现事务式 Stars 入库：仓库 Upsert、默认用户状态、`source_items` 来源和 `repo_mentions` 证据同步落库。
- 已实现仓库列表、搜索/筛选、详情和元数据 PATCH Route Handlers，以及 GitHub Stars 导入入口。
- 收藏库已切换到真实 SQLite 数据，支持状态、标签、下一步行动和笔记编辑；补齐加载、空、错误、保存和导入反馈。
- UI 按 `ui-ux-pro-max` 做了桌面亮色、移动端深色视觉验收，并补充键盘焦点和 Esc 关闭弹窗。
- 已增加 Playwright 收藏库导入弹窗流程测试；本轮没有实际请求 GitHub API。
- 已增加 RSS/Atom 连接器（`rss-parser`）、feed 元数据表和条目 Upsert，保留摘要、发布时间和 GitHub 引用。
- 已增加手动链接入库：URL 规范化、标题/摘录、GitHub URL 与 `owner/repo` 提取、去重。
- `source_items` 已增加 `processing_status`、`review_status`、`parse_attempts`、`next_retry_at`、`last_error` 和 `extracted_github_refs`，为失败重试与人工确认留出明确状态。
- 已实现收件箱查询、手动链接/RSS 导入、来源详情和接受/忽略 PATCH Route Handlers。
- 已增加收件箱 UI：手动链接与 RSS 表单、引用预览、审核状态筛选、失败计数和接受/忽略操作；Playwright 覆盖导航和 RSS 表单展示。
- 已抽取共享 GitHub 仓库连接器与事务持久化：接受来源后可显式点击“解析并入库”，严格限制为 GitHub `owner/repo` 引用，最多 20 个，优先复用本地仓库。
- 已新增解析租约、令牌、完成时间和证据计数；网络请求全部完成后才开启数据库事务，失败不会留下半批仓库，重复解析不会重复创建证据。
- 已新增 `/api/inbox/[sourceItemId]/resolve` 和收件箱解析/重试/失败状态 UI；来源内容变化或审核撤回会使旧解析失效。新增 Drizzle 迁移 `0005_chemical_kabuki.sql` 已应用到本地开发库。
- 已补充解析服务内存 SQLite + Mock fetch 测试（含严格引用校验、失败回滚、幂等和本地仓库复用）。
- Sprint 3 已完成第一条可验证切片：新增 `repository_analyses` 表和 `0006_handy_fallen_one.sql` 迁移；项目详情可显式触发 `local-rules-v1` 本地确定性结构化分析，保存摘要、主题、技术栈、场景、风险、置信度和输入证据快照；新增 provider 契约、服务、GET/POST API、loading/empty/error/ready UI 状态及 3 个分析测试。
- Sprint 3 的兴趣规则切片已完成：复用 `interests` 表实现单用户 active 档案，新增领域读写接口、`GET/PATCH /api/interests`、规则 trim/去重/数量限制，以及兴趣与规则编辑页的 loading/empty/error/saved 状态；新增 4 个领域测试和 1 个兴趣导航 E2E。
- Sprint 3 的推荐切片已完成：ranking 层根据兴趣、反馈、来源可信度、仓库健康度、新鲜度和新颖度计算 0–100 分，返回命中的正/负规则、数据覆盖度和最多 3 条理由；新增推荐 API、反馈事件领域接口与 `/api/repositories/[repositoryId]/feedback`，项目详情提供可选原因的五种反馈操作。
- Sprint 3 的周报预览切片已完成：`GET/POST /api/digests/preview` 动态生成最近 7 天最多 8 个候选，确认时服务端重算推荐信号，并将选中项目的分数、理由、位置和 `pending` 决策写入现有 `digests` / `digest_items` 表；UI 覆盖加载、空、错误、选择和已保存状态，不做发送。
- Sprint 3 的周报历史切片已完成：新增只读 `GET /api/digests`，默认返回最近 10 条、最多 20 条历史快照；周报页展示周期、状态、保存时间、项目和快照分数，不重新计算历史结果。
- Sprint 3 的快照复盘切片已完成：新增 `PATCH /api/digests/[digestId]/items/[digestItemId]`，历史项目支持可逆的 `pending` / `kept` / `dismissed` 三态决定，服务端校验项目归属并返回更新后的完整快照。
- 收藏库 UI 已完成卡片化重构：真实项目结果按工作流状态分组，卡片突出来源、标签、下一步行动和本地复盘入口，Stars/Forks 仅在详情上下文中保留，不做 GitHub 式信息流。
- 收件箱 UI 已完成线索卡片化重构：按待确认、已接受、已忽略分组并展示下一步动作；解析失败、重试等待和来源证据仍留在卡片内。
- RSS 同步已接入条件请求：已有 feed 会发送 `If-None-Match` / `If-Modified-Since`，`304` 只刷新 `last_fetched_at` 和校验器，不重复写 `source_items`；成功 `200` 会持久化新的 `etag` / `last-modified`，失败保留旧校验器。
- 来源重试与同步状态切片已完成：RSS 请求失败会持久化 feed 的 `error` 状态和错误原因但保留上次成功时间；新增 `/api/inbox/feeds` 状态查询，收件箱展示最近尝试/上次成功；新增 `src/jobs/source-retry.ts` 与 `/api/inbox/retry`，只处理已接受且退避到期的失败解析，页面提供显式“处理到期重试”入口。
- 周报本地 Markdown 导出已完成：新增只读 `GET /api/digests/[digestId]/export?scope=active|all`，默认排除已移除项目，可导出完整记录；位置/分数/理由不重算，当前元数据明确标注，不含私人笔记与兴趣配置。历史卡片增加范围、数量、下载/生成中/错误重试/已发起下载状态，手机端控件上下排列，支持深色模式与键盘焦点。
- 周报历史筛选已完成：`GET /api/digests` 支持 `decision`、`from`、`to`，决定按快照内任一项目匹配，周期按相交范围匹配；页面提供决定/周期控件、清除筛选、无匹配提示，筛选请求失败时保留旧卡片并显示错误。
- 周报 JSON 导出已完成：导出接口支持 `format=markdown|json`，JSON 使用 `repotrellis-digest-export-v1` 固定契约，保留快照字段和当前项目公开元数据，不含私人笔记、兴趣规则和配置；导出工具区可切换格式，文件名、按钮和机器可读提示同步变化。
- RSS OPML 导出已完成：新增纯本地 `GET /api/inbox/feeds/export`，导出全部订阅并跳过非 HTTP(S) 或含凭证的 URL，XML 标题/地址经过转义；收件箱 RSS 状态卡片提供带进行中状态的“导出 OPML”按钮，失败时保留卡片并显示错误，不改变数据库。
- Sprint 5 治理文档已补齐：新增 `SECURITY.md`、`RESPONSIBLE-USE.md`、`TRADEMARKS.md` 和 `CONTRIBUTING.md`，明确漏洞报告不虚构渠道、禁止绕过平台控制、MIT 与商标权的边界，以及本地数据和测试要求。
- Sprint 5 本地容器运行已补齐：新增 `Dockerfile`、`docker-compose.yml` 和 `.dockerignore`；容器启动先应用迁移再启动生产服务，SQLite 使用 `repotrellis-data` volume，端口默认只绑定 `127.0.0.1:3000`。本轮只运行了 `docker compose config` 静态校验，没有拉取镜像或部署。
- BYOK AI 批量梳理已完成：新增 `/api/ai/triage` OpenAI-compatible 结构化接口、`local-rules-v1` 无 Key 初筛、`/api/inbox/batch-review` 事务式批量审核，以及“AI 梳理”导航页；API Key 仅保存在浏览器 localStorage，模型建议默认不自动改状态，用户可批量接受/忽略明确建议，`review` 留给人工复核。
- 当前验证为 23 个 Vitest 文件/99 个用例、lint、typecheck、build 均通过。12 个 Playwright 用例通过，覆盖 BYOK 配置、批量梳理、批量接受、Markdown/JSON 默认与全量下载、OPML 下载、全移除空范围、请求中禁用、失败重试、历史决定/周期筛选、清除筛选、筛选失败保留旧结果和移动端键盘焦点；已查看 AI 梳理结果聚合桌面截图，以及既有桌面亮色/手机深色截图。本轮获得本地服务和 Chromium 的沙箱外执行许可后，之前的 `MachPortRendezvous ... Permission denied` 不再阻塞，不能把历史失败继续记为当前失败。新增 API 测试只使用内存 SQLite，浏览器测试拦截为样例数据，没有修改真实记录或调用第三方模型。

## 当前卡点

没有产品层面的外部阻塞。GitHub 未配置 Token 时仍可读取公开 Stars，但受匿名 API 限流；凭证由用户自行配置，代理不要读取 `.env`。Playwright 在受限沙箱中可能需要本地服务/浏览器执行许可，本轮已成功运行；`NO_COLOR` / `FORCE_COLOR` warning 不影响结果。

## 下一步

1. 评估在线分享或发送，但必须单独确认外发目标和权限；不要默认复用本地下载。
2. 在 BYOK 基础上评估更细粒度的模型配置/密钥管理，再实现可控周报发送。

## 不要踩的坑

- MIT 允许免费商用，不能在 README 里声称禁止商用；商业价值放在托管服务、数据源、AI 配额、支持和品牌上。
- 不做抖音、小红书、公众号的无授权全量爬取，不绕过验证码、反爬或访问控制。
- GitHub Token、第三方凭证、`.env` 和真实用户数据不能提交。
- 不要让 AI 生成 FTS 查询语法；`toFtsQuery` 必须继续做确定性 token 化，避免操作符注入和解析错误。
- GitHub 导入要继续经过连接器标准化与事务入库层，不要在 Route Handler 或 React 组件里直接写 SQL。
- AI 只负责语义提取、摘要和解释；URL、去重、权限、限流、调度和状态一致性由确定性代码负责。
- `/Users/fangyueyu/Desktop/code2609` 已有其他目录 `etcn`，不要覆盖或移动它。
- 未经用户明确要求，不执行 `git push`、发布或部署。
- 导出必须区分历史快照的分数/理由与当前项目描述/行动；不要把当前元数据宣称为历史值，也不要默认导出私人笔记。
- Vitest 已配置 `@` 到 `src` 的路径别名；Route Handler 测试 mock `@/db` 使用内存数据库，禁止因测试导入真实 DB 客户端。
