"use client";

import {
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rss,
  Star,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import type {
  RssFeedSummary,
  SourceInboxItem,
  SourceReviewStatus,
} from "@/domain/inbox/source-library";
import { rssExportFilename } from "@/domain/inbox/rss-export";

const reviewLabels: Record<SourceReviewStatus, string> = {
  pending: "待确认",
  accepted: "已接受",
  rejected: "已忽略",
};

const reviewStyles: Record<SourceReviewStatus, string> = {
  pending: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  accepted: "bg-[var(--success-soft)] text-[var(--success)]",
  rejected: "bg-[var(--surface-muted)] text-[var(--muted)]",
};

const reviewMarkerStyles: Record<SourceReviewStatus, string> = {
  pending: "bg-[var(--accent)]",
  accepted: "bg-[var(--success)]",
  rejected: "bg-[var(--muted)]",
};

const reviewDescriptions: Record<SourceReviewStatus, string> = {
  pending: "需要你判断是否值得进入项目库",
  accepted: "已确认，可继续解析其中的项目引用",
  rejected: "已忽略，保留记录但不会继续处理",
};

const reviewOrder = ["pending", "accepted", "rejected"] as const satisfies readonly SourceReviewStatus[];

const rssFeedStatusLabels: Record<RssFeedSummary["status"], string> = {
  active: "同步正常",
  error: "同步异常",
  paused: "已暂停",
};

const rssFeedStatusStyles: Record<RssFeedSummary["status"], string> = {
  active: "bg-[var(--success-soft)] text-[var(--success)]",
  error: "bg-red-500/10 text-red-700 dark:text-red-300",
  paused: "bg-[var(--surface-muted)] text-[var(--muted)]",
};

type Notice = { kind: "success" | "error"; title: string; detail: string };

export function InboxWorkbench({
  initialItems,
  onResolved,
}: {
  initialItems: SourceInboxItem[];
  onResolved?: () => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [reviewFilter, setReviewFilter] = useState<"all" | SourceReviewStatus>(
    "all",
  );
  const [sourceMode, setSourceMode] = useState<"manual" | "rss">("manual");
  const [manualUrl, setManualUrl] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [rssUrl, setRssUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feeds, setFeeds] = useState<RssFeedSummary[]>([]);
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isFeedExporting, setIsFeedExporting] = useState(false);
  const [feedExportError, setFeedExportError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolutionErrors, setResolutionErrors] = useState<Record<number, string>>({});
  const [now, setNow] = useState(0);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "100" });
    if (reviewFilter !== "all") params.set("reviewStatus", reviewFilter);

    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      fetch(`/api/inbox?${params}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as InboxListResponse;
          if (!response.ok || !payload.data) {
            throw new Error(payload.error?.message ?? "收件箱读取失败。");
          }
          setItems(payload.data);
          setFormError(null);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setFormError(error instanceof Error ? error.message : "收件箱读取失败。");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshKey, reviewFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsFeedLoading(true);
      fetch("/api/inbox/feeds?limit=20", { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as FeedListResponse;
          if (!response.ok || !payload.data) {
            throw new Error(payload.error?.message ?? "RSS 状态读取失败。");
          }
          setFeeds(payload.data);
          setFeedError(null);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setFeedError(error instanceof Error ? error.message : "RSS 状态读取失败。");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsFeedLoading(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshKey]);

  const pendingCount = items.filter(({ reviewStatus }) => reviewStatus === "pending").length;
  const referenceCount = items.reduce(
    (count, item) => count + item.extractedGithubRefs.length,
    0,
  );
  const failedCount = items.filter(({ processingStatus }) => processingStatus === "failed").length;
  const linkedCount = items.reduce(
    (count, item) => count + item.linkedRepositoryCount,
    0,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    const endpoint = sourceMode === "manual" ? "/api/inbox" : "/api/inbox/rss";
    const body =
      sourceMode === "manual"
        ? {
            url: manualUrl,
            title: manualTitle || null,
            excerpt: manualExcerpt || null,
          }
        : { url: rssUrl };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as InboxMutationResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "来源保存失败。");
      }

      if (sourceMode === "manual") {
        const extractedCount = getExtractedCount(payload.data.extractedGithubRefs);
        setManualUrl("");
        setManualTitle("");
        setManualExcerpt("");
        setNotice({
          kind: "success",
          title: "链接已放入收件箱",
          detail: extractedCount
            ? `发现 ${extractedCount} 个 GitHub 引用，等待确认。`
            : "暂未发现 GitHub 引用，可以先保留来源。",
        });
      } else {
        setRssUrl("");
        setNotice({
          kind: "success",
          title: payload.data.notModified ? "RSS 内容未变化" : "RSS 已同步",
          detail: payload.data.notModified
            ? "服务端校验器确认 feed 未变化，没有重复下载或更新来源。"
            : `收到 ${payload.data.received ?? 0} 条来源，其中 ${getExtractedCount(payload.data.extractedGithubRefs)} 个 GitHub 引用。`,
        });
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "来源保存失败。");
      if (sourceMode === "rss") setRefreshKey((value) => value + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetryDue() {
    setIsRetrying(true);
    try {
      const response = await fetch("/api/inbox/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as RetryResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "到期重试失败。");
      }
      setRefreshKey((value) => value + 1);
      setNotice({
        kind: "success",
        title: payload.data.processed ? "已处理到期重试" : "暂时没有到期重试",
        detail: payload.data.processed
          ? `已处理 ${payload.data.processed} 条来源，请查看卡片中的最新状态。`
          : "失败来源会按退避时间自动等待，不会重复请求上游。",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        title: "重试失败",
        detail: error instanceof Error ? error.message : "到期重试失败。",
      });
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleExportFeeds() {
    if (isFeedExporting) return;
    setIsFeedExporting(true);
    setFeedExportError(null);

    try {
      const response = await fetch("/api/inbox/feeds/export", { cache: "no-store" });
      if (!response.ok) {
        let message = "RSS 订阅导出失败。";
        try {
          const payload = (await response.json()) as ApiError;
          message = payload.error?.message ?? message;
        } catch {
          // Keep the generic message when the server does not return JSON.
        }
        throw new Error(message);
      }

      const downloadUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = rssExportFilename;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      }
      setNotice({
        kind: "success",
        title: "OPML 下载已开始",
        detail: "订阅列表已导出到本地，不会发布或修改来源。",
      });
    } catch (error) {
      setFeedExportError(error instanceof Error ? error.message : "RSS 订阅导出失败。");
    } finally {
      setIsFeedExporting(false);
    }
  }

  async function handleReview(item: SourceInboxItem, reviewStatus: SourceReviewStatus) {
    try {
      const response = await fetch(`/api/inbox/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus }),
      });
      const payload = (await response.json()) as SourceItemResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "来源状态保存失败。");
      }
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? payload.data! : currentItem,
        ),
      );
      setRefreshKey((value) => value + 1);
      setNotice({
        kind: "success",
        title: reviewStatus === "accepted" ? "来源已接受" : "来源已忽略",
        detail: "人工确认状态已保存到本地数据库。",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        title: "保存失败",
        detail: error instanceof Error ? error.message : "来源状态保存失败。",
      });
    }
  }

  async function handleResolve(item: SourceInboxItem) {
    setResolvingId(item.id);
    setResolutionErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, processingStatus: "processing" }
          : currentItem,
      ),
    );
    try {
      const response = await fetch(`/api/inbox/${item.id}/resolve`, { method: "POST" });
      const payload = (await response.json()) as ResolveResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.data?.error ?? payload.error?.message ?? "仓库解析失败。");
      }
      if (payload.data.status === "resolved") {
        setNotice({
          kind: "success",
          title: "来源已解析",
          detail: `已关联 ${payload.data.linked} 个仓库，重复解析不会重复建库。`,
        });
        onResolved?.();
      } else if (payload.data.status === "busy") {
        setNotice({ kind: "success", title: "解析正在进行", detail: "另一个请求正在处理这条来源，请稍后刷新。" });
      } else if (payload.data.status === "retry_wait") {
        throw new Error(payload.data.error ?? "GitHub 暂时限流，请稍后重试。");
      } else if (payload.data.status !== "resolved") {
        throw new Error(payload.data.error ?? "仓库解析失败。");
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "仓库解析失败。";
      setResolutionErrors((current) => ({ ...current, [item.id]: message }));
      setNotice({ kind: "error", title: "解析失败", detail: message });
      setRefreshKey((value) => value + 1);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div>
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
            先把外部线索收进来，再确认哪些引用值得进入收藏库。来源证据会一直留在本地。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {failedCount > 0 && (
            <button
              type="button"
              onClick={handleRetryDue}
              disabled={isRetrying}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
              {isRetrying ? "正在重试" : "处理到期重试"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={isLoading || isFeedLoading}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isLoading || isFeedLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            刷新收件箱
          </button>
        </div>
      </section>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="收件箱概览">
        <InboxStat label="待确认" value={String(pendingCount)} detail="需要人工判断" />
        <InboxStat label="GitHub 引用" value={String(referenceCount)} detail="等待进入项目库" />
        <InboxStat label="解析失败" value={String(failedCount)} detail="可在后续重试" alert={failedCount > 0} />
        <InboxStat label="已入库仓库" value={String(linkedCount)} detail="保留来源证据" />
      </section>

      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-4">
          <span className="mr-2 text-sm font-semibold">添加来源</span>
          <ModeButton active={sourceMode === "manual"} onClick={() => setSourceMode("manual")}>
            <Link2 className="size-3.5" aria-hidden="true" />手动链接
          </ModeButton>
          <ModeButton active={sourceMode === "rss"} onClick={() => setSourceMode("rss")}>
            <Rss className="size-3.5" aria-hidden="true" />RSS / Atom
          </ModeButton>
        </div>
        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          {sourceMode === "manual" ? (
            <>
              <label className="block text-xs font-semibold text-[var(--ink)]">
                链接 URL
                <input
                  required
                  type="url"
                  value={manualUrl}
                  onChange={(event) => setManualUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--ink)]">
                  标题（可选）
                  <input
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                    placeholder="例如：一篇值得回看的实践笔记"
                    className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--ink)]">
                  摘录（可选）
                  <input
                    value={manualExcerpt}
                    onChange={(event) => setManualExcerpt(event.target.value)}
                    placeholder="补充上下文，帮助识别 GitHub 项目"
                    className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="block text-xs font-semibold text-[var(--ink)]">
              RSS / Atom Feed URL
              <input
                required
                type="url"
                value={rssUrl}
                onChange={(event) => setRssUrl(event.target.value)}
                placeholder="https://example.com/feed.xml"
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
              <span className="mt-2 block font-normal leading-5 text-[var(--muted)]">
                本次会读取最新 100 条条目并保存摘要，不会长期保存正文。
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--muted)]">所有来源默认处于“待确认”状态。</span>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              {isSubmitting ? "正在保存" : "加入收件箱"}
            </button>
          </div>
        </form>
        {formError && <InlineError message={formError} />}
      </section>

      {(feeds.length > 0 || feedError || feedExportError) && (
        <section
          className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
          aria-labelledby="rss-status-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
            <div>
              <h2 id="rss-status-heading" className="text-sm font-semibold">RSS 同步状态</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                显示最近尝试和上次成功时间；同步异常不会覆盖成功记录。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isFeedLoading && <span className="text-xs text-[var(--muted)]">刷新中…</span>}
              {feeds.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportFeeds}
                  disabled={isFeedLoading || isFeedExporting}
                  aria-busy={isFeedExporting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFeedExporting ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="size-3.5" aria-hidden="true" />
                  )}
                  {isFeedExporting ? "正在导出" : "导出 OPML"}
                </button>
              )}
            </div>
          </div>
          {feeds.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {feeds.map((feed) => (
                <RssFeedCard key={feed.id} feed={feed} />
              ))}
            </div>
          )}
          {feedError && <InlineError message={feedError} />}
          {feedExportError && <InlineError message={feedExportError} />}
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold">线索分组</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">先确认线索，再决定是否把其中的项目放进收藏库。</p>
          </div>
          <label className="relative">
            <span className="sr-only">筛选审核状态</span>
            <select
              value={reviewFilter}
              onChange={(event) => setReviewFilter(event.target.value as "all" | SourceReviewStatus)}
              className="h-9 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 pr-8 text-xs font-medium text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            >
              <option value="all">全部状态</option>
              <option value="pending">待确认</option>
              <option value="accepted">已接受</option>
              <option value="rejected">已忽略</option>
            </select>
          </label>
        </div>
        {items.length ? (
          <div className="space-y-8 p-4 sm:p-5">
            {reviewOrder.map((status) => {
              const grouped = items.filter((item) => item.reviewStatus === status);
              if (grouped.length === 0) return null;

              return (
                <section key={status} aria-labelledby={`inbox-group-${status}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={`size-2.5 rounded-full ${reviewMarkerStyles[status]}`}
                      aria-hidden="true"
                    />
                    <h3 id={`inbox-group-${status}`} className="text-sm font-semibold">
                      {reviewLabels[status]}
                    </h3>
                    <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                      {grouped.length}
                    </span>
                    <p className="ml-1 text-xs text-[var(--muted)]">
                      {reviewDescriptions[status]}
                    </p>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {grouped.map((item) => (
                      <SourceCard
                        key={item.id}
                        item={item}
                        onReview={handleReview}
                        onResolve={handleResolve}
                        isResolving={resolvingId === item.id}
                        resolutionError={resolutionErrors[item.id]}
                        now={now}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="grid size-11 place-items-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">收件箱还是空的</h3>
            <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">
              粘贴一个链接，或添加一个 RSS feed，开始建立可复盘的来源线索。
            </p>
          </div>
        )}
      </section>

      {notice && <NoticeToast notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

function SourceCard({
  item,
  onReview,
  onResolve,
  isResolving,
  resolutionError,
  now,
}: {
  item: SourceInboxItem;
  onReview: (item: SourceInboxItem, status: SourceReviewStatus) => void;
  onResolve: (item: SourceInboxItem) => void;
  isResolving: boolean;
  resolutionError?: string;
  now: number;
}) {
  const retryBlocked = Boolean(
    item.nextRetryAt && now > 0 && Date.parse(item.nextRetryAt) > now,
  );
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]">
              {item.kind === "rss" ? (
                <Rss className="size-4" aria-hidden="true" />
              ) : item.kind === "github" ? (
                <Star className="size-4" aria-hidden="true" />
              ) : (
                <Link2 className="size-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--ink)]">
                  {item.title ?? item.url}
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${reviewStyles[item.reviewStatus]}`}>
                  {reviewLabels[item.reviewStatus]}
                </span>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-[var(--accent-strong)] hover:underline"
              >
                <span className="truncate">{item.url}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              </a>
              {item.excerpt && (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.excerpt}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                <span>{sourceKindLabel(item.kind)}</span>
                <span className="text-[var(--border-strong)]">/</span>
                <span>{formatDate(item.discoveredAt)}</span>
                {item.processingStatus === "failed" && (
                  <span className="text-red-600">解析失败（{item.parseAttempts} 次）</span>
                )}
              </div>
              {item.extractedGithubRefs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.extractedGithubRefs.map((ref) => (
                    <span key={ref} className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[11px] text-[var(--ink)]">
                      {ref.replace("https://github.com/", "")}
                    </span>
                  ))}
                </div>
              )}
              {item.reviewStatus === "accepted" && item.extractedGithubRefs.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.resolvedAt ? (
                    <span className="text-[11px] font-medium text-[var(--success)]">
                      已入库 · {item.linkedRepositoryCount} 个仓库 · {formatDate(item.resolvedAt)}
                    </span>
                  ) : item.processingStatus === "failed" ? (
                    <span className="text-[11px] text-red-600" role="alert">
                      {item.lastError ?? "解析失败，可重试。"}
                      {retryBlocked && item.nextRetryAt && (
                        <>（{formatRetryAt(item.nextRetryAt, now)} 后可重试）</>
                      )}
                    </span>
                  ) : null}
                  {resolutionError && (
                    <span className="text-[11px] text-red-600" role="alert">{resolutionError}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {item.reviewStatus === "accepted" && item.extractedGithubRefs.length > 0 && !item.resolvedAt ? (
          <button
            type="button"
            onClick={() => onResolve(item)}
            disabled={isResolving || item.processingStatus === "processing" || retryBlocked}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResolving || item.processingStatus === "processing" ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {isResolving || item.processingStatus === "processing" ? "正在解析" : retryBlocked ? "稍后重试" : item.processingStatus === "failed" ? "重试解析" : "解析并入库"}
          </button>
        ) : item.reviewStatus === "pending" ? (
          <div className="flex shrink-0 items-center gap-2 lg:pt-0.5">
            <button
              type="button"
              onClick={() => onReview(item, "rejected")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:border-red-300 hover:text-red-600"
            >
              <X className="size-3.5" aria-hidden="true" />忽略
            </button>
            <button
              type="button"
              onClick={() => onReview(item, "accepted")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--success)] px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
            >
              <Check className="size-3.5" aria-hidden="true" />接受
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RssFeedCard({ feed }: { feed: RssFeedSummary }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Rss className="size-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
            <h3 className="truncate text-sm font-semibold">{feed.title ?? feed.url}</h3>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{feed.url}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${rssFeedStatusStyles[feed.status]}`}>
          {rssFeedStatusLabels[feed.status]}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <dt className="text-[var(--muted)]">最近尝试</dt>
          <dd className="mt-1 font-medium text-[var(--ink)]">{formatDateTime(feed.updatedAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">上次成功</dt>
          <dd className="mt-1 font-medium text-[var(--ink)]">
            {feed.lastFetchedAt ? formatDateTime(feed.lastFetchedAt) : "尚未成功"}
          </dd>
        </div>
      </dl>
      {feed.lastError && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-700 dark:text-red-300" role="alert">
          {feed.lastError}
        </p>
      )}
    </article>
  );
}

function InboxStat({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: string;
  detail: string;
  alert?: boolean;
}) {
  return (
    <article className={`rounded-2xl border p-4 shadow-[var(--shadow-sm)] ${alert ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-right text-[11px] text-[var(--muted)]">{detail}</span>
      </div>
    </article>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)]"}`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-4 flex gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300" role="alert">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function NoticeToast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const success = notice.kind === "success";
  return (
    <div className="fixed bottom-5 right-5 z-30 flex max-w-sm items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl" role={success ? "status" : "alert"}>
      <div className={`grid size-7 shrink-0 place-items-center rounded-full ${success ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-red-500/10 text-red-600"}`}>
        {success ? <Check className="size-4" aria-hidden="true" /> : <CircleAlert className="size-4" aria-hidden="true" />}
      </div>
      <div>
        <p className="text-sm font-semibold">{notice.title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{notice.detail}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭提示">
        <X className="size-4 text-[var(--muted)]" aria-hidden="true" />
      </button>
    </div>
  );
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

function formatRetryAt(value: string, now: number): string {
  const remaining = Math.max(0, Date.parse(value) - now);
  const minutes = Math.ceil(remaining / 60_000);
  return minutes > 0 ? `${minutes} 分钟` : "现在";
}

function sourceKindLabel(kind: SourceInboxItem["kind"]): string {
  if (kind === "rss") return "RSS / Atom";
  if (kind === "github") return "GitHub Stars";
  if (kind === "article") return "文章";
  return "手动链接";
}

function getExtractedCount(value: string[] | number | undefined): number {
  return Array.isArray(value) ? value.length : value ?? 0;
}

interface ApiError {
  error?: { code: string; message: string };
}

interface InboxListResponse extends ApiError {
  data?: SourceInboxItem[];
}

interface FeedListResponse extends ApiError {
  data?: RssFeedSummary[];
}

interface SourceItemResponse extends ApiError {
  data?: SourceInboxItem;
}

interface InboxMutationResponse extends ApiError {
  data?: {
    sourceItemId?: number;
    created?: boolean;
    received?: number;
    extractedGithubRefs?: string[] | number;
    notModified?: boolean;
  };
}

interface ResolveResponse extends ApiError {
  data?: {
    status: string;
    linked: number;
    created: number;
    updated: number;
    resolvedAt: string | null;
    nextRetryAt: string | null;
    error: string | null;
  };
}

interface RetryResponse extends ApiError {
  data?: {
    scanned: number;
    processed: number;
    results: Array<{ status: string; sourceItemId: number }>;
  };
}
