import { ArrowRight } from "lucide-react";
import { money } from "@/lib/till/catalog";
import { MandateIllustration } from "./mandate-graphics";
import { scenarioFor, type MandateKind } from "./mandate-config";

export function MandateComposer({
  kind,
  brief,
  budget,
  onChange,
  onStart,
  onBack,
}: {
  kind: MandateKind;
  brief: string;
  budget: number | null;
  onChange: (value: string) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const scenario = scenarioFor(kind);
  const sample = Boolean(scenario.presetId && brief.trim() === scenario.brief);
  const heading =
    brief.trim() === scenario.brief ? scenario.heading : scenarioFor("custom").heading;
  return (
    <main
      className="mandate-composer rise"
      data-till-view
      tabIndex={-1}
      aria-labelledby="composer-title"
    >
      <section
        className="order-ticket mandate-ticket composer-ticket"
        aria-labelledby="composer-title"
      >
        <div className="ticket-heading">
          <p className="ticket-label">{scenario.label} / your mandate</p>
          <span className="ticket-mark" aria-hidden="true">
            T.
          </span>
        </div>
        <div className="mandate-composition composer-composition">
          <h1 id="composer-title" className="mandate-title composer-title">
            {heading.map((word, i) => (
              <span className={i === heading.length - 1 ? "text-teal" : ""} key={word}>
                {word}
                {i < heading.length - 1 ? <br /> : null}
              </span>
            ))}
          </h1>
          <div className="mandate-art">
            <MandateIllustration kind={kind} />
          </div>
        </div>
        <form
          className="mandate-form"
          onSubmit={(event) => {
            event.preventDefault();
            onStart();
          }}
        >
          <label htmlFor="brief" className="ticket-label">
            The brief — edit before writing
          </label>
          <textarea
            id="brief"
            value={brief}
            maxLength={500}
            rows={3}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Name the job, your dollar cap, and what to leave out."
            aria-describedby="mandate-cap-note"
          />
          <div className="composer-boundary">
            <div>
              <p className="ticket-label">Your dollar cap</p>
              <p className="amount mandate-cap">{budget ? money(budget) : "Not set"}</p>
            </div>
            <p id="mandate-cap-note" className="ticket-note">
              {budget ? "The cart must fit this cap." : "Include a dollar cap in your brief."}
            </p>
          </div>
          <div className="ticket-tear mandate-action">
            <button
              type="submit"
              disabled={brief.trim().length < 8}
              className="counter-button plan-button"
            >
              Write the cart <ArrowRight size={18} aria-hidden="true" />
            </button>
            <p className="ticket-note">
              A proposal first. <br />
              Your approval on PayPal.
            </p>
          </div>
        </form>
      </section>
      <aside className="supplier-slip mandate-guide" aria-labelledby="guide-title">
        <p className="ticket-label text-teal">
          {sample ? "Sample cart · prewritten" : "Custom brief · catalog planning"}
        </p>
        <h2 id="guide-title">
          A ticket
          <br />
          inside your rules.
        </h2>
        <p className="ticket-note guide-source">
          {sample
            ? "This untouched sample loads its original cart. No model request is needed."
            : "Till tries model planning. If unavailable, it uses local catalog rules and labels the result."}
        </p>
        <ol className="mandate-path">
          <li>
            <span aria-hidden="true">1</span>
            <div>
              <p>Write the cart</p>
              <p className="ticket-note">See what fits your brief.</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">2</span>
            <div>
              <p>Review the ticket</p>
              <p className="ticket-note">Remove items; inspect refusals.</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">3</span>
            <div>
              <p>Approve on PayPal</p>
              <p className="ticket-note">One checkout, approved by you.</p>
            </div>
          </li>
        </ol>
        <p className="guide-demo ticket-note">
          {kind === "travel"
            ? "Demo travel catalog. No room, transit pass or trip is booked."
            : kind === "screen"
              ? "Demo repair catalog. No appointment or repair is arranged."
              : "Demo catalog labels. No delivery is arranged."}
          <br />
          PayPal sandbox · no real money.
        </p>
        <button type="button" onClick={onBack} className="ticket-text-button">
          Choose another mandate
        </button>
      </aside>
    </main>
  );
}
