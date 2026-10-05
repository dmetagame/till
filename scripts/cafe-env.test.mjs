import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mergeAppEnv, readCafeEnv, readPayPalEnv } from "./with-app-env.mjs";

test("cafe key loads server-only while PayPal loader keeps its existing scope", () => {
  const root = mkdtempSync(join(tmpdir(), "till-cafe-env-test-"));
  try {
    writeFileSync(
      join(root, ".env"),
      "GEMINI_API_KEY=unit-test-gemini-key\nXAI_API_KEY=unit-test-unused-xai\nPAYPAL_CLIENT_ID=unit-test-client\nPAYPAL_CLIENT_SECRET=unit-test-secret\nUNRELATED=ignored\n",
    );
    assert.deepEqual(readCafeEnv(root), { GEMINI_API_KEY: "unit-test-gemini-key" });
    assert.deepEqual(readPayPalEnv(root), {
      PAYPAL_CLIENT_ID: "unit-test-client",
      PAYPAL_CLIENT_SECRET: "unit-test-secret",
    });
    assert.deepEqual(mergeAppEnv(readCafeEnv(root), { GEMINI_API_KEY: "unit-test-override" }), {
      GEMINI_API_KEY: "unit-test-override",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing cafe key is optional and cannot enable a fallback cart", () => {
  const root = mkdtempSync(join(tmpdir(), "till-cafe-env-test-"));
  try {
    assert.deepEqual(readCafeEnv(root), {});
    writeFileSync(join(root, ".env"), "PAYPAL_CLIENT_ID=unit-test-client\n");
    assert.deepEqual(readCafeEnv(root), {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
