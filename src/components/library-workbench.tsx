"use client";

import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  ExternalLink,
  GitBranch,
  Inbox,
  Layers3,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  demoRepositories,
  repositoryStatuses,
  type DemoRepository,
  type RepositorySource,
  type RepositoryStatus,
} from "@/lib/demo-repositories";

const statusLabels: Record<RepositoryStatus, string> = {
  candidate: "候选",
  trying: "试用中",
  adopted: "已采用",
  reference: "参考",
};

const statusStyles: Record<RepositoryStatus, string> = {
  candidate: "bg-[var(--surface-muted)] text-[var(--muted)]",
  trying: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  adopted: "bg-[var(--success-soft)] text-[var(--success)]",
  reference: "bg-[var(--violet-soft)] text-[var(--violet)]",
};

const sourceLabels: Record<RepositorySource, string> = {
  github: "GitHub Stars",
  rss: "RSS",
  manual: "手动添加",
};

const navigation = [
  { id: "library", label: "收藏库", icon: Layers3 },
  { id: "inbox", label: "收件箱", icon: Inbox },
  { id: "interests", label: "兴趣与规则", icon: Sparkles },
  { id: "digest", label: "周报", icon: BookOpen },
] as const;

type NavigationId = (typeof navigation)[number]["id"] | "settings";

export function LibraryWorkbench() {
  const [activeNav, setActiveNav] = useState<NavigationId>("library");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RepositoryStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | RepositorySource>("all");
  const [selectedId, setSelectedId] = useState(demoRepositories[0].id);
  const [importOpen, setImportOpen] = useState(false);
  const [importNotice, setImportNotice] = useState(false);

  const filteredRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return demoRepositories.filter((repository) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [repository.fullName, repository.description, ...repository.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || repository.status === statusFilter;
      const matchesSource = sourceFilter === "all" || repository.source === sourceFilter;

      return matchesQuery && matchesStatus && matchesSource;
    });
  }, [query, sourceFilter, statusFilter]);

  const selectedRepository =
    filteredRepositories.find((repository) => repository.id === selectedId) ??
    filteredRepositories[0] ??
    null;

  function handleImport() {
    setImportOpen(false);
    setImportNotice(true);
    window.setTimeout(() => setImportNotice(false), 4200);
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1600px]">
        <aside className="hidden w-[248px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 lg:flex lg:flex-col">
          <BrandMark />
          <div className="mt-10 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Workspace
          </div>
          <nav className="mt-3 space-y-1" aria-label="主导航">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-[17px]" strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === "inbox" && (
                    <span className="ml-auto rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                      12
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="size-2 rounded-full bg-[var(--success)]" aria-hidden="true" />
              本地数据库已连接
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              SQLite 文件保存在本机。同步只读，不会修改 GitHub。
            </p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-strong)] hover:underline"
              onClick={() => setActiveNav("settings")}
            >
              查看设置 <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color:var(--background)/.92] px-5 py-4 backdrop-blur-md sm:px-8 lg:px-10">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="lg:hidden">
                  <BrandMark compact />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--muted)]">Workspace / RepoTrellis</p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                    {activeNav === "library"
                      ? "收藏库"
                      : navigation.find((item) => item.id === activeNav)?.label ?? "设置"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] sm:inline-flex">
                  演示数据
                </span>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
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
                    onClick={() => setActiveNav(item.id)}
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

          <main className="mx-auto max-w-[1200px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
            {activeNav === "library" ? (
              <LibraryContent
                query={query}
                onQueryChange={setQuery}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                sourceFilter={sourceFilter}
                onSourceChange={setSourceFilter}
                repositories={filteredRepositories}
                selectedRepository={selectedRepository}
                onSelectRepository={setSelectedId}
                onOpenImport={() => setImportOpen(true)}
              />
            ) : (
              <ModulePlaceholder
                title={navigation.find((item) => item.id === activeNav)?.label ?? "设置"}
                onOpenImport={() => setImportOpen(true)}
              />
            )}
          </main>
        </div>
      </div>

      {importNotice && (
        <div
          className="fixed bottom-5 right-5 z-30 flex max-w-sm items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
          role="status"
        >
          <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <Check className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold">导入意图已记录</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">GitHub API 连接将在 Sprint 1 接入。</p>
          </div>
          <button type="button" onClick={() => setImportNotice(false)} aria-label="关闭提示">
            <X className="size-4 text-[var(--muted)]" aria-hidden="true" />
          </button>
        </div>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onSubmit={handleImport} />}
    </div>
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
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: "all" | RepositoryStatus;
  onStatusChange: (value: "all" | RepositoryStatus) => void;
  sourceFilter: "all" | RepositorySource;
  onSourceChange: (value: "all" | RepositorySource) => void;
  repositories: DemoRepository[];
  selectedRepository: DemoRepository | null;
  onSelectRepository: (id: string) => void;
  onOpenImport: () => void;
}) {
  return (
    <>
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
            把已经看过的项目放在一个可复盘的地方。先从搜索开始，再决定下一步行动。
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
        >
          <Plus className="size-4" aria-hidden="true" />
          添加来源
        </button>
      </section>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="收藏库概览">
        <StatCard label="全部项目" value="128" detail="本地已保存" icon={<Layers3 className="size-4" />} />
        <StatCard label="待处理" value="12" detail="需要下一步动作" icon={<Clock3 className="size-4" />} />
        <StatCard label="本周新增" value="6" detail="来自 3 个来源" icon={<ArrowUpRight className="size-4" />} />
        <StatCard label="平均匹配" value="78" detail="兴趣规则评分" icon={<Sparkles className="size-4" />} accent />
      </section>

      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:p-5 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索仓库、描述或标签"
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
              onChange={(value) => onStatusChange(value as "all" | RepositoryStatus)}
              options={[
                ["all", "全部状态"],
                ...repositoryStatuses.map((status) => [status, statusLabels[status]] as const),
              ]}
            />
            <FilterSelect
              label="来源"
              value={sourceFilter}
              onChange={(value) => onSourceChange(value as "all" | RepositorySource)}
              options={[
                ["all", "全部来源"],
                ["github", "GitHub Stars"],
                ["rss", "RSS"],
                ["manual", "手动添加"],
              ]}
            />
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">更多筛选</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--muted)] sm:px-5">
          <span>
            {repositories.length === demoRepositories.length
              ? "全部收藏"
              : `筛选出 ${repositories.length} 个项目`}
          </span>
          <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-[var(--ink)]">
            最近更新 <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        {repositories.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {repositories.map((repository) => (
              <RepositoryRow
                key={repository.id}
                repository={repository}
                selected={repository.id === selectedRepository?.id}
                onSelect={() => onSelectRepository(repository.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState onClear={() => { onQueryChange(""); onStatusChange("all"); onSourceChange("all"); }} />
        )}
      </section>

      {selectedRepository && (
        <div className="mt-6 xl:hidden">
          <RepositoryDetail repository={selectedRepository} />
        </div>
      )}

      <div className="mt-6 hidden xl:block">
        {selectedRepository && <RepositoryDetail repository={selectedRepository} />}
      </div>
    </>
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
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">项目脉络工作台</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail: string; icon: ReactNode; accent?: boolean }) {
  return (
    <article className={`rounded-2xl border p-4 shadow-[var(--shadow-sm)] ${accent ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <div className="flex items-center justify-between text-xs font-medium text-[var(--muted)]">
        <span>{label}</span>
        <span className={accent ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}>{icon}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-right text-[11px] text-[var(--muted)]">{detail}</span>
      </div>
    </article>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="relative inline-flex h-10 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-sm font-medium text-[var(--ink)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[var(--muted)]" aria-hidden="true" />
    </label>
  );
}

function RepositoryRow({ repository, selected, onSelect }: { repository: DemoRepository; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full flex-col gap-4 px-4 py-4 text-left transition-colors sm:flex-row sm:items-center sm:px-5 ${selected ? "bg-[var(--accent-soft)]/55" : "hover:bg-[var(--surface-muted)]"}`}
      aria-pressed={selected}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
          <GitBranch className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-[var(--ink)]">{repository.fullName}</span>
            {repository.source === "github" && <Star className="size-3.5 fill-current text-[var(--accent)]" aria-label="来自 GitHub Stars" />}
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--muted)]">{repository.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: repository.languageColor }} aria-hidden="true" />{repository.language}</span>
            <span className="text-[var(--border-strong)]">/</span>
            <span>{repository.stars} stars</span>
            {repository.tags.map((tag) => <span key={tag} className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5">{tag}</span>)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 sm:w-[220px] sm:justify-end">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[repository.status]}`}>{statusLabels[repository.status]}</span>
        <div className="text-right">
          <p className="text-xs font-semibold text-[var(--ink)]">{repository.score} 匹配</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{repository.updated}</p>
        </div>
        <MoreHorizontal className="size-4 text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </div>
    </button>
  );
}

function RepositoryDetail({ repository }: { repository: DemoRepository }) {
  return (
    <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]" aria-label="项目详情">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Selected project</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">{repository.fullName}</h2>
        </div>
        <a href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]" aria-label="打开 GitHub 仓库">
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{repository.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <DetailMetric label="匹配分" value={`${repository.score} / 100`} />
        <DetailMetric label="来源" value={sourceLabels[repository.source]} />
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold"><CircleHelp className="size-3.5 text-[var(--accent-strong)]" aria-hidden="true" />为什么在这里</div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{repository.evidence}</p>
      </div>
      <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3.5">
        <div className="flex items-center gap-2 text-xs font-semibold"><ArrowUpRight className="size-3.5 text-[var(--accent-strong)]" aria-hidden="true" />下一步行动</div>
        <p className="mt-2 text-sm leading-5 text-[var(--ink)]">{repository.nextAction}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {repository.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)]"><Tag className="size-3" aria-hidden="true" />{tag}</span>)}
      </div>
    </aside>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid size-11 place-items-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]"><Search className="size-5" aria-hidden="true" /></div>
      <h3 className="mt-4 text-sm font-semibold">没有匹配的项目</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">换个关键词或清除筛选条件，继续查找你的收藏。</p>
      <button type="button" onClick={onClear} className="mt-4 text-xs font-semibold text-[var(--accent-strong)] hover:underline">清除筛选</button>
    </div>
  );
}

function ModulePlaceholder({ title, onOpenImport }: { title: string; onOpenImport: () => void }) {
  return (
    <section className="flex min-h-[55dvh] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Sparkles className="size-5" aria-hidden="true" /></div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}正在接入</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">这个模块会沿用同一套本地优先数据和解释性状态。先导入一些 Stars，收藏库会立即可用。</p>
      <button type="button" onClick={onOpenImport} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"><Upload className="size-4" aria-hidden="true" />导入 GitHub Stars</button>
    </section>
  );
}

function ImportDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[color:var(--ink)/.35] px-5 py-8" role="presentation" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">GitHub connector</p>
            <h2 id="import-title" className="mt-2 text-xl font-semibold tracking-tight">导入 Stars</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]" aria-label="关闭导入窗口"><X className="size-5" aria-hidden="true" /></button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">输入 GitHub 用户名，后续会通过只读 API 同步 Starred repositories。当前先记录界面流程，不会发送请求。</p>
        <label className="mt-5 block text-xs font-semibold text-[var(--ink)]">GitHub 用户名或个人 URL<input className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" placeholder="例如 andyazure" /></label>
        <div className="mt-6 flex items-center justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)]">取消</button><button type="button" onClick={onSubmit} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"><Upload className="size-4" aria-hidden="true" />准备导入</button></div>
      </div>
    </div>
  );
}
