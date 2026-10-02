# Till

A buyer agent that shops inside a mandate you write. Checkout is still simulated. The next slice is a real PayPal sandbox order: create, buyer approval, server recheck, then capture.

App code lives in `src/components/till` and `src/lib/till`. PayPal credentials stay server-only (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`). Do not prefix them with `VITE_` and do not commit them.

```bash
npm install
npm run dev
```
