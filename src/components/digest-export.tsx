"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";

import type { DigestSnapshot } from "@/domain/digest/digest";
import {
  digestExportFilenameWithFormat,
  selectDigestExportItems,
  type DigestExportFormat,
  type DigestExportScope,
} from "@/domain/digest/digest-export";

export function DigestExport({
  digest,
  disabled,
}: {
  digest: DigestSnapshot;
  disabled: boolean;
}) {
  const [scope, setScope] = useState<DigestExportScope>("active");
  const [format, setFormat] = useState<DigestExportFormat>("markdown");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const count = selectDigestExportItems(digest, scope).length;

  async function downloadExport() {
    if (isExporting || disabled || count === 0) return;
    setIsExporting(true);
    setError(null);
    setDownloadStarted(false);
    try {
      const response = await fetch(`/api/digests/${digest.id}/export?scope=${scope}&format=${format}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? "周报导出失败，请重试。");
      }

      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = digestExportFilenameWithFormat(digest.id, scope, format);
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
      setDownloadStarted(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "周报导出失败，请重试。");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <fieldset disabled={disabled || isExporting} aria-busy={isExporting}>
        <legend className="text-xs font-semibold">带到我的笔记</legend>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="min-w-0 flex-1 text-[11px] text-[var(--muted)]">
            导出范围
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as DigestExportScope);
                setError(null);
                setDownloadStarted(false);
              }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
            >
              <option value="active">未移除项目（待定 + 保留）</option>
              <option value="all">完整复盘记录（包含已移除）</option>
            </select>
          </label>
          <label className="min-w-0 flex-1 text-[11px] text-[var(--muted)]">
            文件格式
            <select
              aria-label="文件格式"
              value={format}
              onChange={(event) => {
                setFormat(event.target.value as DigestExportFormat);
                setError(null);
                setDownloadStarted(false);
              }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
            >
              <option value="markdown">Markdown（适合阅读）</option>
              <option value="json">JSON（适合备份/脚本）</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void downloadExport()}
            disabled={count === 0}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 text-xs font-semibold text-[var(--accent-strong)] transition-colors hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
            {isExporting ? "正在导出" : `下载 ${format === "json" ? "JSON" : "Markdown"}`}
          </button>
        </div>
      </fieldset>
      <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
        {count === 0
          ? "此范围内没有项目，可选择完整复盘记录。"
          : `${count} 个项目 · ${format === "json" ? "机器可读 JSON" : "可读 Markdown"} · 仅下载到本地，不发布，不含私人笔记。`}
      </p>
      {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>}
      <p className="mt-2 text-[11px] text-[var(--success)]" role="status">
        {downloadStarted ? "已发起下载，请查看浏览器下载列表。" : ""}
      </p>
    </div>
  );
}
