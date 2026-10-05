import "@tanstack/react-start/server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getProduct, parseBudget } from "./catalog.ts";
import type { CheckoutCart, PayPalReceipt } from "./checkout.ts";
import {
  CheckoutError,
  paypalCredentials,
  sandboxClient,
  type PayPalOrder,
  type PayPalSandboxClient,
} from "./paypal.server.ts";

const COOKIE = "till_paypal_checkout";
const MAX_AGE = 3 * 60 * 60;

type FrozenCart = CheckoutCart & {
  cartVersion: string;
  totalCents: number;
  orderId?: string;
  createdAt: number;
  cancelled: boolean;
  checkoutSessionId?: string;
  stateId?: string;
  returnedOrderId?: string;
};

// Process-local authority revokes every older signed generation. Restart fails closed.
const processState = globalThis as typeof globalThis & {
  tillActiveCheckouts?: Map<string, FrozenCart>;
};
const activeCheckouts = (processState.tillActiveCheckouts ??= new Map<string, FrozenCart>());

function assertActiveCheckout(cart: FrozenCart) {
  const current = cart.checkoutSessionId ? activeCheckouts.get(cart.checkoutSessionId) : undefined;
  if (
    !current ||
    !cart.stateId ||
    current.stateId !== cart.stateId ||
    current.cartVersion !== cart.cartVersion ||
    current.orderId !== cart.orderId ||
    current.cancelled ||
    cart.cancelled ||
    Date.now() - current.createdAt > MAX_AGE * 1000
  )
    throw new CheckoutError(
      "Checkout was cancelled, replaced or edited, expired, or the server restarted. No capture was attempted.",
      409,
    );
}

function rememberCheckout(cart: FrozenCart) {
  cart.stateId = randomUUID();
  activeCheckouts.set(cart.checkoutSessionId!, cart);
}

export function freezeCart(input: unknown): FrozenCart {
  const cart = input as CheckoutCart | null;
  if (
    !cart ||
    typeof cart.brief !== "string" ||
    cart.brief.length > 500 ||
    typeof cart.title !== "string" ||
    cart.title.length > 120 ||
    typeof cart.checkoutKey !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(cart.checkoutKey)
  ) {
    throw new CheckoutError("The checkout cart is invalid. Review the mandate again.");
  }
  const budget = parseBudget(cart.brief);
  if (budget === null || !Number.isSafeInteger(cart.budgetCents) || cart.budgetCents !== budget) {
    throw new CheckoutError("The cart budget must match the dollar cap in your mandate.");
  }
  if (!Array.isArray(cart.lines) || cart.lines.length < 1 || cart.lines.length > 5) {
    throw new CheckoutError("Checkout needs between one and five catalog items.");
  }
  const seen = new Set<string>();
  const lines = cart.lines
    .map((line) => {
      if (
        !line ||
        typeof line.productId !== "string" ||
        !getProduct(line.productId) ||
        !Number.isSafeInteger(line.qty) ||
        line.qty < 1 ||
        line.qty > 2 ||
        seen.has(line.productId)
      ) {
        throw new CheckoutError(
          "The cart contains an unknown item, duplicate, or invalid quantity.",
        );
      }
      seen.add(line.productId);
      return { productId: line.productId, qty: line.qty };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));
  const totalCents = lines.reduce(
    (sum, line) => sum + getProduct(line.productId)!.price * line.qty,
    0,
  );
  if (totalCents <= 0 || totalCents > budget) {
    throw new CheckoutError("This cart exceeds your mandate budget. No payment will be captured.");
  }
  // Ignore all client-supplied prices, payees, totals, and cart hashes.
  const normalized: CheckoutCart = {
    checkoutKey: cart.checkoutKey,
    title: cart.title,
    brief: cart.brief,
    budgetCents: budget,
    lines,
  };
  return {
    ...normalized,
    cartVersion: createHash("sha256")
      .update(JSON.stringify({ ...normalized, totalCents }))
      .digest("hex")
      .slice(0, 32),
    totalCents,
    createdAt: Date.now(),
    cancelled: false,
  };
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`till-paypal-checkout-v1:${value}`)
    .digest("base64url");
}

export function sealCart(cart: FrozenCart, secret: string): string {
  const value = Buffer.from(JSON.stringify(cart)).toString("base64url");
  return `${value}.${sign(value, secret)}`;
}

export function readCart(cookie: string | null, secret: string): FrozenCart {
  const raw = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const [value, signature] = raw?.split(".") ?? [];
  const expected = value ? sign(value, secret) : "";
  if (
    !value ||
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new CheckoutError(
      "The frozen checkout is missing or invalid. Return to your cart; no capture was attempted.",
      409,
    );
  }
  let cart: FrozenCart;
  try {
    cart = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new CheckoutError("The frozen checkout is unreadable. No capture was attempted.", 409);
  }
  if (!Number.isFinite(cart.createdAt) || Date.now() - cart.createdAt > MAX_AGE * 1000) {
    throw new CheckoutError(
      "This frozen checkout has expired. Review the cart again; no capture was attempted.",
      409,
    );
  }
  const current = freezeCart(cart);
  if (current.cartVersion !== cart.cartVersion || current.totalCents !== cart.totalCents) {
    throw new CheckoutError(
      "The catalog or cart changed after checkout was frozen. No capture was attempted.",
      409,
    );
  }
  return cart;
}

function cookieFor(cart: FrozenCart, secret: string, request: Request) {
  return `${COOKIE}=${sealCart(cart, secret)}; Path=/api/paypal; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function assertMatchingOrder(order: PayPalOrder, cart: FrozenCart) {
  const unit = order.purchase_units?.[0];
  if (
    order.id !== cart.orderId ||
    order.intent !== "CAPTURE" ||
    order.purchase_units?.length !== 1 ||
    unit?.custom_id !== cart.cartVersion ||
    unit.amount?.currency_code !== "USD" ||
    unit.amount?.value !== (cart.totalCents / 100).toFixed(2)
  ) {
    throw new CheckoutError(
      "PayPal's order amount or cart version does not match the frozen cart. Payment status could not be verified.",
      409,
    );
  }
  const expected = cart.lines.map((line) => {
    const product = getProduct(line.productId)!;
    return {
      sku: product.id,
      name: product.name,
      quantity: String(line.qty),
      value: (product.price / 100).toFixed(2),
      currency: "USD",
    };
  });
  const actual = unit.items
    ?.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      value: item.unit_amount?.value,
      currency: item.unit_amount?.currency_code,
    }))
    .sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? ""));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new CheckoutError(
      "PayPal's order items do not match the frozen cart. Payment status could not be verified.",
      409,
    );
  }
}

function receiptFor(order: PayPalOrder, cart: FrozenCart): PayPalReceipt {
  assertMatchingOrder(order, cart);
  const captures = order.purchase_units![0].payments?.captures ?? [];
  if (
    captures.length > 1 ||
    captures.some(
      (capture) =>
        capture.amount.currency_code !== "USD" ||
        capture.amount.value !== (cart.totalCents / 100).toFixed(2),
    )
  ) {
    throw new CheckoutError(
      "PayPal's capture does not match the frozen cart. Payment status could not be verified.",
      409,
    );
  }
  if (order.status === "COMPLETED" && !captures[0]?.id) {
    throw new CheckoutError(
      "PayPal returned a completed order without a capture ID. Payment status could not be verified.",
      502,
    );
  }
  return {
    orderId: order.id,
    captureId: captures[0]?.id ?? null,
    orderStatus: order.status,
    captureStatus: captures[0]?.status ?? null,
    cartVersion: cart.cartVersion,
    title: cart.title,
    brief: cart.brief,
    budgetCents: cart.budgetCents,
    totalCents: cart.totalCents,
    lines: cart.lines.map((line) => {
      const product = getProduct(line.productId)!;
      return { productId: product.id, name: product.name, qty: line.qty, price: product.price };
    }),
  };
}

export function approvalLink(order: PayPalOrder): string {
  const link =
    order.links?.find((item) => item.rel === "payer-action") ??
    order.links?.find((item) => item.rel === "approve");
  if (!link)
    throw new CheckoutError(
      "PayPal did not return a buyer approval link. No capture was attempted.",
      502,
    );
  const url = new URL(link.href);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.sandbox.paypal.com" ||
    url.username ||
    url.password
  ) {
    throw new CheckoutError(
      "PayPal returned an unexpected approval URL. No capture was attempted.",
      502,
    );
  }
  return url.href;
}

// The injectable client is for tests only; the application route always uses sandboxClient().
export async function handleCheckout(
  request: Request,
  dependencies?: { client: PayPalSandboxClient; secret: string },
) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  try {
    const url = new URL(request.url);
    const action =
      request.method === "GET"
        ? url.searchParams.get("paypal") === "return"
          ? "return"
          : "status"
        : undefined;
    if (request.method !== "GET" && request.method !== "POST")
      throw new CheckoutError("Method not allowed.", 405);
    if (
      request.method === "POST" &&
      (request.headers.get("origin") !== url.origin ||
        !request.headers.get("content-type")?.startsWith("application/json"))
    ) {
      throw new CheckoutError("Checkout requests must come from this app.", 403);
    }
    const input =
      request.method === "POST"
        ? ((await request.json()) as {
            action?: string;
            cart?: unknown;
            orderId?: string;
            cartVersion?: string;
          })
        : null;
    const operation = action ?? input?.action;
    if (!["create", "capture", "status", "cancel", "return"].includes(operation ?? ""))
      throw new CheckoutError("Unknown checkout action.");
    if (operation === "return" && request.method !== "GET")
      throw new CheckoutError("PayPal return must use the server return URL.", 405);
    if (operation === "cancel") {
      // Cancellation never needs an OAuth call. Invalid/expired checkout cookies
      // can be discarded safely so they do not block the next mandate.
      const signingSecret = dependencies?.secret ?? process.env.PAYPAL_CLIENT_SECRET?.trim();
      let cart: FrozenCart | undefined;
      try {
        if (signingSecret) cart = readCart(request.headers.get("cookie"), signingSecret);
      } catch (error) {
        if (!(error instanceof CheckoutError)) throw error;
      }
      if (cart && signingSecret) {
        if (input?.cartVersion && input.cartVersion !== cart.cartVersion)
          throw new CheckoutError("This checkout was replaced by another cart.", 409);
        if (cart.checkoutSessionId) {
          const current = activeCheckouts.get(cart.checkoutSessionId);
          if (current && current.stateId !== cart.stateId)
            throw new CheckoutError("This checkout was replaced by another cart.", 409);
          cart.cancelled = true;
          rememberCheckout(cart);
        } else cart.cancelled = true;
        headers.set("Set-Cookie", cookieFor(cart, signingSecret, request));
      } else {
        headers.set(
          "Set-Cookie",
          `${COOKIE}=; Path=/api/paypal; HttpOnly; SameSite=Lax; Max-Age=0`,
        );
      }
      return new Response(JSON.stringify({ ok: true, cancelled: true }), { headers });
    }
    const secret = dependencies?.secret ?? paypalCredentials().clientSecret;
    const client = dependencies?.client ?? sandboxClient();
    let result: unknown;

    if (operation === "create") {
      const cart = freezeCart(input?.cart);
      let previous: FrozenCart | undefined;
      try {
        previous = readCart(request.headers.get("cookie"), secret);
      } catch (error) {
        if (!(error instanceof CheckoutError)) throw error;
      }
      for (const [id, checkout] of activeCheckouts)
        if (Date.now() - checkout.createdAt > MAX_AGE * 1000) activeCheckouts.delete(id);
      cart.checkoutSessionId = previous?.checkoutSessionId ?? randomUUID();
      rememberCheckout(cart);
      const returnUrl = new URL("/api/paypal/checkout", url.origin);
      returnUrl.searchParams.set("paypal", "return");
      returnUrl.searchParams.set("cartVersion", cart.cartVersion);
      const cancelUrl = new URL("/", url.origin);
      cancelUrl.searchParams.set("paypal", "cancel");
      cancelUrl.searchParams.set("cartVersion", cart.cartVersion);
      const order = await client.order(
        "",
        "POST",
        cart.cartVersion,
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              custom_id: cart.cartVersion,
              amount: {
                currency_code: "USD",
                value: (cart.totalCents / 100).toFixed(2),
                breakdown: {
                  item_total: { currency_code: "USD", value: (cart.totalCents / 100).toFixed(2) },
                },
              },
              items: cart.lines.map((line) => {
                const product = getProduct(line.productId)!;
                return {
                  sku: product.id,
                  name: product.name,
                  quantity: String(line.qty),
                  unit_amount: { currency_code: "USD", value: (product.price / 100).toFixed(2) },
                };
              }),
              // No payee override: the merchant is the owner of the server's sandbox app.
            },
          ],
          application_context: {
            return_url: returnUrl.href,
            cancel_url: cancelUrl.href,
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
          },
        },
        () => assertActiveCheckout(cart),
      );
      assertActiveCheckout(cart);
      cart.orderId = order.id;
      assertMatchingOrder(order, cart);
      headers.set("Set-Cookie", cookieFor(cart, secret, request));
      if (order.status === "COMPLETED") {
        result = { receipt: receiptFor(order, cart) };
      } else {
        result = {
          orderId: order.id,
          cartVersion: cart.cartVersion,
          approvalUrl: approvalLink(order),
        };
      }
    } else {
      const cart = readCart(request.headers.get("cookie"), secret);
      assertActiveCheckout(cart);
      if (operation === "return") {
        if (
          !cart.orderId ||
          url.searchParams.get("token") !== cart.orderId ||
          url.searchParams.get("cartVersion") !== cart.cartVersion
        )
          throw new CheckoutError(
            "PayPal's return token or cart version does not match this checkout. No capture was attempted.",
            409,
          );
        if (cart.returnedOrderId !== cart.orderId) {
          cart.returnedOrderId = cart.orderId;
          rememberCheckout(cart);
        }
        const destination = new URL("/", url.origin);
        destination.searchParams.set("paypal", "return");
        destination.searchParams.set("token", cart.orderId);
        destination.searchParams.set("cartVersion", cart.cartVersion);
        headers.set("Set-Cookie", cookieFor(cart, secret, request));
        headers.set("Location", destination.href);
        return new Response(null, { status: 302, headers });
      }
      const orderId = operation === "status" ? url.searchParams.get("orderId") : input?.orderId;
      if (!cart.orderId || orderId !== cart.orderId)
        throw new CheckoutError(
          "The returned PayPal order does not belong to this frozen checkout.",
          409,
        );
      if (operation === "capture") {
        if (cart.returnedOrderId !== cart.orderId)
          throw new CheckoutError(
            "PayPal must return this order to the server before capture. No capture was attempted.",
            409,
          );
        if (cart.cancelled)
          throw new CheckoutError(
            "Checkout was cancelled or edited. No capture was attempted.",
            409,
          );
        if (
          input?.cartVersion !== cart.cartVersion ||
          freezeCart(input?.cart).cartVersion !== cart.cartVersion
        ) {
          throw new CheckoutError(
            "The cart was edited after checkout was frozen. No capture was attempted.",
            409,
          );
        }
      }
      const order = await client.order(`/${encodeURIComponent(cart.orderId)}`, "GET");
      assertMatchingOrder(order, cart);
      if (operation === "status" || order.status === "COMPLETED") {
        result = { receipt: receiptFor(order, cart) };
      } else {
        if (order.status !== "APPROVED")
          throw new CheckoutError(
            `PayPal order status is ${order.status}; buyer approval is required. No capture was attempted.`,
            409,
          );
        const captured = await client.order(
          `/${encodeURIComponent(cart.orderId)}/capture`,
          "POST",
          cart.cartVersion,
          undefined,
          () => assertActiveCheckout(readCart(request.headers.get("cookie"), secret)),
        );
        const captureStatus = captured.purchase_units?.[0].payments?.captures?.[0]?.status;
        if (captureStatus && !["COMPLETED", "PENDING"].includes(captureStatus)) {
          throw new CheckoutError(
            `PayPal capture status is ${captureStatus}. No successful payment is being reported.`,
            502,
          );
        }
        // Read the authoritative order after capture, including its items and capture IDs.
        const verified = await client.order(`/${encodeURIComponent(cart.orderId)}`, "GET");
        const receipt = receiptFor(verified, cart);
        if (!receipt.captureId || captured.id !== verified.id)
          throw new CheckoutError(
            "PayPal capture could not be confirmed. Retry to check the existing order.",
            502,
          );
        result = { receipt };
      }
    }
    return new Response(JSON.stringify({ ok: true, ...(result as object) }), { headers });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof CheckoutError
            ? error.message
            : "Checkout could not be verified. No successful payment is being reported.",
      }),
      {
        status: error instanceof CheckoutError ? error.statusCode : 500,
        headers,
      },
    );
  }
}
