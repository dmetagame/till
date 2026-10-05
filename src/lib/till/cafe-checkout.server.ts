import "@tanstack/react-start/server-only";
import { getProduct } from "./catalog.ts";
import { CAFE_MAX_BUDGET, CAFE_MERCHANT, isCafeMandate, type CafeCatalog } from "./cafe.ts";
import { cafeSupplier } from "./cafe.server.ts";
import { readCafeProposal } from "./cafe-proposal.server.ts";
import type { CheckoutCart } from "./checkout.ts";
import { freezeCart, handleCheckout, readCart } from "./checkout.server.ts";
import {
  CheckoutError,
  paypalCredentials,
  sandboxClient,
  type PayPalSandboxClient,
} from "./paypal.server.ts";

export function assertCafeCheckout(cart: CheckoutCart, token: unknown, catalog: CafeCatalog) {
  const refuse = (message: string): never => {
    throw new CheckoutError(`${message} No capture was attempted.`, 409);
  };
  let proposal;
  try {
    proposal = readCafeProposal(token);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Replan before checkout.");
  }
  if (
    proposal.checkoutKey !== cart.checkoutKey ||
    proposal.brief !== cart.brief ||
    proposal.budgetCents !== cart.budgetCents ||
    cart.budgetCents > CAFE_MAX_BUDGET
  )
    refuse("This cafe cart does not match the Gemini proposal and $180 limit. Replan.");
  if (proposal.stockRevision !== catalog.revision)
    refuse("Demo supplier stock changed since this proposal. Replan before checkout.");
  const cupId = catalog.products.find((item) => item.id === "cups")?.inStock
    ? "cups"
    : "cups-small";
  const expectedIds = ["oat", "beans", cupId];
  if (
    cart.lines.length !== 3 ||
    !expectedIds.every((id) => cart.lines.some((line) => line.productId === id && line.qty === 1))
  )
    refuse(
      "A payable cafe restock needs one oat milk, one beans and exactly one current cup pack. Replan.",
    );
  let total = 0;
  for (const line of cart.lines) {
    const product = catalog.products.find((item) => item.id === line.productId);
    const proposed = proposal.lines.find((item) => item.productId === line.productId);
    if (!product || product.merchant !== CAFE_MERCHANT)
      return refuse("Cafe checkout allows only Counter Supply catalog items.");
    if (!product.inStock) refuse(`${product.name} is out of stock. Replan.`);
    if (
      !proposed ||
      line.qty !== proposed.qty ||
      product.priceCents !== proposed.priceCents ||
      getProduct(line.productId)?.price !== product.priceCents
    )
      refuse("The cafe lines or catalog prices changed since Gemini proposed them. Replan.");
    total += product.priceCents * line.qty;
  }
  if (total <= 0 || total > cart.budgetCents || total > CAFE_MAX_BUDGET)
    refuse("This cafe cart breaks the $180 dollar cap.");
}

// Preserve the existing order payload, frozen-cart/cookie checks and capture rules.
// The guard runs only at a cafe order POST, after the handler's existing checks.
export async function handleCafeCheckout(
  request: Request,
  dependencies?: { client: PayPalSandboxClient; secret: string; catalog: () => CafeCatalog },
) {
  if (request.method !== "POST") return handleCheckout(request, dependencies);
  let input: { action?: string; cart?: CheckoutCart };
  try {
    input = await request.clone().json();
  } catch {
    return handleCheckout(request, dependencies);
  }
  if (input?.action !== "create" && input?.action !== "capture")
    return handleCheckout(request, dependencies);
  try {
    const client = dependencies?.client ?? sandboxClient();
    const secret = dependencies?.secret ?? paypalCredentials().clientSecret;
    const guarded = new Proxy(client, {
      get(target, property, receiver) {
        if (property !== "order") return Reflect.get(target, property, receiver);
        return async (...args: Parameters<PayPalSandboxClient["order"]>) => {
          const [path, method] = args;
          if (method === "POST" && (path === "" || path.endsWith("/capture"))) {
            const checkCafe = () => {
              const cart =
                path === ""
                  ? freezeCart(input.cart)
                  : readCart(request.headers.get("cookie"), secret);
              if (
                input.cart?.cafeProof ||
                isCafeMandate(cart.brief) ||
                cart.lines.some((line) => getProduct(line.productId)?.category === "cafe")
              )
                assertCafeCheckout(
                  cart,
                  input.cart?.cafeProof,
                  dependencies?.catalog() ?? cafeSupplier.snapshot(),
                );
            };
            checkCafe();
            const beforeSend = args[4];
            args[4] = () => {
              beforeSend?.();
              checkCafe();
            };
          }
          return target.order(...args);
        };
      },
    });
    return handleCheckout(request, { client: guarded, secret });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof CheckoutError ? error.message : "Checkout could not be verified.",
      },
      {
        status: error instanceof CheckoutError ? error.statusCode : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
