# 项目治理文档设计

## 背景

RepoTrellis 使用 MIT License，但项目同时处理 GitHub Token、RSS 地址、来源摘要和本地 SQLite 数据。需要把许可证授予的权限、平台使用边界、漏洞披露方式和 RepoTrellis 品牌边界分开写清楚，避免 README 或代码给出不准确的安全与商标承诺。

## 产物

- `SECURITY.md`：漏洞报告渠道、支持范围、凭证与本地数据处理原则。
- `RESPONSIBLE-USE.md`：允许用途、禁止绕过平台控制的行为，以及连接器和 AI 的使用边界。
- `TRADEMARKS.md`：MIT 与商标权的区别、名称/Logo 使用规则、不得暗示官方背书。
- `CONTRIBUTING.md`：本地开发、测试、隐私保护和提交前检查，帮助贡献者在不触碰真实数据的情况下参与。

## 约束

- 不虚构专用邮箱、SLA、已启用的 GitHub 安全功能或未来支持版本。
- 不复制 MIT License 正文；许可证仍以仓库根目录的 `LICENSE` 为准。
- 文档不改变运行时权限，也不把 `.env`、Token 或真实数据库内容写入仓库。
- 所有外部平台建议都以官方 API/RSS、最小权限、限流和用户主动提供为前提。
