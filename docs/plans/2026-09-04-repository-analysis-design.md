# Sprint 3：项目结构化分析设计

## 目标

为已经进入本地收藏库的仓库提供一次可追溯、可重复的结构化分析。用户显式点击“生成结构化分析”后，系统根据本地仓库元数据和已保存的来源证据，生成摘要、主题、技术栈、使用场景、风险提示和置信度；结果保存在 SQLite，后续推荐和周报只读取这份结构化结果。

## 本轮边界

- 先实现确定性的本地规则 provider，不调用云端模型、GitHub 内容 API 或其他外部服务。
- 通过 provider 接口保留未来接入 OpenAI/Ollama 的位置；本轮不实现模型配置、费用控制和后台队列。
- 一仓库一份最新分析，重新生成会替换结果并保留输入快照；不自动生成，避免未经用户确认产生不可解释的 AI 结果。
- 输入只使用 `repositories`、`user_repository_meta` 和 `repo_mentions`/`source_items` 中已有的字段，不抓取来源正文。
- 分析失败时写入明确错误和 `failed` 状态，允许用户再次点击重试；不修改用户状态、标签、笔记或来源证据。

## 数据契约

`repository_analyses` 以 `repository_id` 唯一，包含：

- `status`: `pending | processing | ready | failed`
- `provider`: 当前为 `local-rules-v1`
- `summary`: 一段面向人的摘要
- `topics`、`tech_stack`、`use_cases`、`risks`: JSON 字符串数组
- `confidence`: 0 到 1 的确定性置信度
- `source_snapshot`: 生成时使用的仓库与证据摘要 JSON
- `last_error`、`generated_at`、时间戳

服务层负责状态变更和 Zod 校验，provider 只负责纯函数式语义提取。API 只接受仓库 ID，不接受客户端传入的分析内容。

## UI 状态

项目详情增加“结构化分析”卡片：缺失时展示说明和主按钮；生成中展示 spinner 和 `aria-busy`；成功时展示摘要、标签、场景和风险；失败时展示错误并提供重试。按钮具备键盘焦点样式，分析结果为空时仍保留可解释的来源快照提示。

## 验收

- 本地 provider 对同一输入多次运行结果完全一致，单测不发网络请求。
- 分析服务覆盖仓库不存在、首次生成、重复生成和 provider 校验失败等路径。
- API 遵循 Next 16 `Promise` 路由参数约定，并返回可供 UI 显示的状态。
- `lint`、`typecheck`、`test`、`build` 和现有 E2E 全部通过。

## 后续切片

云端/本地模型 provider、兴趣规则、推荐解释、反馈事件和后台调度在后续 Sprint 实现；它们只能消费这份结构化契约，不能绕过来源证据和人工审核边界。
