"use client";

import {
  Check,
  CircleAlert,
  FileText,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  DigestItemDecision,
  DigestPreview,
  DigestSnapshot,
} from "@/domain/digest/digest";
import { DigestExport } from "./digest-export";

interface DigestResponse {
  data?: DigestPreview | DigestSnapshot | null;
  error?: { code: string; message: string };
}

interface DigestHistoryResponse {
  data?: DigestSnapshot[];
  error?: { code: string; message: string };
}

export function DigestWorkbench() {
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [history, setHistory] = useState<DigestSnapshot[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [savedDigest, setSavedDigest] = useState<DigestSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  const [historyDecisionFilter, setHistoryDecisionFilter] = useState<"all" | DigestItemDecision>("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/digests/preview", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as DigestResponse;
        if (!response.ok || !payload.data || !("items" in payload.data)) {
          throw new Error(payload.error?.message ?? "周报预览读取失败。");
        }
        const next = payload.data as DigestPreview;
        setPreview(next);
        setSelectedIds(new Set(next.items.map((item) => item.repositoryId)));
        setSavedDigest(null);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "周报预览读取失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const historyQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: "10" });
    if (historyDecisionFilter !== "all") params.set("decision", historyDecisionFilter);
    if (historyFrom) params.set("from", historyFrom);
    if (historyTo) params.set("to", historyTo);
    return params.toString();
  }, [historyDecisionFilter, historyFrom, historyTo]);

  const historyFilterActive = historyDecisionFilter !== "all" || Boolean(historyFrom || historyTo);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsHistoryLoading(true);
      setHistoryError(null);
      void fetch(`/api/digests?${historyQuery}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as DigestHistoryResponse;
          if (!response.ok || !payload.data) {
            throw new Error(payload.error?.message ?? "周报历史读取失败。");
          }
          setHistory(payload.data);
        })
        .catch((reason: unknown) => {
          if (reason instanceof Error && reason.name === "AbortError") return;
          setHistoryError(reason instanceof Error ? reason.message : "周报历史读取失败。");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsHistoryLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [historyQuery, reloadKey]);

  const selectedItems = useMemo(
    () => preview?.items.filter((item) => selectedIds.has(item.repositoryId)) ?? [],
    [preview, selectedIds],
  );

  async function saveSnapshot() {
    if (selectedItems.length === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/digests/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryIds: selectedItems.map((item) => item.repositoryId),
        }),
      });
      const payload = (await response.json()) as DigestResponse;
      if (!response.ok || !payload.data || !("id" in payload.data)) {
        throw new Error(payload.error?.message ?? "周报快照保存失败。");
      }
      const digest = payload.data as DigestSnapshot;
      setSavedDigest(digest);
      setHistory((current) => {
        const withoutCurrent = current.filter((item) => item.id !== digest.id);
        return matchesHistoryFilters(digest)
          ? [digest, ...withoutCurrent].slice(0, 10)
          : withoutCurrent;
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "周报快照保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateItemDecision(
    digest: DigestSnapshot,
    itemId: number,
    decision: "pending" | "kept" | "dismissed",
  ) {
    setUpdatingItemId(itemId);
    setHistoryActionError(null);
    try {
      const response = await fetch(`/api/digests/${digest.id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as DigestResponse;
      if (!response.ok || !payload.data || !("id" in payload.data)) {
        throw new Error(payload.error?.message ?? "周报项目状态保存失败。");
      }
      const updated = payload.data as DigestSnapshot;
      setHistory((current) => {
        const withoutUpdated = current.filter((entry) => entry.id !== updated.id);
        return matchesHistoryFilters(updated)
          ? [updated, ...withoutUpdated].sort(compareDigestSnapshots).slice(0, 10)
          : withoutUpdated;
      });
      setSavedDigest((current) => (current?.id === updated.id ? updated : current));
    } catch (reason: unknown) {
      setHistoryActionError(
        reason instanceof Error ? reason.message : "周报项目状态保存失败。",
      );
    } finally {
      setUpdatingItemId(null);
    }
  }

  function clearHistoryFilters() {
    setHistoryDecisionFilter("all");
    setHistoryFrom("");
    setHistoryTo("");
  }

  function matchesHistoryFilters(digest: DigestSnapshot): boolean {
    const decisionMatch =
      historyDecisionFilter === "all" ||
      digest.items.some((item) => item.decision === historyDecisionFilter);
    const fromMatch = !historyFrom || digest.periodEnd >= historyFrom;
    const toMatch = !historyTo || digest.periodStart <= historyTo;
    return decisionMatch && fromMatch && toMatch;
  }

  return (
    <div className="space-y-5">
      <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
      aria-label="周报预览"
      aria-busy={isLoading || isSaving}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <FileText className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Review before save
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">周报预览</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              先看推荐理由，再决定哪些项目进入本周快照。确认时服务端会重新计算分数，客户端不会写入理由或评分。
            </p>
          </div>
        </div>
        {preview && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
            {preview.periodStart} — {preview.periodEnd}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-3 md:grid-cols-2" role="status">
          {[1, 2, 3, 4].map((value) => (
            <div key={value} className="h-36 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
          ))}
          <span className="sr-only">正在生成周报预览</span>
        </div>
      ) : error && !preview ? (
        <div className="mt-8 flex flex-col items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300" role="alert">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setReloadKey((value) => value + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            重新生成预览
          </button>
        </div>
      ) : preview?.items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-14 text-center">
          <Sparkles className="size-5 text-[var(--muted)]" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold">还没有可推荐的项目</h3>
          <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">
            先导入仓库、配置兴趣规则，或在项目详情生成结构化分析，周报预览会自动获得更多信号。
          </p>
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
            <p className="text-xs text-[var(--muted)]">
              已选择 <span className="font-semibold text-[var(--ink)]">{selectedItems.length}</span> / {preview?.items.length} 个项目
            </p>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(preview?.items.map((item) => item.repositoryId)))}
              disabled={isSaving}
              className="text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-50"
            >
              全部选择
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {preview?.items.map((item) => {
              const selected = selectedIds.has(item.repositoryId);
              return (
                <label
                  key={item.repositoryId}
                  className={`relative cursor-pointer rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)] ${
                    selected
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)]/45"
                      : "border-[var(--border)] bg-[var(--background)] opacity-65"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(item.repositoryId)) next.delete(item.repositoryId);
                        else next.add(item.repositoryId);
                        return next;
                      });
                    }}
                    disabled={isSaving}
                    className="sr-only"
                    aria-label={`选择 ${item.repository.fullName}`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{item.repository.fullName}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{item.repository.description ?? "暂无仓库描述。"}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">
                      {item.score} 分
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--muted)]">
                    {item.reasons.slice(0, 2).map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </label>
              );
            })}
          </div>
          {error && <p className="mt-3 text-xs text-red-600" role="alert">{error}</p>}
          {savedDigest ? (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/60 p-4 text-sm" role="status">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
              <div>
                <p className="font-semibold">周报快照已保存</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  快照 #{savedDigest.id} 已保存在本地，包含 {savedDigest.items.length} 个项目；后续发送和发布仍需单独确认。
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
              <p className="text-xs text-[var(--muted)]">确认后会保存当前分数和理由，作为可追溯快照。</p>
              <button
                type="button"
                onClick={() => void saveSnapshot()}
                disabled={isSaving || selectedItems.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
              >
                {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                {isSaving ? "保存中" : "保存为周报快照"}
              </button>
            </div>
          )}
        </>
      )}
      </section>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
        aria-label="周报历史"
        aria-busy={isHistoryLoading || updatingItemId !== null}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">
            <History className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Local snapshots
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">历史快照</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              保留当时的分数和理由，继续做保留或移除的决定，也能下载到自己的笔记中。导出的项目描述和下一步行动取自当前收藏库。
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold">筛选历史</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">按项目决定或周报周期查找可复盘快照。</p>
            </div>
            {historyFilterActive && (
              <button
                type="button"
                onClick={clearHistoryFilters}
                className="text-xs font-semibold text-[var(--accent-strong)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                清除筛选
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-[11px] text-[var(--muted)]">
              复盘决定
              <select
                aria-label="按复盘决定筛选"
                value={historyDecisionFilter}
                onChange={(event) => setHistoryDecisionFilter(event.target.value as "all" | DigestItemDecision)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="all">全部决定</option>
                <option value="pending">待定</option>
                <option value="kept">保留</option>
                <option value="dismissed">已移除</option>
              </select>
            </label>
            <label className="text-[11px] text-[var(--muted)]">
              周期从
              <input
                aria-label="周期从"
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="text-[11px] text-[var(--muted)]">
              周期到
              <input
                aria-label="周期到"
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
          </div>
        </div>

        {isHistoryLoading ? (
          <div className="mt-7 grid gap-3 md:grid-cols-2" role="status">
            {[1, 2].map((value) => (
              <div key={value} className="h-28 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
            ))}
            <span className="sr-only">正在读取周报历史</span>
          </div>
        ) : historyError && history.length === 0 ? (
          <p className="mt-7 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300" role="alert">
            {historyError}
          </p>
        ) : history.length === 0 ? (
          <div className="mt-7 rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
            <p className="text-sm font-semibold">
              {historyFilterActive ? "没有匹配的周报快照" : "还没有保存的周报快照"}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {historyFilterActive
                ? "可以放宽决定或周期范围，或清除筛选查看全部历史。"
                : "在上方确认一次预览后，快照会保留在这里供后续复盘。"}
            </p>
          </div>
        ) : (
          <>
            {historyError && (
              <p
                className="mt-7 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
                role="alert"
              >
                {historyError} 当前结果仍保留，可以重试筛选。
              </p>
            )}
            {historyActionError && (
              <p
                className="mt-7 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
                role="alert"
              >
                {historyActionError}
              </p>
            )}
            <div className="mt-7 grid gap-3 md:grid-cols-2">
              {history.map((digest) => (
                <article
                  key={digest.id}
                  aria-label={`周报快照 #${digest.id}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {digest.periodStart} — {digest.periodEnd}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        快照 #{digest.id} · {formatDigestTime(digest.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                      {digestStatusLabel[digest.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    包含 {digest.items.length} 个项目
                  </p>
                  <ul className="mt-2 space-y-2 text-xs leading-5">
                    {digest.items.map((item) => (
                      <li
                        key={item.id}
                        className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate">
                            {item.position}. {item.repository.fullName}
                          </span>
                          <span className="shrink-0 font-semibold text-[var(--accent-strong)]">
                            {item.score ?? "—"} 分
                          </span>
                        </div>
                        <div
                          className="flex flex-wrap gap-1.5"
                          role="group"
                          aria-label={`${item.repository.fullName} 的周报决定`}
                        >
                          {digestDecisionOptions.map((option) => {
                            const active = item.decision === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  void updateItemDecision(digest, item.id, option.value)
                                }
                                disabled={updatingItemId !== null}
                                aria-pressed={active}
                                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
                                  active
                                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-muted)]"
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <DigestExport digest={digest} disabled={updatingItemId !== null} />
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function compareDigestSnapshots(left: DigestSnapshot, right: DigestSnapshot): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id - left.id;
}

const digestStatusLabel: Record<DigestSnapshot["status"], string> = {
  draft: "草稿",
  published: "已发布",
  failed: "失败",
};

const digestDecisionOptions = [
  { value: "pending", label: "待定" },
  { value: "kept", label: "保留" },
  { value: "dismissed", label: "移除" },
] as const;

function formatDigestTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
