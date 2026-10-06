# Till — counter ticket

This is the source of truth for the frontend rebuild. Build one section at a time,
inspect it in a browser, and refine it against this document before moving on.
The user's specified Mystique Mide method governs the sequence; no installed
Mystique Mide skill was found in the local skill catalogs. The installed
frontend-design and interface-design skills supply the craft and review checks.

## Feel and audience

An independent cafe owner is standing at the counter, checking tomorrow's supplies.
Till should feel like a paper order ticket next to a payment receipt: direct,
warm, useful, and visibly bounded. Its job is to write a complete restock, show
what could not go on the ticket, and hand the reviewed cart to PayPal sandbox.

The physical vocabulary is order tickets, cup sleeves, receipt rolls, supplier
lists, ink stamps, and the cafe counter. The signature is the perforated ticket
with the running amount on its tear-off, plus stamped refusal lines. Carry that
through the mandate, cart, supplier slip, checkout and receipt. Avoid a fintech
dashboard, marketing hero, metric cards and feature-card grid.

## Type

- Display: **DM Serif Display**, regular; sharp contrast for the cafe mandate and
  Till wordmark. Mandate 72px / 1.02 on desktop, 44px / 1.05 at 390px. Use display
  type for words, never money or payment identifiers.
- Plain text: **IBM Plex Sans**, 400/500/600. Body 16px / 1.5, controls 16px / 1.25,
  support 14px / 1.5, ticket labels 12px / 1.4 with 0.08em tracking.
- Amounts: IBM Plex Sans, 500/600, tabular numerals. Total 36px / 1.1; row prices
  16px. Derive every amount from integer catalog cents via the existing formatter.
- Payment IDs wrap without truncation. No Inter. Load the two faces only; preserve
  readable serif/sans fallbacks if font loading fails.

## Colors and depth

| Token | Value | Use |
| --- | --- | --- |
| paper | #f3eee4 | Existing warm ground |
| card | #fffdf8 | Order ticket and separate slips |
| ink | #1c1915 | Primary words and PayPal continuation |
| muted | #6d665c | Supporting text |
| teal | #0e6b56 | Existing brand; planning actions and validated details |
| stamp | #854132 | Refusals and errors on paper |

Use ink at 15% for rules, 30% for stronger separators. Paper surfaces use a quiet
1px outline and a tiny offset shadow, not floating rounded dashboard cards.
Tickets have 2px corners; controls have 4px corners. The distinctive edge is a
small repeated perforation on the ticket's tear-off, not a decorative gradient.
Teal/paper and ink/paper buttons must exceed 4.5:1 contrast. Never reduce enabled
button opacity. Disabled controls have a distinct background and explicit text.

## Spacing and composition

Use a 4px base: 8px within labels, 12px between related controls, 16px between
rows, 24px between groups, 32px ticket padding, 48px between main sections.
Desktop workspace max-width 1120px, 32px outer padding. The main ticket takes
the larger column; the supplier slip is 304px, separated by 32px. A small
masthead has Till on the left and cafe context on the right, separated from the
workspace by an ink rule. No dashboard navigation or three equal cards.

At 390px use 16px outer padding, 20px ticket padding, one column, and no fixed
widths on content. The mandate and write action come before the supplier switch;
the switch remains easy to reach after writing the cart. Every control has a
44px minimum hit area. No horizontal scroll, overlapping prices, or cropped IDs.

## Voice

Use the cafe's job and catalog facts: "Write the cart", "Replan", "Demo supplier",
"Left off the ticket", "Review PayPal checkout", "Continue to PayPal". No
"AI-powered", fintech promises, stock guarantees, or invented settlement state.
Model/server provenance is secondary, visible once a real proposal exists.
Errors keep the exact "Could not replan. Retry." text. Refusals retain the
server's catalog reason; add an OUT OF STOCK or OVER CAP stamp without rewriting
the rule. Name the unavailable 500-count cups and the premium case's $180 cap.

## Path through the product

1. The public root opens cafe restock, with the existing full cafe brief,
   Counter Supply only, $180 cap, and one primary action: **Write the cart**.
   Other existing mandates and local notes stay available as secondary navigation.
   No cart appears before Gemini succeeds.
2. With 500-count cups in stock, show oat milk $24, beans $72 and cups $64;
   total $160. Server refusals show the smaller pack's preference reason and
   premium $224 cart breaking $180. Gemini cannot change the server's cup choice.
3. A native switch labeled **Demo supplier** marks only the 500-count cups
   unavailable. It immediately clears the proposal and payment continuation.
   Explain shared demo inventory without presenting a settings page.
4. **Replan** waits for a genuine Gemini proposal. Show the recovered three
   items including the $18 pack, total $114; stamp original cups OUT OF STOCK
   and premium OVER CAP. Do not manufacture a fallback on error. Remove still
   recalculates; an incomplete cart cannot continue, and additions require Replan.
5. **Review PayPal checkout** opens a separate slip, explicitly marked
   **PayPal sandbox · no real money**. It lists the exact cart and amount,
   one controlled sandbox merchant, acknowledgement and an ink-colored
   **Continue to PayPal** button. This has different styling from teal Replan.
   Keep the existing create/return/capture client flow; do not add an agent or
   manual capture capability. No payment request happens when opening review.
6. Return/error/receipt states use the same payment slip. Receipt status and
   IDs come only from the existing verified PayPal response. Local notes are
   never evidence. No success mock or local Paid stamp.

## Interaction and review

Use native controls, visible 3px teal keyboard focus with 3px offset, hover,
press and disabled states. Errors focus the alert; loading uses role=status;
cart updates use aria-live. Use only a brief opacity/translate reveal, respect
reduced motion, and do not animate amounts. Preserve existing server functions,
stock handling, proposal proof and checkout wiring.

Build and inspect in this order: masthead/mandate and supplier slip; proposed
cart and stamped refusals; separate PayPal and receipt slips; desktop and 390px
review; production build and deployed public review. A frontend edit may never
change catalog prices, the $180 cup policy, Gemini prompt or payment guards.

Deployment is one long-running Node process in one Railway replica, sleeping
disabled, no cluster, serverless or overlapping replicas. Runtime credentials
belong in the host environment, never source or browser. Restart invalidates
unfinished checkout authority. Verify live $160 → $114 replanning and a refused
capture request without creating an order or approving a charge.
