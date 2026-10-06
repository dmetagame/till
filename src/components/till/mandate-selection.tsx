import { ArrowRight, Gift, MapPinned, PencilLine, Smartphone, Utensils } from "lucide-react";
import { money, parseBudget } from "@/lib/till/catalog";
import { CounterIllustration } from "./cafe-graphics";
import { MANDATES, scenarioFor, type MandateKind } from "./mandate-config";

const MARKS = {
  dinner: Utensils,
  screen: Smartphone,
  gift: Gift,
  travel: MapPinned,
  custom: PencilLine,
};

export function MandateSelection({ onChoose }: { onChoose: (kind: MandateKind) => void }) {
  const cafe = scenarioFor("cafe");
  return (
    <main
      className="mandate-selection rise"
      data-till-view
      tabIndex={-1}
      aria-labelledby="selection-title"
    >
      <div className="selection-heading">
        <p className="ticket-label">A job. A cap. Your approval.</p>
        <h1 id="selection-title">Choose a mandate.</h1>
        <p className="ticket-note">Start from a sample, or write a brief of your own.</p>
      </div>
      <div className="selection-layout">
        <section className="order-ticket selection-feature" aria-labelledby="selection-cafe">
          <div className="ticket-heading">
            <p className="ticket-label">The live stock demo</p>
            <span className="ticket-mark" aria-hidden="true">
              T.
            </span>
          </div>
          <div className="selection-feature-art">
            <CounterIllustration />
          </div>
          <h2 id="selection-cafe">
            Keep the
            <br />
            <span>counter stocked.</span>
          </h2>
          <p className="ticket-note">
            Oat milk, beans and cups. One demo supplier. A stock-out changes the ticket.
          </p>
          <div className="selection-feature-action ticket-tear">
            <p>
              <span className="ticket-label">Cafe cap</span>
              <br />
              <span className="amount">{money(parseBudget(cafe.brief)!)}</span>
            </p>
            <button
              type="button"
              onClick={() => onChoose("cafe")}
              className="counter-button plan-button"
            >
              Cafe restock <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
        <section className="order-ticket selection-list" aria-labelledby="selection-others">
          <h2 id="selection-others" className="ticket-label">
            Another job for Till
          </h2>
          <ul>
            {MANDATES.filter((scenario) => scenario.kind !== "cafe").map((scenario) => {
              const Icon = MARKS[scenario.kind as keyof typeof MARKS];
              const budget = parseBudget(scenario.brief);
              return (
                <li key={scenario.kind}>
                  <button
                    type="button"
                    onClick={() => onChoose(scenario.kind)}
                    className="mandate-choice"
                  >
                    <span className="mandate-choice-mark">
                      <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <span className="mandate-choice-copy">
                      <span className="mandate-choice-name">{scenario.label}</span>
                      <span className="ticket-note">{scenario.hint}</span>
                      {budget ? (
                        <span className="choice-cap amount">{money(budget)} cap</span>
                      ) : null}
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <p className="selection-footer ticket-note">
        PayPal sandbox · no real money. Demo catalog labels; one controlled sandbox merchant.
      </p>
    </main>
  );
}
