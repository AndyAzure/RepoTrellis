import { z } from "zod";

import {
  githubHeaders,
  githubRepositorySchema,
  mapGithubRepository,
  throwGithubResponseError,
  type GithubRepository,
  GithubConnectorError,
} from "./shared";

export { GithubConnectorError, type GithubRepository } from "./shared";

const starredRepositoriesSchema = z.array(githubRepositorySchema);

export interface FetchGithubStarsOptions {
  username: string;
  page?: number;
  perPage?: number;
  token?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface GithubStarsPage {
  repositories: GithubRepository[];
  nextPage: number | null;
  rateLimitRemaining: number | null;
}

export type { GithubConnectorErrorCode } from "./shared";

export async function fetchGithubStars(
  options: FetchGithubStarsOptions,
): Promise<GithubStarsPage> {
  const username = options.username.trim();

  if (!isGithubUsername(username)) {
    throw new GithubConnectorError(
      "GitHub username is invalid.",
      "invalid_username",
      400,
    );
  }

  const page = clampInteger(options.page ?? 1, 1, 1000);
  const perPage = clampInteger(options.perPage ?? 100, 1, 100);
  const url = new URL(
    `https://api.github.com/users/${encodeURIComponent(username)}/starred`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const headers = githubHeaders(options.token);

  const response = await (options.fetchImpl ?? fetch)(url, {
    headers,
    signal: options.signal,
  });

  if (!response.ok) {
    throwGithubResponseError(response, "GitHub user was not found.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GithubConnectorError(
      "GitHub returned unreadable JSON.",
      "invalid_response",
      502,
    );
  }

  const parsed = starredRepositoriesSchema.safeParse(payload);
  if (!parsed.success) {
    throw new GithubConnectorError(
      "GitHub returned an unexpected repository payload.",
      "invalid_response",
      502,
    );
  }

  return {
    repositories: parsed.data.map(mapGithubRepository),
    nextPage: hasNextPage(response.headers.get("link")) ? page + 1 : null,
    rateLimitRemaining: parseIntegerHeader(
      response.headers.get("x-ratelimit-remaining"),
    ),
  };
}

function isGithubUsername(value: string): boolean {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value);
}

function hasNextPage(linkHeader: string | null): boolean {
  return linkHeader?.split(",").some((link) => /rel="next"/.test(link)) ?? false;
}

function parseIntegerHeader(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}
