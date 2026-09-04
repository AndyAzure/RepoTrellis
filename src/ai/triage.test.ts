import { describe, expect, it } from "vitest";

import {
  buildAiTriagePrompt,
  extractOpenAiMessageContent,
  isSafeAiEndpoint,
  parseAiTriageContent,
} from "./triage";
import { triageLocally } from "./local-triage";

const source = {
  sourceItemId: 1,
  kind: "article",
  url: "https://notes.example.com/ai",
  title: "A useful TypeScript tool",
  excerpt: "A practical open source tool for a local workflow.",
  publishedAt: null,
  extractedGithubRefs: ["https://github.com/acme/tool"],
};

describe("AI triage helpers", () => {
  it("builds a prompt from bounded source evidence without private fields", () => {
    const prompt = buildAiTriagePrompt([source]);
    expect(prompt).toContain("A useful TypeScript tool");
    expect(prompt).toContain("https://github.com/acme/tool");
    expect(prompt).not.toContain("apiKey");
    expect(prompt).not.toContain('"note"');
  });

  it("parses fenced JSON and filters unknown or duplicate source IDs", () => {
    const content = `\n\`\`\`json\n${JSON.stringify({
      items: [
        { sourceItemId: 1, verdict: "keep", summary: "Keep", reason: "Has a project", projectRefs: [] },
        { sourceItemId: 1, verdict: "skip", summary: "Duplicate", reason: "No", projectRefs: [] },
        { sourceItemId: 999, verdict: "review", summary: "Unknown", reason: "No", projectRefs: [] },
      ],
    })}\n\`\`\``;
    expect(parseAiTriageContent(content, new Set([1]))).toEqual([
      { sourceItemId: 1, verdict: "keep", summary: "Keep", reason: "Has a project", projectRefs: [] },
    ]);
  });

  it("accepts OpenAI text parts and rejects unsafe endpoints", () => {
    expect(
      extractOpenAiMessageContent({
        choices: [{ message: { content: [{ type: "text", text: "hello" }] } }],
      }),
    ).toBe("hello");
    expect(isSafeAiEndpoint("https://api.example.com/v1/chat/completions")).toBe(true);
    expect(isSafeAiEndpoint("http://localhost:11434/v1/chat/completions")).toBe(true);
    expect(isSafeAiEndpoint("file:///tmp/model")).toBe(false);
    expect(isSafeAiEndpoint("https://user:password@example.com/v1")).toBe(false);
  });

  it("provides a no-key local first pass", () => {
    expect(triageLocally([source])[0]).toMatchObject({
      sourceItemId: 1,
      verdict: "keep",
      projectRefs: ["https://github.com/acme/tool"],
    });
    expect(
      triageLocally([{ ...source, sourceItemId: 2, extractedGithubRefs: [], excerpt: "A short note" }])[0].verdict,
    ).toBe("skip");
  });
});
