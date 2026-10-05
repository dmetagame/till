import assert from "node:assert/strict";
import { test } from "node:test";
import { CAFE_BRIEF, CAFE_REPLAN_ERROR } from "./cafe.ts";
import { CafeSupplier, proposeCafeRestock } from "./cafe.server.ts";

// These model responses are unit-test fixtures, not a demo mode or live AI evidence.
const lines = (cups = "cups") => [
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

test("fake Gemini in-stock response produces the only legal $160 cart under $180", async () => {
  const result = await proposeCafeRestock(
    CAFE_BRIEF,
    new CafeSupplier(),
    "unit-test-model-key",
    async () => responseFor({ lines: lines() }),
  );
  assert.ok(result.ok);
  assert.equal(result.plan.budgetCents, 18000);
  assert.equal(result.plan.totalCents, 16000);
  assert.deepEqual(
    result.plan.lines.map(({ productId, qty }) => ({ productId, qty })),
    lines(),
  );
  assert.ok(result.plan.checkoutProof);
  assert.equal(
    result.plan.refused.find((p) => p.productId === "cups-small")!.reason,
    "The 500-count cups are in stock and fit the cap.",
  );
  assert.match(
    result.plan.refused.find((p) => p.productId === "cups-premium")!.reason,
    /\$224\.00.*\$180\.00/,
  );
});

test("fake Gemini stock-out response produces $114 and factual stock/cap refusals", async () => {
  const supplier = new CafeSupplier();
  supplier.setCupsInStock(false);
  const result = await proposeCafeRestock(CAFE_BRIEF, supplier, "unit-test-model-key", async () =>
    responseFor({ lines: lines("cups-small") }),
  );
  assert.ok(result.ok);
  assert.equal(result.plan.totalCents, 11400);
  assert.deepEqual(
    result.plan.lines.map(({ productId, qty }) => ({ productId, qty })),
    lines("cups-small"),
  );
  assert.ok(result.plan.checkoutProof);
  assert.match(result.plan.refused.find((p) => p.productId === "cups")!.reason, /Out of stock/);
  assert.match(
    result.plan.refused.find((p) => p.productId === "cups-premium")!.reason,
    /\$224\.00.*\$180\.00/,
  );
});

test("wrong cup, second pack, duplicate, missing item and quantities fail with retry, never a repaired cart", async () => {
  for (const inStock of [true, false]) {
    const supplier = new CafeSupplier();
    supplier.setCupsInStock(inStock);
    const valid = lines(inStock ? "cups" : "cups-small");
    const invalid = [
      lines(inStock ? "cups-small" : "cups"),
      lines("cups-premium"),
      [...valid, { productId: inStock ? "cups-small" : "cups", qty: 1 }],
      [...valid, { productId: "cups-premium", qty: 1 }],
      [...valid, valid[2]],
      [valid[0], valid[2], valid[2]],
      valid.slice(1),
      valid.slice(0, 2),
      valid.map((l) => (l.productId === "beans" ? { ...l, qty: 2 } : l)),
      valid.map((l) => (l.productId === valid[2].productId ? { ...l, qty: 2 } : l)),
      valid.map((l) => ({ ...l, qty: -1 })),
      [...valid, { productId: "invented", qty: 1 }],
      [valid[0], { productId: "pastry", qty: 1 }, valid[2]],
    ];
    for (const input of invalid) {
      assert.equal(supplier.validate(CAFE_BRIEF, { lines: input }), null);
      const result = await proposeCafeRestock(
        CAFE_BRIEF,
        supplier,
        "unit-test-model-key",
        async () => responseFor({ lines: input }),
      );
      assert.equal(result.ok, false);
      assert.ok(!("plan" in result));
      if (!result.ok) assert.equal(result.error, CAFE_REPLAN_ERROR);
    }
  }
});

test("model stock/price/merchant/cap claims cannot change catalog facts or the chosen pack", () => {
  const supplier = new CafeSupplier();
  const plan = supplier.validate(CAFE_BRIEF, {
    budgetCents: 999999,
    lines: lines().map((line) => ({
      ...line,
      priceCents: 0,
      merchant: "invented",
      inStock: false,
    })),
  });
  assert.ok(plan);
  assert.equal(plan.budgetCents, 18000);
  assert.equal(plan.totalCents, 16000);
  supplier.setCupsInStock(false);
  assert.equal(
    supplier.validate(CAFE_BRIEF, {
      lines: lines().map((line) => ({ ...line, inStock: true, priceCents: 0 })),
    }),
    null,
  );
});

test("lower buyer caps are respected; missing/raised caps fail", () => {
  const supplier = new CafeSupplier();
  assert.equal(supplier.validate("Cafe restock under $159", { lines: lines() }), null);
  supplier.setCupsInStock(false);
  assert.equal(supplier.validate("Cafe restock under $113", { lines: lines("cups-small") }), null);
  assert.ok(supplier.validate("Cafe restock under $114", { lines: lines("cups-small") }));
  assert.equal(supplier.validate("Cafe restock under $181", { lines: lines("cups-small") }), null);
  assert.equal(supplier.validate("Cafe restock with no cap", { lines: lines("cups-small") }), null);
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
      assert.equal(payload.budgetCents, 18000);
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
      return responseFor({ lines: lines("cups-small") });
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
