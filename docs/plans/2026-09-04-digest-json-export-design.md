# 周报快照 JSON 导出设计

## 目标与边界

在已有 Markdown 下载旁增加机器可读的 JSON 备份，服务于本地脚本、迁移和后续筛选。它是本地下载，不是在线分享：不请求第三方、不复制私人笔记、不发送到任何外部目标。

## 导出契约

`GET /api/digests/[digestId]/export?scope=active|all&format=markdown|json` 保持只读。JSON 使用固定 `repotrellis-digest-export-v1` 版本，保存快照的 ID、周期、状态、创建/更新时间，以及每个项目的原始位置、分数、决定、理由。项目名称、链接、描述、下一步、语言、标签和来源来自当前收藏库，并以 `currentRepository` 命名，不伪装成历史字段。

不导出 `configSnapshot`、兴趣规则或私人 `note`。只接受 HTTP(S) 项目链接，危险链接输出 `null`；JSON 由 `JSON.stringify` 生成，避免手写转义。`active` 继续排除已移除项目，`all` 保留完整复盘记录。文件名由数字快照 ID、范围和固定格式后缀构造。

## UI 与错误处理

历史快照卡片的“带到我的笔记”工具区增加格式选择，默认 Markdown，选择 JSON 后按钮文案和文件名同步变化。沿用现有加载、错误重试、无项目禁用、键盘焦点与手机上下排列；格式/范围改变会清除旧提示。接口对非法 ID、范围或格式返回 400，找不到快照返回 404，数据库异常返回不泄露细节的 500，并设置 `private, no-store`。

## 验收

- Markdown 行为和文件名完全保持兼容。
- JSON 可被解析，字段稳定、排序稳定，不包含 note/config/兴趣规则。
- 默认和完整范围、空结果、危险 URL、非法参数均有单测。
- Playwright 覆盖 JSON 下载、格式切换、移动端布局和原有 Markdown/错误流程；只拦截样例 API。
