import type Database from "better-sqlite3";

import {
  getRepository,
  type RepositoryListItem,
} from "../domain/repositories/repository-library";
import { getRepositoryAnalysis } from "../domain/analysis/analysis-library";
import {
  getActiveInterest,
} from "../domain/interests/interest-library";
import type { Interest } from "../domain/interests/interest";
import type { RepositoryAnalysis } from "../domain/analysis/repository-analysis";
import type { FeedbackAction } from "../domain/feedback";

export { feedbackActions } from "../domain/feedback";
export type { FeedbackAction } from "../domain/feedback";

export interface FeedbackSignal {
  latestAction: FeedbackAction | null;
  totalCount: number;
}

export interface RecommendationInput {
  repository: RepositoryListItem;
  analysis: RepositoryAnalysis | null;
  interest: Interest | null;
  feedback: FeedbackSignal;
  evidenceCount: number;
  now?: Date;
}

export interface RecommendationResult {
  repositoryId: number;
  score: number;
  reasons: string[];
  matchedPositiveRules: string[];
  matchedNegativeRules: string[];
  coverage: {
    interest: boolean;
    analysis: boolean;
    evidence: boolean;
  };
}

export function getRepositoryRecommendation(
  sqlite: Database.Database,
  repositoryId: number,
): RecommendationResult | null {
  const repository = getRepository(sqlite, repositoryId);
  if (!repository) return null;

  const feedback = sqlite
    .prepare<[number, number], { action: FeedbackAction; totalCount: number }>(
      `select
         (select action from feedback_events
          where repository_id = ?
          order by created_at desc, id desc limit 1) as action,
         (select count(*) from feedback_events where repository_id = ?) as totalCount`,
    )
    .get(repositoryId, repositoryId);
  const evidence = sqlite
    .prepare<[number], { count: number }>(
      "select count(*) as count from repo_mentions where repository_id = ?",
    )
    .get(repositoryId);

  return scoreRepository({
    repository,
    analysis: getRepositoryAnalysis(sqlite, repositoryId),
    interest: getActiveInterest(sqlite),
    feedback: {
      latestAction: feedback?.action ?? null,
      totalCount: feedback?.totalCount ?? 0,
    },
    evidenceCount: evidence?.count ?? 0,
  });
}

export function scoreRepository(input: RecommendationInput): RecommendationResult {
  const haystack = buildHaystack(input);
  const positiveRules = input.interest?.positiveRules ?? [];
  const negativeRules = input.interest?.negativeRules ?? [];
  const matchedPositiveRules = positiveRules.filter((rule) =>
    haystack.includes(rule.toLocaleLowerCase()),
  );
  const matchedNegativeRules = negativeRules.filter((rule) =>
    haystack.includes(rule.toLocaleLowerCase()),
  );

  const interestScore = clamp(
    input.interest
      ? 0.5 + matchedPositiveRules.length * 0.2 - matchedNegativeRules.length * 0.25
      : 0.5,
  );
  const feedbackScore = feedbackWeights[input.feedback.latestAction ?? "none"];
  const sourceScore = input.repository.sources.length
    ? Math.max(...input.repository.sources.map((source) => sourceWeights[source] ?? 0.35))
    : 0.35;
  const healthScore = getHealthScore(input.repository);
  const freshnessScore = getFreshnessScore(
    input.repository.remoteUpdatedAt,
    input.now ?? new Date(),
  );
  const noveltyScore = 0.5;
  const score = Math.round(
    (interestScore * 35 +
      feedbackScore * 20 +
      sourceScore * 15 +
      healthScore * 15 +
      freshnessScore * 10 +
      noveltyScore * 5) *
      10,
  ) / 10;

  const reasons = [
    ...matchedPositiveRules.slice(0, 2).map((rule) => `兴趣规则命中：${rule}`),
    ...matchedNegativeRules.slice(0, 2).map((rule) => `负向规则降权：${rule}`),
    input.analysis?.topics[0] ? `项目主题：${input.analysis.topics[0]}` : null,
    input.feedback.latestAction ? `最近反馈：${feedbackLabels[input.feedback.latestAction]}` : null,
    input.repository.sources.length > 0 ? `来源：${input.repository.sources.map((source) => source).join("、")}` : null,
  ].filter((reason): reason is string => Boolean(reason)).slice(0, 3);

  if (reasons.length === 0) reasons.push("暂无足够信号，建议先生成结构化分析或补充兴趣规则。");

  return {
    repositoryId: input.repository.id,
    score,
    reasons,
    matchedPositiveRules,
    matchedNegativeRules,
    coverage: {
      interest: Boolean(input.interest),
      analysis: input.analysis?.status === "ready",
      evidence: input.evidenceCount > 0,
    },
  };
}

const feedbackWeights: Record<FeedbackAction | "none", number> = {
  keep: 0.85,
  try: 0.9,
  adopt: 1,
  dismiss: 0.2,
  block: 0,
  none: 0.5,
};

const feedbackLabels: Record<FeedbackAction, string> = {
  keep: "保留",
  try: "准备试用",
  adopt: "已采用",
  dismiss: "暂不考虑",
  block: "明确屏蔽",
};

const sourceWeights: Record<string, number> = {
  github: 0.9,
  rss: 0.75,
  article: 0.7,
  manual: 0.6,
};

function buildHaystack(input: RecommendationInput): string {
  return [
    input.repository.fullName,
    input.repository.description,
    input.repository.language,
    input.repository.tags.join(" "),
    input.analysis?.summary,
    ...(input.analysis?.topics ?? []),
    ...(input.analysis?.techStack ?? []),
    ...(input.analysis?.useCases ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function getHealthScore(repository: RepositoryListItem): number {
  if (repository.isArchived) return 0.1;
  let score = 0.45;
  if (repository.license) score += 0.2;
  if (repository.stars >= 100) score += 0.1;
  if (repository.forks >= 10) score += 0.1;
  return clamp(score);
}

function getFreshnessScore(value: string | null, now: Date): number {
  if (!value) return 0.4;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0.4;
  const days = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  if (days <= 30) return 1;
  if (days <= 180) return 0.8;
  if (days <= 365) return 0.6;
  return 0.35;
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
