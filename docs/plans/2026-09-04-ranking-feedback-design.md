# Sprint 3：推荐评分与反馈设计

## 目标

将兴趣档案和已保存的结构化分析转成可解释的本地推荐信号，并允许用户对项目做 `keep`、`try`、`adopt`、`dismiss`、`block` 反馈。评分结果先动态计算，周报阶段再把结果和理由写入 `digest_items` 快照。

## 评分边界

- 不新增评分表；`GET /api/repositories/:id/recommendation` 每次从本地数据计算，避免当前阶段产生过期缓存。
- 评分由兴趣匹配、反馈、来源可信度、仓库健康度、新鲜度和新颖度组成，总分 0–100。
- 正向规则命中增加兴趣分，负向规则命中降低兴趣分；返回最多 3 条理由，其中负向理由明确标识为降权信号。
- 缺少结构化分析或来源证据时降低“覆盖度”提示，但不把缺失数据伪装成负面事实。
- 反馈事件追加写入 `feedback_events`，保留动作、可选原因、来源和时间；同一仓库可以有多次反馈，评分只读取最近动作和历史动作数量。

## 数据流

ranking 层读取仓库、active interest、ready analysis 和 feedback_events，返回 `score`、`reasons`、`matchedPositiveRules`、`matchedNegativeRules`、`coverage`。API 只接收仓库 ID；反馈 API 校验动作枚举和原因长度后调用领域层写入。

## UI

项目详情增加“推荐信号”卡片：分数环、最多三条解释、数据覆盖提示和五个反馈按钮。按钮点击后显示保存状态，失败时保留当前界面并给出重试提示；`block`/`dismiss` 使用克制的警示样式，不弹出不可逆确认，因为事件写入可追溯且不删除项目。

## 验收

- ranking 单测覆盖正/负规则命中、反馈权重、归一化边界和缺失数据提示。
- feedback 单测覆盖合法动作、非法仓库、原因 trim/长度限制。
- API 与详情 UI 不调用外网；现有 lint、typecheck、unit、build、E2E 全部通过。
