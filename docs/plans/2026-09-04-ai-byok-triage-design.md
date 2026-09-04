# BYOK AI 批量梳理设计

## 目标

收件箱来源不应要求用户逐条阅读。新增一个本地“AI 梳理台”，允许用户配置 OpenAI-compatible endpoint、model 和自己的 API Key，对待确认来源做批量初筛，并把结果按“建议接受 / 需要复核 / 建议忽略”聚合展示。

## 隐私与权限

- API Key 只保存在当前浏览器的 `localStorage`，不写入 SQLite、不进入服务端日志；点击梳理时随请求发送到用户配置的 endpoint。
- 服务端不持久化模型输入或输出，也不把 AI 建议直接写入来源状态。
- 输入只包含来源 URL、标题、摘要、发布时间和已提取的 GitHub 引用，不包含收藏库私人笔记。
- endpoint 仅允许 HTTP(S) 且禁止 URL 用户名/密码；请求不自动跟随重定向。

## AI 契约

- `POST /api/ai/triage` 接收最多 30 条待确认来源和 BYOK 配置。
- 上游使用 OpenAI Chat Completions 兼容格式；要求返回 JSON：每条包含 `sourceItemId`、`verdict`、`summary`、`reason`、`projectRefs`。
- 服务端用 Zod 校验并过滤未知/重复 ID；输出不完整时只展示已返回结果，并提示未覆盖数量。
- 模型不允许臆造仓库或把不确定内容判为事实；证据不足时使用 `review`。

## 交互与数据流

1. AI 梳理台读取待确认来源，默认最多处理 30 条。
2. 用户保存本地配置并点击“批量梳理”；客户端将来源和 Key 发到本地 Route Handler。
3. Route Handler 调用用户指定 endpoint，返回结构化建议；失败时不暴露上游响应或 Key。
4. UI 按 verdict 分组，展示摘要、理由、来源和 GitHub 引用；`review` 只保留人工处理。
5. 用户可以一次性接受 `keep` 或忽略 `skip`，通过事务批量更新来源状态；不会自动应用模型建议。

## 验收

- 无待确认来源、未配置 endpoint、模型返回非法 JSON、超时和上游 401/5xx 都有可读错误。
- API Key 不出现在任何响应、错误文本或数据库记录中。
- 批量更新是事务式的，未知来源 ID 不会造成部分更新。
- UI 覆盖 loading、empty、error、结果聚合、批量操作和键盘焦点；测试只拦截本地样例 endpoint，不访问外部模型。
