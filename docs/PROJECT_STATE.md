# Project State

Last updated: `2026-10-02T14:07:56Z`
Status: `IMPLEMENTED — REAL SANDBOX VERIFICATION PENDING`
Active objective: Replace Till's simulated checkout with one controlled-merchant PayPal sandbox create/approve/recheck/capture flow. Preserve design, mandate UI, and Grok planning.

## Workspace

- Repository: https://github.com/dmetagame/till (private at clone time)
- Worktree: `/home/rouma/till`
- Branch: `main`, upstream `origin/main`
- Initial commit: `d6755c29403fe1ec535a2cf05f7301713d172b50`; clean clone
- Active commit before implementation checkpoint: the initial commit above. Feature changes are currently uncommitted; remote backup will be recorded after push verification.
- No existing project state or frozen release was present. Platform shell, catalog and planning are preserved.
- GitHub authentication passes. Branch-protection inspection returned HTTP 403 (private-repository feature unavailable); no protection override will be attempted.

## Constraints

- One sandbox merchant owned by the configured PayPal REST app; fictional catalog merchants are never payees.
- Server-only PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET; no credential values in documentation, browser, or Git.
- Buyer alone approves on PayPal; agent cannot capture. Server checks frozen cart before capture.
- No AI replanning, database, role system, sponsor integrations, new application dependencies, tax/shipping math, or redesign.
- User narrowed delivery to this payment slice and setup documentation; no video/license deliverable.
- User authorized local testing with a gitignored root `.env`, overriding the template's generic prohibition. Load only the two PAYPAL variables into the server process; the user approves using their separate personal sandbox buyer in their browser.
- Repository Grok instructions describe a different `/workspace` environment; use the explicitly authorized clone here. `.grok` skills/references are absent from the clone. Preserve existing startup/platform files.

## Current Context

- TanStack Start app; checkout simulation is in `src/components/till/till-app.tsx`.
- Prices are integer cents in `src/lib/till/catalog.ts`; cafe sample totals $160 under $220.
- `src/lib/till/plan.functions.ts` is out of scope. `src/lib/till/ledger.ts` localStorage is not payment evidence.
- Decision: signed HttpOnly checkout cookie retains frozen state without a database; PayPal GET verifies payment records. Use direct fetch to sandbox only.
- One active checkout per browser, three-hour cookie lifetime. A replaced or expired cookie cannot verify an older receipt inside the app; independent PayPal GET remains available. Local storage is never payment evidence.

## Work Completed

- Server-only OAuth/fetch client, signed HttpOnly frozen-cart cookie, catalog-cents validation, one purchase unit without fictional payees, exact order checks, buyer redirect/return, capture and GET-only receipt refresh.
- Existing UI now displays PayPal IDs/status only after server verification; errors/cancellation are visible. Local ledger is references/notes only. Catalog, Grok planning and ledger implementation are unchanged.
- README documents sandbox app, two server variables, personal sandbox buyer, cafe flow, independent PayPal GET, cancellation/refresh checks, and cookie scope.
- `scripts/with-app-env.mjs` now reads only the two PayPal names from an optional root `.env`, with process-environment precedence. `scripts/paypal-env.test.mjs` verifies child-process loading without logging values. The file remains gitignored and is not created or committed by Codex.
- Cancel/edit invalidation needs no OAuth call. Missing or expired cookies can be discarded without preventing a new mandate. The server prevents subsequent capture of the browser's cancelled checkout.
- Initial `npm ci` failed due to pre-existing lockfile inconsistencies (`ajv`, `json-schema-traverse`, `fast-uri`, `require-from-string`). `npm install --ignore-scripts --no-audit --no-fund` repaired the lock against existing dependency declarations; no direct dependency added.

## Verification

- `npm run test:paypal`: 25 payment-policy/API fixture tests and 3 environment-loader tests pass (no real transactions).
- `npm run typecheck`: passes after TanStack generated the new API route types.
- Scoped ESLint: passes without findings.
- `npm run build`: passes; existing framework bundler warnings, migration skipped because DATABASE_URL is unset; no database added.
- Dev and production preview browser smoke checks pass at 1280×800 and 390×844; no horizontal overflow, console errors or page errors. Built output matches dev text. Images and verdicts retained locally under ignored `screenshots/dev*` and `screenshots/built*`.
- Cafe review and checkout were exercised in the browser: missing credentials show the explicit configuration error; no receipt or ledger payment entry appears. Cancellation/edit recovery was also checked. This is error-path evidence only.
- Browser JavaScript scan: OAuth path, server client class, secret variable and cookie-signing marker absent from both built JS assets.
- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`: passes after lock repair.
- `npm test`: 200 template script tests, 184 pass / 16 fail. All 16 failures reproduce by name on initial commit `d6755c2` (197 tests, 181 pass / 16 fail): missing ignored `.grok` skill/app-env files and template metadata expectations. These unrelated template issues are preserved. The remaining 55 app-data/auth tests pass when run independently; payment tests also pass independently.
- `git diff --check`: passes. `git diff --exit-code -- src/lib/till/catalog.ts src/lib/till/ledger.ts src/lib/till/plan.functions.ts`: passes, confirming those files are unchanged.

- Clone/status/worktree/remote and GitHub auth verified before editing.
- At 14:07 UTC, the user-owned root `.env` was not present. Credential values are never printed or recorded.

## Risks And Blockers

- Real sandbox approval/capture verification requires the user to save the two app credentials in `/home/rouma/till/.env`, then approve the cafe order in their browser with their personal sandbox buyer. No real sandbox order or capture has been verified yet; do not call the end-to-end acceptance criteria complete.
- The existing broad test command stops at the pre-existing template failures; use the independent focused checks above to assess this slice.

## Next Actions

1. Commit the verified implementation and state, push `main`, and record the verified remote checkpoint.
2. When the user saves `.env`, restart `npm run dev` at http://localhost:8080. Check variable presence only; never print values.
3. Have the user start Cafe restock and approve in their own browser. Verify the resulting order/capture IDs and raw statuses with PayPal GET; refresh and compare capture count. Test a separate cancelled checkout and confirm zero captures. Record actual evidence separately from fixture tests.

## Change Log

- 2026-10-02T13:29:33+00:00: Cloned requested repository, reconciled missing state, confirmed clean main/upstream and credentials missing. Implementation started.

- 2026-10-02T13:47:22+00:00: Payment implementation and setup written; 24 payment tests, typecheck, scoped lint and production build pass. Real sandbox credentials remain missing; browser/full-suite checks underway.
- 2026-10-02T14:07:56Z: Implementation verified with 25 payment tests and 3 loader tests, typecheck, scoped lint, build and desktop/mobile dev/production browser checks. Reproduced all 16 broad-suite failures on the original commit. User authorized root `.env`; loader and judge documentation updated. Real sandbox approval is pending user credentials and browser action.
