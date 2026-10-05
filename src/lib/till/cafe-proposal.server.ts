import "@tanstack/react-start/server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { CafeCatalog, CafePlan } from "./cafe.ts";

type Proposal = {
  checkoutKey: string;
  brief: string;
  budgetCents: number;
  stockRevision: number;
  cupsInStock: boolean;
  issuedAt: number;
  lines: { productId: string; qty: number; priceCents: number }[];
};

// Demo-process proof, not a payment record. Restart invalidates old proposals.
// No new environment secret and no reuse of PayPal/model credentials.
const processState = globalThis as typeof globalThis & { tillCafeProposalKey?: Buffer };
const key = (processState.tillCafeProposalKey ??= randomBytes(32));
const signature = (value: string) =>
  createHmac("sha256", key).update(`till-cafe-proposal-v1:${value}`).digest("base64url");

export function issueCafeProposal(brief: string, plan: CafePlan, catalog: CafeCatalog) {
  const proposal: Proposal = {
    checkoutKey: randomUUID(),
    brief,
    budgetCents: plan.budgetCents,
    stockRevision: catalog.revision,
    cupsInStock: catalog.products.find((product) => product.id === "cups")?.inStock ?? true,
    issuedAt: Date.now(),
    lines: plan.lines.map((line) => ({
      productId: line.productId,
      qty: line.qty,
      priceCents: catalog.products.find((product) => product.id === line.productId)!.priceCents,
    })),
  };
  const value = Buffer.from(JSON.stringify(proposal)).toString("base64url");
  return { token: `${value}.${signature(value)}`, checkoutKey: proposal.checkoutKey };
}

export function readCafeProposal(token: unknown): Proposal {
  if (typeof token !== "string" || token.length > 8000)
    throw new Error("Replan this cafe cart before checkout.");
  const [value, signed, extra] = token.split(".");
  const expected = value ? signature(value) : "";
  if (
    !value ||
    !signed ||
    extra ||
    signed.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))
  )
    throw new Error("The cafe proposal could not be verified. Replan before checkout.");
  const proposal = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Proposal;
  if (!Number.isFinite(proposal.issuedAt) || Date.now() - proposal.issuedAt > 3 * 60 * 60 * 1000)
    throw new Error("The cafe proposal expired. Replan before checkout.");
  return proposal;
}
