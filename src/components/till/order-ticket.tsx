import { useEffect, useRef } from "react";
import { money } from "@/lib/till/catalog";
import { ProductGlyph } from "./mandate-graphics";

export type TicketLine = {
  productId: string;
  name: string;
  qty: number;
  unitCents: number;
  why: string;
  detail?: string;
};

export function OrderTicket({
  lines,
  totalCents,
  budgetCents,
  onRemove,
  totalTestId,
  emptyMessage = "Rewrite the brief to start again.",
}: {
  lines: TicketLine[];
  totalCents: number;
  budgetCents: number;
  onRemove: (id: string) => void;
  totalTestId?: string;
  emptyMessage?: string;
}) {
  const ticket = useRef<HTMLDivElement>(null);
  const previousCount = useRef(lines.length);
  useEffect(() => {
    if (lines.length < previousCount.current) ticket.current?.focus({ preventScroll: true });
    previousCount.current = lines.length;
  }, [lines.length]);
  const left = budgetCents - totalCents;
  return (
    <div
      ref={ticket}
      tabIndex={-1}
      className="order-ticket cart-ticket"
      aria-label="Proposed cart ticket"
    >
      <div className="cart-column-labels ticket-label">
        <span>Item / quantity</span>
        <span>USD</span>
      </div>
      {lines.length ? (
        <ul className="cart-lines" aria-label="Proposed cart">
          {lines.map((line) => (
            <li key={line.productId} className="cart-line">
              <span className="cart-product-art">
                <ProductGlyph productId={line.productId} />
              </span>
              <div className="cart-line-copy">
                <p className="cart-item-name">
                  {line.name}
                  {line.qty > 1 ? ` × ${line.qty}` : ""}
                </p>
                {line.detail ? <p className="cart-item-detail">{line.detail}</p> : null}
              </div>
              <p className="amount cart-line-price">{money(line.unitCents * line.qty)}</p>
              <div className="cart-line-detail">
                <p className="cart-item-reason">{line.why}</p>
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onRemove(line.productId)}
                  className="ticket-text-button"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-ticket">The ticket is empty. Nothing will be spent. {emptyMessage}</p>
      )}
      <div className="ticket-tear cart-total" aria-live="polite" aria-atomic="true">
        <div>
          <p className="ticket-label">Proposed total</p>
          <p className="amount total-amount" data-testid={totalTestId}>
            {money(totalCents)}
          </p>
        </div>
        <p className={`unspent${left < 0 ? " over-cap" : ""}`}>
          <span className="amount">{money(Math.abs(left))}</span>
          <br />
          {left >= 0 ? "under your cap" : "over your cap"}
        </p>
      </div>
      <div className="budget-strip">
        <div className="budget-rule" aria-hidden="true">
          <span
            style={{
              transform: `scaleX(${budgetCents > 0 ? Math.min(totalCents / budgetCents, 1) : 0})`,
            }}
          />
        </div>
        <p className="ticket-label">
          {money(totalCents)} of your {money(budgetCents)} cap
        </p>
      </div>
    </div>
  );
}

function stamp(reason: string) {
  if (/out of stock/i.test(reason)) return "Out of stock";
  if (/in stock and fit/i.test(reason)) return "Not needed";
  if (/cap|budget|breaks|under \$|past \$/i.test(reason)) return "Over cap";
  if (/alcohol|wine/i.test(reason)) return "Banned";
  if (/plastic|batter/i.test(reason)) return "Material";
  if (/same.day|days|walk.in|today/i.test(reason)) return "Timing";
  if (/merchant|supplier|vendor/i.test(reason)) return "Supplier";
  return "Left off";
}

export function RefusalLines({
  items,
}: {
  items: { productId: string; name: string; reason: string }[];
}) {
  if (!items.length) return null;
  return (
    <div className="refusal-section">
      <h3 className="ticket-label">Left off the ticket</h3>
      <ul aria-label="Catalog refusals" className="refusal-lines">
        {items.map((item) => (
          <li key={item.productId} className="refusal-line">
            <span className="refusal-stamp">{stamp(item.reason)}</span>
            <div>
              <p className="refusal-name">{item.name}</p>
              <p>{item.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
