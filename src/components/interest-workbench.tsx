"use client";

import { Check, CircleAlert, LoaderCircle, Save, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import type { Interest } from "@/domain/interests/interest";

interface InterestResponse {
  data?: Interest | null;
  error?: { code: string; message: string };
}

export function InterestWorkbench() {
  const [profile, setProfile] = useState<Interest | null>(null);
  const [name, setName] = useState("我的项目兴趣");
  const [description, setDescription] = useState("");
  const [positiveRules, setPositiveRules] = useState("");
  const [negativeRules, setNegativeRules] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/interests", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as InterestResponse;
        if (!response.ok) {
          throw new Error(payload.error?.message ?? "兴趣档案读取失败。");
        }
        const next = payload.data ?? null;
        setProfile(next);
        if (next) {
          setName(next.name);
          setDescription(next.description ?? "");
          setPositiveRules(next.positiveRules.join("\n"));
          setNegativeRules(next.negativeRules.join("\n"));
        }
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "兴趣档案读取失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoaded(true);
      });

    return () => controller.abort();
  }, [reloadKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSavedAt(null);

    const payload = {
      name,
      description: description.trim() || null,
      positiveRules: splitRules(positiveRules),
      negativeRules: splitRules(negativeRules),
    };

    try {
      const response = await fetch("/api/interests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as InterestResponse;
      if (!response.ok || !result.data) {
        throw new Error(result.error?.message ?? "兴趣档案保存失败。");
      }
      setProfile(result.data);
      setName(result.data.name);
      setDescription(result.data.description ?? "");
      setPositiveRules(result.data.positiveRules.join("\n"));
      setNegativeRules(result.data.negativeRules.join("\n"));
      setSavedAt(result.data.updatedAt);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "兴趣档案保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
      aria-busy={!isLoaded || isSaving}
      aria-label="兴趣与规则"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Personal signal
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">兴趣与规则</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              用几条明确的信号告诉 RepoTrellis 你想多看什么、明确避开什么。规则只作为推荐解释依据，不会修改仓库或来源。
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
          <span className="size-1.5 rounded-full bg-[var(--success)]" aria-hidden="true" />
          本地单用户档案
        </span>
      </div>

      {!isLoaded ? (
        <div className="mt-8 space-y-4" role="status">
          <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-muted)]" />
          <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-muted)]" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-36 animate-pulse rounded-lg bg-[var(--surface-muted)]" />
            <div className="h-36 animate-pulse rounded-lg bg-[var(--surface-muted)]" />
          </div>
          <span className="sr-only">正在读取兴趣档案</span>
        </div>
      ) : loadError ? (
        <div className="mt-8 flex flex-col items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300" role="alert">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsLoaded(false);
              setReloadKey((value) => value + 1);
            }}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            重新读取
          </button>
        </div>
      ) : (
        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-[var(--ink)]">
            档案名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              placeholder="例如：我的 AI 工具雷达"
              className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>
          <label className="block text-xs font-semibold text-[var(--ink)]">
            整体偏好
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1_000}
              rows={3}
              placeholder="例如：关注本地优先、可自部署、能快速验证的 AI 开发工具。"
              className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <RuleEditor
              label="正向规则"
              hint="每行一条：命中后会成为推荐理由。"
              value={positiveRules}
              onChange={setPositiveRules}
              placeholder={"本地优先\nTypeScript\n可自部署"}
              tone="positive"
            />
            <RuleEditor
              label="负向规则"
              hint="每行一条：命中后会降低推荐优先级。"
              value={negativeRules}
              onChange={setNegativeRules}
              placeholder={"纯营销站\n需要强制登录\n长期不维护"}
              tone="negative"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
            <div className="min-h-5 text-xs text-[var(--muted)]" role="status">
              {savedAt && (
                <span className="inline-flex items-center gap-1.5 text-[var(--success)]">
                  <Check className="size-3.5" aria-hidden="true" />
                  已保存 · {savedAt.slice(0, 16).replace("T", " ")}
                </span>
              )}
              {profile && !savedAt && "修改后保存，规则会用于后续推荐解释。"}
              {!profile && !savedAt && "尚未建立档案，保存后即可作为评分输入。"}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
            >
              {isSaving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {isSaving ? "保存中" : profile ? "保存兴趣档案" : "建立兴趣档案"}
            </button>
          </div>
          {saveError && (
            <p className="text-xs font-medium text-red-600" role="alert">
              {saveError}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function RuleEditor({
  label,
  hint,
  value,
  onChange,
  placeholder,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  tone: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-[var(--success)]" : "text-[var(--accent-strong)]";
  return (
    <label className="block text-xs font-semibold text-[var(--ink)]">
      <span className={toneClass}>{label}</span>
      <span className="ml-2 font-normal text-[var(--muted)]">{hint}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={1_700}
        rows={6}
        placeholder={placeholder}
        className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
      <span className="mt-1 block text-[11px] font-normal text-[var(--muted)]">最多 20 条，每条 80 字。</span>
    </label>
  );
}

function splitRules(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}
