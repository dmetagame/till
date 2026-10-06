/** Decorative supply drawings; product names, prices and stock stay in the catalog. */
function OatCarton() {
  return (
    <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M16 25 26 10h31l12 15v66H16Z" fill="var(--color-card)" />
      <path d="m57 10 12 15v66H57Z" fill="var(--color-kraft)" />
      <path d="M16 25h53M26 10v15m0-8h31" fill="none" />
      <path d="M16 38h41v42H16Z" fill="var(--color-teal)" stroke="none" />
      <text
        x="36"
        y="56"
        textAnchor="middle"
        fill="var(--color-card)"
        stroke="none"
        fontSize="13"
        fontFamily="var(--font-display)"
      >
        OAT
      </text>
      <path d="M36 71V61m0 5-7-4m7 7 7-4m-7-3 5-4" fill="none" stroke="var(--color-card)" />
      <path d="M23 85h10m3 0h9" fill="none" />
    </g>
  );
}

function CoffeeBag() {
  return (
    <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="m17 9 45 1 2 9-3 63 6 11H12l6-11-2-63Z" fill="var(--color-teal)" />
      <path d="m17 9 3 11 40 1 2-11M19 26l-1 53m43-54-2 54M12 93l12-7h32l11 7" fill="none" />
      <path d="M23 33h32v41H23Z" fill="var(--color-card)" stroke="none" />
      <text
        x="39"
        y="44"
        fill="var(--color-ink)"
        stroke="none"
        textAnchor="middle"
        fontSize="7"
        fontFamily="var(--font-sans)"
        letterSpacing="1"
      >
        COFFEE
      </text>
      <ellipse
        cx="39"
        cy="58"
        rx="7"
        ry="10"
        transform="rotate(28 39 58)"
        fill="var(--color-kraft)"
      />
      <path d="M41 49c-8 7 4 9-4 18M29 79h19" fill="none" />
      <path d="M23 14h31" stroke="var(--color-card)" opacity=".65" />
    </g>
  );
}

function CupStack() {
  return (
    <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="m15 26 8 64h33l9-64Z" fill="var(--color-card)" />
      <path d="m20 59 3 24h34l3-24Z" fill="var(--color-kraft)" />
      <path d="m55 30-6 26" opacity=".3" />
      {[8, 14, 20, 26].map((y) => (
        <path key={y} d={`M13 ${y}q27-9 54 0v4q-27 8-54 0Z`} fill="var(--color-card)" />
      ))}
      <ellipse cx="40" cy="8" rx="27" ry="5" fill="var(--color-paper)" />
      <text
        x="40"
        y="76"
        fill="var(--color-teal)"
        stroke="none"
        textAnchor="middle"
        fontSize="19"
        fontFamily="var(--font-display)"
      >
        T.
      </text>
    </g>
  );
}

export function SupplyGlyph({ productId }: { productId: string }) {
  return (
    <svg className="supply-glyph" viewBox="0 0 80 100" aria-hidden="true" focusable="false">
      {productId === "oat" ? <OatCarton /> : productId === "beans" ? <CoffeeBag /> : <CupStack />}
    </svg>
  );
}

export function CounterIllustration() {
  return (
    <svg
      className="counter-illustration"
      viewBox="0 0 340 320"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="176" cy="287" rx="150" ry="15" fill="currentColor" opacity=".045" />
      <path
        d="M15 303h307M29 310h280"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity=".18"
      />
      <g className="illustration-bag" transform="translate(115 22) rotate(7 70 105) scale(2.55)">
        <CoffeeBag />
      </g>
      <g className="illustration-oat" transform="translate(-7 85) rotate(-8 80 110) scale(2.1)">
        <OatCarton />
      </g>
      <g className="illustration-cups" transform="translate(211 148) rotate(5 55 75) scale(1.48)">
        <CupStack />
      </g>
      <g fill="none" stroke="var(--color-teal)" strokeWidth="1.2">
        <path d="M35 48v25m-12-13h24m-21-9 18 18m0-18L26 69" />
        <path d="M293 93v15m-7-7h14" />
      </g>
      <path
        d="m289 45 8 2m-6-13 8 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".4"
      />
    </svg>
  );
}

export function SupplierSeal() {
  return (
    <svg className="supplier-seal" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle
        cx="32"
        cy="32"
        r="25"
        fill="none"
        stroke="currentColor"
        strokeWidth=".6"
        strokeDasharray="1 3"
      />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontSize="25"
      >
        CS
      </text>
    </svg>
  );
}
