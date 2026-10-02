import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { projectRoot, readPayPalEnv } from "./with-app-env.mjs";

const execute = promisify(execFile);

test("root PayPal .env reaches the child process without becoming browser flags", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "till-paypal-env-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  const wrapper = join(root, "scripts/with-app-env.mjs");
  copyFileSync(join(projectRoot(), "scripts/with-app-env.mjs"), wrapper);
  // Explicitly fake values, never actual app credentials.
  writeFileSync(join(root, ".env"), [
    'PAYPAL_CLIENT_ID="unit-test-client"',
    "PAYPAL_CLIENT_SECRET='unit-test-secret # literal'",
    "VITE_TEST_SECRET=must-not-be-loaded",
    "OTHER_SERVER_VAR=must-not-be-loaded",
  ].join("\n"));
  const env = { ...process.env };
  for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "VITE_TEST_SECRET", "OTHER_SERVER_VAR"])
    delete env[key];
  const check = `
    const ok = process.env.PAYPAL_CLIENT_ID === 'unit-test-client'
      && process.env.PAYPAL_CLIENT_SECRET === 'unit-test-secret # literal'
      && !process.env.VITE_TEST_SECRET && !process.env.OTHER_SERVER_VAR;
    process.exit(ok ? 0 : 1);
  `;
  const result = await execute(process.execPath, [wrapper, process.execPath, "-e", check], { env });
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  const override = await execute(process.execPath, [wrapper, process.execPath, "-e",
    "process.exit(process.env.PAYPAL_CLIENT_SECRET === 'unit-test-override' ? 0 : 1)",
  ], { env: { ...env, PAYPAL_CLIENT_SECRET: "unit-test-override" } });
  assert.equal(override.stdout, "");
});

test("missing root .env leaves server environment unchanged", (t) => {
  const root = mkdtempSync(join(tmpdir(), "till-paypal-env-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(readPayPalEnv(root), {});
});

test("unreadable root .env reports a generic error without file contents", (t) => {
  const root = mkdtempSync(join(tmpdir(), "till-paypal-env-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".env"));
  assert.throws(() => readPayPalEnv(root), /^Error: Could not read the root \.env file\.$/);
});
