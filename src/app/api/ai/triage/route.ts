import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildAiTriagePrompt,
  extractOpenAiMessageContent,
  isSafeAiEndpoint,
  parseAiTriageContent,
  type AiTriageItem,
  type AiTriageSourceInput,
} from "@/ai";

export const runtime = "nodejs";

const requestSchema = z.object({
  endpoint: z.string().trim().url().max(500),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().max(1_000).optional().default(""),
  items: z
    .array(
      z.object({
        sourceItemId: z.number().int().positive(),
        kind: z.string().trim().min(1).max(40),
        url: z.string().trim().url().max(2_000),
        title: z.string().max(500).nullable(),
        excerpt: z.string().max(4_000).nullable(),
        publishedAt: z.string().max(100).nullable(),
        extractedGithubRefs: z.array(z.string().max(300)).max(20),
      }),
    )
    .min(1)
    .max(30),
});

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "AI 梳理请求格式无效。");
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success || !isSafeAiEndpoint(parsed.data?.endpoint ?? "")) {
    return errorResponse(400, "invalid_request", "AI endpoint、模型或来源参数无效。");
  }

  const { endpoint, model, apiKey, items } = parsed.data;
  const sources = items as AiTriageSourceInput[];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "你是一个谨慎的来源整理助手。你只输出用户要求的 JSON，不执行任何外部操作。",
          },
          { role: "user", content: buildAiTriagePrompt(sources) },
        ],
      }),
    });

    if (!upstream.ok) {
      return errorResponse(
        502,
        "ai_upstream_failed",
        upstream.status === 401 || upstream.status === 403
          ? "AI 服务拒绝了请求，请检查 endpoint 或 API Key。"
          : "AI 服务暂时不可用，请稍后重试。",
      );
    }

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      return errorResponse(502, "ai_invalid_response", "AI 服务没有返回有效 JSON。");
    }
    const content = extractOpenAiMessageContent(payload);
    if (!content) {
      return errorResponse(502, "ai_invalid_response", "AI 服务没有返回可读取的梳理内容。");
    }

    const itemsById = new Set(sources.map((item) => item.sourceItemId));
    let results: AiTriageItem[];
    try {
      results = parseAiTriageContent(content, itemsById);
    } catch {
      return errorResponse(502, "ai_invalid_response", "AI 返回的梳理结果无法解析。");
    }
    if (results.length === 0) {
      return errorResponse(502, "ai_invalid_response", "AI 没有返回可对应到来源的梳理结果。");
    }

    return NextResponse.json(
      {
        data: {
          model,
          analyzedCount: results.length,
          requestedCount: sources.length,
          items: results,
        },
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return errorResponse(504, "ai_timeout", "AI 梳理超过 30 秒，已停止等待。");
    }
    return errorResponse(502, "ai_unavailable", "无法连接 AI 服务，请检查 endpoint 和本地网络。");
  } finally {
    clearTimeout(timeout);
  }
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: privateHeaders });
}
