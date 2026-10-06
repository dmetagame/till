import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole } from "lucide-react";
import {
  getProduct,
  localPlan,
  money,
  parseBudget,
  planFromPreset,
  type Plan,
  type PlanSource,
} from "@/lib/till/catalog";
import { planMandate } from "@/lib/till/plan.functions";
import { loadReceipts, saveReceipts, type Receipt } from "@/lib/till/ledger";
import type { CheckoutCart, PayPalReceipt } from "@/lib/till/checkout";
import { CAFE_BRIEF, isCafeMandate, type CafePlan } from "@/lib/till/cafe";
import { CafeRestock } from "./cafe-restock";
import { MandateSelection } from "./mandate-selection";
import { MandateComposer } from "./mandate-composer";
import { MandateIllustration } from "./mandate-graphics";
import { OrderTicket, RefusalLines } from "./order-ticket";
import { kindForBrief, scenarioFor, type MandateKind } from "./mandate-config";

const PENDING_CHECKOUT = "till.paypal.pending.v1";
type PendingCheckout = { cart: CheckoutCart; notes: Receipt };

async function paypalRequest(
  body?: object,
  orderId?: string,
): Promise<{
  receipt?: PayPalReceipt;
  approvalUrl?: string;
  orderId?: string;
  cartVersion?: string;
}> {
  const url = orderId
    ? `/api/paypal/checkout?orderId=${encodeURIComponent(orderId)}`
    : "/api/paypal/checkout";
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.error ?? "PayPal checkout could not be verified.");
  return result;
}

function receiptNotes(payment: PayPalReceipt, notes?: Receipt): Receipt {
  return {
    id: payment.orderId,
    at: notes?.at ?? Date.now(),
    title: payment.title,
    brief: payment.brief,
    summary: notes?.summary ?? "Your cart at Till’s controlled PayPal sandbox merchant.",
    rules: notes?.rules ?? [`Spend at most ${money(payment.budgetCents)}`],
    lines: payment.lines.map((line) => ({
      ...line,
      merchant: getProduct(line.productId)?.merchant ?? "Demo catalog",
      why: "",
    })),
    rejected: notes?.rejected ?? [],
    total: payment.totalCents,
    budgetCents: payment.budgetCents,
    address: notes?.address ?? "Delivery not arranged in this sandbox",
    source: notes?.source ?? "preset",
  };
}

type Phase =
  "mandates" | "brief" | "planning" | "review" | "pay" | "payment" | "done" | "ledger" | "cafe";

const SOURCE_LABEL: Record<PlanSource, string> = {
  preset: "Sample cart · prewritten",
  grok: "Grok proposal",
  device: "Local catalog rules · model unavailable",
  gemini: "Gemini proposal · server-validated",
};

export function TillApp() {
  const planFn = useServerFn(planMandate);
  const [phase, setPhase] = useState<Phase>("cafe");
  const [brief, setBrief] = useState(CAFE_BRIEF);
  const [draftKind, setDraftKind] = useState<MandateKind>("cafe");
  const [draftPreset, setDraftPreset] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [address, setAddress] = useState("14 Mercer Street, Apt 4, New York, NY 10013");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [active, setActive] = useState<Receipt | null>(null);
  const [fromLedger, setFromLedger] = useState(false);
  const [payment, setPayment] = useState<PayPalReceipt | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const paymentErrorRef = useRef<HTMLParagraphElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const checkoutKey = useRef("");
  const cafeProof = useRef<string | undefined>(undefined);
  const checkoutBusy = useRef(false);
  const token = useRef(0);

  useEffect(() => {
    if (!["mandates", "brief", "review", "planning", "ledger"].includes(phase)) return;
    appRef.current?.querySelector<HTMLElement>("[data-till-view]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [phase]);

  useEffect(() => {
    if (!paymentError) return;
    paymentErrorRef.current?.focus({ preventScroll: true });
    paymentErrorRef.current?.scrollIntoView({ block: "center" });
  }, [paymentError]);

  useEffect(() => {
    setReceipts(loadReceipts());
    const query = new URLSearchParams(window.location.search);
    const outcome = query.get("paypal");
    if (outcome) {
      setPhase("payment");
      setPaymentBusy(true);
      void (async () => {
        try {
          let pending: PendingCheckout | undefined;
          try {
            const raw = window.sessionStorage.getItem(PENDING_CHECKOUT);
            pending = raw ? (JSON.parse(raw) as PendingCheckout) : undefined;
          } catch {
            // Local notes are optional for a GET-only receipt. Missing cart data cannot authorize capture.
          }
          if (outcome === "cancel") {
            await paypalRequest({ action: "cancel", cartVersion: query.get("cartVersion") });
            if (pending) restoreCart(pending);
            throw new Error("PayPal checkout was cancelled. Till did not request a capture.");
          }
          const orderId = query.get("token");
          if (!orderId)
            throw new Error("PayPal did not return an order ID. No capture was attempted.");
          let result;
          if (outcome === "return") {
            if (!pending)
              throw new Error(
                "The checkout cart is missing from this tab. No capture was attempted.",
              );
            result = await paypalRequest({
              action: "capture",
              orderId,
              cartVersion: query.get("cartVersion"),
              cart: pending.cart,
            });
          } else if (outcome === "receipt") {
            result = await paypalRequest(undefined, orderId);
          } else {
            throw new Error("Unknown PayPal return. No capture was attempted.");
          }
          if (!result.receipt) throw new Error("PayPal did not return a verified receipt.");
          showReceipt(result.receipt, pending?.notes);
        } catch (error) {
          setPaymentError(
            error instanceof Error ? error.message : "PayPal checkout could not be verified.",
          );
        } finally {
          setPaymentBusy(false);
        }
      })();
    }
    return () => {
      token.current += 1;
    };
  }, []);

  function restoreCart(pending: PendingCheckout) {
    checkoutKey.current = pending.cart.checkoutKey;
    cafeProof.current = pending.cart.cafeProof;
    setPlan({
      title: pending.notes.title,
      brief: pending.cart.brief,
      summary: pending.notes.summary,
      rules: pending.notes.rules,
      lines: pending.notes.lines.map((line) => ({
        productId: line.productId,
        qty: line.qty,
        why: line.why,
      })),
      rejected: [],
      budgetCents: pending.cart.budgetCents,
      source: pending.notes.source,
    });
    setBrief(pending.cart.brief);
    setRemoved([]);
    setAgreed(false);
    setPhase("review");
  }

  function showReceipt(verified: PayPalReceipt, notes?: Receipt) {
    const receipt = receiptNotes(verified, notes);
    setPayment(verified);
    setActive(receipt);
    setPaymentError(null);
    setFromLedger(false);
    setPhase("done");
    window.history.replaceState(
      null,
      "",
      `/?paypal=receipt&token=${encodeURIComponent(verified.orderId)}`,
    );
    // The local ledger is only a convenience index; never use its contents as payment evidence.
    const next = [receipt, ...loadReceipts().filter((item) => item.id !== receipt.id)].slice(0, 12);
    setReceipts(next);
    try {
      saveReceipts(next);
    } catch {
      /* PayPal evidence remains available if local storage is full. */
    }
  }

  async function beforeEdit(edit: () => void) {
    if (checkoutBusy.current) return;
    try {
      // Invalidate the browser's frozen checkout even if this tab lost its local draft.
      await paypalRequest({ action: "cancel" });
      window.sessionStorage.removeItem(PENDING_CHECKOUT);
      checkoutKey.current = crypto.randomUUID();
      setPayment(null);
      setPaymentError(null);
      window.history.replaceState(null, "", "/");
      edit();
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "Could not invalidate the frozen checkout.",
      );
    }
  }

  const budgetPreview = parseBudget(brief);

  function openMandates() {
    token.current += 1;
    void beforeEdit(() => setPhase("mandates"));
  }

  function chooseMandate(kind: MandateKind) {
    const scenario = scenarioFor(kind);
    setDraftKind(kind);
    setDraftPreset(scenario.presetId);
    setBrief(scenario.brief);
    setPhase(kind === "cafe" ? "cafe" : "brief");
  }

  async function begin(nextBrief: string, presetId: string | null) {
    const clean = nextBrief.trim();
    if (clean.length < 8) return;
    const run = ++token.current;
    checkoutKey.current = crypto.randomUUID();
    cafeProof.current = undefined;
    setPayment(null);
    setPaymentError(null);
    setBrief(clean);
    setAgreed(false);
    setRemoved([]);
    setFromLedger(false);
    setPhase("planning");
    let next: Plan;
    if (presetId) {
      next = planFromPreset(presetId, clean) ?? localPlan(clean);
    } else {
      const result = await planFn({ data: { brief: clean } }).catch(() => null);
      next = result && result.ok ? result.plan : localPlan(clean);
    }
    if (token.current !== run) return;
    setPlan(next);
    setPhase("review");
  }

  async function reviewCafe(proposal: CafePlan) {
    if (!proposal.checkoutProof || !proposal.lines.length) return;
    await beforeEdit(() => {
      checkoutKey.current = proposal.checkoutProof!.checkoutKey;
      cafeProof.current = proposal.checkoutProof!.token;
      setPlan({
        title: "Cafe restock",
        brief,
        summary: proposal.summary,
        budgetCents: proposal.budgetCents,
        rules: [
          `Spend at most ${money(proposal.budgetCents)}`,
          "Counter Supply only",
          "In-stock catalog items only",
        ],
        lines: proposal.lines,
        rejected: proposal.refused.map(({ productId, reason }) => ({ productId, reason })),
        source: "gemini",
      });
      setRemoved([]);
      setAgreed(false);
      setPhase("pay");
    });
  }

  function visibleLines() {
    if (!plan) return [];
    return plan.lines.filter(
      (line) => !removed.includes(line.productId) && getProduct(line.productId),
    );
  }

  function totalOf(lines: ReturnType<typeof visibleLines>) {
    return lines.reduce(
      (sum, line) => sum + (getProduct(line.productId)?.price ?? 0) * line.qty,
      0,
    );
  }

  async function checkout() {
    if (!plan || !agreed || checkoutBusy.current) return;
    const lines = visibleLines().flatMap((line) => {
      const product = getProduct(line.productId);
      if (!product) return [];
      return [
        {
          productId: product.id,
          name: product.name,
          merchant: product.merchant,
          qty: line.qty,
          price: product.price,
          why: line.why,
        },
      ];
    });
    if (lines.length === 0) return;
    const receipt: Receipt = {
      id: "Pending checkout",
      at: Date.now(),
      title: plan.title,
      brief: plan.brief,
      summary: plan.summary,
      rules: plan.rules,
      lines,
      rejected: plan.rejected.flatMap((item) => {
        const product = getProduct(item.productId);
        return product ? [{ name: product.name, reason: item.reason }] : [];
      }),
      total: lines.reduce((sum, line) => sum + line.price * line.qty, 0),
      budgetCents: plan.budgetCents,
      address: address.trim() || "No address given",
      source: plan.source,
    };
    checkoutBusy.current = true;
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const cart: CheckoutCart = {
        checkoutKey: checkoutKey.current || (checkoutKey.current = crypto.randomUUID()),
        title: plan.title,
        brief: plan.brief,
        budgetCents: plan.budgetCents,
        lines: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        ...(cafeProof.current ? { cafeProof: cafeProof.current } : {}),
      };
      window.sessionStorage.setItem(PENDING_CHECKOUT, JSON.stringify({ cart, notes: receipt }));
      const result = await paypalRequest({ action: "create", cart });
      if (result.receipt) {
        showReceipt(result.receipt, receipt);
      } else if (result.approvalUrl) {
        window.location.assign(result.approvalUrl);
      } else {
        throw new Error("PayPal did not return a buyer approval link.");
      }
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "PayPal checkout could not be started.",
      );
    } finally {
      checkoutBusy.current = false;
      setPaymentBusy(false);
    }
  }

  async function openLocalReceipt(receipt: Receipt) {
    setActive(receipt);
    setPayment(null);
    setPaymentError(null);
    setFromLedger(true);
    setPhase("done");
    setPaymentBusy(true);
    try {
      const result = await paypalRequest(undefined, receipt.id);
      if (!result.receipt) throw new Error("PayPal did not return a verified receipt.");
      setPayment(result.receipt);
      setActive(receiptNotes(result.receipt, receipt));
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "This local reference could not be checked against PayPal.",
      );
    } finally {
      setPaymentBusy(false);
    }
  }

  return (
    <div ref={appRef} className="till-app">
      <header className="counter-masthead">
        <div className="counter-brand">
          <span className="counter-wordmark">
            Till<span className="text-teal">.</span>
          </span>
          <span className="ticket-label">
            {phase === "mandates" || phase === "ledger"
              ? "Your mandate"
              : scenarioFor(
                  phase === "cafe"
                    ? "cafe"
                    : phase === "brief"
                      ? draftKind
                      : kindForBrief(plan?.brief ?? active?.brief ?? brief),
                ).context}
          </span>
        </div>
        <div className="counter-masthead-note">
          <span className="ticket-label">One cart. Your approval.</span>
          <div className="counter-nav">
            <button
              type="button"
              disabled={paymentBusy}
              onClick={openMandates}
              className="ticket-text-button"
            >
              Mandates
            </button>
            <button
              type="button"
              disabled={paymentBusy}
              onClick={() => {
                token.current += 1;
                setPhase("ledger");
              }}
              className="ticket-text-button"
            >
              Local notes <span className="amount">{receipts.length}</span>
            </button>
          </div>
        </div>
      </header>

      {paymentError ? (
        <p ref={paymentErrorRef} role="alert" tabIndex={-1} className="counter-alert">
          {paymentError}
        </p>
      ) : null}

      {phase === "payment" ? (
        <div className="payment-slip rise" aria-live="polite">
          <p className="text-sm font-medium text-teal">PayPal sandbox · no real money</p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight">
            {paymentBusy ? "Checking PayPal" : "Checkout not confirmed"}
          </h1>
          <p className="mt-3 text-muted">
            {paymentBusy
              ? "The server is checking your frozen cart and PayPal’s order status."
              : "No successful payment is being reported. Retry checks the existing PayPal order."}
          </p>
          {!paymentBusy ? (
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="counter-button payment-button"
              >
                Retry check
              </button>
              <button
                type="button"
                onClick={() => void beforeEdit(() => setPhase("brief"))}
                className="ticket-text-button"
              >
                New mandate
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "mandates" ? <MandateSelection onChoose={chooseMandate} /> : null}

      {phase === "brief" ? (
        <MandateComposer
          kind={draftKind}
          brief={brief}
          budget={budgetPreview}
          onChange={setBrief}
          onBack={openMandates}
          onStart={() => {
            if (isCafeMandate(brief)) setPhase("cafe");
            else
              void beforeEdit(
                () =>
                  void begin(
                    brief,
                    draftPreset && brief.trim() === scenarioFor(draftKind).brief
                      ? draftPreset
                      : null,
                  ),
              );
          }}
        />
      ) : null}

      {phase === "cafe" ? (
        <CafeRestock
          brief={brief}
          onBack={openMandates}
          onCheckout={(proposal) => void reviewCafe(proposal)}
        />
      ) : null}

      {phase === "planning" ? <Planning brief={brief} onBack={openMandates} /> : null}

      {phase === "review" && plan ? (
        <Review
          plan={plan}
          lines={visibleLines()}
          total={totalOf(visibleLines())}
          onRemove={(id) => void beforeEdit(() => setRemoved((current) => [...current, id]))}
          onPay={() => {
            setAgreed(false);
            setPhase("pay");
          }}
          onBack={() => void beforeEdit(() => setPhase("brief"))}
        />
      ) : null}

      {phase === "pay" && plan ? (
        <Pay
          plan={plan}
          lines={visibleLines()}
          total={totalOf(visibleLines())}
          address={address}
          agreed={agreed}
          onAddress={setAddress}
          onAgreed={setAgreed}
          busy={paymentBusy}
          onBack={() =>
            void beforeEdit(() => setPhase(plan.source === "gemini" ? "cafe" : "review"))
          }
          onCheckout={() => void checkout()}
        />
      ) : null}

      {phase === "done" && active ? (
        <Done
          receipt={active}
          fromLedger={fromLedger}
          payment={payment}
          checking={paymentBusy}
          onNew={() =>
            void beforeEdit(() => {
              setBrief("");
              setPlan(null);
              setPhase("brief");
            })
          }
          onLedger={() => setPhase("ledger")}
        />
      ) : null}

      {phase === "ledger" ? (
        <Ledger
          receipts={receipts}
          onOpen={(receipt) => void openLocalReceipt(receipt)}
          onBack={() => setPhase(active ? "done" : "brief")}
        />
      ) : null}
    </div>
  );
}

function Planning({ brief, onBack }: { brief: string; onBack: () => void }) {
  const budget = parseBudget(brief);
  return (
    <main
      className="planning-ticket rise"
      data-till-view
      tabIndex={-1}
      aria-labelledby="planning-title"
    >
      <div className="order-ticket pending-slip">
        <div className="ticket-heading">
          <p className="ticket-label">Custom brief / proposal pending</p>
          <span className="ticket-mark" aria-hidden="true">
            T.
          </span>
        </div>
        <h1 id="planning-title">Waiting for a model proposal.</h1>
        <div role="status" className="writing-status">
          <span className="writing-motif" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p>No cart is payable while this request is pending.</p>
        </div>
        <div className="pending-brief">
          <p className="ticket-label">Your brief</p>
          <p>{brief}</p>
        </div>
        {budget ? (
          <div className="pending-cap">
            <p className="ticket-label">Your dollar cap</p>
            <p className="amount">{money(budget)}</p>
          </div>
        ) : null}
        <div className="ticket-tear pending-footer">
          <p className="ticket-note">
            If the model is unavailable, Till uses local catalog rules and labels the result.
          </p>
          <button type="button" onClick={onBack} className="ticket-text-button">
            Choose another mandate
          </button>
        </div>
      </div>
    </main>
  );
}

function Review({
  plan,
  lines,
  total,
  onRemove,
  onPay,
  onBack,
}: {
  plan: Plan;
  lines: Plan["lines"];
  total: number;
  onRemove: (id: string) => void;
  onPay: () => void;
  onBack: () => void;
}) {
  const kind = kindForBrief(plan.brief);
  return (
    <main
      className="mandate-review rise"
      data-till-view
      tabIndex={-1}
      aria-labelledby="review-title"
    >
      <header className="review-heading">
        <div>
          <p className="ticket-label text-teal">{SOURCE_LABEL[plan.source]}</p>
          <h1 id="review-title">{plan.title}</h1>
          <p className="cart-summary">{plan.summary}</p>
        </div>
        <div className="review-art">
          <MandateIllustration kind={kind} />
        </div>
      </header>
      <div className="section-heading">
        <h2>Your order ticket</h2>
        <span className="proposal-label">Proposal · not a payment</span>
      </div>
      <div className="cart-layout">
        <OrderTicket
          lines={lines.flatMap((line) => {
            const product = getProduct(line.productId);
            return product
              ? [
                  {
                    ...line,
                    name: product.name,
                    unitCents: product.price,
                    detail: `${product.merchant} · ${product.lead}`,
                  },
                ]
              : [];
          })}
          totalCents={total}
          budgetCents={plan.budgetCents}
          onRemove={onRemove}
        />
        <aside className="cart-annotations">
          <div className="ticket-rules">
            <h3 className="ticket-label">Your boundaries</h3>
            <ul>
              {plan.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
          <RefusalLines
            items={plan.rejected.flatMap((item) => {
              const product = getProduct(item.productId);
              return product ? [{ ...item, name: product.name }] : [];
            })}
          />
          <p className="cart-provenance">
            {plan.source === "preset"
              ? "Original sample cart. No model request."
              : plan.source === "device"
                ? "Local catalog rules. The model was unavailable; this is a rules-based result."
                : plan.source === "gemini"
                  ? "Gemini proposal checked against the server catalog."
                  : "Grok proposal checked against catalog rules."}
          </p>
          <p className="ticket-note">
            Remove a line to spend less. Rewrite the brief to add or restore one.
          </p>
        </aside>
      </div>
      <div className="payment-handoff">
        <p className="ticket-label">PayPal sandbox · no real money</p>
        <button
          type="button"
          disabled={lines.length === 0 || total > plan.budgetCents}
          onClick={onPay}
          className="counter-button payment-button"
        >
          <LockKeyhole size={16} aria-hidden="true" /> Review PayPal checkout ·{" "}
          <span className="amount">{money(total)}</span>
        </button>
        <p className="ticket-note">Review opens a separate payment slip. No payment yet.</p>
      </div>
      <footer className="counter-footer">
        <button type="button" onClick={onBack} className="ticket-text-button">
          Rewrite the brief
        </button>
        <p>Demo catalog labels. No delivery is arranged.</p>
      </footer>
    </main>
  );
}

function Pay({
  plan,
  lines,
  total,
  address,
  agreed,
  onAddress,
  onAgreed,
  onBack,
  onCheckout,
  busy,
}: {
  plan: Plan;
  lines: Plan["lines"];
  total: number;
  address: string;
  agreed: boolean;
  onAddress: (value: string) => void;
  onAgreed: (value: boolean) => void;
  onBack: () => void;
  onCheckout: () => void;
  busy: boolean;
}) {
  return (
    <main className="payment-slip rise" aria-labelledby="payment-title">
      <div className="payment-slip-heading">
        <span className="ticket-label">PayPal sandbox · no real money</span>
        <span className="ticket-mark" aria-hidden="true">
          T.
        </span>
      </div>
      <h1 id="payment-title" className="payment-title">
        Review this ticket.
      </h1>
      <p className="ticket-note">{plan.title} · one-time checkout</p>
      <div className="payment-amount-row">
        <div>
          <p className="ticket-label">Amount for approval</p>
          <p className="amount payment-amount">{money(total)}</p>
        </div>
        <p className="approval-stamp">
          Buyer approval
          <br />
          required
        </p>
      </div>
      <ul className="payment-items" aria-label="Checkout items">
        {lines.map((line) => {
          const product = getProduct(line.productId);
          return product ? (
            <li key={line.productId}>
              <span>
                {product.name}
                {line.qty > 1 ? ` × ${line.qty}` : ""}
              </span>
              <span className="amount">{money(product.price * line.qty)}</span>
            </li>
          ) : null;
        })}
      </ul>
      <dl className="payment-parties">
        <div>
          <dt>Payee</dt>
          <dd>Till’s controlled sandbox merchant</dd>
        </div>
        <div>
          <dt>Your cap</dt>
          <dd className="amount">{money(plan.budgetCents)}</dd>
        </div>
      </dl>
      <p className="payment-explanation">
        You approve this exact cart on PayPal sandbox. When you return, the server rechecks the
        frozen cart and current stock before capture. The agent cannot approve or pay.
      </p>
      {plan.source !== "gemini" ? (
        <div className="payment-delivery">
          <label htmlFor="address" className="ticket-label">
            Delivery note · demo only
          </label>
          <input
            id="address"
            value={address}
            disabled={busy}
            onChange={(event) => onAddress(event.target.value)}
          />
          <p className="ticket-note">No delivery is arranged. Catalog suppliers are fictional.</p>
        </div>
      ) : (
        <p className="ticket-note">
          Counter Supply is a demo catalog, not a separate PayPal payee. No delivery is arranged.
        </p>
      )}
      <label className="payment-acknowledgement">
        <input
          type="checkbox"
          checked={agreed}
          disabled={busy}
          onChange={(event) => onAgreed(event.target.checked)}
        />
        <span>
          I reviewed this cart. I’ll approve payment on PayPal; a new purchase needs a new mandate.
        </span>
      </label>
      <div className="payment-actions ticket-tear">
        <button
          type="button"
          disabled={busy || !agreed || lines.length === 0 || total <= 0 || total > plan.budgetCents}
          onClick={onCheckout}
          className="counter-button payment-button"
        >
          {busy ? (
            "Opening PayPal…"
          ) : (
            <>
              Continue to PayPal · <span className="amount">{money(total)}</span>
            </>
          )}
        </button>
        <button type="button" onClick={onBack} disabled={busy} className="ticket-text-button">
          Send back to the ticket
        </button>
      </div>
      <p className="ticket-note payment-footnote">
        Sandbox test funds only. Payment status comes from PayPal.
      </p>
    </main>
  );
}

function Done({
  receipt,
  fromLedger,
  payment,
  checking,
  onNew,
  onLedger,
}: {
  receipt: Receipt;
  fromLedger: boolean;
  payment: PayPalReceipt | null;
  checking: boolean;
  onNew: () => void;
  onLedger: () => void;
}) {
  const when = new Date(receipt.at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <main className="payment-slip receipt-slip rise" aria-labelledby="receipt-title">
      <div className="payment-slip-heading">
        <span className="ticket-label">PayPal sandbox · no real money</span>
        <span className="ticket-mark" aria-hidden="true">
          T.
        </span>
      </div>
      <h1 id="receipt-title" className="payment-title">
        {receipt.title}
      </h1>
      <p className="ticket-note">
        {when} ·{" "}
        {checking
          ? "Checking PayPal…"
          : payment
            ? "Checked against PayPal"
            : "Local mandate · payment not verified"}
        {fromLedger ? " · From your local notes" : ""}
      </p>
      <div className="payment-amount-row">
        <div>
          <p className="ticket-label">{payment ? "PayPal order amount" : "Local cart amount"}</p>
          <p className="amount payment-amount">{money(receipt.total)}</p>
        </div>
        {payment ? <span className="approval-stamp">{payment.orderStatus}</span> : null}
      </div>
      {payment ? (
        <dl className="payment-identifiers">
          <div>
            <dt>PayPal order ID</dt>
            <dd>{payment.orderId}</dd>
          </div>
          <div>
            <dt>PayPal order status</dt>
            <dd>{payment.orderStatus}</dd>
          </div>
          <div>
            <dt>PayPal capture ID</dt>
            <dd>{payment.captureId ?? "None — no capture returned by PayPal"}</dd>
          </div>
          <div>
            <dt>PayPal capture status</dt>
            <dd>{payment.captureStatus ?? "Not captured"}</dd>
          </div>
        </dl>
      ) : null}
      <ul className="payment-items" aria-label="Receipt items">
        {receipt.lines.map((line) => (
          <li key={line.productId}>
            <span>
              {line.name}
              {line.qty > 1 ? ` × ${line.qty}` : ""}
            </span>
            <span className="amount">{money(line.price * line.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="payment-explanation">
        Only the PayPal IDs and statuses above are payment evidence. The agent proposed catalog
        items; you approved on PayPal and the server checked the frozen cart.
      </p>
      <p className="ticket-note">Catalog labels are fictional. No delivery is arranged.</p>
      <div className="payment-actions ticket-tear">
        <button type="button" onClick={onNew} className="counter-button plan-button">
          New mandate
        </button>
        <button type="button" onClick={onLedger} className="ticket-text-button">
          Open local notes
        </button>
      </div>
    </main>
  );
}

function Ledger({
  receipts,
  onOpen,
  onBack,
}: {
  receipts: Receipt[];
  onOpen: (receipt: Receipt) => void;
  onBack: () => void;
}) {
  return (
    <main className="local-notes rise" data-till-view tabIndex={-1} aria-labelledby="notes-title">
      <p className="ticket-label">Saved on this device</p>
      <h1 id="notes-title">Local notes.</h1>
      <p className="cart-summary">
        Mandate notes and order references, not payment records. Open a reference to check the
        current checkout against PayPal.
      </p>
      <div className="order-ticket notes-ticket">
        {receipts.length ? (
          <ul>
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <button type="button" onClick={() => onOpen(receipt)}>
                  <span>
                    <span className="notes-name">{receipt.title}</span>
                    <span className="ticket-note notes-id">{receipt.id}</span>
                  </span>
                  <span className="amount">{money(receipt.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-ticket">
            No local mandate references yet. A PayPal receipt appears only after server
            verification.
          </p>
        )}
      </div>
      <button type="button" onClick={onBack} className="ticket-text-button notes-back">
        Back
      </button>
    </main>
  );
}
