# RSS 条件请求与同步状态设计

## 目标

让已经保存到 `rss_feeds` 的 HTTP 缓存校验器真正参与下一次同步，减少未变化 feed 的 XML 下载，同时保留人工触发同步、来源幂等入库和失败可见性。

## 边界

- 继续由现有 `POST /api/inbox/rss` 触发同步，不新增后台调度器。
- 请求已有 feed 时发送 `If-None-Match` 和 `If-Modified-Since`；仅信任响应头，不把校验器当作用户输入。
- `304 Not Modified` 不创建或更新 `source_items`，只刷新 feed 的 `last_fetched_at`、状态和校验器。
- `200` 解析成功后保存新的 `etag` / `last-modified`，再按现有事务 upsert 条目。
- 上游错误继续由 API 映射为稳定错误，不保存响应正文；失败时保留旧校验器，便于下一次重试。
- 本切片不自动重试、不发送周报、不调用外部 API 测试。

## 数据流

1. Route Handler 根据规范化 URL 读取本地 feed 元数据。
2. RSS connector 带条件请求头发起 GET，返回 `notModified` 或解析后的 feed 与响应校验器。
3. `304` 走轻量状态更新；`200` 走现有 `ingestRssFeed` 事务，并原子更新 feed 元数据。
4. UI 对 `304` 展示“内容未变化”，对 `200` 保持现有“RSS 已同步”反馈。

## 验收

- connector 在有校验器时发送两个条件请求头，并把响应校验器返回给调用方。
- connector 对 `304` 不尝试解析 XML。
- ingest 持久化 `etag` / `last-modified`，重复 `304` 不改变来源条目计数。
- 上游失败不会清空旧校验器。
- Vitest、lint、typecheck、build 通过；E2E 只验证现有 RSS 表单不回归。
