"use client";

import {
  BrainCircuit,
  Check,
  CircleAlert,
  ExternalLink,
  KeyRound,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { triageLocally } from "@/ai";
import type { AiTriageItem, AiTriageVerdict } from "@/ai/triage";
import type { SourceInboxItem } from "@/domain/inbox/source-library";

const configStorageKey = "repotrellis.ai-config.v1";
const defaultEndpoint = "https://api.openai.com/v1/chat/completions";
const defaultModel = "gpt-4o-mini";
const maxBatchSize = 30;

const verdictLabels: Record<AiTriageVerdict, string> = {
  keep: "建议接受",
  review: "需要复核",
  skip: "建议忽略",
};

const verdictStyles: Record<AiTriageVerdict, string> = {
  keep: "bg-[var(--success-soft)] text-[var(--success)]",
  review: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  skip: "bg-[var(--surface-muted)] text-[var(--muted)]",
};

const verdictOrder: AiTriageVerdict[] = ["keep", "review", "skip"];

interface AiConfig {
  endpoint: string;
  model: string;
  apiKey: string;
}

interface TriageData {
  model: string;
  analyzedCount: number;
  requestedCount: number;
  items: AiTriageItem[];
}

type Notice = { kind: "success" | "error"; message: string };

export function AiTriageWorkbench() {
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [model, setModel] = useState(defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [configReady, setConfigReady] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [items, setItems] = useState<SourceInboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [triage, setTriage] = useState<TriageData | null>(null);
  const [isTriaging, setIsTriaging] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState<AiTriageVerdict | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(configStorageKey);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<AiConfig>;
          if (typeof saved.endpoint === "string" && saved.endpoint) setEndpoint(saved.endpoint);
          if (typeof saved.model === "string" && saved.model) setModel(saved.model);
          if (typeof saved.apiKey === "string") setApiKey(saved.apiKey);
        }
      } catch {
        // Keep defaults when browser storage is unavailable or malformed.
      } finally {
        setConfigReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/inbox?limit=100&reviewStatus=pending", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as SourceListResponse;
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "待确认来源读取失败。");
        }
        setItems(payload.data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "待确认来源读取失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  const batchItems = items.slice(0, maxBatchSize);
  const sourceById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      window.localStorage.setItem(
        configStorageKey,
        JSON.stringify({ endpoint: endpoint.trim(), model: model.trim(), apiKey }),
      );
      setConfigSaved(true);
      setNotice({ kind: "success", message: "AI 配置已保存在当前浏览器。" });
    } catch {
      setConfigSaved(false);
      setNotice({ kind: "error", message: "浏览器无法保存配置，请检查存储权限。" });
    }
  }

  function handleClearApiKey() {
    setApiKey("");
    try {
      const raw = window.localStorage.getItem(configStorageKey);
      const saved = raw ? (JSON.parse(raw) as Partial<AiConfig>) : {};
      window.localStorage.setItem(
        configStorageKey,
        JSON.stringify({
          endpoint: typeof saved.endpoint === "string" ? saved.endpoint : endpoint.trim(),
          model: typeof saved.model === "string" ? saved.model : model.trim(),
          apiKey: "",
        }),
      );
      setConfigSaved(true);
      setNotice({ kind: "success", message: "已清除当前浏览器保存的 API Key。" });
    } catch {
      setConfigSaved(false);
      setNotice({ kind: "error", message: "清除 Key 失败，请检查浏览器存储权限。" });
    }
  }

  async function handleAiTriage() {
    if (isTriaging || batchItems.length === 0) return;
    setIsTriaging(true);
    setTriageError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: endpoint.trim(),
          model: model.trim(),
          apiKey,
          items: batchItems.map(toTriageSource),
        }),
      });
      const payload = (await response.json()) as TriageResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "AI 梳理失败。");
      }
      setTriage(payload.data);
    } catch (error: unknown) {
      setTriageError(error instanceof Error ? error.message : "AI 梳理失败。");
    } finally {
      setIsTriaging(false);
    }
  }

  function handleLocalTriage() {
    if (batchItems.length === 0) return;
    const result = triageLocally(batchItems.map(toTriageSource));
    setTriage({
      model: "local-rules-v1",
      analyzedCount: result.length,
      requestedCount: batchItems.length,
      items: result,
    });
    setTriageError(null);
    setNotice({ kind: "success", message: "已完成本地规则初筛，无 API Key 或外部请求。" });
  }

  async function handleApply(verdict: AiTriageVerdict) {
    if (isApplying || !triage) return;
    const reviewStatus = verdict === "keep" ? "accepted" : verdict === "skip" ? "rejected" : null;
    if (!reviewStatus) return;
    const ids = triage.items
      .filter((item) => item.verdict === verdict)
      .map((item) => item.sourceItemId);
    if (ids.length === 0) return;

    const actionLabel = reviewStatus === "accepted" ? "接受" : "忽略";
    if (!window.confirm(`确认${actionLabel}这 ${ids.length} 条来源吗？`)) return;

    setIsApplying(verdict);
    setTriageError(null);
    try {
      const response = await fetch("/api/inbox/batch-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceItemIds: ids, reviewStatus }),
      });
      const payload = (await response.json()) as BatchReviewResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "批量审核失败。");
      }
      setItems((current) => current.filter((item) => !ids.includes(item.id)));
      setTriage((current) =>
        current
          ? { ...current, items: current.items.filter((item) => !ids.includes(item.sourceItemId)) }
          : current,
      );
      setNotice({ kind: "success", message: `已${actionLabel} ${payload.data.updated} 条来源。` });
      setReloadKey((value) => value + 1);
    } catch (error: unknown) {
      setTriageError(error instanceof Error ? error.message : "批量审核失败。");
    } finally {
      setIsApplying(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
            先让模型把待确认线索分成“建议接受 / 需要复核 / 建议忽略”，你只需要处理边界项，不必逐条从头读起。
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
          <LockKeyhole className="size-3.5" aria-hidden="true" />
          本地优先 · BYOK
        </span>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
          aria-labelledby="ai-config-heading"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <KeyRound className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Bring your own key</p>
              <h2 id="ai-config-heading" className="mt-1 text-lg font-semibold tracking-tight">配置 AI</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">兼容 OpenAI Chat Completions，也可以填本机 Ollama 等兼容 endpoint。</p>
            </div>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleSaveConfig}>
            <label className="block text-xs font-semibold">
              Endpoint
              <input
                required
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder={defaultEndpoint}
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </label>
            <label className="block text-xs font-semibold">
              模型 ID
              <input
                required
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={defaultModel}
                maxLength={120}
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </label>
            <label className="block text-xs font-semibold">
              API Key <span className="font-normal text-[var(--muted)]">（本机模型可留空）</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-…"
                maxLength={1_000}
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </label>
            <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/55 p-3 text-xs leading-5 text-[var(--accent-strong)]">
              <div className="flex items-start gap-2">
                <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>Key 只保存在当前浏览器的 localStorage，梳理时直传你填写的 endpoint，不写入 SQLite，也不会出现在响应中。</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <span className="text-[11px] text-[var(--muted)]" role="status">
                {configSaved ? "已保存到当前浏览器" : "修改后记得保存配置"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {apiKey && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    disabled={!configReady}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:border-red-300 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    清除 Key
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!configReady}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="size-3.5" aria-hidden="true" />
                  保存配置
                </button>
              </div>
            </div>
          </form>
        </section>

        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
          aria-labelledby="ai-queue-heading"
          aria-busy={isLoading || isTriaging}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">
                <Layers3 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Triage queue</p>
                <h2 id="ai-queue-heading" className="mt-1 text-lg font-semibold tracking-tight">待确认来源</h2>
              </div>
            </div>
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">{items.length} 条</span>
          </div>

          {isLoading ? (
            <div className="mt-6 space-y-3" role="status">
              <div className="h-4 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-[var(--surface-muted)]" />
              <span className="sr-only">正在读取待确认来源</span>
            </div>
          ) : loadError ? (
            <div className="mt-6 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300" role="alert">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{loadError}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center">
              <Check className="mx-auto size-5 text-[var(--success)]" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold">没有待确认来源</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">收件箱已经清空，可以继续添加 RSS 或手动链接。</p>
            </div>
          ) : (
            <>
              <div className="mt-6 rounded-xl bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold">一次处理最多 {maxBatchSize} 条</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  当前会先处理最早进入待确认状态的 {batchItems.length} 条；AI 只给建议，不会自动改状态。
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAiTriage}
                  disabled={!configReady || isTriaging || batchItems.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isTriaging ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <BrainCircuit className="size-3.5" aria-hidden="true" />}
                  {isTriaging ? "正在梳理" : "批量 AI 梳理"}
                </button>
                <button
                  type="button"
                  onClick={handleLocalTriage}
                  disabled={isTriaging || batchItems.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <WandSparkles className="size-3.5" aria-hidden="true" />
                  无需 Key 的本地先筛
                </button>
              </div>
              {!apiKey.trim() && !isLocalEndpoint(endpoint) && (
                <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">当前是远程 endpoint 且未填写 API Key；如果服务需要认证，请先保存 Key，或使用本地先筛。</p>
              )}
            </>
          )}
        </section>
      </div>

      {triage && (
        <TriageResults
          data={triage}
          sources={sourceById}
          isApplying={isApplying}
          onApply={handleApply}
        />
      )}
      {triageError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{triageError}</span>
        </div>
      )}
      {notice && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${notice.kind === "success" ? "border-[var(--success)]/20 bg-[var(--success-soft)] text-[var(--success)]" : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"}`} role={notice.kind === "success" ? "status" : "alert"}>
          {notice.kind === "success" ? <Check className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
          {notice.message}
        </div>
      )}
    </div>
  );
}

function TriageResults({
  data,
  sources,
  isApplying,
  onApply,
}: {
  data: TriageData;
  sources: Map<number, SourceInboxItem>;
  isApplying: AiTriageVerdict | null;
  onApply: (verdict: AiTriageVerdict) => void;
}) {
  const grouped = verdictOrder.map((verdict) => ({
    verdict,
    items: data.items.filter((item) => item.verdict === verdict),
  }));
  const uncovered = Math.max(0, data.requestedCount - data.analyzedCount);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6" aria-labelledby="ai-results-heading" aria-busy={Boolean(isApplying)}>
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Triage result · {data.model}</p>
            <h2 id="ai-results-heading" className="mt-1 text-lg font-semibold tracking-tight">这一轮梳理完成</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">已覆盖 {data.analyzedCount} / {data.requestedCount} 条；建议不会自动写入收件箱。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {grouped.map(({ verdict, items }) => (
            <span key={verdict} className={`rounded-full px-2.5 py-1 ${verdictStyles[verdict]}`}>{verdictLabels[verdict]} {items.length}</span>
          ))}
        </div>
      </div>

      {uncovered > 0 && (
        <p className="mt-4 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted)]">有 {uncovered} 条来源没有得到可对应的模型结果，已保留在收件箱，不会被批量操作。</p>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {grouped.map(({ verdict, items }) => (
          <section key={verdict} aria-labelledby={`ai-result-group-${verdict}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 id={`ai-result-group-${verdict}`} className="text-sm font-semibold">{verdictLabels[verdict]}</h3>
                <p className="mt-1 text-[11px] text-[var(--muted)]">{groupDescription(verdict)}</p>
              </div>
              {(verdict === "keep" || verdict === "skip") && items.length > 0 && (
                <button
                  type="button"
                  onClick={() => onApply(verdict)}
                  disabled={Boolean(isApplying)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isApplying === verdict && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
                  {verdict === "keep" ? "批量接受" : "批量忽略"}
                </button>
              )}
            </div>
            {items.length > 0 ? (
              <div className="space-y-3">
                {items.map((result) => (
                  <TriageResultCard key={result.sourceItemId} result={result} source={sources.get(result.sourceItemId)} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">暂无项目</div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function TriageResultCard({ result, source }: { result: AiTriageItem; source?: SourceInboxItem }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${verdictStyles[result.verdict]}`}>{verdictLabels[result.verdict]}</span>
        <span className="text-[10px] text-[var(--muted)]">{source?.kind ?? "来源"}</span>
      </div>
      <h4 className="mt-3 line-clamp-2 text-sm font-semibold">{source?.title ?? source?.url ?? `来源 #${result.sourceItemId}`}</h4>
      {source?.url && (
        <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-[var(--accent-strong)] hover:underline">
          <span className="truncate">{source.url}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
      )}
      <p className="mt-3 text-xs leading-5 text-[var(--ink)]">{result.summary}</p>
      <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{result.reason}</p>
      {result.projectRefs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.projectRefs.map((ref) => <span key={ref} className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-[var(--ink)]">{ref.replace("https://github.com/", "")}</span>)}
        </div>
      )}
    </article>
  );
}

function toTriageSource(item: SourceInboxItem) {
  return {
    sourceItemId: item.id,
    kind: item.kind,
    url: item.url,
    title: item.title,
    excerpt: item.excerpt,
    publishedAt: item.publishedAt,
    extractedGithubRefs: item.extractedGithubRefs,
  };
}

function groupDescription(verdict: AiTriageVerdict): string {
  if (verdict === "keep") return "已有明确价值或项目引用，可批量接受。";
  if (verdict === "review") return "保留在收件箱，集中处理不确定项。";
  return "暂不值得投入时间，可批量忽略。";
}

function isLocalEndpoint(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

interface ApiError {
  error?: { code: string; message: string };
}

interface SourceListResponse extends ApiError {
  data?: SourceInboxItem[];
}

interface TriageResponse extends ApiError {
  data?: TriageData;
}

interface BatchReviewResponse extends ApiError {
  data?: { updated: number; items: SourceInboxItem[] };
}
