# Till

Till proposes a cart inside a spending mandate. The completed **PayPal sandbox** slice creates an order, redirects for buyer approval, rechecks the frozen cart on the server, then captures. The agent cannot approve, change the payee, raise the budget, or capture. The cafe sample proposes a fresh Gemini cart after a demo stock change and passes that verified cart into the same buyer-approved sandbox checkout.

**PayPal sandbox · no real money.** All purchases go to the one sandbox business merchant that owns the configured REST app. Catalog vendor names are fictional labels, never PayPal payees. The existing mandate UI, sample carts, visual design and Grok planning remain in place.

## Judge setup

Use Node 22.18+ and npm. No additional payment SDK or application dependency is needed.

1. Sign into the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) with an ordinary developer account.
2. Under **Apps & Credentials**, select **Sandbox** and create a REST app linked to a **Business sandbox account** you control. That account is the only merchant. Copy this app's sandbox Client ID and Secret, not live credentials.
3. Under **Testing Tools → Sandbox Accounts**, create or select one **Personal sandbox account**, distinct from the merchant. Open its **⋮ → View/Edit Account** to retrieve the generated buyer email and password privately. In the browser you will use for Till, first [sign into PayPal sandbox](https://www.sandbox.paypal.com/signin) with those personal sandbox credentials. Give it sufficient test balance for the $160 cafe sample. Sandbox accounts do not require a PayPal employee account. See [PayPal's account-login instructions](https://developer.paypal.com/api/rest/#3-get-sandbox-account-credentials).
4. Clone this repository and install its existing dependencies:

   ```bash
   git clone https://github.com/dmetagame/till
   cd till
   npm ci
   ```

5. Create a **gitignored `.env` at the repository root** with these two names and your sandbox app credentials. Replace the placeholders privately; do not commit this file:

   ```dotenv
   PAYPAL_CLIENT_ID=your_sandbox_app_client_id
   PAYPAL_CLIENT_SECRET=your_sandbox_app_secret
   ```

   Start (or restart) the local server with `npm run dev`. The startup wrapper loads these PayPal variables and the optional cafe `GEMINI_API_KEY` into the server process. The PayPal client reads its two values through `process.env`; none uses a `VITE_` prefix or enters the browser bundle. Existing process environment variables take precedence. If you prefer process environment variables instead of a file, these Bash prompts avoid shell history:

   ```bash
   read -r -p 'Sandbox Client ID: ' PAYPAL_CLIENT_ID
   read -r -s -p 'Sandbox Client Secret: ' PAYPAL_CLIENT_SECRET
   export PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
   npm run dev
   ```

   Open **http://localhost:8080**. Use one stable app origin throughout checkout. Never commit credentials or share the business app secret with the buyer. `GEMINI_API_KEY` is required for the cafe replanning demo; the non-cafe samples and payment slice do not need it. The sandbox personal buyer login is separate from these app credentials.

If PayPal reports **Funds not available**, configure a funded test buyer in **Testing Tools → Sandbox Accounts → Create account → Create Custom Account**. Choose **Personal**, **United States**, and a **USD 1,000 test balance**. Log out of the previous buyer on PayPal sandbox, then retry from Till using this buyer. Keep the merchant app credentials unchanged. If an existing account's balance cannot be edited, **Duplicate Account** supports editing the cloned balance. See [PayPal's sandbox account guide](https://developer.paypal.com/sandbox-testing/accounts). No real deposit is needed.

If PayPal shows a credit/debit-card form, select **Log In** and use the **personal sandbox buyer**, rather than guest card checkout. If that buyer asks for a funding card after sign-in, use [PayPal's sandbox test-card generator](https://developer.paypal.com/sandbox-testing/card-testing) and add the generated test card to the buyer **only on www.sandbox.paypal.com**. Keep all card details within PayPal; Till and its agent never receive them. Then approve the order and return to Till.

If the checkout URL contains `/checkoutweb/signup`, you are creating an account during checkout. Return to **Log In** with the personal buyer already created in Developer Dashboard; its generated credentials are separate from your regular PayPal login and the app's Client ID/Secret. Once signed in, start a fresh checkout in Till. A frozen checkout expires after three hours, so an old approval URL cannot complete the app's capture checks. Keep buyer credentials, phone numbers and verification codes out of Till and chat.

## Cafe restock replan

Add `GEMINI_API_KEY` privately to the gitignored root `.env`, without changing the existing PayPal values, and restart `npm run dev`. The loader reads it through the server environment only. The cafe server uses Google’s REST `generateContent` endpoint with `gemini-3.5-flash-lite`, a current stable Flash model with a documented free tier ([model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [pricing](https://ai.google.dev/gemini-api/docs/pricing)). The key goes in the request header, never the URL. Each **Write the cart/Replan** click makes one capped Gemini Flash-Lite request; there is no background replanning or model fallback.

1. Click **Cafe restock**. The mandate is **“Restock a cafe: oat milk, beans, and cups, under $180, Counter Supply only.”** Start with every catalog item in stock: leave **Mark 500-count cups out of stock** unchecked. Click **Write the cart**. The model sees only product IDs, integer-cent prices, merchant and stock, plus these mandate constraints.
2. The first payable cart must contain one oat milk ($24), one beans ($72) and one 500-count cup pack ($64): **$160**, inside **$180**. The smaller pack is visibly refused: **“The 500-count cups are in stock and fit the cap.”** Premium cups cost $128, making a $224 restock, and are refused for breaking $180. Review is available for this complete cart, but the stock-out demo proceeds without paying it.
3. Under **Demo supplier**, check **Mark 500-count cups out of stock**. Only that stock flag changes; the previous proposal clears. Click **Replan**. The fresh payable cart must contain one oat milk ($24), one beans ($72) and one smaller cup pack ($18): **$114**. The 500-count cups are now refused as **out of stock**; premium cups remain refused for the **$224/$180 cap**. Keep the checkbox checked.
4. Removing a line recalculates the display, but an incomplete restock cannot be paid. Click **Replan** to restore the complete cart; adding or replacing items also requires Replan.
5. Click **Review PayPal checkout** for the recovered $114 cart. The checkout shows the **$180** mandate and **$114** total. Acknowledge the cart, then **Continue to PayPal · $114.00**. Stop at PayPal for the personal sandbox buyer to approve. PayPal returns through the server callback, which matches the order token and cart version and records that return in signed checkout state before redirecting to Till. A capture POST without that recorded return is refused. Keep stock unchanged and the server running during approval. The receipt must show a new order ID, one capture, both statuses, $114.00 and the three recovered items. Refresh checks that same order without another capture.

Stock is server-owned and shared across this demo process. Every cafe product defaults to in stock; only the 500-count cups have a demo mutation control. Restarting the process resets stock. Prices and merchants come from the catalog, never the browser or model. The server requires exactly three distinct lines at quantity one: oat, beans and the stock-selected cup pack. In-stock 500-count cups that fit the cap are the only accepted cup; after their stock-out, only the smaller pack is accepted. Another cup choice, a second pack, missing item, unknown/foreign line or over-cap total fails validation with **“Could not replan. Retry.”** No model output is repaired into a canned cart. A stock revision change during inference fails safely.

Historical **old $120 mandate** acceptance was verified on October 5, 2026 in local dev and the production preview: a fresh $114 cart, stock-change replan, visible premium refusal, and removal to $96. Replan restored the removed smaller cups to $114. Desktop/mobile checks made zero PayPal requests. This is an older result; the current $180 judge path starts at $160, and an incomplete cafe cart cannot be paid.

Missing `GEMINI_API_KEY`, provider failures or malformed output show **“Could not replan. Retry.”** No canned cafe cart appears. Gemini has no payment tool and can only repeat the server's predetermined three-item cart; it cannot swap the accepted cup. The server writes the summary and refusal reasons. Only the buyer’s checkout click creates an order. A server-signed proposal binds product IDs, quantities, catalog prices, budget and stock revision; the browser cannot invent replacements. Capture follows this order: check the frozen cart and cafe proposal/current stock, await any PayPal token refresh, check the active checkout generation and cafe stock revision again, then send capture immediately with no intervening await. A revision change before that final check refuses capture and requires Replan, including a change during token refresh after buyer approval. Creation also checks cafe stock before and after token acquisition. CAPTURE intent, USD amounts/items, merchant, frozen-cart validation, APPROVED requirement and stable request IDs are preserved; the return gate, snapshot revocation and final transport guards are added. Dinner, repair, gift and travel planning remain as before.

The proof and inventory belong to this demo server process; restarting it invalidates uncompleted cafe proposals and unfinished checkouts, so Replan and review again after restart. Completed receipt refresh within an active checkout session is GET-only and bypasses the stock guard, since changed stock cannot erase an actual payment. Use the independent PayPal GET below if that session was lost. No new credentials or database are added. The earlier $160 order `8J567318K9210721P` remains historical evidence. Independent PayPal GET verified the historical **old $120 mandate** buyer-approved $114 order `7GH61487DG719402X` and its sole capture `1DR45640TU8797836`, both COMPLETED, on October 5, 2026. Items match beans $72, smaller cups $18 and oat milk $24; neither 500-count cups nor premium cups was charged. The buyer confirmed receipt refresh retained these IDs, statuses and total; a subsequent independent GET still showed exactly one unchanged capture. This old-cap transaction is not the current live demo path.

The revised **$180** story has real buyer-approved sandbox evidence: order `2TB52773F8180315G` and its sole capture `3H158002EX0446249` are both **COMPLETED for USD 114.00**, independently verified by PayPal GET on October 5, 2026. Items are exactly one beans ($72), one smaller cup pack ($18) and one oat milk ($24). The buyer confirmed receipt refresh retained these IDs, statuses and total; a post-refresh independent GET still showed exactly one unchanged capture. The earlier order evidence above remains unchanged.

## Run the sandbox purchase

1. Click **Sunday dinner**. The existing sample cart costs **$61**, below its **$90** cap. Its fictional catalog vendors do not create multiple PayPal payees. Cafe restock now uses its genuine replanned cart for this same checkout after the demo stock change; the completed $160 cafe payment remains historical verification evidence below.
2. Optionally remove items, then click **Review PayPal checkout**.
3. Review the amount and acknowledge the cart. Click **Continue to PayPal**.
4. Till's server uses OAuth client credentials, creates one `CAPTURE` order with USD item amounts from the catalog, and sends you to PayPal's returned `payer-action` link (otherwise `approve`). Log in as the **personal sandbox buyer** and approve.
5. PayPal returns through `/api/paypal/checkout?paypal=return` with its order `token` and the frozen cart version. The server matches both, records the order return in signed state, and redirects to Till. Capture then requires that recorded return and the current server-held checkout generation. The server GETs the order and captures only if it is `APPROVED`, belongs to this checkout, and its amount, currency, items and cart version match the frozen cart. It uses the same stable `PayPal-Request-Id` for create and capture. No payee override is accepted.
6. The receipt displays the **PayPal order ID, capture ID, order status and capture status**, read back from PayPal. There is no local “Paid” label. `PENDING` is not presented as `COMPLETED`.

The delivery-note field is a demo note. This slice does not arrange shipping, calculate tax, or change the payment amount through shipping preferences.

## Verify the outcomes

- **Receipt refresh:** refresh the receipt URL. This performs only a PayPal GET. It does not create or capture an order. Retrying an interrupted approval return checks the existing order first; a completed order is never captured again.
- **Cancel:** choose PayPal's return/cancel option rather than approving. Till shows cancellation and revokes the checkout in the server's process-local registry without calling capture. Returning to edit or creating a replacement revokes earlier signed generations too; replaying an old cookie, version and proposal cannot capture an approved old order.
- **Budget/edit refusal:** automated tests exercise over-budget carts, a changed budget, removed/changed items, changed versions, tampered cookies, and PayPal-side amount/item mismatches. They assert that capture is not called. The UI also prevents over-budget checkout. Server prices do not come from the browser.
- **Errors:** missing credentials and PayPal API errors appear visibly. There is no simulated success fallback. After a timeout, retry checks the existing order; it does not assume the payment failed or succeeded.
- **Local ledger:** localStorage stores mandate notes and order references only. Opening one requests a fresh server check. Legacy simulated entries cannot serve as payment proof.

To independently compare the receipt with PayPal's `GET /v2/checkout/orders/{id}`, use the same server environment and replace only the order ID below. This prints IDs and statuses, never credentials or payer details:

```bash
node scripts/with-app-env.mjs node --input-type=module <<'JS'
const orderId = 'PASTE_RECEIPT_ORDER_ID';
const tokenResponse = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});
if (!tokenResponse.ok) throw new Error(`OAuth HTTP ${tokenResponse.status}`);
const { access_token } = await tokenResponse.json();
const response = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
  headers: { Authorization: `Bearer ${access_token}` },
});
if (!response.ok) throw new Error(`Order GET HTTP ${response.status}`);
const order = await response.json();
console.log(JSON.stringify({
  orderId: order.id,
  orderStatus: order.status,
  captures: order.purchase_units?.flatMap(unit => unit.payments?.captures ?? []).map(capture => ({
    captureId: capture.id, captureStatus: capture.status, amount: capture.amount,
  })),
}, null, 2));
JS
```

## Checks and scope

```bash
npm run test:paypal
npm run test:cafe
npm test
npm run typecheck
npm run build
```

PayPal unit tests explicitly inject fake HTTP responses and use `UNIT-TEST-*` IDs. Passing them does **not** establish that a real sandbox buyer approved or that PayPal captured an actual sandbox order. See [project state](docs/PROJECT_STATE.md) for the current verification record.

Real sandbox acceptance was verified on October 5, 2026: cafe order `8J567318K9210721P` and capture `87D25249NG9449623` both returned `COMPLETED` for USD 160.00 from independent PayPal GET. The buyer confirmed receipt refresh retained those IDs; a subsequent GET still showed exactly one unchanged capture. Genuine cancellation and edited/over-budget refusal evidence are also recorded in project state. These are sandbox transactions with no real money.

There is no database. A signed, HttpOnly, SameSite cookie and a process-local registry retain **one active checkout generation per browser**, with the original three-hour lifetime. Cancellation or replacement revokes all earlier signed snapshots in that checkout session. A process restart invalidates unfinished checkout authority even with unchanged credentials; review a fresh checkout afterward, and Replan for cafe. App receipt lookup also requires the active session, so use the independent PayPal GET above for historical completed orders after session loss. Keep cookies and this tab's session storage enabled. Local ledger entries and missing, expired or revoked cookies cannot authorize capture. The same secret signs the frozen state server-side; changing credentials invalidates it.

The audit regressions in `checkout-audit.test.ts` reproduced direct capture without server return, cancelled/replaced-cookie replay, and stock changing during OAuth refresh on the old implementation. After the fix each refuses with HTTP 409 and zero mocked capture requests. These fixtures use injected HTTP only; they do not create real sandbox orders or establish new live payment acceptance.

Cafe stock replanning supplies a server-verified cart to the existing payment slice. No second PayPal merchant, invoices, payouts, authorization/void flow, database, roles or sponsor integration is included.

Implementation: `src/lib/till/paypal.server.ts`, `src/lib/till/checkout.server.ts`, `src/routes/api/paypal/checkout.ts`, and the existing `src/components/till/till-app.tsx`.
