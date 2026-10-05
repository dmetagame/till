import "@tanstack/react-start/server-only";
import { CATALOG, money, parseBudget, type Product } from "./catalog.ts";
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
    if (!Array.isArray(record.lines) || record.lines.length > 16) return null;
    const refused = new Map<string, CafeRefusal>();
    const refuse = (productId: string, reason: string) => {
      const product = this.products.find((item) => item.id === productId);
      refused.set(productId, { productId, name: product?.name ?? productId, reason });
    };
    const requiredTotal = REQUIRED_IDS.reduce(
      (sum, id) => sum + (this.products.find((product) => product.id === id)?.price ?? 0),
      0,
    );

    // Facts remain visible even when the model omits a rejected candidate.
    for (const product of this.products.filter(
      (item) => item.category === "cafe" && item.merchant === CAFE_MERCHANT,
    )) {
      if (!this.stock.get(product.id))
        refuse(product.id, "Out of stock in the demo supplier catalog.");
      else if (CUP_IDS.includes(product.id) && requiredTotal + product.price > budgetCents) {
        refuse(
          product.id,
          `With oat milk and beans, this cart would cost ${money(requiredTotal + product.price)} and break the ${money(budgetCents)} dollar cap.`,
        );
      }
    }

    const lines: CafeLine[] = [];
    const seen = new Set<string>();
    let totalCents = 0;
    for (const value of record.lines) {
      if (!value || typeof value !== "object") continue;
      const line = value as Record<string, unknown>;
      if (typeof line.productId !== "string") continue;
      const id = line.productId.slice(0, 80);
      const product = this.products.find((item) => item.id === id);
      if (!product) {
        refuse(id, "Not in the server catalog.");
        continue;
      }
      if (product.merchant !== CAFE_MERCHANT || product.category !== "cafe") {
        refuse(id, "Outside the Counter Supply-only supplier mandate.");
        continue;
      }
      if (!this.stock.get(id)) {
        refuse(id, "Out of stock in the demo supplier catalog.");
        continue;
      }
      if (!Number.isSafeInteger(line.qty) || (line.qty !== 1 && line.qty !== 2)) {
        refuse(id, "Invalid quantity; the catalog allows one or two packs.");
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const cost = product.price * line.qty;
      if (CUP_IDS.includes(id) && requiredTotal + cost > budgetCents) {
        refuse(
          id,
          `With oat milk and beans, this cart would cost ${money(requiredTotal + cost)} and break the ${money(budgetCents)} dollar cap.`,
        );
        continue;
      }
      if (totalCents + cost > budgetCents) {
        refuse(id, `This line would break the ${money(budgetCents)} dollar cap.`);
        continue;
      }
      lines.push({
        productId: id,
        qty: line.qty,
        why: CUP_IDS.includes(id)
          ? "An in-stock cup pack inside the dollar cap."
          : "In stock at Counter Supply; catalog price checked by the server.",
      });
      totalCents += cost;
    }

    const complete =
      REQUIRED_IDS.every((id) => lines.some((line) => line.productId === id)) &&
      lines.some((line) => CUP_IDS.includes(line.productId));
    if (!complete) {
      for (const line of lines)
        refuse(
          line.productId,
          `The full oat milk, beans and cups restock could not be validated inside the ${money(budgetCents)} dollar cap and current stock.`,
        );
      lines.length = 0;
      totalCents = 0;
    }
    return {
      budgetCents,
      totalCents,
      lines,
      refused: [...refused.values()],
      summary: complete
        ? "A fresh model proposal, checked against Counter Supply’s current stock and catalog prices."
        : `Restock refused: the proposal cannot cover oat milk, beans and cups within current stock and the ${money(budgetCents)} dollar cap.`,
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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: 'Propose a cafe restock using only the supplied catalog. Cover one oat milk, one beans and one cup pack. Choose an in-stock cup pack that fits the entire cart under the dollar cap; prefer the larger cups pack if it fits. Never raise the budget or use another merchant. Return JSON {"lines":[{"productId":"catalog id","qty":1}]}. If nothing fits, return an empty lines array. You have no payment capability.',
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
            thinkingConfig: { thinkingLevel: "low" },
            responseFormat: {
              text: {
                mimeType: "application/json",
                schema: {
                  type: "object",
                  properties: {
                    lines: {
                      type: "array",
                      maxItems: 5,
                      items: {
                        type: "object",
                        properties: {
                          productId: { type: "string" },
                          qty: { type: "integer", minimum: 1, maximum: 2 },
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
    return plan ? { ok: true, catalog: supplier.snapshot(), plan } : failed();
  } catch {
    return failed();
  }
}
