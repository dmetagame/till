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

1. Click **Cafe restock**, then **Write the cart**. The server supplies the current Counter Supply demo catalog to Gemini Flash-Lite, with only product IDs, integer-cent prices, merchant and stock, plus the mandate constraints.
2. The original oat milk ($24), beans ($72) and 500-count cups ($64) total **$160**. With the chosen **$120** mandate, those cups are budget-refused from the start. The smaller 100-count pack costs **$18**, allowing all three needs for **$114**. The premium case costs **$128** ($224 with milk/beans) and is visibly refused for the dollar cap.
3. Under the labeled **Demo supplier** control, check **Mark 500-count cups out of stock** and leave it checked. Unchecking it restores stock and disables this checkout demo. The previous proposal clears. Click **Replan**: the 500-count pack is now refused for current stock, premium cups remain refused for budget, and a fresh compliant smaller-pack proposal can appear. If the model cannot propose a complete restock that passes validation, the server refuses the whole cart.
4. Remove any proposed line to recalculate the displayed total. Adding or replacing items requires **Replan**.
5. After marking the 500-count cups unavailable and receiving the fresh $114 proposal, click **Review PayPal checkout**. The existing checkout shows $114 and the $120 mandate. Acknowledge the cart, then **Continue to PayPal · $114.00**. Approve with your personal sandbox buyer; only the server captures on return. Keep stock unchanged during this one approval. The receipt shows the new order/capture IDs and statuses from PayPal; refresh checks that same order without another capture.

Stock is owned by the server and shared across this demo process. Every cafe catalog product defaults to in stock; only the 500-count cups have a demo mutation control. Restarting the process resets stock. Prices and merchants come from the catalog, not the browser or model. The server drops unknown/foreign/out-of-stock/over-cap lines, recalculates totals, and rejects incomplete restocks. A stock revision change during the model call fails safely and requires another replan.

Live-model acceptance was verified on October 5, 2026 in local dev and the production preview: a fresh $114 cart, stock-change replan, visible premium refusal, and removal to $96. Replan restored the removed smaller cups to $114. Desktop/mobile checks made zero PayPal requests.

Missing `GEMINI_API_KEY`, provider failures or malformed output show **“Could not replan. Retry.”** No canned cafe cart appears. Gemini has no payment tool. Only the buyer’s checkout click creates an order through the existing handler. A server-signed proposal binds product IDs, quantities, catalog prices, budget and stock revision; the browser cannot invent replacements. Before creation and immediately before the existing capture POST, a separate cafe guard rechecks the proof, Counter Supply, current catalog prices and stock. Any stock revision change requires Replan and blocks capture, including a change after PayPal approval. The order body, frozen-cart/cookie checks, approval requirement, idempotency and capture sequence remain unchanged. Dinner, repair, gift and travel behavior remain as before.

The proof and inventory belong to this demo server process; restarting it invalidates uncompleted cafe proposals, so Replan after restart. Completed receipt refresh is GET-only and bypasses the stock guard, since changed stock cannot erase an actual payment. No new credentials or database are added. The earlier $160 order `8J567318K9210721P` remains historical evidence. Independent PayPal GET verified the new buyer-approved $114 order `7GH61487DG719402X` and its sole capture `1DR45640TU8797836`, both COMPLETED, on October 5, 2026. Items match beans $72, smaller cups $18 and oat milk $24; neither 500-count cups nor premium cups was charged. Buyer confirmation of receipt refresh remains pending.

## Run the sandbox purchase

1. Click **Sunday dinner**. The existing sample cart costs **$61**, below its **$90** cap. Its fictional catalog vendors do not create multiple PayPal payees. Cafe restock now uses its genuine replanned cart for this same checkout after the demo stock change; the completed $160 cafe payment remains historical verification evidence below.
2. Optionally remove items, then click **Review PayPal checkout**.
3. Review the amount and acknowledge the cart. Click **Continue to PayPal**.
4. Till's server uses OAuth client credentials, creates one `CAPTURE` order with USD item amounts from the catalog, and sends you to PayPal's returned `payer-action` link (otherwise `approve`). Log in as the **personal sandbox buyer** and approve.
5. PayPal returns you to Till. The server GETs that order and captures only if it is `APPROVED`, belongs to this checkout, and its amount, currency, items and cart version match the server's frozen cart. It uses the same stable `PayPal-Request-Id` for create and capture. No payee override is accepted.
6. The receipt displays the **PayPal order ID, capture ID, order status and capture status**, read back from PayPal. There is no local “Paid” label. `PENDING` is not presented as `COMPLETED`.

The delivery-note field is a demo note. This slice does not arrange shipping, calculate tax, or change the payment amount through shipping preferences.

## Verify the outcomes

- **Receipt refresh:** refresh the receipt URL. This performs only a PayPal GET. It does not create or capture an order. Retrying an interrupted approval return checks the existing order first; a completed order is never captured again.
- **Cancel:** choose PayPal's return/cancel option rather than approving. Till shows cancellation, marks the frozen checkout cancelled, and does not call capture. Returning to edit a pending cart also invalidates that checkout.
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

There is no database. A signed, HttpOnly, SameSite cookie retains **one active checkout per browser**, with a three-hour lifetime. It survives server restarts with unchanged credentials. New checkout replaces that cookie; older local ledger entries and missing/expired cookies cannot be used to authorize capture or independently verify an old receipt in the app. Keep cookies and this tab's session storage enabled. The independent PayPal GET above remains the way to inspect older orders. The same secret signs the frozen state server-side; changing credentials invalidates it.

Cafe stock replanning is isolated from the completed payment slice. No second PayPal merchant, invoices, payouts, authorization/void flow, database, roles or sponsor integration is included.

Implementation: `src/lib/till/paypal.server.ts`, `src/lib/till/checkout.server.ts`, `src/routes/api/paypal/checkout.ts`, and the existing `src/components/till/till-app.tsx`.
