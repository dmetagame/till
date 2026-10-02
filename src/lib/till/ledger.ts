export type ReceiptLine = {
  productId: string;
  name: string;
  merchant: string;
  qty: number;
  price: number;
  why: string;
};

export type Receipt = {
  id: string;
  at: number;
  title: string;
  brief: string;
  summary: string;
  rules: string[];
  lines: ReceiptLine[];
  rejected: { name: string; reason: string }[];
  total: number;
  budgetCents: number;
  address: string;
  source: "preset" | "grok" | "device";
};

const KEY = "till.receipts.v1";

export function loadReceipts(): Receipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReceipt).slice(0, 12);
  } catch {
    return [];
  }
}

export function saveReceipts(receipts: Receipt[]) {
  window.localStorage.setItem(KEY, JSON.stringify(receipts.slice(0, 12)));
}

function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Receipt>;
  return typeof item.id === "string" && typeof item.total === "number" && Array.isArray(item.lines);
}
