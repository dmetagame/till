import assert from "node:assert/strict";
import { test } from "node:test";
import { CAFE_BRIEF, CAFE_REPLAN_ERROR } from "./cafe.ts";
import { CafeSupplier, proposeCafeRestock } from "./cafe.server.ts";

// These model responses are unit-test fixtures, not a demo mode or live AI evidence.
const lines = (cups = "cups-small") => [
  { productId: "oat", qty: 1 },
  { productId: "beans", qty: 1 },
  { productId: cups, qty: 1 },
];
const responseFor = (value: unknown) =>
  Response.json({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }],
  });

test("fresh server inventory defaults to in stock, one demo merchant and integer cents", () => {
  const catalog = new CafeSupplier().snapshot();
  assert.equal(catalog.products.length, 5);
  assert.ok(
    catalog.products.every(
      (product) =>
        product.inStock &&
        product.merchant === "Counter Supply" &&
        Number.isSafeInteger(product.priceCents),
    ),
  );
  assert.deepEqual(
    catalog.products.map((product) => [product.id, product.priceCents]),
    [
      ["oat", 2400],
      ["beans", 7200],
      ["cups", 6400],
      ["cups-small", 1800],
      ["cups-premium", 12800],
    ],
  );
});

test("$120 plan uses catalog prices and visibly refuses both expensive cup options", () => {
  const plan = new CafeSupplier().validate(CAFE_BRIEF, { lines: lines(), budgetCents: 999999 });
  assert.ok(plan);
  assert.equal(plan.budgetCents, 12000);
  assert.equal(plan.totalCents, 11400);
  assert.equal(plan.lines.length, 3);
  assert.match(
    plan.refused.find((item) => item.productId === "cups")!.reason,
    /\$160\.00.*\$120\.00/,
  );
  assert.match(
    plan.refused.find((item) => item.productId === "cups-premium")!.reason,
    /\$224\.00.*\$120\.00/,
  );
});

test("stock change excludes 500 cups even if model spoofs stock, merchant and price", () => {
  const supplier = new CafeSupplier();
  supplier.setCupsInStock(false);
  const plan = supplier.validate(CAFE_BRIEF, {
    lines: [
      ...lines(),
      { productId: "cups", qty: 1, priceCents: 0, inStock: true, merchant: "Counter Supply" },
    ],
  });
  assert.ok(plan);
  assert.equal(plan.totalCents, 11400);
  assert.ok(!plan.lines.some((line) => line.productId === "cups"));
  assert.match(plan.refused.find((item) => item.productId === "cups")!.reason, /Out of stock/);
  assert.equal(
    supplier.snapshot().products.find((product) => product.id === "cups")!.inStock,
    false,
  );
});

test("unknown and other-merchant items are dropped without changing the valid total", () => {
  const plan = new CafeSupplier().validate(CAFE_BRIEF, {
    lines: [
      ...lines(),
      { productId: "pastry", qty: 1, merchant: "Counter Supply", priceCents: 1 },
      { productId: "invented", qty: 1 },
    ],
  });
  assert.ok(plan);
  assert.equal(plan.totalCents, 11400);
  assert.equal(plan.lines.length, 3);
  assert.match(
    plan.refused.find((item) => item.productId === "pastry")!.reason,
    /Counter Supply-only/,
  );
  assert.match(
    plan.refused.find((item) => item.productId === "invented")!.reason,
    /Not in the server catalog/,
  );
});

test("over-cap premium and invalid quantities cannot produce a partial restock", () => {
  const supplier = new CafeSupplier();
  for (const input of [
    lines("cups-premium"),
    lines("cups"),
    [...lines().slice(0, 2), { productId: "cups-small", qty: -1 }],
    [...lines().slice(0, 2), { productId: "cups-small", qty: 2 }],
  ]) {
    const plan = supplier.validate(CAFE_BRIEF, { lines: input });
    assert.ok(plan);
    assert.deepEqual(plan.lines, []);
    assert.equal(plan.totalCents, 0);
    assert.match(plan.summary, /refused.*\$120\.00/);
  }
});

test("smaller buyer cap is respected and missing/raised caps are refused", () => {
  const supplier = new CafeSupplier();
  const plan = supplier.validate("Cafe restock under $110", { lines: lines(), budgetCents: 12000 });
  assert.ok(plan);
  assert.equal(plan.budgetCents, 11000);
  assert.equal(plan.totalCents, 0);
  assert.equal(supplier.validate("Cafe restock under $121", { lines: lines() }), null);
  assert.equal(supplier.validate("Cafe restock with no cap", { lines: lines() }), null);
});

test("duplicate model lines cannot inflate quantities or totals", () => {
  const plan = new CafeSupplier().validate(CAFE_BRIEF, { lines: [...lines(), ...lines()] });
  assert.ok(plan);
  assert.equal(plan.lines.length, 3);
  assert.equal(plan.totalCents, 11400);
});

test("missing model key never calls a provider or returns a canned cart", async () => {
  const result = await proposeCafeRestock(CAFE_BRIEF, new CafeSupplier(), "", async () => {
    throw new Error("Unexpected network call");
  });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result).sort(), ["catalog", "error", "ok"]);
  if (!result.ok) assert.equal(result.error, CAFE_REPLAN_ERROR);
});

test("fresh model sees only catalog facts and mandate constraints, never PayPal values", async () => {
  const supplier = new CafeSupplier();
  supplier.setCupsInStock(false);
  let calls = 0;
  const result = await proposeCafeRestock(
    CAFE_BRIEF,
    supplier,
    "unit-test-model-key",
    async (url, init) => {
      calls += 1;
      assert.equal(
        String(url),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      );
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "unit-test-model-key");
      assert.ok(!String(url).includes("unit-test-model-key"));
      const body = JSON.parse(String(init?.body));
      const payload = JSON.parse(body.contents[0].parts[0].text);
      assert.equal(payload.budgetCents, 12000);
      assert.equal(
        payload.catalog.find((product: { id: string }) => product.id === "cups").inStock,
        false,
      );
      assert.ok(
        payload.catalog.every(
          (product: object) =>
            JSON.stringify(Object.keys(product).sort()) ===
            JSON.stringify(["id", "inStock", "merchant", "priceCents"]),
        ),
      );
      assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
      assert.ok(!String(init?.body).includes("PAYPAL_CLIENT"));
      assert.ok(!String(init?.body).includes("api-m.sandbox.paypal.com"));
      return responseFor({ lines: lines() });
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.plan.totalCents, 11400);
    assert.match(
      result.plan.refused.find((item) => item.productId === "cups")!.reason,
      /Out of stock/,
    );
  }
});

test("provider errors, timeouts and malformed output all fail without a cart", async () => {
  const requests: (typeof fetch)[] = [
    async () => new Response("rejected", { status: 401 }),
    async () => {
      throw new Error("unit-test timeout");
    },
    async () =>
      Response.json({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }],
      }),
    async () => responseFor({ lines: "not an array" }),
    async () =>
      Response.json({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: JSON.stringify({ lines: lines() }) }] },
          },
        ],
      }),
  ];
  for (const request of requests) {
    const result = await proposeCafeRestock(
      CAFE_BRIEF,
      new CafeSupplier(),
      "unit-test-model-key",
      request,
    );
    assert.equal(result.ok, false);
    assert.ok(!("plan" in result));
    if (!result.ok) assert.equal(result.error, CAFE_REPLAN_ERROR);
  }
});

test("inventory changed during model response fails and requires another fresh search", async () => {
  const supplier = new CafeSupplier();
  const result = await proposeCafeRestock(CAFE_BRIEF, supplier, "unit-test-model-key", async () => {
    supplier.setCupsInStock(false);
    return responseFor({ lines: lines() });
  });
  assert.equal(result.ok, false);
  assert.equal(result.catalog.products.find((product) => product.id === "cups")!.inStock, false);
});
