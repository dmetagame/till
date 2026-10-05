import assert from "node:assert/strict";
import { test } from "node:test";
import { CAFE_BRIEF } from "./cafe.ts";
import { CafeSupplier, proposeCafeRestock } from "./cafe.server.ts";
import { assertCafeCheckout, handleCafeCheckout } from "./cafe-checkout.server.ts";
import type { CheckoutCart } from "./checkout.ts";
import { PayPalSandboxClient, type PayPalOrder } from "./paypal.server.ts";

// Explicit API fixtures only. These never contact PayPal or Gemini.
const ORIGIN = "http://localhost:8080";
const post = (body: object, cookie?: string) =>
  new Request(`${ORIGIN}/api/paypal/checkout`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

async function proposal(supplier: CafeSupplier, stockOut = true): Promise<CheckoutCart> {
  supplier.setCupsInStock(!stockOut);
  const result = await proposeCafeRestock(CAFE_BRIEF, supplier, "unit-test-model-key", async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  lines: [
                    { productId: "oat", qty: 1 },
                    { productId: "beans", qty: 1 },
                    { productId: stockOut ? "cups-small" : "cups", qty: 1 },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }),
  );
  assert.ok(result.ok && result.plan.checkoutProof);
  return {
    checkoutKey: result.plan.checkoutProof.checkoutKey,
    title: "Cafe restock",
    brief: CAFE_BRIEF,
    budgetCents: 18000,
    cafeProof: result.plan.checkoutProof.token,
    lines: result.plan.lines.map(({ productId, qty }) => ({ productId, qty })),
  };
}

function fixture(supplier: CafeSupplier) {
  let order: PayPalOrder;
  let duringGet: (() => void) | undefined;
  let creates = 0,
    captures = 0;
  const client = new PayPalSandboxClient(
    { clientId: "unit-test-client", clientSecret: "unit-test-secret" },
    async (url, init) => {
      const href = String(url);
      assert.ok(href.startsWith("https://api-m.sandbox.paypal.com/"));
      if (href.endsWith("/oauth2/token"))
        return Response.json({ access_token: "unit-test-token", expires_in: 3600 });
      const path = href.split("/v2/checkout/orders")[1];
      if (init?.method === "POST" && path === "") {
        creates++;
        order = {
          ...JSON.parse(String(init.body)),
          id: "UNIT-CAFE-ORDER",
          status: "CREATED",
          links: [
            {
              rel: "approve",
              href: "https://www.sandbox.paypal.com/checkoutnow?token=UNIT-CAFE-ORDER",
            },
          ],
        };
        assert.equal(order.purchase_units![0].amount!.value, "114.00");
        assert.ok(!("payee" in order.purchase_units![0]));
      } else if (init?.method === "POST" && path.endsWith("/capture")) {
        captures++;
        assert.equal(order.status, "APPROVED");
        assert.equal(
          new Headers(init.headers).get("PayPal-Request-Id"),
          order.purchase_units![0].custom_id,
        );
        order.status = "COMPLETED";
        order.purchase_units![0].payments = {
          captures: [
            {
              id: "UNIT-CAFE-CAPTURE",
              status: "COMPLETED",
              amount: { currency_code: "USD", value: "114.00" },
            },
          ],
        };
      } else {
        duringGet?.();
        duringGet = undefined;
      }
      return Response.json(order!);
    },
  );
  const handle = (request: Request) =>
    handleCafeCheckout(request, {
      client,
      secret: "unit-test-signing-key",
      catalog: () => supplier.snapshot(),
    });
  return {
    handle,
    counts: () => ({ creates, captures }),
    approve: () => {
      order.status = "APPROVED";
    },
    mutateDuringGet: (fn: () => void) => {
      duringGet = fn;
    },
    async create(cart: CheckoutCart) {
      const response = await handle(post({ action: "create", cart }));
      const result = await response.json();
      assert.equal(result.ok, true, JSON.stringify(result));
      return { ...result, cookie: response.headers.get("set-cookie")!.split(";")[0] };
    },
  };
}

test("only verified Gemini lines enter existing $114 checkout; refresh remains GET-only after stock changes", async () => {
  const supplier = new CafeSupplier(),
    cart = await proposal(supplier),
    api = fixture(supplier);
  const created = await api.create(cart);
  api.approve();
  const response = await api.handle(
    post(
      { action: "capture", cart, orderId: created.orderId, cartVersion: created.cartVersion },
      created.cookie,
    ),
  );
  const result = await response.json();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.receipt.totalCents, 11400);
  assert.equal(result.receipt.captureId, "UNIT-CAFE-CAPTURE");
  assert.deepEqual(
    result.receipt.lines.map((line: { productId: string }) => line.productId),
    ["beans", "cups-small", "oat"],
  );
  supplier.setCupsInStock(true);
  const refreshed = await api.handle(
    new Request(`${ORIGIN}/api/paypal/checkout?orderId=${created.orderId}`, {
      headers: { cookie: created.cookie },
    }),
  );
  assert.deepEqual((await refreshed.json()).receipt, result.receipt);
  assert.deepEqual(api.counts(), { creates: 1, captures: 1 });
});

test("stock changed after approval or during PayPal GET refuses before any capture POST", async () => {
  for (const timing of ["after", "during", "restored"]) {
    const supplier = new CafeSupplier(),
      cart = await proposal(supplier),
      api = fixture(supplier);
    const created = await api.create(cart);
    api.approve();
    if (timing === "during") api.mutateDuringGet(() => supplier.setCupsInStock(true));
    else {
      supplier.setCupsInStock(true);
      if (timing === "restored") supplier.setCupsInStock(false);
    }
    const response = await api.handle(
      post(
        { action: "capture", cart, orderId: created.orderId, cartVersion: created.cartVersion },
        created.cookie,
      ),
    );
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /stock changed.*No capture/);
    assert.deepEqual(api.counts(), { creates: 1, captures: 0 });
  }
});

test("missing/forged proposal, premium, foreign lines and raised budget cannot create orders", async () => {
  const supplier = new CafeSupplier(),
    cart = await proposal(supplier),
    api = fixture(supplier);
  const bad = [
    { ...cart, cafeProof: undefined },
    { ...cart, cafeProof: undefined, lines: [{ productId: "sourdough", qty: 1 }] },
    { ...cart, cafeProof: "forged.token" },
    { ...cart, lines: [{ productId: "cups-premium", qty: 1 }] },
    { ...cart, lines: [{ productId: "sourdough", qty: 1 }] },
    { ...cart, budgetCents: 22000, brief: CAFE_BRIEF.replace("$180", "$220") },
  ];
  for (const value of bad) {
    const response = await api.handle(post({ action: "create", cart: value }));
    assert.ok(response.status >= 400);
    assert.equal((await response.json()).ok, false);
  }
  assert.deepEqual(api.counts(), { creates: 0, captures: 0 });
});

test("changed catalog price, unavailable line, incomplete cart or second cup pack fails", async () => {
  const supplier = new CafeSupplier(),
    cart = await proposal(supplier),
    catalog = supplier.snapshot();
  const product = catalog.products.find((p) => p.id === "cups-small")!;
  product.inStock = false;
  assert.throws(() => assertCafeCheckout(cart, cart.cafeProof, catalog), /out of stock/);
  product.inStock = true;
  product.priceCents++;
  assert.throws(() => assertCafeCheckout(cart, cart.cafeProof, catalog), /prices changed/);
  assert.throws(
    () =>
      assertCafeCheckout(
        { ...cart, lines: cart.lines.filter((l) => l.productId !== "cups-small") },
        cart.cafeProof,
        supplier.snapshot(),
      ),
    /payable cafe restock/,
  );
  assert.throws(
    () =>
      assertCafeCheckout(
        { ...cart, lines: [...cart.lines, { productId: "cups", qty: 1 }] },
        cart.cafeProof,
        supplier.snapshot(),
      ),
    /payable cafe restock/,
  );
});

test("original frozen-cart edit refusal and buyer-approval requirement still run", async () => {
  const supplier = new CafeSupplier(),
    cart = await proposal(supplier),
    api = fixture(supplier),
    created = await api.create(cart);
  const capture = (value: CheckoutCart) =>
    api.handle(
      post(
        {
          action: "capture",
          cart: value,
          orderId: created.orderId,
          cartVersion: created.cartVersion,
        },
        created.cookie,
      ),
    );
  assert.match((await (await capture(cart)).json()).error, /buyer approval is required/);
  api.approve();
  assert.match(
    (await (await capture({ ...cart, lines: cart.lines.slice(1) })).json()).error,
    /edited after checkout was frozen/,
  );
  assert.deepEqual(api.counts(), { creates: 1, captures: 0 });
});

test("verified in-stock $160 proposal is payable without bypassing the catalog guard", async () => {
  const supplier = new CafeSupplier();
  const cart = await proposal(supplier, false);
  assert.equal(cart.budgetCents, 18000);
  assert.deepEqual(
    cart.lines.map((l) => l.productId),
    ["oat", "beans", "cups"],
  );
  assert.doesNotThrow(() => assertCafeCheckout(cart, cart.cafeProof, supplier.snapshot()));
  supplier.setCupsInStock(false);
  assert.throws(
    () => assertCafeCheckout(cart, cart.cafeProof, supplier.snapshot()),
    /stock changed/,
  );
});
