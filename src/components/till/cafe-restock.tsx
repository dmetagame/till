import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, RefreshCw } from "lucide-react";
import { money, parseBudget } from "@/lib/till/catalog";
import {
  CAFE_MAX_BUDGET,
  CAFE_REPLAN_ERROR,
  type CafeCatalog,
  type CafePlan,
} from "@/lib/till/cafe";
import { getCafeCatalog, replanCafe, setDemoCupsStock } from "@/lib/till/cafe.functions";
import { CounterIllustration, SupplierSeal, SupplyGlyph } from "./cafe-graphics";

export function CafeRestock({
  brief,
  onBack,
  onCheckout,
}: {
  brief: string;
  onBack: () => void;
  onCheckout: (plan: CafePlan) => void;
}) {
  const catalogFn = useServerFn(getCafeCatalog);
  const stockFn = useServerFn(setDemoCupsStock);
  const replanFn = useServerFn(replanCafe);
  const [catalog, setCatalog] = useState<CafeCatalog | null>(null);
  const [plan, setPlan] = useState<CafePlan | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const operation = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const ticketRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    void catalogFn()
      .then((snapshot) => {
        if (active) {
          setCatalog(snapshot);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError(CAFE_REPLAN_ERROR);
      });
    return () => {
      active = false;
    };
  }, [catalogFn]);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  useEffect(() => {
    if (plan) {
      ticketRef.current?.focus({ preventScroll: true });
      ticketRef.current?.scrollIntoView({ block: "start" });
    }
  }, [plan]);

  async function updateStock(cupsInStock: boolean) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setPlan(null);
    setRemoved([]);
    try {
      setCatalog(await stockFn({ data: { cupsInStock } }));
      setChanged(true);
    } catch {
      setError(CAFE_REPLAN_ERROR);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function replan() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setPlan(null);
    setRemoved([]);
    setAttempted(true);
    try {
      const result = await replanFn({ data: { brief } });
      setCatalog(result.catalog);
      if (result.ok) {
        setPlan(result.plan);
        setChanged(false);
      } else setError(CAFE_REPLAN_ERROR);
    } catch {
      setError(CAFE_REPLAN_ERROR);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const lines = plan?.lines.filter((line) => !removed.includes(line.productId)) ?? [];
  const total = lines.reduce(
    (sum, line) =>
      sum +
      (catalog?.products.find((product) => product.id === line.productId)?.priceCents ?? 0) *
        line.qty,
    0,
  );
  const budget = plan?.budgetCents ?? parseBudget(brief);
  const cupsInStock = catalog?.products.find((product) => product.id === "cups")?.inStock ?? true;
  const complete = lines.length === 3;

  return (
    <main className="counter-workspace" id="counter">
      <section className="order-ticket mandate-ticket" aria-labelledby="cafe-mandate">
        <div className="ticket-heading">
          <p className="ticket-label">Cafe restock / your mandate</p>
          <span className="ticket-mark" aria-hidden="true">
            T.
          </span>
        </div>
        <div className="mandate-composition">
          <h1 id="cafe-mandate" className="mandate-title">
            Oat milk,
            <br />
            beans
            <br />
            <span>&amp; cups.</span>
          </h1>
          <div className="mandate-art">
            <CounterIllustration />
          </div>
        </div>
        <p className="mandate-brief">{brief}</p>
        <div className="mandate-boundary">
          <div>
            <span className="ticket-label">Spend no more than</span>
            <p className="mandate-cap amount">{money(budget ?? CAFE_MAX_BUDGET)}</p>
          </div>
          <div className="mandate-supplier">
            <span className="ticket-label">One supplier</span>
            <p>Counter Supply only</p>
          </div>
        </div>
        <div className="ticket-tear mandate-action">
          <button
            type="button"
            disabled={busy || !catalog}
            onClick={() => void replan()}
            className="counter-button plan-button"
          >
            {attempted || changed ? (
              <RefreshCw size={18} aria-hidden="true" />
            ) : (
              <ArrowRight size={18} aria-hidden="true" />
            )}
            {busy ? "Writing the cart…" : attempted || changed ? "Replan" : "Write the cart"}
          </button>
          <p className="ticket-note">
            A proposal first.
            <br />
            You approve the payment.
          </p>
        </div>
      </section>

      <aside className="supplier-slip" aria-labelledby="supplier-title">
        <div className="supplier-title-row">
          <p className="ticket-label">Demo supplier</p>
          <span className="supplier-dot" aria-hidden="true" />
        </div>
        <div className="supplier-identity">
          <h2 id="supplier-title">
            Counter
            <br />
            Supply
          </h2>
          <SupplierSeal />
        </div>
        <p className="supplier-intro">A small catalog for the cafe counter.</p>
        <div
          className={`supplier-stock-drawing${catalog && !cupsInStock ? " is-unavailable" : ""}`}
          aria-hidden="true"
        >
          <SupplyGlyph productId="cups" />
          <div>
            <span className="ticket-label">500-count cups</span>
            <p>{!catalog ? "Checking stock" : cupsInStock ? "On the shelf." : "Off the shelf."}</p>
          </div>
        </div>
        <div className="supplier-stock">
          <p className="ticket-label">Try a stock-out</p>
          <label className="supplier-switch" htmlFor="cafe-stock">
            <span>
              500-count cups
              <br />
              <span className="ticket-note">Mark out of stock</span>
            </span>
            <input
              id="cafe-stock"
              type="checkbox"
              role="switch"
              aria-label="Mark 500-count cups out of stock"
              aria-describedby="cafe-stock-instructions"
              checked={!cupsInStock}
              disabled={busy || !catalog}
              onChange={(event) => void updateStock(!event.target.checked)}
            />
          </label>
          <p className="stock-fact" aria-live="polite">
            {!catalog
              ? "Loading supplier catalog…"
              : cupsInStock
                ? "500-count cups are in stock."
                : "500-count cups are out of stock."}
          </p>
          <p id="cafe-stock-instructions" className="ticket-note">
            Stock changes clear the cart. Replan for a fresh proposal. Shared demo stock.
          </p>
        </div>
        {catalog ? (
          <details className="supplier-catalog">
            <summary>
              Supplier catalog <span className="amount">{catalog.products.length} items</span>
            </summary>
            <ul aria-label="Demo supplier catalog">
              {catalog.products.map((product) => (
                <li key={product.id} className="supplier-product">
                  <div>
                    <p>{product.name}</p>
                    <span className="ticket-note">
                      {product.inStock ? "In stock" : "Out of stock"}
                    </span>
                  </div>
                  <span className="amount">{money(product.priceCents)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="supplier-footnote">
          The agent writes the ticket.
          <br />
          It cannot raise your cap or pay.
          <br />
          You approve on PayPal.
        </p>
      </aside>

      {error ? (
        <p ref={errorRef} role="alert" tabIndex={-1} className="counter-alert">
          {error}
        </p>
      ) : null}
      {busy ? (
        <div role="status" className="writing-status">
          <span className="writing-motif" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <p>Reading current stock.</p>
            <p className="ticket-note">Checking your cap. Writing a fresh ticket.</p>
          </div>
        </div>
      ) : null}
      {changed ? (
        <p role="status" className="counter-status">
          Stock changed. Replan to write a fresh ticket.
        </p>
      ) : null}

      {plan ? (
        <section
          ref={ticketRef}
          tabIndex={-1}
          className="cart-section"
          aria-label="Validated cafe proposal"
          aria-live="polite"
        >
          <div className="section-heading">
            <h2>Your order ticket</h2>
            <span className="proposal-label">Proposal · not a payment</span>
          </div>
          <p className="cart-summary">{plan.summary}</p>
          <div className="cart-layout">
            <div className="order-ticket cart-ticket">
              <div className="cart-column-labels ticket-label">
                <span>Item / one of each</span>
                <span>USD</span>
              </div>
              {lines.length ? (
                <ul className="cart-lines" aria-label="Proposed cart">
                  {lines.map((line) => {
                    const product = catalog?.products.find((item) => item.id === line.productId);
                    if (!product) return null;
                    return (
                      <li key={line.productId} className="cart-line">
                        <span className="cart-product-art">
                          <SupplyGlyph productId={product.id} />
                        </span>
                        <div className="cart-line-copy">
                          <p className="cart-item-name">
                            {product.name}
                            {line.qty > 1 ? ` × ${line.qty}` : ""}
                          </p>
                        </div>
                        <p className="amount cart-line-price">
                          {money(product.priceCents * line.qty)}
                        </p>
                        <div className="cart-line-detail">
                          <p className="cart-item-reason">{line.why}</p>
                          <button
                            type="button"
                            aria-label={`Remove ${product.name}`}
                            onClick={() => setRemoved((current) => [...current, product.id])}
                            className="ticket-text-button"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty-ticket">The ticket is empty. Nothing will be spent.</p>
              )}
              <div className="ticket-tear cart-total">
                <div>
                  <p className="ticket-label">Proposed total</p>
                  <p className="amount total-amount" data-testid="cafe-total">
                    {money(total)}
                  </p>
                </div>
                <p className="unspent">
                  <span className="amount">{money(plan.budgetCents - total)}</span>
                  <br />
                  under your cap
                </p>
              </div>
              <div className="budget-strip">
                <div className="budget-rule" aria-hidden="true">
                  <span style={{ transform: `scaleX(${Math.min(total / plan.budgetCents, 1)})` }} />
                </div>
                <p className="ticket-label">
                  {money(total)} of your {money(plan.budgetCents)} cap
                </p>
              </div>
            </div>

            <div className="cart-annotations">
              {plan.refused.length ? (
                <div className="refusal-section">
                  <h3 className="ticket-label">Left off the ticket</h3>
                  <ul aria-label="Catalog refusals" className="refusal-lines">
                    {plan.refused.map((item) => (
                      <li key={item.productId} className="refusal-line">
                        <span className="refusal-stamp">
                          {item.productId === "cups"
                            ? "Out of stock"
                            : item.productId === "cups-premium"
                              ? "Over cap"
                              : "Not needed"}
                        </span>
                        <div>
                          <p className="refusal-name">{item.name}</p>
                          <p>{item.reason}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="cart-provenance">
                Proposed with Gemini Flash-Lite. Catalog, stock and cap checked by the server.
              </p>
              <p className="ticket-note">
                Removing a line recalculates. Restock needs all three items; Replan to add or
                restore a line.
              </p>
            </div>
          </div>
          {plan.checkoutProof && !complete ? (
            <p id="cafe-checkout-blocked" className="counter-alert">
              Checkout needs one oat milk, one beans and exactly one cup pack. Click Replan.
            </p>
          ) : null}
          {lines.length && plan.checkoutProof ? (
            <div className="payment-handoff">
              <p className="ticket-label">PayPal sandbox · no real money</p>
              <button
                type="button"
                disabled={busy || !complete}
                aria-describedby={!complete ? "cafe-checkout-blocked" : undefined}
                onClick={() => onCheckout({ ...plan, lines, totalCents: total })}
                className="counter-button payment-button"
              >
                Review PayPal checkout · <span className="amount">{money(total)}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <p className="ticket-note">Review opens a separate payment slip. No payment yet.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="counter-footer">
        <button type="button" onClick={onBack} disabled={busy} className="ticket-text-button">
          Other mandates
        </button>
        <p>Counter Supply is a demo catalog.</p>
      </footer>
    </main>
  );
}
