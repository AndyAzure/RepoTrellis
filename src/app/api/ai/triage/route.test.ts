import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

function request(body: unknown) {
  return POST(
    new Request("http://localhost/api/ai/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const item = {
  sourceItemId: 1,
  kind: "article",
  url: "https://notes.example.com/one",
  title: "A project note",
  excerpt: "A useful open source project.",
  publishedAt: null,
  extractedGithubRefs: ["https://github.com/acme/tool"],
};

describe("AI triage route", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("sends bounded source evidence to an OpenAI-compatible endpoint and validates JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    {
                      sourceItemId: 1,
                      verdict: "keep",
                      summary: "值得保留",
                      reason: "包含明确的 GitHub 项目",
                      projectRefs: ["https://github.com/acme/tool"],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      ),
    );

    const response = await request({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "example-model",
      apiKey: "SECRET_KEY",
      items: [item],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { model: "example-model", analyzedCount: 1, requestedCount: 1 },
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer SECRET_KEY" });
    expect(String(init?.body)).toContain("A project note");
    expect(String(init?.body)).not.toContain("SECRET_KEY");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("allows a local endpoint without a key", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items: [{ ...item, sourceItemId: 1, verdict: "review", summary: "复核", reason: "需要人工判断", projectRefs: [] }] }) } }],
        }),
      ),
    );
    const response = await request({
      endpoint: "http://localhost:11434/v1/chat/completions",
      model: "qwen2.5:7b",
      items: [item],
    });
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).not.toHaveProperty("Authorization");
  });

  it.each([
    { endpoint: "file:///tmp/model", model: "model", items: [item] },
    { endpoint: "https://user:password@example.com/v1/chat/completions", model: "model", items: [item] },
    { endpoint: "https://api.example.com/v1/chat/completions", model: "", items: [item] },
  ])("rejects unsafe or incomplete configuration", async (body) => {
    const response = await request(body);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps upstream failures to a generic message without exposing the key", async () => {
    fetchMock.mockResolvedValue(new Response("SECRET_KEY leaked upstream", { status: 401 }));
    const response = await request({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "model",
      apiKey: "SECRET_KEY",
      items: [item],
    });
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain("ai_upstream_failed");
    expect(body).not.toContain("SECRET_KEY");
  });

  it("rejects malformed model output", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] })),
    );
    const response = await request({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "model",
      items: [item],
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "ai_invalid_response" } });
  });
});
