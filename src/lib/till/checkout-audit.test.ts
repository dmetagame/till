import assert from "node:assert/strict";
import { test } from "node:test";
import { CAFE_BRIEF } from "./cafe.ts";
import { CafeSupplier, proposeCafeRestock } from "./cafe.server.ts";
import { handleCafeCheckout } from "./cafe-checkout.server.ts";
import type { CheckoutCart } from "./checkout.ts";
import { PayPalSandboxClient, type PayPalOrder } from "./paypal.server.ts";

// All HTTP is injected. No real credentials, Gemini requests or PayPal requests.
const ORIGIN = "http://localhost:8080";
const post = (body: object, cookie: string) =>
  new Request(`${ORIGIN}/api/paypal/checkout`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

async function fixture() {
  const supplier = new CafeSupplier();
  supplier.setCupsInStock(false);
  const proposal = await proposeCafeRestock(
    CAFE_BRIEF,
    supplier,
    "audit-fixture-model-key",
    async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    lines: ["oat", "beans", "cups-small"].map((productId) => ({
                      productId,
                      qty: 1,
                    })),
                  }),
                },
              ],
            },
          },
        ],
      }),
  );
  assert.ok(proposal.ok && proposal.plan.checkoutProof);
  const cart: CheckoutCart = {
    checkoutKey: proposal.plan.checkoutProof.checkoutKey,
    title: "Cafe restock",
    brief: CAFE_BRIEF,
    budgetCents: 18000,
    cafeProof: proposal.plan.checkoutProof.token,
    lines: proposal.plan.lines.map(({ productId, qty }) => ({ productId, qty })),
  };
  const orders = new Map<string, PayPalOrder>();
  const baseTime = Date.now();
  let time = baseTime,
    oauths = 0,
    captures = 0;
  let expireDuringGet = false;
  let duringRefresh: (() => void) | undefined;
  const client = new PayPalSandboxClient(
    { clientId: "audit-fixture-client", clientSecret: "audit-fixture-secret" },
    async (url, init) => {
      const href = String(url);
      assert.ok(href.startsWith("https://api-m.sandbox.paypal.com/"));
      if (href.endsWith("/oauth2/token")) {
        oauths++;
        if (oauths > 1) duringRefresh?.();
        return Response.json({ access_token: "audit-fixture-token", expires_in: 3600 });
      }
      const path = href.split("/v2/checkout/orders")[1];
      if (path === "" && init?.method === "POST") {
        const id = `UNIT-AUDIT-ORDER-${orders.size + 1}`;
        const order: PayPalOrder = {
          ...JSON.parse(String(init.body)),
          id,
          status: "CREATED",
          links: [
            { rel: "approve", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` },
          ],
        };
        orders.set(id, order);
        return Response.json(order);
      }
      const order = orders.get(path.split("/")[1])!;
      assert.ok(order);
      if (init?.method === "POST") {
        assert.ok(path.endsWith("/capture"));
        assert.equal(order.status, "APPROVED");
        captures++;
        order.status = "COMPLETED";
        order.purchase_units![0].payments = {
          captures: [
            {
              id: "UNIT-AUDIT-CAPTURE",
              status: "COMPLETED",
              amount: { currency_code: "USD", value: "114.00" },
            },
          ],
        };
      } else if (expireDuringGet) {
        time = baseTime + 3541000;
      }
      return Response.json(order);
    },
  );
  const handle = (request: Request) =>
    handleCafeCheckout(request, {
      client,
      secret: "audit-fixture-cookie-key",
      catalog: () => supplier.snapshot(),
    });
  const response = await handle(post({ action: "create", cart }, ""));
  const created = await response.json();
  assert.equal(created.ok, true);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  orders.get(created.orderId)!.status = "APPROVED";
  const body = {
    action: "capture",
    cart,
    orderId: created.orderId,
    cartVersion: created.cartVersion,
  };
  return {
    cart,
    created,
    cookie,
    body,
    handle,
    supplier,
    captures: () => captures,
    oauths: () => oauths,
    now: () => time,
    expireAtCapture: (mutation: () => void) => {
      time = baseTime + 3539000;
      expireDuringGet = true;
      duringRefresh = mutation;
    },
    async returned(token = created.orderId, version = created.cartVersion) {
      const query = new URLSearchParams({
        paypal: "return",
        token,
        cartVersion: version,
        orderId: created.orderId,
      });
      const result = await handle(
        new Request(`${ORIGIN}/api/paypal/checkout?${query}`, { headers: { cookie } }),
      );
      // Before the fix this GET was a status read; after it, a signed return redirect.
      assert.ok(result.status === 200 || result.status === 302);
      return result.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    },
  };
}

test("audit: direct approved capture before a server-handled return fails closed", async () => {
  const api = await fixture();
  const response = await api.handle(post(api.body, api.cookie));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /return/i);
  assert.equal(api.captures(), 0);
  for (const [token, cartVersion] of [
    ["", api.created.cartVersion],
    ["UNIT-AUDIT-OTHER-ORDER", api.created.cartVersion],
    [api.created.orderId, "edited-version"],
  ]) {
    const query = new URLSearchParams({ paypal: "return", token, cartVersion });
    const invalid = await api.handle(
      new Request(`${ORIGIN}/api/paypal/checkout?${query}`, { headers: { cookie: api.cookie } }),
    );
    assert.equal(invalid.status, 409);
  }
  const retry = await api.handle(post(api.body, api.cookie));
  assert.equal(retry.status, 409, "an invalid return did not unlock capture");
  assert.equal(api.captures(), 0);
});

test("audit: cancelled and replaced signed snapshots cannot be replayed", async () => {
  const outcomes = [];
  for (const action of ["cancel", "replace"] as const) {
    const api = await fixture();
    const returnedCookie = await api.returned();
    if (action === "cancel") {
      const response = await api.handle(
        post({ action: "cancel", cartVersion: api.created.cartVersion }, returnedCookie),
      );
      assert.equal(response.status, 200);
    } else {
      const replacement = await api.handle(
        post(
          { action: "create", cart: { ...api.cart, title: "Edited cafe cart" } },
          returnedCookie,
        ),
      );
      assert.equal(replacement.status, 200);
    }
    const statuses = [];
    for (const oldCookie of [api.cookie, returnedCookie]) {
      const response = await api.handle(post(api.body, oldCookie));
      statuses.push(response.status);
    }
    outcomes.push({ action, statuses, captures: api.captures() });
  }
  assert.deepEqual(outcomes, [
    { action: "cancel", statuses: [409, 409], captures: 0 },
    { action: "replace", statuses: [409, 409], captures: 0 },
  ]);
});

test("audit: stock change during awaited OAuth refresh refuses the outbound capture", async () => {
  const api = await fixture();
  const cookie = await api.returned();
  const originalNow = Date.now;
  try {
    Date.now = api.now;
    api.expireAtCapture(() => api.supplier.setCupsInStock(true));
    const response = await api.handle(post(api.body, cookie));
    assert.equal(api.oauths(), 2, "the capture actually awaited a second OAuth response");
    assert.equal(api.supplier.snapshot().revision, 2, "stock changed during that response");
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /stock changed.*No capture/);
    assert.equal(api.captures(), 0);
  } finally {
    Date.now = originalNow;
  }
});
