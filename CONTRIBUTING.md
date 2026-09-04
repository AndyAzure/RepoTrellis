# 贡献指南

感谢参与 RepoTrellis。项目目前以本地单用户 MVP 为主，贡献请优先保持“多源输入 → 人工确认 → 可追溯整理”的闭环，不把它扩展成社交平台或自动发布系统。

## 开始开发

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

默认 SQLite 文件在 `data/repotrellis.db`。请使用样例或临时内存数据库进行测试，不要把真实数据库、`.env.local`、Token 或导出文件加入提交。

## 提交前检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

涉及 Drizzle 表结构时，先运行 `pnpm db:generate`，检查迁移内容，再运行 `pnpm db:migrate`。Route Handler 测试应 mock `@/db` 并使用内存 SQLite，不访问真实数据或第三方 API。

## 设计与边界

- 确定性代码负责 URL、去重、权限、限流、调度和数据一致性；
- AI 输出必须结构化校验，不能直接变成外部副作用；
- 外部连接器优先使用官方 API/RSS，遵守速率限制和访问控制；
- 新增 UI 时保留 loading、empty、error、success 状态，并提供键盘焦点和移动端可用性；
- 新功能应补充领域测试、路由测试或浏览器验收，并在设计有取舍时记录到 `docs/plans/`。

安全问题请阅读 [SECURITY.md](SECURITY.md)，平台和内容使用边界请阅读 [RESPONSIBLE-USE.md](RESPONSIBLE-USE.md)。
