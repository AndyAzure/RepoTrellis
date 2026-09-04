"use client";

import {
  Ban,
  ArrowUpRight,
  BrainCircuit,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Clock3,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Inbox,
  Layers3,
  LoaderCircle,
  Plus,
  Save,
  Search,
  Sparkles,
  Tag,
  ThumbsUp,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { InboxWorkbench } from "@/components/inbox-workbench";
import { InterestWorkbench } from "@/components/interest-workbench";
import { DigestWorkbench } from "@/components/digest-workbench";
import { AiTriageWorkbench } from "@/components/ai-triage-workbench";
import type { RepositoryAnalysis } from "@/domain/analysis/repository-analysis";
import type { FeedbackAction } from "@/domain/feedback/feedback";
import type { RecommendationResult } from "@/ranking/repository-ranking";
import type { SourceInboxItem } from "@/domain/inbox/source-library";
import {
  repositorySourceKinds,
  repositoryStatuses,
  type RepositoryListItem,
  type RepositoryMetaPatch,
  type RepositorySourceKind,
  type RepositoryStatus,
} from "@/domain/repositories/repository";

const statusLabels: Record<RepositoryStatus, string> = {
  candidate: "候选",
  trying: "试用中",
  adopted: "已采用",
  dropped: "已放弃",
  reference: "参考",
};

const statusStyles: Record<RepositoryStatus, string> = {
  candidate: "bg-[var(--surface-muted)] text-[var(--muted)]",
  trying: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  adopted: "bg-[var(--success-soft)] text-[var(--success)]",
  dropped: "bg-[var(--surface-muted)] text-[var(--muted)] line-through",
  reference: "bg-[var(--violet-soft)] text-[var(--violet)]",
};

const statusMarkerStyles: Record<RepositoryStatus, string> = {
  candidate: "bg-[var(--border-strong)]",
  trying: "bg-[var(--accent)]",
  adopted: "bg-[var(--success)]",
  dropped: "bg-[var(--muted)]",
  reference: "bg-[var(--violet)]",
};

const statusDescriptions: Record<RepositoryStatus, string> = {
  candidate: "值得进一步了解，尚未做决定",
  trying: "正在验证是否适合你的工作流",
  adopted: "已经进入常用工具箱",
  dropped: "明确不再投入时间",
  reference: "留作参考，暂不进入试用",
};

const sourceLabels: Record<RepositorySourceKind, string> = {
  github: "GitHub Stars",
  rss: "RSS",
  article: "文章",
  manual: "手动添加",
};

const sourceShortLabels: Record<RepositorySourceKind, string> = {
  github: "Stars 导入",
  rss: "RSS 发现",
  article: "文章线索",
  manual: "手动记录",
};

const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Rust: "#dea584",
  Go: "#00add8",
  Java: "#b07219",
  Ruby: "#701516",
};

const navigation = [
  { id: "library", label: "收藏库", icon: Layers3 },
  { id: "inbox", label: "收件箱", icon: Inbox },
  { id: "interests", label: "兴趣与规则", icon: Sparkles },
  { id: "ai", label: "AI 梳理", icon: BrainCircuit },
  { id: "digest", label: "周报", icon: BookOpen },
] as const;

type NavigationId = (typeof navigation)[number]["id"] | "settings";
type Notice = { kind: "success" | "error"; title: string; detail: string };

export function RepositoryWorkbench({
  initialRepositories,
  initialInboxItems,
}: {
  initialRepositories: RepositoryListItem[];
  initialInboxItems: SourceInboxItem[];
}) {
  const [activeNav, setActiveNav] = useState<NavigationId>("library");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | RepositoryStatus
  >("all");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | RepositorySourceKind
  >("all");
  const [repositories, setRepositories] =
    useState<RepositoryListItem[]>(initialRepositories);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialRepositories[0]?.id ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        setIsLoading(true);
        const search = new URLSearchParams({ limit: "100" });
        if (query.trim()) search.set("q", query.trim());
        if (statusFilter !== "all") search.set("status", statusFilter);
        if (sourceFilter !== "all") search.set("source", sourceFilter);

        try {
          const response = await fetch(`/api/repositories?${search}`, {
            signal: controller.signal,
          });
          const payload = (await response.json()) as RepositoryListResponse;

          if (!response.ok || !payload.data) {
            throw new Error(payload.error?.message ?? "资料库读取失败。");
          }

          setRepositories(payload.data);
          setLoadError(null);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          setLoadError(error instanceof Error ? error.message : "资料库读取失败。");
        } finally {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        }
      },
      query ? 220 : 0,
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, refreshKey, sourceFilter, statusFilter]);

  const selectedRepository =
    repositories.find((repository) => repository.id === selectedId) ??
    repositories[0] ??
    null;
  const stats = useMemo(
    () => ({
      total: repositories.length,
      candidate: repositories.filter(({ status }) => status === "candidate")
        .length,
      trying: repositories.filter(({ status }) => status === "trying").length,
      adopted: repositories.filter(({ status }) => status === "adopted").length,
    }),
    [repositories],
  );

  async function handleImport(username: string): Promise<string | null> {
    try {
      const response = await fetch("/api/imports/github-stars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.data) {
        return payload.error?.message ?? "GitHub Stars 导入失败。";
      }

      setImportOpen(false);
      setRefreshKey((value) => value + 1);
      setNotice({
        kind: "success",
        title: "GitHub Stars 已同步",
        detail: `新增 ${payload.data.created} 个，更新 ${payload.data.updated} 个仓库。`,
      });
      return null;
    } catch {
      return "无法连接导入接口，请确认本地服务仍在运行。";
    }
  }

  async function handleMetaUpdate(
    repositoryId: number,
    patch: RepositoryMetaPatch,
  ): Promise<string | null> {
    try {
      const response = await fetch(`/api/repositories/${repositoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as RepositoryDetailResponse;

      if (!response.ok || !payload.data) {
        return payload.error?.message ?? "项目记录保存失败。";
      }

      setRepositories((current) =>
        current.map((repository) =>
          repository.id === repositoryId ? payload.data! : repository,
        ),
      );
      setRefreshKey((value) => value + 1);
      setNotice({
        kind: "success",
        title: "项目记录已保存",
        detail: `${payload.data.fullName} 的状态、标签和笔记已更新。`,
      });
      return null;
    } catch {
      return "无法连接保存接口，请稍后重试。";
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1600px]">
        <aside className="hidden w-[248px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 lg:flex lg:flex-col">
          <BrandMark />
          <div className="mt-10 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Workspace
          </div>
          <Navigation activeNav={activeNav} onChange={setActiveNav} />
          <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span
                className="size-2 rounded-full bg-[var(--success)]"
                aria-hidden="true"
              />
              本地数据库已连接
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              SQLite 文件保存在本机。同步只读，不会修改 GitHub。
            </p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-strong)] hover:underline"
              onClick={() => setActiveNav("ai")}
            >
              配置 AI <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <Header
            activeNav={activeNav}
            onNavChange={setActiveNav}
            onOpenImport={() => setImportOpen(true)}
          />
          <main className="mx-auto max-w-[1200px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
            {activeNav === "library" ? (
              <LibraryContent
                query={query}
                onQueryChange={setQuery}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                sourceFilter={sourceFilter}
                onSourceChange={setSourceFilter}
                repositories={repositories}
                selectedRepository={selectedRepository}
                onSelectRepository={setSelectedId}
                onOpenImport={() => setImportOpen(true)}
                stats={stats}
                isLoading={isLoading}
                loadError={loadError}
                onMetaUpdate={handleMetaUpdate}
              />
            ) : activeNav === "inbox" ? (
              <InboxWorkbench
                initialItems={initialInboxItems}
                onResolved={() => setRefreshKey((value) => value + 1)}
              />
            ) : activeNav === "interests" ? (
              <InterestWorkbench />
            ) : activeNav === "ai" ? (
              <AiTriageWorkbench />
            ) : activeNav === "digest" ? (
              <DigestWorkbench />
            ) : (
              <ModulePlaceholder
                title="设置"
                onOpenImport={() => setImportOpen(true)}
              />
            )}
          </main>
        </div>
      </div>

      {notice && <NoticeToast notice={notice} onClose={() => setNotice(null)} />}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onSubmit={handleImport}
        />
      )}
    </div>
  );
}

function Header({
  activeNav,
  onNavChange,
  onOpenImport,
}: {
  activeNav: NavigationId;
  onNavChange: (value: NavigationId) => void;
  onOpenImport: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color:var(--background)/.92] px-5 py-4 backdrop-blur-md sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <BrandMark compact />
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">
              Workspace / RepoTrellis
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {activeNav === "library"
                ? "收藏库"
                : navigation.find((item) => item.id === activeNav)?.label ??
                  "设置"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] sm:inline-flex">
            SQLite · 本地数据
          </span>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:bg-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
          >
            <Upload className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">导入 Stars</span>
            <span className="sm:hidden">导入</span>
          </button>
        </div>
      </div>
      <div className="mx-auto mt-4 flex max-w-[1200px] gap-1 overflow-x-auto border-t border-[var(--border)] pt-3 lg:hidden">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavChange(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--muted)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function Navigation({
  activeNav,
  onChange,
}: {
  activeNav: NavigationId;
  onChange: (value: NavigationId) => void;
}) {
  return (
    <nav className="mt-3 space-y-1" aria-label="主导航">
      {navigation.map((item) => {
        const Icon = item.icon;
        const active = activeNav === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
              active
                ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-[17px]" strokeWidth={1.8} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function LibraryContent({
  query,
  onQueryChange,
  statusFilter,
  onStatusChange,
  sourceFilter,
  onSourceChange,
  repositories,
  selectedRepository,
  onSelectRepository,
  onOpenImport,
  stats,
  isLoading,
  loadError,
  onMetaUpdate,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: "all" | RepositoryStatus;
  onStatusChange: (value: "all" | RepositoryStatus) => void;
  sourceFilter: "all" | RepositorySourceKind;
  onSourceChange: (value: "all" | RepositorySourceKind) => void;
  repositories: RepositoryListItem[];
  selectedRepository: RepositoryListItem | null;
  onSelectRepository: (id: number) => void;
  onOpenImport: () => void;
  stats: { total: number; candidate: number; trying: number; adopted: number };
  isLoading: boolean;
  loadError: string | null;
  onMetaUpdate: (
    repositoryId: number,
    patch: RepositoryMetaPatch,
  ) => Promise<string | null>;
}) {
  const hasFilters =
    query.trim().length > 0 || statusFilter !== "all" || sourceFilter !== "all";

  return (
    <>
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
          把发现变成行动：每张卡片只回答为什么关注、现在在哪一步，以及下一步做什么。
        </p>
        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
        >
          <Plus className="size-4" aria-hidden="true" />
          添加来源
        </button>
      </section>

      <section
        className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="收藏库概览"
      >
        <StatCard
          label="当前结果"
          value={String(stats.total)}
          detail="最多显示 100 个"
          icon={<Layers3 className="size-4" />}
        />
        <StatCard
          label="候选"
          value={String(stats.candidate)}
          detail="等待下一步动作"
          icon={<Clock3 className="size-4" />}
        />
        <StatCard
          label="试用中"
          value={String(stats.trying)}
          detail="正在验证价值"
          icon={<ArrowUpRight className="size-4" />}
        />
        <StatCard
          label="已采用"
          value={String(stats.adopted)}
          detail="进入常用工具箱"
          icon={<Check className="size-4" />}
          accent
        />
      </section>

      <section
        className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
        aria-busy={isLoading}
      >
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:p-5 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索仓库、描述或语言"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-9 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="清除搜索"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="状态"
              value={statusFilter}
              onChange={(value) =>
                onStatusChange(value as "all" | RepositoryStatus)
              }
              options={[
                ["all", "全部状态"],
                ...repositoryStatuses.map(
                  (status) => [status, statusLabels[status]] as const,
                ),
              ]}
            />
            <FilterSelect
              label="来源"
              value={sourceFilter}
              onChange={(value) =>
                onSourceChange(value as "all" | RepositorySourceKind)
              }
              options={[
                ["all", "全部来源"],
                ...repositorySourceKinds.map(
                  (source) => [source, sourceLabels[source]] as const,
                ),
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--muted)] sm:px-5">
          <span>
            {isLoading
              ? "正在查询本地索引…"
              : hasFilters
                ? `筛选出 ${repositories.length} 个项目`
                : `${repositories.length} 个本地项目`}
          </span>
          <span className="inline-flex items-center gap-1 font-medium">
            最近更新 <ChevronDown className="size-3.5" aria-hidden="true" />
          </span>
        </div>

        {loadError ? (
          <InlineError message={loadError} />
        ) : repositories.length > 0 ? (
          <div
            className={`space-y-8 p-4 transition-opacity sm:p-5 ${
              isLoading ? "opacity-55" : "opacity-100"
            }`}
          >
            {repositoryStatuses.map((status) => {
              const grouped = repositories.filter(
                (repository) => repository.status === status,
              );
              if (grouped.length === 0) return null;

              return (
                <section
                  key={status}
                  aria-labelledby={`library-group-${status}`}
                >
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2.5 rounded-full ${statusMarkerStyles[status]}`}
                          aria-hidden="true"
                        />
                        <h3
                          id={`library-group-${status}`}
                          className="text-sm font-semibold"
                        >
                          {statusLabels[status]}
                        </h3>
                        <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                          {grouped.length}
                        </span>
                      </div>
                      <p className="mt-1 pl-[18px] text-xs text-[var(--muted)]">
                        {statusDescriptions[status]}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {grouped.map((repository) => (
                      <RepositoryCard
                        key={repository.id}
                        repository={repository}
                        selected={repository.id === selectedRepository?.id}
                        onSelect={() => onSelectRepository(repository.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState
            hasFilters={hasFilters}
            onClear={() => {
              onQueryChange("");
              onStatusChange("all");
              onSourceChange("all");
            }}
            onOpenImport={onOpenImport}
          />
        )}
      </section>

      {selectedRepository && (
        <div className="mt-6">
          <RepositoryDetail
            key={selectedRepository.id}
            repository={selectedRepository}
            onSave={onMetaUpdate}
          />
        </div>
      )}
    </>
  );
}

function RepositoryCard({
  repository,
  selected,
  onSelect,
}: {
  repository: RepositoryListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full flex-col rounded-2xl border p-4 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] ${
        selected
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]/55"
          : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--border-strong)]"
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
            <GitBranch className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[var(--ink)]">
              {repository.fullName}
            </h3>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {repository.sources.map((source) => sourceShortLabels[source]).join("、") || "本地记录"}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[repository.status]}`}
        >
          {statusLabels[repository.status]}
        </span>
      </div>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--muted)]">
        {repository.description ?? "暂无项目描述，先打开详情补充你的判断。"}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {repository.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]"
          >
            {tag}
          </span>
        ))}
        {repository.language && (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
            <span
              className="size-1.5 rounded-full"
              style={{
                backgroundColor:
                  languageColors[repository.language] ?? "#82909d",
              }}
              aria-hidden="true"
            />
            {repository.language}
          </span>
        )}
      </div>
      <div className="mt-4 rounded-xl bg-[var(--surface)] p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
          <ArrowUpRight className="size-3.5 text-[var(--accent-strong)]" aria-hidden="true" />
          下一步行动
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--ink)]">
          {repository.nextAction ?? "打开详情，写下一个最小验证动作"}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-strong)]">
          <Sparkles className="size-3.5" aria-hidden="true" />
          打开详情看推荐信号
        </span>
        <span className="text-[11px] text-[var(--muted)]">
          更新于 {formatDate(repository.remoteUpdatedAt ?? repository.updatedAt)}
        </span>
      </div>
    </button>
  );
}

function RepositoryDetail({
  repository,
  onSave,
}: {
  repository: RepositoryListItem;
  onSave: (
    repositoryId: number,
    patch: RepositoryMetaPatch,
  ) => Promise<string | null>;
}) {
  const [status, setStatus] = useState(repository.status);
  const [tags, setTags] = useState(repository.tags.join(", "));
  const [note, setNote] = useState(repository.note ?? "");
  const [nextAction, setNextAction] = useState(repository.nextAction ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisGenerating, setAnalysisGenerating] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [recommendation, setRecommendation] =
    useState<RecommendationResult | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null,
  );
  const [feedbackSaving, setFeedbackSaving] = useState<FeedbackAction | null>(
    null,
  );
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackDone, setFeedbackDone] = useState<FeedbackAction | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/repositories/${repository.id}/analysis`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as AnalysisResponse;
        if (!response.ok) {
          throw new Error(payload.error?.message ?? "结构化分析读取失败。");
        }
        setAnalysis(payload.data ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setAnalysisError(
          error instanceof Error ? error.message : "结构化分析读取失败。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalysisLoading(false);
      });

    return () => controller.abort();
  }, [repository.id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/repositories/${repository.id}/recommendation`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as RecommendationResponse;
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "推荐信号读取失败。");
        }
        setRecommendation(payload.data);
        setRecommendationError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setRecommendationError(
          error instanceof Error ? error.message : "推荐信号读取失败。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecommendationLoading(false);
      });

    return () => controller.abort();
  }, [repository.id]);

  async function handleGenerateAnalysis() {
    setAnalysisGenerating(true);
    setAnalysisError(null);
    try {
      const response = await fetch(`/api/repositories/${repository.id}/analysis`, {
        method: "POST",
      });
      const payload = (await response.json()) as AnalysisResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "结构化分析生成失败。");
      }
      setAnalysis(payload.data);
    } catch (error: unknown) {
      setAnalysisError(
        error instanceof Error ? error.message : "结构化分析生成失败。",
      );
    } finally {
      setAnalysisGenerating(false);
    }
  }

  async function handleFeedback(action: FeedbackAction, reason: string | null) {
    setFeedbackSaving(action);
    setFeedbackError(null);
    setFeedbackDone(null);
    try {
      const response = await fetch(`/api/repositories/${repository.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = (await response.json()) as FeedbackResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "反馈保存失败。");
      }
      setFeedbackDone(action);
      const recommendationResponse = await fetch(
        `/api/repositories/${repository.id}/recommendation`,
      );
      const recommendationPayload =
        (await recommendationResponse.json()) as RecommendationResponse;
      if (recommendationResponse.ok && recommendationPayload.data) {
        setRecommendation(recommendationPayload.data);
      }
    } catch (error: unknown) {
      setFeedbackError(error instanceof Error ? error.message : "反馈保存失败。");
    } finally {
      setFeedbackSaving(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const saveError = await onSave(repository.id, {
      status,
      tags: tags.split(/[,，]/),
      note: note.trim() || null,
      nextAction: nextAction.trim() || null,
    });

    setIsSaving(false);
    setError(saveError);
  }

  return (
    <aside
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]"
      aria-label="项目详情"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Selected project
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            {repository.fullName}
          </h2>
        </div>
        <a
          href={repository.url}
          target="_blank"
          rel="noreferrer"
          className="grid size-8 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
          aria-label="打开 GitHub 仓库"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
        {repository.description ?? "暂无仓库描述。"}
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <DetailMetric label="Stars" value={formatCount(repository.stars)} />
        <DetailMetric label="Forks" value={formatCount(repository.forks)} />
        <DetailMetric
          label="来源"
          value={
            repository.sources.map((source) => sourceLabels[source]).join("、") ||
            "未记录"
          }
        />
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <CircleHelp
            className="size-3.5 text-[var(--accent-strong)]"
            aria-hidden="true"
          />
          为什么在这里
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          {repository.sources.includes("github")
            ? "由 GitHub Stars 只读同步导入，并保留了来源记录。"
            : "这个项目已保存到你的本地收藏库。"}
        </p>
      </div>

      <AnalysisCard
        analysis={analysis}
        isLoading={analysisLoading}
        isGenerating={analysisGenerating}
        error={analysisError}
        onGenerate={handleGenerateAnalysis}
      />

      <RecommendationCard
        recommendation={recommendation}
        isLoading={recommendationLoading}
        error={recommendationError}
      />

      <FeedbackCard
        saving={feedbackSaving}
        done={feedbackDone}
        error={feedbackError}
        onFeedback={handleFeedback}
      />

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="状态">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as RepositoryStatus)
              }
              className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            >
              {repositoryStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="标签">
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="用逗号分隔，例如 AI, 本地优先"
              maxLength={840}
              className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </Field>
        </div>
        <Field label="下一步行动">
          <input
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            placeholder="例如：运行一次示例项目"
            maxLength={500}
            className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </Field>
        <Field label="笔记">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录为什么关注它、试用结果或待确认的问题。"
            maxLength={4_000}
            rows={4}
            className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {repository.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)]"
              >
                <Tag className="size-3" aria-hidden="true" />
                {tag}
              </span>
            ))}
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {isSaving ? "保存中" : "保存记录"}
          </button>
        </div>
        {error && (
          <p className="text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </aside>
  );
}

function RecommendationCard({
  recommendation,
  isLoading,
  error,
}: {
  recommendation: RecommendationResult | null;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <section
      className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-label="推荐信号"
      aria-busy={isLoading}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">推荐信号</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            由兴趣、来源、健康度、新鲜度和反馈组成的可解释分数。
          </p>
        </div>
        {recommendation && (
          <div
            className="grid size-14 shrink-0 place-items-center rounded-full p-1"
            style={{
              background: `conic-gradient(var(--accent) ${recommendation.score}%, var(--surface-muted) 0)`,
            }}
            aria-label={`推荐分数 ${recommendation.score} 分`}
          >
            <div className="grid size-full place-items-center rounded-full bg-[var(--surface)] text-sm font-semibold">
              {recommendation.score}
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2" role="status">
          <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--surface-muted)]" />
          <span className="sr-only">正在计算推荐信号</span>
        </div>
      ) : error ? (
        <p className="mt-4 text-xs text-red-600" role="alert">{error}</p>
      ) : recommendation ? (
        <div className="mt-4">
          <ul className="space-y-2 text-xs leading-5 text-[var(--muted)]">
            {recommendation.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
            <CoverageBadge label="兴趣" active={recommendation.coverage.interest} />
            <CoverageBadge label="分析" active={recommendation.coverage.analysis} />
            <CoverageBadge label="来源证据" active={recommendation.coverage.evidence} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--muted)]">暂无可用推荐信号。</p>
      )}
    </section>
  );
}

function CoverageBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-1 ${
        active
          ? "bg-[var(--success-soft)] text-[var(--success)]"
          : "bg-[var(--surface-muted)] text-[var(--muted)]"
      }`}
    >
      {active ? "已覆盖" : "待补充"} · {label}
    </span>
  );
}

function FeedbackCard({
  saving,
  done,
  error,
  onFeedback,
}: {
  saving: FeedbackAction | null;
  done: FeedbackAction | null;
  error: string | null;
  onFeedback: (action: FeedbackAction, reason: string | null) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const options: Array<{
    action: FeedbackAction;
    label: string;
    icon: ReactNode;
  }> = [
    { action: "keep", label: "保留", icon: <Bookmark className="size-3.5" aria-hidden="true" /> },
    { action: "try", label: "准备试用", icon: <FlaskConical className="size-3.5" aria-hidden="true" /> },
    { action: "adopt", label: "已采用", icon: <ThumbsUp className="size-3.5" aria-hidden="true" /> },
    { action: "dismiss", label: "暂不考虑", icon: <XCircle className="size-3.5" aria-hidden="true" /> },
    { action: "block", label: "屏蔽", icon: <Ban className="size-3.5" aria-hidden="true" /> },
  ];

  return (
    <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4" aria-label="项目反馈">
      <div>
        <h3 className="text-sm font-semibold">给推荐一个反馈</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          只追加一条本地事件，不会删除项目或覆盖你的笔记。
        </p>
      </div>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        placeholder="可选：补充一句原因，帮助以后复盘"
        className="mt-4 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        aria-label="反馈原因，可选"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = done === option.action;
          return (
            <button
              key={option.action}
              type="button"
              onClick={() => void onFeedback(option.action, reason.trim() || null)}
              disabled={Boolean(saving)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
              }`}
            >
              {saving === option.action ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                option.icon
              )}
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-3 text-xs text-red-600" role="alert">{error}</p>}
      {done && !error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--success)]" role="status">
          <Check className="size-3.5" aria-hidden="true" /> 已记录“{options.find((item) => item.action === done)?.label}”反馈
        </p>
      )}
    </section>
  );
}

function AnalysisCard({
  analysis,
  isLoading,
  isGenerating,
  error,
  onGenerate,
}: {
  analysis: RepositoryAnalysis | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => Promise<void>;
}) {
  const busy = isLoading || isGenerating || analysis?.status === "processing";

  return (
    <section
      className="mt-5 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/45 p-4"
      aria-label="结构化分析"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface)] text-[var(--accent-strong)]">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">结构化分析</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              把本地元数据和已保存证据整理成可复盘的项目画像。
            </p>
          </div>
        </div>
        {!isLoading && (
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent-border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--accent-soft)]"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-3.5" aria-hidden="true" />
            )}
            {busy ? "分析中" : analysis ? "重新生成" : "生成结构化分析"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2" role="status">
          <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--surface)]" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--surface)]" />
          <span className="sr-only">正在读取结构化分析</span>
        </div>
      ) : error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : analysis?.status === "ready" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-[var(--ink)]">{analysis.summary}</p>
          <AnalysisTags label="主题" values={analysis.topics} />
          <AnalysisTags label="技术栈" values={analysis.techStack} />
          <AnalysisTags label="适用场景" values={analysis.useCases} />
          <div>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              风险提示 · 置信度 {Math.round((analysis.confidence ?? 0) * 100)}%
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted)]">
              {analysis.risks.map((risk) => (
                <li key={risk} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="border-t border-[var(--accent-border)] pt-3 text-[11px] text-[var(--muted)]">
            由 {analysis.provider} 生成 · 输入快照保存在本地，便于复盘。
          </p>
        </div>
      ) : analysis?.status === "failed" ? (
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
          上次分析没有完成：{analysis.lastError ?? "未知错误"}。可以重新生成。
        </p>
      ) : busy ? (
        <p className="mt-4 text-xs text-[var(--muted)]" role="status">
          正在基于本地证据生成分析…
        </p>
      ) : (
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
          这是一次显式、可追溯的本地初筛，不会读取仓库源码，也不会调用外部模型。
        </p>
      )}
    </section>
  );
}

function AnalysisTags({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--muted)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length > 0 ? (
          values.map((value) => (
            <span
              key={value}
              className="rounded-md border border-[var(--accent-border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--accent-strong)]"
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-xs text-[var(--muted)]">暂无可靠信号</span>
        )}
      </div>
    </div>
  );
}

function ImportDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (username: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = normalizeGithubUsername(value);

    if (!username) {
      setError("请输入有效的 GitHub 用户名或个人主页 URL。");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const submitError = await onSubmit(username);
    setIsSubmitting(false);
    setError(submitError);
  }

  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-[color:var(--ink)/.35] px-5 py-8"
      role="presentation"
      onMouseDown={isSubmitting ? undefined : onClose}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              GitHub connector
            </p>
            <h2
              id="import-title"
              className="mt-2 text-xl font-semibold tracking-tight"
            >
              导入 Stars
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
            aria-label="关闭导入窗口"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          通过 GitHub 只读 API 同步公开的 Starred repositories，单次最多读取 1,000 个仓库。
        </p>
        <label className="mt-5 block text-xs font-semibold text-[var(--ink)]">
          GitHub 用户名或个人 URL
          <input
            autoFocus
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={isSubmitting}
            className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            placeholder="例如 fangyueyu"
          />
        </label>
        {error && (
          <div
            className="mt-3 flex gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {isSubmitting ? "正在同步" : "开始导入"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NoticeToast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const success = notice.kind === "success";
  return (
    <div
      className="fixed bottom-5 right-5 z-30 flex max-w-sm items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
      role={success ? "status" : "alert"}
    >
      <div
        className={`grid size-7 shrink-0 place-items-center rounded-full ${
          success
            ? "bg-[var(--success-soft)] text-[var(--success)]"
            : "bg-red-500/10 text-red-600"
        }`}
      >
        {success ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <CircleAlert className="size-4" aria-hidden="true" />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold">{notice.title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          {notice.detail}
        </p>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭提示">
        <X className="size-4 text-[var(--muted)]" aria-hidden="true" />
      </button>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "px-3"}`}>
      <div className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-[var(--background)]">
        <GitBranch className="size-4" strokeWidth={1.8} aria-hidden="true" />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-bold tracking-tight">RepoTrellis</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            项目脉络工作台
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 shadow-[var(--shadow-sm)] ${
        accent
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center justify-between text-xs font-medium text-[var(--muted)]">
        <span>{label}</span>
        <span className={accent ? "text-[var(--accent-strong)]" : ""}>
          {icon}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-right text-[11px] text-[var(--muted)]">
          {detail}
        </span>
      </div>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="relative inline-flex h-10 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-sm font-medium text-[var(--ink)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 size-3.5 text-[var(--muted)]"
        aria-hidden="true"
      />
    </label>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-[var(--ink)]">
      {label}
      {children}
    </label>
  );
}

function EmptyState({
  hasFilters,
  onClear,
  onOpenImport,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onOpenImport: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid size-11 place-items-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]">
        {hasFilters ? (
          <Search className="size-5" aria-hidden="true" />
        ) : (
          <GitBranch className="size-5" aria-hidden="true" />
        )}
      </div>
      <h3 className="mt-4 text-sm font-semibold">
        {hasFilters ? "没有匹配的项目" : "收藏库还是空的"}
      </h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">
        {hasFilters
          ? "换个关键词或清除筛选条件，继续查找你的收藏。"
          : "导入一次 GitHub Stars，建立你的第一批本地项目记录。"}
      </p>
      <button
        type="button"
        onClick={hasFilters ? onClear : onOpenImport}
        className="mt-4 text-xs font-semibold text-[var(--accent-strong)] hover:underline"
      >
        {hasFilters ? "清除筛选" : "导入 GitHub Stars"}
      </button>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
      <div className="grid size-11 place-items-center rounded-2xl bg-red-500/10 text-red-600">
        <CircleAlert className="size-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">资料库暂时无法读取</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">
        {message}
      </p>
    </div>
  );
}

function ModulePlaceholder({
  title,
  onOpenImport,
}: {
  title: string;
  onOpenImport: () => void;
}) {
  return (
    <section className="flex min-h-[55dvh] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">
        {title}正在接入
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
        这个模块会沿用同一套本地优先数据和解释性状态。先导入一些 Stars，收藏库会立即可用。
      </p>
      <button
        type="button"
        onClick={onOpenImport}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
      >
        <Upload className="size-4" aria-hidden="true" />
        导入 GitHub Stars
      </button>
    </section>
  );
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${trimDecimal(value / 1_000_000)}m`;
  if (value >= 1_000) return `${trimDecimal(value / 1_000)}k`;
  return String(value);
}

function trimDecimal(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function normalizeGithubUsername(value: string): string | null {
  const trimmed = value.trim();
  let username = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
        return null;
      }
      username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }

  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)
    ? username
    : null;
}

interface ApiError {
  error?: { code: string; message: string };
}

interface RepositoryListResponse extends ApiError {
  data?: RepositoryListItem[];
}

interface RepositoryDetailResponse extends ApiError {
  data?: RepositoryListItem;
}

interface AnalysisResponse extends ApiError {
  data?: RepositoryAnalysis | null;
}

interface RecommendationResponse extends ApiError {
  data?: RecommendationResult | null;
}

interface FeedbackResponse extends ApiError {
  data?: { id: number; action: FeedbackAction };
}

interface ImportResponse extends ApiError {
  data?: {
    received: number;
    created: number;
    updated: number;
    pagesFetched: number;
    nextPage: number | null;
  };
}
