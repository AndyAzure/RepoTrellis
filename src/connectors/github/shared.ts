import { z } from "zod";

export const githubRepositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
  name: z.string().min(1),
  html_url: z.string().url(),
  description: z.string().nullable(),
  default_branch: z.string().nullable(),
  language: z.string().nullable(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
  archived: z.boolean(),
  updated_at: z.string().min(1),
});

export interface GithubRepository {
  githubId: number;
  fullName: string;
  owner: string;
  name: string;
  url: string;
  description: string | null;
  defaultBranch: string | null;
  language: string | null;
  stars: number;
  forks: number;
  license: string | null;
  isArchived: boolean;
  remoteUpdatedAt: string;
}

export type GithubConnectorErrorCode =
  | "invalid_username"
  | "invalid_repository"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "upstream"
  | "invalid_response";

export class GithubConnectorError extends Error {
  constructor(
    message: string,
    public readonly code: GithubConnectorErrorCode,
    public readonly status: number,
    public readonly retryAt: string | null = null,
  ) {
    super(message);
    this.name = "GithubConnectorError";
  }
}

export function mapGithubRepository(
  repository: z.infer<typeof githubRepositorySchema>,
): GithubRepository {
  return {
    githubId: repository.id,
    fullName: repository.full_name,
    owner: repository.owner.login,
    name: repository.name,
    url: repository.html_url,
    description: repository.description,
    defaultBranch: repository.default_branch,
    language: repository.language,
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    license: repository.license?.spdx_id ?? null,
    isArchived: repository.archived,
    remoteUpdatedAt: repository.updated_at,
  };
}

export function githubHeaders(token?: string): Headers {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoTrellis",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export function throwGithubResponseError(
  response: Response,
  notFoundMessage = "GitHub resource was not found.",
): never {
  if (response.status === 404) {
    throw new GithubConnectorError(notFoundMessage, "not_found", 404);
  }
  if (response.status === 401) {
    throw new GithubConnectorError("GitHub rejected the configured credentials.", "unauthorized", 401);
  }
  if (response.status === 429 || (response.status === 403 &&
    (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const retryAt = response.headers.get("x-ratelimit-reset") ??
      (retryAfter > 0 ? String(Math.ceil(Date.now() / 1000) + retryAfter) : null);
    throw new GithubConnectorError("GitHub API rate limit was reached.", "rate_limited", 429, retryAt);
  }
  throw new GithubConnectorError("GitHub API request failed.", "upstream", 502);
}
