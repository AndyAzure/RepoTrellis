import { describe, expect, it, vi } from "vitest";

import { fetchGithubStars, GithubConnectorError } from "./stars";

const githubRepository = {
  id: 101,
  full_name: "acme/repotrellis",
  owner: { login: "acme" },
  name: "repotrellis",
  html_url: "https://github.com/acme/repotrellis",
  description: "Repository intelligence",
  default_branch: "main",
  language: "TypeScript",
  stargazers_count: 120,
  forks_count: 8,
  license: { spdx_id: "MIT" },
  archived: false,
  updated_at: "2026-09-03T12:00:00Z",
};

describe("GitHub Stars connector", () => {
  it("normalizes a page without making an unmocked request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([githubRepository], {
        headers: {
          link: '<https://api.github.com/users/acme/starred?page=2>; rel="next"',
          "x-ratelimit-remaining": "59",
        },
      }),
    );

    const page = await fetchGithubStars({
      username: "acme",
      perPage: 25,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/users/acme/starred?page=1&per_page=25");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(page).toEqual({
      repositories: [
        {
          githubId: 101,
          fullName: "acme/repotrellis",
          owner: "acme",
          name: "repotrellis",
          url: "https://github.com/acme/repotrellis",
          description: "Repository intelligence",
          defaultBranch: "main",
          language: "TypeScript",
          stars: 120,
          forks: 8,
          license: "MIT",
          isArchived: false,
          remoteUpdatedAt: "2026-09-03T12:00:00Z",
        },
      ],
      nextPage: 2,
      rateLimitRemaining: 59,
    });
  });

  it("maps rate-limit responses without exposing the response body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("sensitive upstream detail", {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1788451200",
        },
      }),
    );

    await expect(
      fetchGithubStars({ username: "acme", fetchImpl }),
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAt: "1788451200",
    } satisfies Partial<GithubConnectorError>);
  });

  it("rejects invalid usernames before fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      fetchGithubStars({ username: "invalid/user", fetchImpl }),
    ).rejects.toMatchObject({ code: "invalid_username", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
