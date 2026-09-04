# Docker Compose 本地运行设计

## 目标

- 提供一条命令启动生产构建的 RepoTrellis。
- 将 SQLite 文件放到命名 volume，容器重建后仍保留本地数据。
- 默认只把端口绑定到宿主机 `127.0.0.1`，避免意外暴露到局域网或公网。
- 容器启动前应用 Drizzle 迁移，再启动 Next.js production server。

## 方案

- `Dockerfile` 使用 Node 22 Debian slim，多阶段构建并在 builder 阶段编译 `better-sqlite3` 和 Next.js。
- runtime 保留项目脚本、迁移文件和依赖，以便每次启动执行 `pnpm db:migrate`；迁移是幂等的。
- `docker-compose.yml` 设置 `DATABASE_URL=/app/data/repotrellis.db`，并把 `/app/data` 映射到 `repotrellis-data` volume。
- `.dockerignore` 排除依赖、Next 缓存、SQLite 数据、环境文件和测试产物。

## 非目标与验收

- 不自动拉取第三方数据，不配置 GitHub Token，不部署到远程主机。
- 不在镜像中写入 `.env` 或真实数据库。
- `docker compose config` 应通过；README 明确首次启动需要用户主动执行 `docker compose up --build`，停止使用 `docker compose down`，数据 volume 需单独删除才会丢失。
