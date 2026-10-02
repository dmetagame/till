import assert from "node:assert/strict";
import { test } from "node:test";
import { planFromPreset } from "./catalog.ts";
import type { CheckoutCart } from "./checkout.ts";
import { approvalLink, freezeCart, handleCheckout, readCart, sealCart } from "./checkout.server.ts";
import { PayPalSandboxClient, type PayPalOrder } from "./paypal.server.ts";

// Explicit unit-test fixtures. These are not real sandbox account credentials or payments.
const SECRET = "unit-test-cookie-signing-key";
const ORIGIN = "http://localhost:8080";
const plan = planFromPreset(
  "cafe",
  "Restock a cafe: oat milk, beans, and cups, under $220, from two vendors max.",
)!;
const CART: CheckoutCart = {
  checkoutKey: "00000000-0000-4000-8000-000000000001",
  title: plan.title,
  brief: plan.brief,
  budgetCents: plan.budgetCents,
  lines: plan.lines.map(({ productId, qty }) => ({ productId, qty })),
};

function post(body: object, cookie?: string, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/paypal/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function fakePayPal() {
  let order: PayPalOrder | undefined;
  let failure: "create" | "capture" | "oauth" | undefined;
  const calls: {
    url: string;
    method: string;
    requestId: string | null;
    body: Record<string, unknown> | null;
  }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const href = String(url);
    assert.ok(href.startsWith("https://api-m.sandbox.paypal.com/"), "all calls target sandbox");
    const headers = new Headers(init?.headers);
    if (href.endsWith("/oauth2/token")) {
      assert.equal(init?.body, "grant_type=client_credentials");
      assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
      assert.equal(
        headers.get("authorization"),
        `Basic ${Buffer.from("unit-test-client:unit-test-secret").toString("base64")}`,
      );
      if (failure === "oauth")
        return Response.json(
          { error: "invalid_client", error_description: "Client Authentication failed" },
          { status: 401 },
        );
      return Response.json({ access_token: "unit-test-access-token", expires_in: 3600 });
    }
    assert.equal(headers.get("authorization"), "Bearer unit-test-access-token");
    const path = href.split("/v2/checkout/orders")[1];
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: href, method, requestId: headers.get("paypal-request-id"), body });
    if (method === "POST" && path === "") {
      if (failure === "create")
        return Response.json(
          { name: "INVALID_REQUEST", message: "Test create failure", debug_id: "UNIT-TEST-DEBUG" },
          { status: 400 },
        );
      // Model PayPal's idempotent create for the same cart version.
      order ??= {
        ...body,
        id: "UNIT-TEST-ORDER",
        status: "CREATED",
        links: [
          {
            rel: "approve",
            href: "https://www.sandbox.paypal.com/checkoutnow?token=UNIT-TEST-ORDER",
          },
        ],
      };
    } else if (method === "POST" && path.endsWith("/capture")) {
      if (failure === "capture")
        return Response.json(
          {
            name: "UNPROCESSABLE_ENTITY",
            message: "Test capture failure",
            details: [{ issue: "INSTRUMENT_DECLINED" }],
            debug_id: "UNIT-TEST-DEBUG",
          },
          { status: 422 },
        );
      assert.equal(order?.status, "APPROVED", "capture follows actual buyer approval");
      order!.status = "COMPLETED";
      order!.purchase_units![0].payments = {
        captures: [
          {
            id: "UNIT-TEST-CAPTURE",
            status: "COMPLETED",
            amount: { currency_code: "USD", value: "160.00" },
          },
        ],
      };
    }
    assert.ok(order);
    return Response.json(order);
  };
  const client = new PayPalSandboxClient(
    { clientId: "unit-test-client", clientSecret: "unit-test-secret" },
    fetcher,
  );
  const handle = (request: Request) => handleCheckout(request, { client, secret: SECRET });
  return {
    handle,
    calls,
    order: () => order!,
    fail: (kind: typeof failure) => {
      failure = kind;
    },
    async create() {
      const response = await handle(post({ action: "create", cart: CART }));
      const result = await response.json();
      assert.equal(result.ok, true, JSON.stringify(result));
      const cookie = response.headers.get("set-cookie")!.split(";")[0];
      return { result, cookie };
    },
  };
}

async function approvedCheckout() {
  const api = fakePayPal();
  const { result, cookie } = await api.create();
  api.order().status = "APPROVED";
  return { api, result, cookie };
}

function captures(api: ReturnType<typeof fakePayPal>) {
  return api.calls.filter((call) => call.method === "POST" && call.url.endsWith("/capture"));
}

test("cafe checkout uses exact catalog cents, one merchant, CAPTURE and app return URLs", async () => {
  const api = fakePayPal();
  const { result, cookie } = await api.create();
  const payload = api.calls[0].body as unknown as PayPalOrder & {
    application_context: { return_url: string; cancel_url: string };
  };
  assert.equal(payload.intent, "CAPTURE");
  assert.equal(payload.purchase_units!.length, 1);
  assert.equal(payload.purchase_units![0].amount!.value, "160.00");
  assert.equal(payload.purchase_units![0].amount!.currency_code, "USD");
  assert.equal(payload.purchase_units![0].items!.length, 3);
  assert.equal("payee" in payload.purchase_units![0], false);
  assert.equal(JSON.stringify(payload).includes("Counter Supply"), false);
  assert.equal(JSON.stringify(payload).includes("Kiln Coffee"), false);
  assert.equal(new URL(payload.application_context.return_url).origin, ORIGIN);
  assert.equal(
    new URL(payload.application_context.return_url).searchParams.get("paypal"),
    "return",
  );
  assert.equal(
    new URL(payload.application_context.cancel_url).searchParams.get("paypal"),
    "cancel",
  );
  assert.equal(api.calls[0].requestId, result.cartVersion);
  assert.equal(captures(api).length, 0);
  const frozen = readCart(cookie, SECRET);
  assert.equal(frozen.totalCents, 16000);
});

test("create retries use the same cart request ID; buyer approval precedes capture; refresh only GETs", async () => {
  const { api, result, cookie } = await approvedCheckout();
  await api.create();
  assert.equal(api.calls[0].requestId, api.calls[1].requestId);
  const body = {
    action: "capture",
    orderId: result.orderId,
    cartVersion: result.cartVersion,
    cart: CART,
  };
  const response = await api.handle(post(body, cookie));
  const receipt = (await response.json()).receipt;
  assert.equal(receipt.orderId, "UNIT-TEST-ORDER");
  assert.equal(receipt.captureId, "UNIT-TEST-CAPTURE");
  assert.equal(receipt.orderStatus, "COMPLETED");
  assert.equal(receipt.captureStatus, "COMPLETED");
  assert.equal(captures(api)[0].requestId, api.calls[0].requestId);
  const afterCapture = api.calls.length;
  const refreshed = await api.handle(
    new Request(`${ORIGIN}/api/paypal/checkout?orderId=${result.orderId}`, { headers: { cookie } }),
  );
  assert.deepEqual((await refreshed.json()).receipt, receipt);
  assert.equal(api.calls.length, afterCapture + 1);
  assert.equal(api.calls.at(-1)!.method, "GET");
  await api.handle(post(body, cookie));
  assert.equal(captures(api).length, 1, "duplicate return never starts a second capture");
});

test("unapproved order never captures", async () => {
  const api = fakePayPal();
  const { result, cookie } = await api.create();
  const response = await api.handle(
    post(
      { action: "capture", orderId: result.orderId, cartVersion: result.cartVersion, cart: CART },
      cookie,
    ),
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /CREATED.*approval/);
  assert.equal(captures(api).length, 0);
});

for (const status of ["PAYER_ACTION_REQUIRED", "VOIDED", "SAVED"]) {
  test(`PayPal status ${status} cannot capture`, async () => {
    const { api, result, cookie } = await approvedCheckout();
    api.order().status = status;
    const response = await api.handle(
      post(
        { action: "capture", orderId: result.orderId, cartVersion: result.cartVersion, cart: CART },
        cookie,
      ),
    );
    assert.equal(response.status, 409);
    assert.equal(captures(api).length, 0);
  });
}

test("over-budget cart and raised mandate cap are refused before order creation", async () => {
  const api = fakePayPal();
  for (const cart of [
    { ...CART, brief: "Cafe under $100", budgetCents: 10000 },
    { ...CART, budgetCents: 50000 },
  ]) {
    const response = await api.handle(post({ action: "create", cart }));
    assert.equal(response.status, 400);
    assert.equal(api.calls.length, 0);
  }
});

test("edited cart, budget, or version after approval cannot capture", async () => {
  const { api, result, cookie } = await approvedCheckout();
  for (const change of [
    { cart: { ...CART, lines: CART.lines.slice(1) }, cartVersion: result.cartVersion },
    { cart: { ...CART, budgetCents: 50000 }, cartVersion: result.cartVersion },
    { cart: CART, cartVersion: "changed-version" },
  ]) {
    const response = await api.handle(
      post({ action: "capture", orderId: result.orderId, ...change }, cookie),
    );
    assert.ok(response.status >= 400);
    assert.equal(captures(api).length, 0);
  }
});

for (const mismatch of [
  "amount",
  "currency",
  "items",
  "version",
  "purchase-units",
  "intent",
  "order-id",
]) {
  test(`PayPal ${mismatch} mismatch refuses capture`, async () => {
    const { api, result, cookie } = await approvedCheckout();
    const order = api.order();
    if (mismatch === "amount") order.purchase_units![0].amount!.value = "161.00";
    if (mismatch === "currency") order.purchase_units![0].amount!.currency_code = "EUR";
    if (mismatch === "items") order.purchase_units![0].items![0].quantity = "2";
    if (mismatch === "version") order.purchase_units![0].custom_id = "different-cart";
    if (mismatch === "purchase-units") order.purchase_units!.push(order.purchase_units![0]);
    if (mismatch === "intent") order.intent = "AUTHORIZE";
    if (mismatch === "order-id") order.id = "ANOTHER-ORDER";
    const response = await api.handle(
      post(
        { action: "capture", orderId: result.orderId, cartVersion: result.cartVersion, cart: CART },
        cookie,
      ),
    );
    assert.equal(response.status, 409);
    assert.equal(captures(api).length, 0);
  });
}

test("cancel makes no PayPal call and prevents a later approved return from capturing", async () => {
  const { api, result, cookie } = await approvedCheckout();
  const count = api.calls.length;
  const cancel = await api.handle(
    post({ action: "cancel", cartVersion: result.cartVersion }, cookie),
  );
  assert.equal((await cancel.json()).cancelled, true);
  assert.equal(api.calls.length, count);
  const cancelledCookie = cancel.headers.get("set-cookie")!.split(";")[0];
  const response = await api.handle(
    post(
      { action: "capture", orderId: result.orderId, cartVersion: result.cartVersion, cart: CART },
      cancelledCookie,
    ),
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /cancelled or edited/);
  assert.equal(captures(api).length, 0);
});

test("tampered, missing, expired cookies and foreign order IDs fail closed", async () => {
  const { api, result, cookie } = await approvedCheckout();
  const frozen = readCart(cookie, SECRET);
  const expired = `till_paypal_checkout=${sealCart({ ...frozen, createdAt: Date.now() - 4 * 60 * 60 * 1000 }, SECRET)}`;
  for (const invalid of [undefined, `${cookie}x`, expired]) {
    const response = await api.handle(
      post(
        { action: "capture", orderId: result.orderId, cartVersion: result.cartVersion, cart: CART },
        invalid,
      ),
    );
    assert.equal(response.status, 409);
  }
  const response = await api.handle(
    post(
      { action: "capture", orderId: "ANOTHER-ORDER", cartVersion: result.cartVersion, cart: CART },
      cookie,
    ),
  );
  assert.equal(response.status, 409);
  assert.equal(captures(api).length, 0);
});

for (const failure of ["oauth", "create", "capture"] as const) {
  test(`${failure} API error is returned without a success receipt or credentials`, async () => {
    const api = fakePayPal();
    let response: Response;
    if (failure === "capture") {
      const { result, cookie } = await api.create();
      api.order().status = "APPROVED";
      api.fail("capture");
      response = await api.handle(
        post(
          {
            action: "capture",
            orderId: result.orderId,
            cartVersion: result.cartVersion,
            cart: CART,
          },
          cookie,
        ),
      );
    } else {
      api.fail(failure);
      response = await api.handle(post({ action: "create", cart: CART }));
    }
    assert.equal(response.status, 502);
    const text = await response.text();
    const result = JSON.parse(text);
    assert.equal(result.ok, false);
    assert.equal(result.receipt, undefined);
    assert.match(
      result.error,
      failure === "oauth"
        ? /invalid_client/
        : failure === "create"
          ? /INVALID_REQUEST/
          : /INSTRUMENT_DECLINED/,
    );
    assert.ok(!text.includes("unit-test-secret"));
    assert.ok(!text.includes("unit-test-access-token"));
  });
}

test("cross-origin create and capture requests are refused", async () => {
  const { api, result, cookie } = await approvedCheckout();
  for (const action of ["create", "capture"]) {
    const response = await api.handle(
      post(
        { action, cart: CART, orderId: result.orderId, cartVersion: result.cartVersion },
        cookie,
        "https://another-site.example",
      ),
    );
    assert.equal(response.status, 403);
    assert.equal(captures(api).length, 0);
  }
});

test("unknown/fractional quantities are refused; client price and payee overrides are ignored", () => {
  for (const lines of [
    [{ productId: "invented", qty: 1 }],
    [{ productId: "oat", qty: 0.5 }],
    [{ productId: "oat", qty: -1 }],
    [CART.lines[0], CART.lines[0]],
  ]) {
    assert.throws(() => freezeCart({ ...CART, lines }));
  }
  assert.equal(
    freezeCart({
      ...CART,
      totalCents: 1,
      payee: "fake-merchant",
      lines: CART.lines.map((line) => ({ ...line, price: 1 })),
    }).totalCents,
    16000,
  );
});

test("payer-action approval link wins, otherwise approve; foreign and live URLs are refused", () => {
  const order: PayPalOrder = {
    id: "UNIT-TEST-ORDER",
    status: "CREATED",
    links: [
      { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=old" },
      { rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=new" },
    ],
  };
  assert.ok(approvalLink(order).endsWith("token=new"));
  for (const href of [
    "https://www.paypal.com/checkoutnow",
    "https://another-site.example",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => approvalLink({ ...order, links: [{ rel: "approve", href }] }));
  }
});

test("failed create without a cookie leaves mandate editing available", async () => {
  const response = await handleCheckout(post({ action: "cancel" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cancelled, true);
});

test("expired checkout can be cancelled without a PayPal call so the mandate remains editable", async () => {
  const { api, cookie } = await approvedCheckout();
  const frozen = readCart(cookie, SECRET);
  const expired = `till_paypal_checkout=${sealCart({ ...frozen, createdAt: Date.now() - 4 * 60 * 60 * 1000 }, SECRET)}`;
  const count = api.calls.length;
  const response = await api.handle(post({ action: "cancel" }, expired));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(api.calls.length, count);
});
