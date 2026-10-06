import assert from "node:assert/strict";
import test from "node:test";
import { configuredPublicOrigin, pinPublicOrigin } from "./public-origin.mjs";

test("host-pinned HTTPS origin preserves the return token/version and ignores forwarded hosts", () => {
  const request = new Request(
    "http://internal:8080/api/paypal/checkout?paypal=return&token=FIXTURE-ORDER&cartVersion=v1",
    {
      headers: { "x-forwarded-host": "other.example", "x-forwarded-proto": "http" },
    },
  );
  pinPublicOrigin(request, configuredPublicOrigin("https://till.example/"));
  assert.equal(
    request.url,
    "https://till.example/api/paypal/checkout?paypal=return&token=FIXTURE-ORDER&cartVersion=v1",
  );
});

test("pinning preserves POST body, method, cookie and submitted Origin for existing guards", async () => {
  const request = new Request("http://internal:8080/api/paypal/checkout", {
    method: "POST",
    headers: {
      origin: "https://till.example",
      cookie: "fixture=not-a-payment-cookie",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "capture", cartVersion: "v1" }),
  });
  assert.equal(pinPublicOrigin(request, "https://till.example"), request);
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("origin"), new URL(request.url).origin);
  assert.equal(request.headers.get("cookie"), "fixture=not-a-payment-cookie");
  assert.deepEqual(await request.clone().json(), { action: "capture", cartVersion: "v1" });
});

test("invalid public origins fail startup without exposing the configured value", () => {
  for (const value of [
    "http://till.example",
    "https://till.example/path",
    "https://till.example?x=1",
    "https://user:private@till.example",
    "not-a-url",
  ]) {
    assert.throws(() => configuredPublicOrigin(value), {
      message: "PUBLIC_ORIGIN must be an HTTPS origin.",
    });
  }
  assert.equal(configuredPublicOrigin(undefined), null);
  const request = new Request("http://localhost:3000/");
  assert.equal(pinPublicOrigin(request, null), request);
});
