import type { ReactNode } from "react";
import type { MandateKind } from "./mandate-config";
import { CounterIllustration, SupplyGlyph } from "./cafe-graphics";

function Ink({ children }: { children: ReactNode }) {
  return (
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  );
}

function Bread() {
  return (
    <Ink>
      <path d="M15 87C3 61 24 7 48 10s34 51 19 77Z" fill="var(--color-kraft)" />
      <path
        d="M22 39q8-11 21-12M18 55q12-13 29-13M19 70q13-12 31-13M22 83q11-9 25-10"
        fill="none"
      />
      <path d="M52 20q16 28 7 58" fill="none" opacity=".3" />
    </Ink>
  );
}

function Greens() {
  return (
    <Ink>
      <path
        d="M39 87 22 55C-3 50 9 23 26 30c-8-31 29-38 32-13 25-11 34 25 10 32-1 22-18 28-29 18Z"
        fill="var(--color-teal)"
      />
      <path
        d="M39 90V26m0 22L22 39m17 20 20-24m-20 32 13-9"
        fill="none"
        stroke="var(--color-card)"
      />
      <path d="m33 85 13 2-3 7-8-1Z" fill="var(--color-kraft)" />
    </Ink>
  );
}

function Lemon() {
  return (
    <Ink>
      <path
        d="M10 64c-7-8 4-11 8-13 15-20 45-22 52-4 9 2 9 8 1 12-4 28-39 31-51 12-5 0-10-2-10-7Z"
        fill="var(--color-kraft)"
      />
      <path d="M33 48q12-7 23-4m-12-1q-2-14 9-23 15 14-9 23Z" fill="var(--color-teal)" />
      <path d="m30 64 1 1m8 4 1 1m10-5 1 1m8-8 1 1" fill="none" />
    </Ink>
  );
}

function Phone() {
  return (
    <Ink>
      <rect x="17" y="7" width="48" height="87" rx="6" fill="var(--color-ink)" />
      <rect x="21" y="14" width="40" height="69" rx="2" fill="var(--color-card)" />
      <path d="M35 10h13M37 89h8" stroke="var(--color-card)" />
      <path d="m50 18-13 23 14 8-14 14 5 16m-5-38-15-3m29 11 9-7m-23 21-14 3" fill="none" />
      <path d="m50 18-13 23 14 8" stroke="var(--color-teal)" strokeWidth="2.5" />
    </Ink>
  );
}

function Dinosaur() {
  return (
    <Ink>
      <path
        d="M10 64c10-2 13-13 20-16 5-18 5-30 15-36 11-5 24 2 21 10-2 6-8 7-17 6l-1 21c17 7 19 17 17 30l-7 1-1-13-10 2-2 13h-8l-1-14-10-3-5 8H11l5-11-6 2Z"
        fill="var(--color-kraft)"
      />
      <circle cx="58" cy="18" r="1.7" fill="currentColor" stroke="none" />
      <path d="M45 20q-3 12-2 21M33 52l16 8M30 59l16 8M39 72l6 1" fill="none" opacity=".32" />
    </Ink>
  );
}

function MapDrawing() {
  return (
    <Ink>
      <path d="m8 24 21-8 23 9 20-9v64l-20 9-23-9-21 9Z" fill="var(--color-card)" />
      <path d="m29 16 23 9v64l-23-9Z" fill="var(--color-kraft)" />
      <path d="M29 16v64M52 25v64m-39-9 12-23 14 6 14-23 14 9" fill="none" strokeDasharray="3 3" />
      <path d="M34 44c-12-17 13-21 13-8 0 4-5 8-7 11Z" fill="var(--color-teal)" />
      <circle cx="40" cy="34" r="2" fill="var(--color-card)" stroke="none" />
    </Ink>
  );
}

function Tile() {
  return (
    <Ink>
      <rect x="10" y="22" width="58" height="58" fill="var(--color-card)" />
      <path d="M15 27h48v48H15Z" fill="none" />
      <path d="m39 33 8 13 13 8-13 8-8 9-8-9-13-8 13-8Z" fill="var(--color-teal)" />
      <circle cx="39" cy="54" r="7" fill="var(--color-card)" />
      <path d="m19 31 4 4m32-4 4 4m-40 36 4-4m32 4 4-4" />
    </Ink>
  );
}

function Tag() {
  return (
    <Ink>
      <path d="M13 32 35 10l32 23v55H13Z" fill="var(--color-card)" />
      <circle cx="37" cy="26" r="4" fill="var(--color-paper)" />
      <path d="M35 22q-8-19 0-20m-12 48h33m-33 9h33m-33 9h21" fill="none" />
      <path d="M23 76h13" stroke="var(--color-teal)" strokeWidth="3" />
    </Ink>
  );
}

function Book() {
  return (
    <Ink>
      <path d="m13 15 47-5 7 9v69l-47 7-7-8Z" fill="var(--color-teal)" />
      <path d="m20 25 47-6v7l-47 6Z" fill="var(--color-card)" />
      <path
        d="M20 32v63m5-43 31-4m-31 13 22-3m-22 12 28-4"
        fill="none"
        stroke="var(--color-card)"
      />
    </Ink>
  );
}

export function ProductGlyph({ productId }: { productId: string }) {
  if (["oat", "beans", "cups", "cups-small", "cups-premium"].includes(productId))
    return <SupplyGlyph productId={productId} />;
  const drawing =
    productId === "sourdough" ? (
      <Bread />
    ) : productId === "greens" ? (
      <Greens />
    ) : productId === "lemons" ? (
      <Lemon />
    ) : ["screen", "case"].includes(productId) ? (
      <Phone />
    ) : productId === "dino" ? (
      <Dinosaur />
    ) : productId === "book" ? (
      <Book />
    ) : productId === "tile" ? (
      <Tile />
    ) : ["tram", "stay"].includes(productId) ? (
      <MapDrawing />
    ) : (
      <Tag />
    );
  return (
    <svg className="supply-glyph" viewBox="0 0 80 100" aria-hidden="true" focusable="false">
      {drawing}
    </svg>
  );
}

export function MandateIllustration({ kind }: { kind: MandateKind }) {
  if (kind === "cafe") return <CounterIllustration />;
  return (
    <svg
      className="scenario-illustration"
      viewBox="0 0 360 320"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="180" cy="287" rx="141" ry="14" fill="currentColor" opacity=".045" />
      {kind === "dinner" ? (
        <>
          <g transform="translate(60 4) rotate(-12 50 100) scale(1.7)">
            <Bread />
          </g>
          <g transform="translate(153 -1) rotate(8 60 100) scale(1.65)">
            <Greens />
          </g>
          <Ink>
            <path d="m62 137 219-8-11 151H78Z" fill="var(--color-kraft)" />
            <path
              d="m78 142 8 129h171l14-132M110 169v-22q0-30 22-30m83 47v-22q0-29-22-29"
              fill="none"
            />
            <path d="M115 193h116v57H115Z" fill="var(--color-card)" stroke="none" />
            <text
              x="173"
              y="218"
              textAnchor="middle"
              stroke="none"
              fontFamily="var(--font-display)"
              fontSize="22"
            >
              For the table.
            </text>
            <path d="M142 233h61" stroke="var(--color-teal)" strokeWidth="3" />
          </Ink>
          <g transform="translate(251 204) rotate(-16) scale(.9)">
            <Lemon />
          </g>
        </>
      ) : kind === "screen" ? (
        <>
          <g transform="translate(44 8) rotate(-10 130 140) scale(2.9)">
            <Phone />
          </g>
          <Ink>
            <path
              d="m266 90 20-4 6 32-12 3-3-8 2 105-16 1-3-104-4 8-11-8Z"
              fill="var(--color-kraft)"
            />
            <path d="m283 43-9 22 10 13 23-7 3-23-10 11-11-4 5-17Z" fill="var(--color-teal)" />
            <path d="m281 77-29 165 12 3 30-165" fill="var(--color-card)" />
            <path d="M53 271h54m-38 6h39" opacity=".4" />
          </Ink>
        </>
      ) : kind === "gift" ? (
        <>
          <Ink>
            <path d="m58 126 229-12 13 164-228 6Z" fill="var(--color-card)" />
            <path d="m164 121 22-1 9 161-23 1Z" fill="var(--color-teal)" stroke="none" />
            <path d="m69 174 224-13 2 21-224 14Z" fill="var(--color-teal)" stroke="none" />
            <path
              d="M180 120c-33-21-37-56-15-54 21 1 29 25 15 54 18-26 46-42 54-24 8 18-24 32-54 24Z"
              fill="var(--color-kraft)"
            />
          </Ink>
          <g transform="translate(50 83) rotate(-9 80 80) scale(2.3)">
            <Dinosaur />
          </g>
          <Ink>
            <path d="m233 213 38-8 24 16-7 45-47 6-8-59Z" fill="var(--color-kraft)" />
            <circle cx="265" cy="225" r="3" fill="var(--color-card)" />
            <path d="m248 244 22-3m-22 10 15-2" />
          </Ink>
        </>
      ) : kind === "travel" ? (
        <>
          <g transform="translate(23 18) rotate(-8 120 120) scale(3)">
            <MapDrawing />
          </g>
          <Ink>
            <path d="m167 204 154 10-4 70-154-10Z" fill="var(--color-teal)" />
            <path d="m185 213-3 58" stroke="var(--color-card)" strokeDasharray="3 4" />
            <text
              x="249"
              y="247"
              fill="var(--color-card)"
              stroke="none"
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontSize="20"
            >
              Lisbon
            </text>
            <path d="m207 260 82 6" stroke="var(--color-card)" />
            <circle cx="285" cy="86" r="24" fill="var(--color-card)" />
            <path d="m285 67 7 20-7 17-7-17Z" fill="var(--color-kraft)" />
          </Ink>
        </>
      ) : (
        <>
          <Ink>
            <path d="m63 63 201-14 16 232-201 14Z" fill="var(--color-kraft)" />
            <path d="m86 69 155-9 14 205-155 9Z" fill="var(--color-card)" />
            <path
              d="m111 107 109-6m-107 27 95-5m-93 29 103-5m-101 26 83-4m-81 27 94-5"
              fill="none"
            />
            <path d="m250 88 12-3 41 145-12 4-11-17Z" fill="var(--color-teal)" />
            <path d="m291 234 12-4-1 22Z" fill="var(--color-kraft)" />
          </Ink>
        </>
      )}
      <path d="M29 303h301M46 310h267" fill="none" stroke="currentColor" opacity=".18" />
    </svg>
  );
}
