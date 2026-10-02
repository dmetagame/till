import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";
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

type Phase = "brief" | "planning" | "review" | "pay" | "done" | "ledger";

const STEPS = [
  "Reading the brief",
  "Scoring the catalog",
  "Dropping anything outside the mandate",
  "Drafting a one-time PayPal authorization",
];

const SOURCE_LABEL: Record<PlanSource, string> = {
  preset: "Sample mandate",
  grok: "Planned with Grok",
  device: "Planned on this device",
};

export function TillApp() {
  const planFn = useServerFn(planMandate);
  const [phase, setPhase] = useState<Phase>("brief");
  const [brief, setBrief] = useState("");
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [address, setAddress] = useState("14 Mercer Street, Apt 4, New York, NY 10013");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [active, setActive] = useState<Receipt | null>(null);
  const [fromLedger, setFromLedger] = useState(false);
  const token = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setReceipts(loadReceipts());
    return () => {
      token.current += 1;
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

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

  function visibleLines() {
    if (!plan) return [];
    return plan.lines.filter((line) => !removed.includes(line.productId) && getProduct(line.productId));
  }

  function totalOf(lines: ReturnType<typeof visibleLines>) {
    return lines.reduce((sum, line) => sum + (getProduct(line.productId)?.price ?? 0) * line.qty, 0);
  }

  function authorize() {
    if (!plan || !agreed) return;
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
      id: `TILL-${Date.now().toString(36).toUpperCase().slice(-6)}`,
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
    const next = [receipt, ...receipts].slice(0, 12);
    setReceipts(next);
    saveReceipts(next);
    setActive(receipt);
    setFromLedger(false);
    setPhase("done");
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-teal text-sm font-semibold text-paper">
            T
          </span>
          <div>
            <p className="font-display text-xl leading-none font-semibold tracking-tight">Till</p>
            <p className="text-sm text-muted">Buyer agent</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPhase("ledger")}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 bg-card px-4 text-sm font-medium transition-transform duration-150 ease-out active:scale-95"
        >
          <ScrollText className="size-4" aria-hidden="true" />
          Ledger
          <span className="tabular-nums text-muted">{receipts.length}</span>
        </button>
      </header>

      {phase === "brief" ? (
        <Brief
          brief={brief}
          budget={budgetPreview}
          onChange={setBrief}
          onStart={() => void begin(brief, null)}
          onPreset={(id, text) => void begin(text, id)}
        />
      ) : null}

      {phase === "planning" ? <Planning brief={brief} step={step} /> : null}

      {phase === "review" && plan ? (
        <Review
          plan={plan}
          lines={visibleLines()}
          total={totalOf(visibleLines())}
          onRemove={(id) => setRemoved((current) => [...current, id])}
          onPay={() => {
            setAgreed(false);
            setPhase("pay");
          }}
          onBack={() => setPhase("brief")}
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
          onBack={() => setPhase("review")}
          onAuthorize={authorize}
        />
      ) : null}

      {phase === "done" && active ? (
        <Done
          receipt={active}
          fromLedger={fromLedger}
          onNew={() => {
            setBrief("");
            setPlan(null);
            setPhase("brief");
          }}
          onLedger={() => setPhase("ledger")}
        />
      ) : null}

      {phase === "ledger" ? (
        <Ledger
          receipts={receipts}
          onOpen={(receipt) => {
            setActive(receipt);
            setFromLedger(true);
            setPhase("done");
          }}
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
        Spend only what you wrote down.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Till shops a catalog inside a mandate you write, then asks for a one-time PayPal authorization.
        When that charge settles, the agent’s access ends.
      </p>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["01", "You write the rules"],
          ["02", "The agent stays inside them"],
          ["03", "PayPal settles once"],
        ].map(([index, label]) => (
          <li key={index} className="rounded-2xl border border-ink/10 bg-card px-4 py-3">
            <p className="font-display text-sm text-teal">{index}</p>
            <p className="mt-1 font-medium">{label}</p>
          </li>
        ))}
      </ol>

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
            {budget ? `Cap detected · ${money(budget)}` : "Name a dollar cap so the agent can stop itself."}
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
        Checkout is a sandbox simulation for the PayPal AI Hackathon. No live charge is made.
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
  const ratio = plan.budgetCents > 0 ? Math.min(100, Math.round((total / plan.budgetCents) * 100)) : 0;
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
          The cart is empty, so nothing will be charged. You can only remove items — adding one would rewrite
          the mandate.
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

      <p className="mt-4 text-sm text-muted">You can take items off. You cannot add — that would rewrite the mandate.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onPay}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-teal px-5 font-medium text-paper transition-transform duration-150 ease-out active:scale-95 disabled:opacity-40"
        >
          <LockKeyhole className="size-4" aria-hidden="true" />
          Authorize with PayPal
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
  onAuthorize,
}: {
  plan: Plan;
  lines: Plan["lines"];
  total: number;
  address: string;
  agreed: boolean;
  onAddress: (value: string) => void;
  onAgreed: (value: boolean) => void;
  onBack: () => void;
  onAuthorize: () => void;
}) {
  const merchants = [
    ...new Set(lines.flatMap((line) => {
      const product = getProduct(line.productId);
      return product ? [product.merchant] : [];
    })),
  ];
  return (
    <div className="rise mt-10">
      <p className="text-sm font-medium text-teal">Sandbox · no live charge</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight">One-time authorization</h1>
      <p className="mt-3 text-muted">
        PayPal is asked to capture this cart and nothing else. The agent never sees a card, and the
        authorization dies with this charge.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-ink/10 bg-card">
        <div className="bg-teal px-5 py-4 text-paper">
          <p className="text-sm">Amount to capture</p>
          <p className="font-display text-4xl tabular-nums">{money(total)}</p>
        </div>
        <dl className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Payer</dt>
            <dd className="font-medium">You</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Agent</dt>
            <dd className="font-medium">Till, this cart only</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Payees</dt>
            <dd className="font-medium">{merchants.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Buyer protection</dt>
            <dd className="inline-flex items-center gap-1 font-medium">
              <ShieldCheck className="size-4 text-teal" aria-hidden="true" />
              On for these goods
            </dd>
          </div>
        </dl>
      </div>

      <label className="mt-4 block text-sm font-medium" htmlFor="address">
        Ship to
      </label>
      <input
        id="address"
        value={address}
        onChange={(event) => onAddress(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-ink/15 bg-card px-3 text-base outline-none focus:border-teal"
      />

      <ul className="mt-4 space-y-1 text-sm text-muted">
        {plan.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <label className="mt-5 flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => onAgreed(event.target.checked)}
          className="mt-1 size-4 accent-teal"
        />
        <span>This charge matches the mandate I wrote. Till may not spend again without a new one.</span>
      </label>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!agreed || lines.length === 0 || total <= 0}
          onClick={onAuthorize}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-teal px-5 font-medium text-paper tabular-nums transition-transform duration-150 ease-out active:scale-95 disabled:opacity-40"
        >
          Authorize {money(total)}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-card px-5 font-medium transition-transform duration-150 ease-out active:scale-95"
        >
          Send back
        </button>
      </div>
    </div>
  );
}

function Done({
  receipt,
  fromLedger,
  onNew,
  onLedger,
}: {
  receipt: Receipt;
  fromLedger: boolean;
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
    <div className="rise mt-10">
      <p className="text-sm font-medium text-teal">{fromLedger ? "From your ledger" : "Paid · sandbox"}</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight">{receipt.title}</h1>
      <p className="mt-2 text-sm text-muted tabular-nums">
        {receipt.id} · {when}
      </p>
      <p className="font-display mt-4 text-4xl tabular-nums">{money(receipt.total)}</p>
      <p className="mt-2 text-muted">{receipt.summary}</p>

      <ul className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
        {receipt.lines.map((line) => (
          <li key={line.productId} className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium">
                {line.name}
                {line.qty > 1 ? ` × ${line.qty}` : ""}
              </p>
              <p className="text-sm text-muted">{line.merchant}</p>
            </div>
            <p className="tabular-nums">{money(line.price * line.qty)}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card px-4 py-4">
        <p className="text-sm font-medium">What the agent was allowed to do</p>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          <li>Read the brief and locked the cart to it.</li>
          <li>Refused anything that broke a rule, instead of asking for more money.</li>
          <li>Requested one PayPal authorization for {money(receipt.total)}.</li>
          <li>Access ended when you approved. A new purchase needs a new mandate.</li>
        </ol>
        <p className="mt-3 text-sm">Ships to {receipt.address}</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-teal px-5 font-medium text-paper transition-transform duration-150 ease-out active:scale-95"
        >
          New mandate
        </button>
        <button
          type="button"
          onClick={onLedger}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-card px-5 font-medium transition-transform duration-150 ease-out active:scale-95"
        >
          Open ledger
        </button>
      </div>
    </div>
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
      <p className="mt-3 text-muted">Authorizations stay on this device. Nothing here is a live PayPal charge.</p>
      {receipts.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-ink/10 bg-card px-4 py-6 text-muted">
          No mandates settled yet.
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
