import "@tanstack/react-start/server-only";
import { CATALOG, money, parseBudget, type Product } from "./catalog.ts";
import { issueCafeProposal } from "./cafe-proposal.server.ts";
import {
  CAFE_MAX_BUDGET,
  CAFE_MERCHANT,
  CAFE_REPLAN_ERROR,
  type CafeCatalog,
  type CafeLine,
  type CafePlan,
  type CafePlanResult,
  type CafeRefusal,
} from "./cafe.ts";

const CUP_IDS = ["cups", "cups-small", "cups-premium"];
const REQUIRED_IDS = ["oat", "beans"];

// Demo inventory lives on the server, shared by this process's viewers.
// A process restart resets every cafe product to in stock; no browser-owned stock.
export class CafeSupplier {
  private readonly products: Product[];
  private readonly stock: Map<string, boolean>;
  private revision = 0;

  constructor(products: Product[] = CATALOG) {
    this.products = products.map((product) => ({ ...product }));
    this.stock = new Map(
      this.products
        .filter((product) => product.category === "cafe")
        .map((product) => [product.id, true]),
    );
  }

  snapshot(): CafeCatalog {
    return {
      revision: this.revision,
      products: this.products
        .filter((product) => product.category === "cafe" && product.merchant === CAFE_MERCHANT)
        .map((product) => ({
          id: product.id,
          name: product.name,
          priceCents: product.price,
          merchant: product.merchant,
          inStock: this.stock.get(product.id) === true,
        })),
    };
  }

  setCupsInStock(inStock: boolean): CafeCatalog {
    if (typeof inStock !== "boolean") throw new Error("Invalid demo supplier control.");
    if (this.stock.get("cups") !== inStock) {
      this.stock.set("cups", inStock);
      this.revision += 1;
    }
    return this.snapshot();
  }

  validate(brief: string, raw: unknown): CafePlan | null {
    const budgetCents = parseBudget(brief);
    if (!budgetCents || budgetCents > CAFE_MAX_BUDGET || !raw || typeof raw !== "object")
      return null;
    const record = raw as Record<string, unknown>;
    // A model proposes all three lines. Validation never repairs its cup choice.
    if (!Array.isArray(record.lines) || record.lines.length !== 3) return null;
    const cupsInStock = this.stock.get("cups") === true;
    const cupId = cupsInStock ? "cups" : "cups-small";
    const expectedIds = [...REQUIRED_IDS, cupId];
    const seen = new Set<string>();
    const lines: CafeLine[] = [];
    let totalCents = 0;
    for (const value of record.lines) {
      if (!value || typeof value !== "object") return null;
      const line = value as Record<string, unknown>;
      if (
        typeof line.productId !== "string" ||
        !expectedIds.includes(line.productId) ||
        seen.has(line.productId) ||
        line.qty !== 1
      )
        return null;
      const product = this.products.find((item) => item.id === line.productId);
      if (
        !product ||
        product.category !== "cafe" ||
        product.merchant !== CAFE_MERCHANT ||
        !this.stock.get(product.id)
      )
        return null;
      seen.add(product.id);
      totalCents += product.price;
      lines.push({
        productId: product.id,
        qty: 1,
        why:
          product.id === cupId
            ? cupsInStock
              ? "The 500-count cups are in stock and fit the cap."
              : "The 500-count cups are out of stock; this smaller pack fits the cap."
            : "In stock at Counter Supply; catalog price checked by the server.",
      });
    }
    if (totalCents > budgetCents || !expectedIds.every((id) => seen.has(id))) return null;

    // Refusal reasons come from catalog facts, including candidates the model omitted.
    const refused: CafeRefusal[] = [];
    const requiredTotal = REQUIRED_IDS.reduce(
      (sum, id) => sum + this.products.find((product) => product.id === id)!.price,
      0,
    );
    for (const product of this.products.filter((item) => CUP_IDS.includes(item.id))) {
      if (product.id === cupId) continue;
      const reason = !this.stock.get(product.id)
        ? "Out of stock in the demo supplier catalog."
        : product.id === "cups-small" && cupsInStock
          ? "The 500-count cups are in stock and fit the cap."
          : `With oat milk and beans, this cart would cost ${money(requiredTotal + product.price)} and break the ${money(budgetCents)} dollar cap.`;
      refused.push({ productId: product.id, name: product.name, reason });
    }
    return {
      budgetCents,
      totalCents,
      lines,
      refused,
      summary: cupsInStock
        ? "The 500-count pack is available: a complete $160 restock within your cap."
        : "The 500-count pack is unavailable: a fresh $114 restock with the smaller pack.",
    };
  }
}

// Keep the demo inventory through dev module reloads, without a cookie or database.
const supplierGlobal = globalThis as typeof globalThis & { tillCafeSupplier?: CafeSupplier };
export const cafeSupplier = (supplierGlobal.tillCafeSupplier ??= new CafeSupplier());

export async function proposeCafeRestock(
  brief: string,
  supplier = cafeSupplier,
  apiKey = process.env.GEMINI_API_KEY,
  request: typeof fetch = fetch,
): Promise<CafePlanResult> {
  const catalog = supplier.snapshot();
  const failed = (): CafePlanResult => ({
    ok: false,
    error: CAFE_REPLAN_ERROR,
    catalog: supplier.snapshot(),
  });
  const budgetCents = parseBudget(brief);
  if (!apiKey?.trim() || !budgetCents || budgetCents > CAFE_MAX_BUDGET) return failed();
  try {
    const response = await request(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: 'Propose a cafe restock using only the supplied catalog. Cover one oat milk, one beans and one cup pack. Use cups (500-count) when it is in stock and the complete cart fits the cap. Only when cups is out of stock, use cups-small. Never use cups-premium or a second cup pack. Each required product must have quantity 1. Never raise the budget or use another merchant. Return JSON {"lines":[{"productId":"catalog id","qty":1}]}. If nothing fits, return an empty lines array. You have no payment capability.',
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: JSON.stringify({
                    budgetCents,
                    merchant: CAFE_MERCHANT,
                    requiredProductIds: REQUIRED_IDS,
                    cupProductIds: CUP_IDS,
                    catalog: catalog.products.map(({ id, priceCents, merchant, inStock }) => ({
                      id,
                      priceCents,
                      merchant,
                      inStock,
                    })),
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingLevel: "LOW" },
            responseFormat: {
              text: {
                mimeType: "APPLICATION_JSON",
                schema: {
                  type: "object",
                  properties: {
                    lines: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: {
                        type: "object",
                        properties: {
                          productId: { type: "string" },
                          qty: { type: "integer", minimum: 1, maximum: 1 },
                        },
                        required: ["productId", "qty"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["lines"],
                  additionalProperties: false,
                },
              },
            },
          },
        }),
      },
    );
    if (!response.ok) return failed();
    const body = (await response.json()) as {
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
    };
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason !== "STOP") return failed();
    const text =
      candidate.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("") ?? "";
    const raw = JSON.parse(text);
    // If inventory changes while the model is thinking, require another fresh search.
    if (supplier.snapshot().revision !== catalog.revision) return failed();
    const plan = supplier.validate(brief, raw);
    if (plan?.lines.length) plan.checkoutProof = issueCafeProposal(brief, plan, catalog);
    return plan ? { ok: true, catalog: supplier.snapshot(), plan } : failed();
  } catch {
    return failed();
  }
}
