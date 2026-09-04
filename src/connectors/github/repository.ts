import { githubHeaders, githubRepositorySchema, mapGithubRepository, throwGithubResponseError, GithubConnectorError, type GithubRepository } from "./shared";

export interface FetchGithubRepositoryOptions {
  owner: string;
  name: string;
  token?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function fetchGithubRepository(
  options: FetchGithubRepositoryOptions,
): Promise<GithubRepository> {
  if (!isGithubOwner(options.owner) || !isGithubRepositoryName(options.name)) {
    throw new GithubConnectorError(
      "GitHub repository reference is invalid.",
      "invalid_repository",
      400,
    );
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.name)}`;
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: githubHeaders(options.token),
    signal: options.signal,
  });
  if (!response.ok) {
    throwGithubResponseError(response);
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
  const parsed = githubRepositorySchema.safeParse(payload);
  if (!parsed.success) {
    throw new GithubConnectorError(
      "GitHub returned an unexpected repository payload.",
      "invalid_response",
      502,
    );
  }
  return mapGithubRepository(parsed.data);
}

function isGithubOwner(value: string): boolean {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value);
}

function isGithubRepositoryName(value: string): boolean {
  return /^[a-z\d](?:[a-z\d._-]{0,98}[a-z\d])?$/i.test(value);
}
