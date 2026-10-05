export const CAFE_MERCHANT = "Counter Supply";
export const CAFE_MAX_BUDGET = 12000;
export const CAFE_BRIEF =
  "Restock a cafe: oat milk, beans, and cups, under $120, Counter Supply only.";
export const CAFE_REPLAN_ERROR = "Could not replan. Retry.";

export function isCafeMandate(brief: string) {
  return /\bcafe\b|\brestock\b|\bespresso\b|\boat milk\b|\bcoffee beans\b|\bCounter Supply\b/i.test(
    brief,
  );
}

export type CafeProduct = {
  id: string;
  name: string;
  priceCents: number;
  merchant: string;
  inStock: boolean;
};

export type CafeCatalog = { revision: number; products: CafeProduct[] };
export type CafeLine = { productId: string; qty: number; why: string };
export type CafeRefusal = { productId: string; name: string; reason: string };
export type CafePlan = {
  budgetCents: number;
  totalCents: number;
  lines: CafeLine[];
  refused: CafeRefusal[];
  summary: string;
};
export type CafePlanResult =
  | { ok: true; catalog: CafeCatalog; plan: CafePlan }
  | { ok: false; error: typeof CAFE_REPLAN_ERROR; catalog: CafeCatalog };
