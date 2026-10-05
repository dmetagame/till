import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, RefreshCw } from "lucide-react";
import { money, parseBudget } from "@/lib/till/catalog";
import { CAFE_REPLAN_ERROR, type CafeCatalog, type CafePlan } from "@/lib/till/cafe";
import { getCafeCatalog, replanCafe, setDemoCupsStock } from "@/lib/till/cafe.functions";

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
  const ratio = budget ? Math.min(100, Math.round((total / budget) * 100)) : 0;

  return (
    <div className="rise mt-10">
      <p className="text-sm font-medium text-teal">Demo supplier · Counter Supply</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight">Cafe restock</h1>
      <p className="mt-3 text-muted">{brief}</p>
      <p className="mt-2 text-sm text-muted">
        The agent proposes a cart. You review checkout and approve on PayPal sandbox.
      </p>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-4 sm:p-5">
        <p className="text-sm font-medium">Demo supplier</p>
        <p id="cafe-stock-instructions" className="mt-1 text-sm text-muted">
          For the checkout demo, keep this box checked and click Replan. Unchecking it
          puts the 500-count cups back in stock and disables checkout.
        </p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            aria-describedby="cafe-stock-instructions"
            checked={!cupsInStock}
            disabled={busy || !catalog}
            onChange={(event) => void updateStock(!event.target.checked)}
            className="size-5 accent-teal"
          />
          <span>Mark 500-count cups out of stock</span>
        </label>
        <p className="mt-1 text-sm text-muted" aria-live="polite">
          {!catalog
            ? "Loading the supplier catalog…"
            : `500-count cups: ${cupsInStock ? "in stock" : "out of stock"}.`}
        </p>
        {changed ? (
          <p className="mt-2 text-sm">Stock changed. Replan to get a fresh cart.</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void replan()}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-teal px-5 font-medium text-paper transition-transform duration-150 ease-out active:scale-95 disabled:opacity-40"
        >
          {attempted || changed ? (
            <RefreshCw className="size-4" aria-hidden="true" />
          ) : (
            <ArrowRight className="size-4" aria-hidden="true" />
          )}
          {busy ? "Checking the catalog…" : attempted || changed ? "Replan" : "Write the cart"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="min-h-11 rounded-full border border-ink/15 bg-card px-5 font-medium disabled:opacity-40"
        >
          Back to mandates
        </button>
      </div>

      {error ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mt-4 rounded-2xl border border-ink/15 bg-card px-4 py-4 text-sm"
        >
          {error}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-4 text-sm text-muted">
          Reading current stock and checking the dollar cap.
        </p>
      ) : null}

      {plan ? (
        <section className="mt-6" aria-label="Validated cafe proposal" aria-live="polite">
          <p className="text-sm font-medium text-teal">
            Planned with Gemini Flash-Lite · checked by the server
          </p>
          <p className="mt-2 text-muted">{plan.summary}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {[
              `Spend at most ${money(plan.budgetCents)}`,
              "Counter Supply only",
              "In-stock catalog items only",
            ].map((rule) => (
              <li
                key={rule}
                className="rounded-full border border-ink/10 bg-card px-3 py-1 text-sm"
              >
                {rule}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm text-muted">Against the cap</p>
              <p className="font-display text-2xl tabular-nums" data-testid="cafe-total">
                {money(total)}
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-teal" style={{ width: `${ratio}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted tabular-nums">
              {money(plan.budgetCents - total)} left unspent
            </p>
          </div>
          {lines.length ? (
            <ul
              className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card"
              aria-label="Proposed cart"
            >
              {lines.map((line) => {
                const product = catalog?.products.find((item) => item.id === line.productId);
                if (!product) return null;
                return (
                  <li key={line.productId} className="flex gap-3 px-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {product.name}
                        {line.qty > 1 ? ` × ${line.qty}` : ""}
                      </p>
                      <p className="text-sm text-muted">{product.merchant} · In stock</p>
                      <p className="mt-1 text-sm">{line.why}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <p className="tabular-nums">{money(product.priceCents * line.qty)}</p>
                      <button
                        type="button"
                        aria-label={`Remove ${product.name}`}
                        onClick={() => setRemoved((current) => [...current, product.id])}
                        className="min-h-11 text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl border border-ink/10 bg-card p-4 text-muted">
              No cart proposed. Nothing will be spent.
            </p>
          )}
          {plan.refused.length ? (
            <div className="mt-6">
              <p className="text-sm font-medium">Left off on purpose</p>
              <ul className="mt-2 space-y-2" aria-label="Catalog refusals">
                {plan.refused.map((item) => (
                  <li key={item.productId} className="text-sm text-muted">
                    <span className="text-ink">{item.name}.</span> {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 text-sm text-muted">
            Removing a line recalculates the total. To add or replace items, click Replan.
          </p>
          {plan.checkoutProof && cupsInStock ? (
            <p
              id="cafe-checkout-blocked"
              className="mt-4 rounded-2xl border border-ink/10 bg-card p-4 text-sm"
            >
              Checkout is disabled: 500-count cups are still in stock. Check “Mark
              500-count cups out of stock” above, leave it checked, then click Replan.
            </p>
          ) : null}
          {lines.length && plan.checkoutProof ? (
            <button
              type="button"
              disabled={busy || cupsInStock}
              aria-describedby={cupsInStock ? "cafe-checkout-blocked" : undefined}
              onClick={() => onCheckout({ ...plan, lines, totalCents: total })}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-teal px-5 font-medium text-paper disabled:opacity-40"
            >
              Review PayPal checkout · {money(total)}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </section>
      ) : null}

      {catalog ? (
        <section className="mt-8" aria-label="Demo supplier catalog">
          <p className="text-sm font-medium">Counter Supply catalog · demo inventory</p>
          <ul className="mt-3 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
            {catalog.products.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-sm text-muted">
                    {product.inStock ? "In stock" : "Out of stock"}
                  </p>
                </div>
                <p className="shrink-0 text-sm tabular-nums">{money(product.priceCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
