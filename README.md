# Till

Till proposes a cart inside a spending mandate. This slice replaces simulated checkout with a real **PayPal sandbox** order: create, redirect for buyer approval, server recheck, then capture. The agent cannot approve, change the payee, raise the budget, or capture.

**PayPal sandbox · no real money.** All purchases go to the one sandbox business merchant that owns the configured REST app. Catalog vendor names are fictional labels, never PayPal payees. The existing mandate UI, sample carts, visual design and Grok planning remain in place.

## Judge setup

Use Node 22.18+ and npm. No additional payment SDK or application dependency is needed.

1. Sign into the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) with an ordinary developer account.
2. Under **Apps & Credentials**, select **Sandbox** and create a REST app linked to a **Business sandbox account** you control. That account is the only merchant. Copy this app's sandbox Client ID and Secret, not live credentials.
3. Under **Testing Tools → Sandbox Accounts**, create or select one **Personal sandbox account**, distinct from the merchant. Use its sandbox email and password when PayPal asks the buyer to log in. Give it sufficient test balance for the $160 cafe sample. Sandbox accounts do not require a PayPal employee account.
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

   Start (or restart) the local server with `npm run dev`. The startup wrapper loads only these two root-file variables into the server process. The PayPal client reads them through `process.env`; neither uses a `VITE_` prefix or enters the browser bundle. Existing process environment variables take precedence. If you prefer process environment variables instead of a file, these Bash prompts avoid shell history:

   ```bash
   read -r -p 'Sandbox Client ID: ' PAYPAL_CLIENT_ID
   read -r -s -p 'Sandbox Client Secret: ' PAYPAL_CLIENT_SECRET
   export PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
   npm run dev
   ```

   Open **http://localhost:8080**. Use one stable app origin throughout checkout. Never commit credentials or share the business app secret with the buyer. Grok's optional `XAI_API_KEY` is not needed for the cafe sample. The sandbox personal buyer login is separate from these app credentials.

If PayPal reports **Funds not available**, configure a funded test buyer in **Testing Tools → Sandbox Accounts → Create account → Create Custom Account**. Choose **Personal**, **United States**, and a **USD 1,000 test balance**. Log out of the previous buyer on PayPal sandbox, then retry from Till using this buyer. Keep the merchant app credentials unchanged. If an existing account's balance cannot be edited, **Duplicate Account** supports editing the cloned balance. See [PayPal's sandbox account guide](https://developer.paypal.com/sandbox-testing/accounts). No real deposit is needed.

## Run the sandbox purchase

1. Click **Cafe restock**. Its unchanged sample cart has beans ($72), oat milk ($24), and cups ($64): **$160**, below its **$220** cap. Its two fictional catalog vendors do not create two PayPal payees.
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
npm test
npm run typecheck
npm run build
```

PayPal unit tests explicitly inject fake HTTP responses and use `UNIT-TEST-*` IDs. Passing them does **not** establish that a real sandbox buyer approved or that PayPal captured an actual sandbox order. See [project state](docs/PROJECT_STATE.md) for the current verification record.

There is no database. A signed, HttpOnly, SameSite cookie retains **one active checkout per browser**, with a three-hour lifetime. It survives server restarts with unchanged credentials. New checkout replaces that cookie; older local ledger entries and missing/expired cookies cannot be used to authorize capture or independently verify an old receipt in the app. Keep cookies and this tab's session storage enabled. The independent PayPal GET above remains the way to inspect older orders. The same secret signs the frozen state server-side; changing credentials invalidates it.

No stock replanning, AI changes, second PayPal merchant, invoices, payouts, authorization/void flow, database, roles, or sponsor integration is included.

Implementation: `src/lib/till/paypal.server.ts`, `src/lib/till/checkout.server.ts`, `src/routes/api/paypal/checkout.ts`, and the existing `src/components/till/till-app.tsx`.
