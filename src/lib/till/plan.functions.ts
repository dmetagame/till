import { createServerFn } from "@tanstack/react-start";
import { catalogForModel, sanitizeModelPlan, type Plan } from "@/lib/till/catalog";

export type PlanResult = { ok: true; plan: Plan } | { ok: false };

export const planMandate = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => {
    const brief = typeof input?.brief === "string" ? input.brief.trim() : "";
    if (brief.length < 8 || brief.length > 500) {
      throw new Error("Write a short brief, at least a sentence.");
    }
    return { brief };
  })
  .handler(async ({ data }): Promise<PlanResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false };

    const catalog = catalogForModel();
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are Till, a buyer agent. You may only purchase product ids from the catalog. Never invent products. Obey the brief: budget, alcohol bans, same-day limits, plastic bans, and vendor caps. Leave money unspent rather than padding. Return JSON only.",
            },
            {
              role: "user",
              content: JSON.stringify({
                brief: data.brief,
                catalog,
                schema: {
                  title: "short",
                  summary: "one or two specific sentences",
                  budgetCents: "integer cents",
                  rules: ["short rule"],
                  lines: [{ productId: "catalog id", qty: 1, why: "why this item, max 90 chars" }],
                  rejected: [{ productId: "catalog id", reason: "why it was refused" }],
                },
                constraints: [
                  "sum(priceCents * qty) must be <= budget",
                  "qty is 1 or 2",
                  "at most 5 lines",
                  "at most 4 rejections",
                  "if the brief states a dollar cap, budgetCents must match it",
                ],
              }),
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false };
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      const plan = sanitizeModelPlan(data.brief, parseJson(text));
      if (!plan) return { ok: false };
      return { ok: true, plan };
    } catch {
      return { ok: false };
    }
  });

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no json");
  return JSON.parse(raw.slice(start, end + 1));
}
