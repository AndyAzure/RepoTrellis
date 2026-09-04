# RepoTrellis

RepoTrellis 是一个本地优先、可解释的多源开源项目雷达：把 GitHub Stars、RSS、文章和用户主动分享的链接，整理成可搜索、可筛选、可定期复盘的项目库。

项目背景、产品边界、技术栈、AI 架构和开发路线见 [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)。

项目治理边界见 [SECURITY.md](SECURITY.md)、[RESPONSIBLE-USE.md](RESPONSIBLE-USE.md) 和 [TRADEMARKS.md](TRADEMARKS.md)；参与开发请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 本地开发

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

打开 `http://127.0.0.1:3000`，即可导入公开的 GitHub Stars、添加 RSS/Atom 或手动链接、全文搜索仓库，并编辑状态、标签、下一步行动和笔记。收藏库以「候选 / 试用中 / 已采用 / 参考 / 已放弃」工作流分组，用响应式卡片突出项目脉络和下一步，而不是复制 GitHub 的社交信息流；收件箱则按「待确认 / 已接受 / 已忽略」分组，作为线索处理台。RSS feed 另有同步状态卡片，显示最近尝试、上次成功和错误原因；GitHub 引用解析失败后可由退避调度或人工按钮处理到期重试。来源先由人工接受，再可显式“解析并入库”其中的 GitHub `owner/repo` 引用；仓库和来源证据会幂等保存到本地。项目详情支持显式生成基于本地元数据和来源证据的结构化分析（当前 provider 为 `local-rules-v1`，不调用云端模型），兴趣与规则页可保存正向/负向偏好，详情页会给出本地推荐分数并记录 `keep/try/adopt/dismiss/block` 反馈。周报页会动态生成最近 7 天的推荐预览，用户确认后才把选中的分数、理由和排序保存为本地 `draft` 快照，并在历史快照区保留可复盘记录；历史项目还可以标记为待定、保留或移除，不会自动发送。可选的 `GITHUB_TOKEN` 只用于提高 GitHub 只读 API 的限流额度。

在「周报 → 历史快照」可以按复盘决定和周期筛选快照；在每张卡片的「带到我的笔记」可以下载 Markdown 或 JSON，默认只导出未移除项目，也可选择完整复盘记录。位置、分数和理由沿用保存时的快照；决定取当前已保存值，项目描述和下一步行动取当前收藏库。导出不含私人笔记与兴趣配置，不会修改或发布周报。

在「收件箱 → RSS 同步状态」可以导出全部 RSS / Atom 订阅为 OPML，包含同步异常或暂停的来源，便于迁移到其他阅读器。OPML 只写入订阅标题和安全的 HTTP(S) 地址；导出在浏览器本地下载，不会上传、分享或修改来源。

在「AI 梳理」可以配置自己的 OpenAI-compatible endpoint、模型 ID 和 API Key（也支持本机 Ollama 等兼容服务），先批量梳理最多 30 条待确认来源。AI 只返回建议接受、需要复核或建议忽略，以及摘要和理由；只有你主动点击批量按钮才会更新来源状态。API Key 仅保存在当前浏览器的 `localStorage`，不会写入 SQLite；公共电脑或共享浏览器使用后请清除该配置。没有 Key 时也可以使用“无需 Key 的本地先筛”。

常用检查：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`。修改 Drizzle 表结构后先运行 `pnpm db:generate`，再运行 `pnpm db:migrate`。本地 SQLite 文件默认写入 `data/repotrellis.db`，不会提交到 Git。

也可以使用 Docker Compose 运行生产构建：

```bash
docker compose up --build
```

Compose 默认只绑定 `127.0.0.1:3000`，SQLite 数据保存在 `repotrellis-data` volume。停止容器使用 `docker compose down`；不要执行 `docker compose down -v`，除非确认要删除该 volume 中的本地数据。首次启动会在容器内应用 Drizzle 迁移，不会自动抓取 GitHub 或其他外部来源。
