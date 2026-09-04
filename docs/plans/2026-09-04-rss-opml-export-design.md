# RSS OPML 导出设计

## 背景

RepoTrellis 目前可以在本地保存 RSS / Atom 来源，但用户还需要能把订阅列表迁移到其他阅读器。在线分享或发送会扩大数据外发范围，因此 Sprint 0-3 继续坚持本地优先，只提供本地下载。

## 目标

- 在 RSS 同步状态卡片上提供“导出 OPML”入口。
- 导出本地数据库中的全部 RSS 订阅，包含同步异常或已暂停的来源，方便迁移和备份。
- 仅输出 OPML 必需的订阅信息：标题、RSS URL 和 HTML URL。
- 对 URL 做协议校验，只允许 `http` / `https`，不导出带用户名或密码的 URL。
- 正确 XML 转义标题和 URL，不把同步状态、错误、缓存校验器或本地备注写入文件。
- 导出失败时在当前卡片内显示可读错误，不暴露数据库详情。

## 非目标

- 不向第三方阅读器、云盘或其他在线服务发送文件。
- 不删除、暂停或修改 RSS 来源。
- 不在 OPML 中表达 RepoTrellis 的审核状态、同步状态或来源条目历史。

## 接口

- `GET /api/inbox/feeds/export`
- 不接受查询参数；请求带参数时返回 `400 invalid_export`，避免未来误把分页语义带入迁移文件。
- 成功响应为 `application/xml; charset=utf-8`，带附件名 `repotrellis-rss-feeds.opml`，并使用 `private, no-store`。

## 验收

- 空库也能下载结构合法的 OPML。
- 标题中的 `& < > " '` 被 XML 转义。
- 非 HTTP(S) 或包含凭证的 URL 被跳过。
- 导出只读，数据库快照前后相同。
- UI 下载按钮有明确的进行中状态，键盘可聚焦。
