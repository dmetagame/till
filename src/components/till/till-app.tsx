import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, LockKeyhole } from "lucide-react";
import {
  getProduct,
  listPresets,
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

type Phase = "brief" | "planning" | "review" | "pay" | "payment" | "done" | "ledger" | "cafe";

const STEPS = [
  "Reading the brief",
  "Scoring the catalog",
  "Dropping anything outside the mandate",
  "Preparing a one-time cart for your approval",
];

const SOURCE_LABEL: Record<PlanSource, string> = {
  preset: "Sample mandate",
  grok: "Planned with Grok",
  device: "Planned on this device",
  gemini: "Planned with Gemini Flash-Lite",
};

export function TillApp() {
  const planFn = useServerFn(planMandate);
  const [phase, setPhase] = useState<Phase>("cafe");
  const [brief, setBrief] = useState(CAFE_BRIEF);
  const [step, setStep] = useState(0);
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
  const checkoutKey = useRef("");
  const cafeProof = useRef<string | undefined>(undefined);
  const checkoutBusy = useRef(false);
  const token = useRef(0);
  const timers = useRef<number[]>([]);

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
      timers.current.forEach((id) => window.clearTimeout(id));
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

  function clearTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  async function begin(nextBrief: string, presetId: string | null) {
    const clean = nextBrief.trim();
    if (clean.length < 8) return;
    const run = ++token.current;
    clearTimers();
    checkoutKey.current = crypto.randomUUID();
    cafeProof.current = undefined;
    setPayment(null);
    setPaymentError(null);
    setBrief(clean);
    setStep(0);
    setAgreed(false);
    setRemoved([]);
    setFromLedger(false);
    setPhase("planning");
    STEPS.forEach((_, index) => {
      const id = window.setTimeout(() => {
        if (token.current === run) setStep(index);
      }, index * 420);
      timers.current.push(id);
    });
    const minWait = new Promise((resolve) => {
      const id = window.setTimeout(resolve, 1600);
      timers.current.push(id);
    });
    let next: Plan;
    if (presetId) {
      await minWait;
      next = planFromPreset(presetId, clean) ?? localPlan(clean);
    } else {
      const remote = planFn({ data: { brief: clean } }).catch(() => null);
      const [result] = await Promise.all([remote, minWait]);
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
    <div className="till-app">
      <header className="counter-masthead">
        <div className="counter-brand">
          <span className="counter-wordmark">
            Till<span className="text-teal">.</span>
          </span>
          <span className="ticket-label">The cafe counter</span>
        </div>
        <div className="counter-masthead-note">
          <span className="ticket-label">Restock within your rules</span>
          <button
            type="button"
            disabled={paymentBusy}
            onClick={() => setPhase("ledger")}
            className="ticket-text-button"
          >
            Local notes <span className="amount">{receipts.length}</span>
          </button>
        </div>
      </header>

      {paymentError ? (
        <p
          ref={paymentErrorRef}
          role="alert"
          tabIndex={-1}
          className="mt-6 rounded-2xl border border-ink/15 bg-card px-4 py-4 text-sm"
        >
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
                className="min-h-11 rounded-full bg-teal px-5 font-medium text-paper"
              >
                Retry check
              </button>
              <button
                type="button"
                onClick={() => void beforeEdit(() => setPhase("brief"))}
                className="min-h-11 rounded-full border border-ink/15 bg-card px-5 font-medium"
              >
                New mandate
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "brief" ? (
        <Brief
          brief={brief}
          budget={budgetPreview}
          onChange={setBrief}
          onStart={() => {
            if (isCafeMandate(brief)) setPhase("cafe");
            else void beforeEdit(() => void begin(brief, null));
          }}
          onPreset={(id, text) => {
            if (id === "cafe") {
              setBrief(text);
              setPhase("cafe");
            } else void beforeEdit(() => void begin(text, id));
          }}
        />
      ) : null}

      {phase === "cafe" ? (
        <CafeRestock
          brief={brief}
          onBack={() => setPhase("brief")}
          onCheckout={(proposal) => void reviewCafe(proposal)}
        />
      ) : null}

      {phase === "planning" ? <Planning brief={brief} step={step} /> : null}

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

function Brief({
  brief,
  budget,
  onChange,
  onStart,
  onPreset,
}: {
  brief: string;
  budget: number | null;
  onChange: (value: string) => void;
  onStart: () => void;
  onPreset: (id: string, brief: string) => void;
}) {
  const presets = listPresets();
  return (
    <div className="rise">
      <h1 className="font-display mt-10 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
        Write your mandate.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Till shops a catalog inside a mandate you write. You approve one checkout on PayPal; the
        server checks the frozen cart before capturing. The agent cannot approve or capture.
      </p>

      <form
        className="mt-8 rounded-2xl border border-ink/10 bg-card p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onStart();
        }}
      >
        <label htmlFor="brief" className="text-sm font-medium">
          Mandate
        </label>
        <textarea
          id="brief"
          value={brief}
          maxLength={500}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Weekend in Lisbon for two, under $400, prefer local makers."
          suppressHydrationWarning
          className="mt-2 w-full resize-none rounded-xl border border-ink/15 bg-paper px-3 py-3 text-base outline-none focus:border-teal"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted tabular-nums">
            {budget
              ? `Cap detected · ${money(budget)}`
              : "Name a dollar cap so the agent can stop itself."}
          </p>
          <button
            type="submit"
            disabled={brief.trim().length < 8}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-teal px-5 font-medium text-paper transition-transform duration-150 ease-out active:scale-95 disabled:opacity-40"
          >
            Write the cart
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      <div className="mt-6">
        <p className="text-sm font-medium text-muted">Or start from a sample</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => onPreset(preset.id, preset.brief)}
                className="flex min-h-11 w-full flex-col items-start rounded-2xl border border-ink/10 bg-card px-4 py-3 text-left transition-transform duration-150 ease-out active:scale-95"
              >
                <span className="font-medium">{preset.label}</span>
                <span className="text-sm text-muted">{preset.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-8 text-sm text-muted">
        PayPal sandbox · no real money. Catalog vendors are fictional; checkout pays one controlled
        sandbox merchant.
      </p>
    </div>
  );
}

function Planning({ brief, step }: { brief: string; step: number }) {
  return (
    <div className="rise mt-10">
      <p className="text-sm font-medium text-teal">Working the mandate</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">{brief}</h1>
      <ol className="mt-8 space-y-3">
        {STEPS.map((label, index) => {
          const state = index < step ? "done" : index === step ? "live" : "wait";
          return (
            <li key={label} className="flex items-center gap-3 text-base">
              <span
                className={`grid size-6 place-items-center rounded-full text-xs ${
                  state === "wait" ? "bg-ink/10 text-muted" : "bg-teal text-paper"
                } ${state === "live" ? "step-live" : ""}`}
              >
                {index + 1}
              </span>
              <span className={state === "wait" ? "text-muted" : "text-ink"}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
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
  const ratio =
    plan.budgetCents > 0 ? Math.min(100, Math.round((total / plan.budgetCents) * 100)) : 0;
  const left = plan.budgetCents - total;
  return (
    <div className="rise mt-10">
      <p className="text-sm font-medium text-teal">{SOURCE_LABEL[plan.source]}</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight">{plan.title}</h1>
      <p className="mt-3 text-muted">{plan.summary}</p>

      <ul className="mt-6 flex flex-wrap gap-2">
        {plan.rules.map((rule) => (
          <li key={rule} className="rounded-full border border-ink/10 bg-card px-3 py-1 text-sm">
            {rule}
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm text-muted">Against the cap</p>
          <p className="font-display text-2xl tabular-nums">{money(total)}</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-teal" style={{ width: `${ratio}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted tabular-nums">
          {left >= 0 ? `${money(left)} left unspent` : `${money(Math.abs(left))} over the cap`}
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-ink/10 bg-card px-4 py-6 text-muted">
          The cart is empty, so nothing will be charged. You can only remove items — adding one
          would rewrite the mandate.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
          {lines.map((line) => {
            const product = getProduct(line.productId);
            if (!product) return null;
            return (
              <li key={line.productId} className="flex gap-3 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {product.name}
                    {line.qty > 1 ? <span className="text-muted"> × {line.qty}</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {product.merchant} · {product.lead}
                  </p>
                  <p className="mt-1 text-sm">{line.why}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <p className="tabular-nums">{money(product.price * line.qty)}</p>
                  <button
                    type="button"
                    onClick={() => onRemove(line.productId)}
                    className="min-h-11 text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {plan.rejected.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm font-medium">Left off on purpose</p>
          <ul className="mt-2 space-y-2">
            {plan.rejected.map((item) => {
              const product = getProduct(item.productId);
              if (!product) return null;
              return (
                <li key={item.productId} className="text-sm text-muted">
                  <span className="text-ink">{product.name}.</span> {item.reason}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-muted">
        You can take items off. You cannot add — that would rewrite the mandate.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={lines.length === 0 || total > plan.budgetCents}
          onClick={onPay}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-teal px-5 font-medium text-paper transition-transform duration-150 ease-out active:scale-95 disabled:opacity-40"
        >
          <LockKeyhole className="size-4" aria-hidden="true" />
          Review PayPal checkout
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-card px-5 font-medium transition-transform duration-150 ease-out active:scale-95"
        >
          Rewrite the brief
        </button>
      </div>
    </div>
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
    <div className="rise mt-10">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Ledger</h1>
      <p className="mt-3 text-muted">
        Local mandate notes and order references, not payment records. Open a reference to check the
        current checkout against PayPal.
      </p>
      {receipts.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-ink/10 bg-card px-4 py-6 text-muted">
          No local mandate references yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <button
                type="button"
                onClick={() => onOpen(receipt)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span>
                  <span className="block font-medium">{receipt.title}</span>
                  <span className="text-sm text-muted">{receipt.id}</span>
                </span>
                <span className="tabular-nums">{money(receipt.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-card px-5 font-medium transition-transform duration-150 ease-out active:scale-95"
      >
        Back
      </button>
    </div>
  );
}
