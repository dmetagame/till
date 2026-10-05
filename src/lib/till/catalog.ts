export type Product = {
  id: string;
  name: string;
  merchant: string;
  category: string;
  price: number;
  lead: string;
  blurb: string;
  tags: string[];
};

export type PlanLine = {
  productId: string;
  qty: number;
  why: string;
};

export type Rejection = {
  productId: string;
  reason: string;
};

export type PlanSource = "preset" | "grok" | "device";

export type Plan = {
  title: string;
  summary: string;
  brief: string;
  budgetCents: number;
  rules: string[];
  lines: PlanLine[];
  rejected: Rejection[];
  source: PlanSource;
};

export const CATALOG: Product[] = [
  {
    id: "sourdough",
    name: "Country sourdough",
    merchant: "Hearth Bakery",
    category: "grocer",
    price: 800,
    lead: "Today",
    blurb: "Two loaves, sliced if you ask.",
    tags: ["dinner", "bread", "host", "food", "grocery", "grocer"],
  },
  {
    id: "chicken",
    name: "Bone-in chicken thighs",
    merchant: "Mercer Poultry",
    category: "grocer",
    price: 1450,
    lead: "Today",
    blurb: "2.5 lb, raised within 80 miles.",
    tags: ["dinner", "host", "food", "meat", "grocery", "grocer"],
  },
  {
    id: "greens",
    name: "Mixed greens",
    merchant: "Lot 12 Produce",
    category: "grocer",
    price: 650,
    lead: "Today",
    blurb: "One pound, washed, enough for six.",
    tags: ["dinner", "salad", "host", "food", "grocery", "grocer"],
  },
  {
    id: "lemons",
    name: "Lemons, half dozen",
    merchant: "Lot 12 Produce",
    category: "grocer",
    price: 400,
    lead: "Today",
    blurb: "For the pan and the water jug.",
    tags: ["dinner", "host", "food", "grocery", "grocer"],
  },
  {
    id: "butter",
    name: "Cultured butter",
    merchant: "Hearth Bakery",
    category: "grocer",
    price: 700,
    lead: "Today",
    blurb: "Eight ounces, salted.",
    tags: ["dinner", "host", "food", "grocery", "grocer"],
  },
  {
    id: "olive",
    name: "Early-harvest olive oil",
    merchant: "Pantry Lane",
    category: "grocer",
    price: 1800,
    lead: "2 days",
    blurb: "500 ml. Not a same-day item.",
    tags: ["dinner", "pantry", "food", "grocery"],
  },
  {
    id: "wine",
    name: "Skin-contact white",
    merchant: "Cork & Co.",
    category: "alcohol",
    price: 2800,
    lead: "Today",
    blurb: "One bottle. Off the cart if alcohol is banned.",
    tags: ["dinner", "wine", "alcohol", "host", "drink"],
  },
  {
    id: "oat",
    name: "Oat milk, case of 6",
    merchant: "Counter Supply",
    category: "cafe",
    price: 2400,
    lead: "Tomorrow",
    blurb: "Barista, unsweetened.",
    tags: ["cafe", "restock", "milk", "oat", "coffee"],
  },
  {
    id: "beans",
    name: "House espresso, 5 lb",
    merchant: "Counter Supply",
    category: "cafe",
    price: 7200,
    lead: "Tomorrow",
    blurb: "Medium roast, roasted this week.",
    tags: ["cafe", "restock", "coffee", "beans", "espresso"],
  },
  {
    id: "cups",
    name: "12 oz cups, 500",
    merchant: "Counter Supply",
    category: "cafe",
    price: 6400,
    lead: "2 days",
    blurb: "Compostable, lids included.",
    tags: ["cafe", "restock", "cups", "coffee"],
  },
  {
    id: "cups-small",
    name: "12 oz cups, 100",
    merchant: "Counter Supply",
    category: "cafe",
    price: 1800,
    lead: "2 days",
    blurb: "A smaller compostable pack, lids included.",
    tags: ["cafe", "restock", "cups", "coffee"],
  },
  {
    id: "cups-premium",
    name: "Premium cup case, 1,000",
    merchant: "Counter Supply",
    category: "cafe",
    price: 12800,
    lead: "2 days",
    blurb: "A premium case that exceeds the $120 cafe mandate.",
    tags: ["cafe", "restock", "cups", "coffee"],
  },
  {
    id: "pastry",
    name: "Morning pastry tray",
    merchant: "Hearth Bakery",
    category: "cafe",
    price: 3600,
    lead: "Tomorrow",
    blurb: "Twelve pieces. A third vendor if the others are already in.",
    tags: ["cafe", "restock", "pastry", "food"],
  },
  {
    id: "screen",
    name: "Phone screen, walk-in",
    merchant: "Bond Street Repair",
    category: "repair",
    price: 6900,
    lead: "Today",
    blurb: "While you wait. Brooklyn shop.",
    tags: ["phone", "screen", "repair", "brooklyn", "cracked", "glass"],
  },
  {
    id: "case",
    name: "Clear fitted case",
    merchant: "Bond Street Repair",
    category: "repair",
    price: 1800,
    lead: "Today",
    blurb: "Protects the new glass. Easy to bust a tight budget.",
    tags: ["phone", "case", "repair", "brooklyn"],
  },
  {
    id: "dino",
    name: "Wooden dinosaur set",
    merchant: "Field & Fig",
    category: "gift",
    price: 2800,
    lead: "2 days",
    blurb: "Six species, solid beech, ages 4 and up.",
    tags: ["gift", "dinosaur", "dino", "child", "kid", "toy", "wood"],
  },
  {
    id: "book",
    name: "Digging Up Dinosaurs",
    merchant: "Field & Fig",
    category: "gift",
    price: 1400,
    lead: "2 days",
    blurb: "Picture book. No plastic.",
    tags: ["gift", "dinosaur", "dino", "child", "kid", "book"],
  },
  {
    id: "blaster",
    name: "Light-up dino blaster",
    merchant: "Aisle 9",
    category: "gift",
    price: 1900,
    lead: "Tomorrow",
    blurb: "Plastic, with batteries. Junk if the brief says so.",
    tags: ["gift", "dinosaur", "dino", "plastic", "toy", "junk", "kid"],
  },
  {
    id: "tile",
    name: "Hand-painted tiles, pair",
    merchant: "Atelier Rossio",
    category: "travel",
    price: 6400,
    lead: "5 days",
    blurb: "From a Lisbon studio.",
    tags: ["lisbon", "travel", "gift", "local", "maker", "weekend"],
  },
  {
    id: "stay",
    name: "One night, guesthouse",
    merchant: "Alfama Rooms",
    category: "travel",
    price: 14800,
    lead: "Held 20 min",
    blurb: "Two guests, breakfast included.",
    tags: ["lisbon", "travel", "hotel", "weekend", "stay", "local"],
  },
  {
    id: "tram",
    name: "48-hour transit, two people",
    merchant: "Carris",
    category: "travel",
    price: 3200,
    lead: "Instant",
    blurb: "Tram, bus, and metro.",
    tags: ["lisbon", "travel", "transit", "weekend", "local"],
  },
];

const byId = new Map(CATALOG.map((product) => [product.id, product]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function parseBudget(brief: string): number | null {
  const match = brief.match(/\$\s*(\d{1,5}(?:\.\d{1,2})?)|(\d{1,5})\s*(?:dollars|usd|bucks)/i);
  if (!match) return null;
  const amount = Number(match[1] ?? match[2]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) return null;
  return Math.round(amount * 100);
}

export function catalogForModel() {
  return CATALOG.map((product) => ({
    id: product.id,
    name: product.name,
    merchant: product.merchant,
    category: product.category,
    priceCents: product.price,
    lead: product.lead,
    tags: product.tags,
  }));
}

type Preset = {
  id: string;
  label: string;
  hint: string;
  brief: string;
  plan: Omit<Plan, "brief" | "source">;
};

const PRESETS: Preset[] = [
  {
    id: "dinner",
    label: "Sunday dinner",
    hint: "Six people, small grocers, no wine",
    brief: "Host dinner for 6 under $90. Prefer small grocers, no alcohol, same-day.",
    plan: {
      title: "Dinner for six, tonight",
      summary:
        "Chicken, bread, greens, lemons, and butter from three neighborhood shops. The bottle of wine and the olive oil never made the cart.",
      budgetCents: 9000,
      rules: [
        "Spend at most $90",
        "No alcohol",
        "Same-day pickup only",
        "Prefer independent grocers over a chain",
      ],
      lines: [
        { productId: "chicken", qty: 2, why: "The main, doubled so six people actually eat." },
        { productId: "sourdough", qty: 1, why: "Bread for the table, ready this afternoon." },
        { productId: "greens", qty: 2, why: "A salad that isn’t a garnish." },
        { productId: "lemons", qty: 1, why: "For the pan and the water." },
        { productId: "butter", qty: 1, why: "With the bread. That’s the meal." },
      ],
      rejected: [
        { productId: "wine", reason: "The brief bans alcohol." },
        { productId: "olive", reason: "Two-day lead time. You asked for same-day." },
      ],
    },
  },
  {
    id: "screen",
    label: "Cracked screen",
    hint: "Walk-in repair under $80",
    brief: "Replace a cracked phone screen in Brooklyn under $80, walk-in today.",
    plan: {
      title: "Glass only, today",
      summary:
        "The walk-in repair fits. The case would have pushed the ticket to $87, so it stays on the counter.",
      budgetCents: 8000,
      rules: ["Spend at most $80", "Must be a same-day walk-in", "Brooklyn, not a mail-in depot"],
      lines: [
        { productId: "screen", qty: 1, why: "While-you-wait glass replacement on Bond Street." },
      ],
      rejected: [{ productId: "case", reason: "Adds $18 and breaks the $80 cap." }],
    },
  },
  {
    id: "gift",
    label: "Dinosaur gift",
    hint: "A seven-year-old, no plastic junk",
    brief: "Gift for a 7-year-old who likes dinosaurs, under $40, no plastic junk.",
    plan: {
      title: "Wood, not a blaster",
      summary:
        "A beech dinosaur set leaves room under $40. The plastic blaster is out, and the book would have crossed the cap.",
      budgetCents: 4000,
      rules: ["Spend at most $40", "No plastic junk", "Suitable for a seven-year-old"],
      lines: [
        { productId: "dino", qty: 1, why: "Solid wood, six species, nothing to throw away next week." },
      ],
      rejected: [
        { productId: "blaster", reason: "Plastic, with batteries. The brief called that junk." },
        { productId: "book", reason: "Would put the total at $42, past $40." },
      ],
    },
  },
  {
    id: "cafe",
    label: "Cafe restock",
    hint: "Counter Supply · $120 · live stock replan",
    brief: "Restock a cafe: oat milk, beans, and cups, under $120, Counter Supply only.",
    plan: {
      title: "Two vendors, not three",
      summary:
        "Beans from the roaster, milk and cups from the supply shop. The pastry tray would have meant a third vendor.",
      budgetCents: 22000,
      rules: ["Spend at most $220", "Cover oat milk, coffee, and cups", "No more than two vendors"],
      lines: [
        { productId: "beans", qty: 1, why: "The thing you actually sell." },
        { productId: "oat", qty: 1, why: "A case, from the same vendor as the cups." },
        { productId: "cups", qty: 1, why: "Five hundred, lids included, same vendor as the milk." },
      ],
      rejected: [
        { productId: "pastry", reason: "Hearth would be a third vendor. The mandate allows two." },
      ],
    },
  },
];

export function listPresets() {
  return PRESETS.map(({ id, label, hint, brief }) => ({ id, label, hint, brief }));
}

export function planFromPreset(id: string, brief: string): Plan | null {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) return null;
  return { ...preset.plan, brief, source: "preset" };
}

function constraints(brief: string) {
  const text = brief.toLowerCase();
  return {
    text,
    budget: parseBudget(brief) ?? 7500,
    banAlcohol: /no alcohol|without alcohol|non-alcoholic|no wine/.test(text),
    sameDay: /same-day|same day|today|walk-in|while you wait/.test(text),
    noPlastic: /no plastic|no junk|not plastic|wooden/.test(text),
    twoVendors: /two vendors|2 vendors|two merchants/.test(text),
  };
}

function scoreProduct(product: Product, text: string, sameDay: boolean): number {
  const hay = `${product.name} ${product.merchant} ${product.category} ${product.blurb} ${product.tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const tag of product.tags) {
    if (text.includes(tag)) score += 3;
  }
  const intent: Array<[RegExp, string]> = [
    [/dinner|host|supper/, "dinner"],
    [/cafe|restock|espresso|oat/, "cafe"],
    [/phone|screen|cracked|repair/, "repair"],
    [/gift|dinosaur|dino|kid|child/, "gift"],
    [/lisbon|weekend|travel|hotel/, "travel"],
  ];
  for (const [pattern, category] of intent) {
    if (pattern.test(text) && (product.category === category || product.tags.includes(category))) {
      score += 4;
    }
  }
  if (sameDay && /today|instant/i.test(product.lead)) score += 2;
  if (score === 0) return 0;
  return hay.length > 0 ? score : 0;
}

export function localPlan(brief: string): Plan {
  const ruleset = constraints(brief);
  const rejected: Rejection[] = [];
  const ranked = CATALOG.map((product) => ({
    product,
    score: scoreProduct(product, ruleset.text, ruleset.sameDay),
  }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price);

  const lines: PlanLine[] = [];
  const vendors = new Set<string>();
  let spent = 0;

  for (const { product } of ranked) {
    if (lines.length >= 5) break;
    if (ruleset.banAlcohol && product.category === "alcohol") {
      rejected.push({ productId: product.id, reason: "The brief bans alcohol." });
      continue;
    }
    if (ruleset.sameDay && !/today|instant/i.test(product.lead)) {
      rejected.push({ productId: product.id, reason: "Not available the same day." });
      continue;
    }
    if (ruleset.noPlastic && product.tags.includes("plastic")) {
      rejected.push({ productId: product.id, reason: "Plastic. The brief ruled that out." });
      continue;
    }
    if (ruleset.twoVendors && !vendors.has(product.merchant) && vendors.size >= 2) {
      rejected.push({ productId: product.id, reason: "Would add a vendor past the cap of two." });
      continue;
    }
    const next = spent + product.price;
    if (next > ruleset.budget) {
      rejected.push({
        productId: product.id,
        reason: `Would pass the ${money(ruleset.budget)} cap.`,
      });
      continue;
    }
    lines.push({
      productId: product.id,
      qty: 1,
      why: product.blurb,
    });
    spent += product.price;
    vendors.add(product.merchant);
  }

  const rules = [`Spend at most ${money(ruleset.budget)}`];
  if (ruleset.banAlcohol) rules.push("No alcohol");
  if (ruleset.sameDay) rules.push("Same-day only");
  if (ruleset.noPlastic) rules.push("No plastic junk");
  if (ruleset.twoVendors) rules.push("No more than two vendors");
  rules.push("Removing items is allowed. Adding them is not.");

  const empty = lines.length === 0;
  return {
    title: empty ? "Nothing fit the mandate" : "A cart inside the brief",
    summary: empty
      ? "Nothing in the catalog matches this brief without breaking a rule. Try a sample, or name dinner, a repair, a gift, cafe stock, or Lisbon."
      : "Picked only what the brief allowed, and left money unspent rather than pad the cart.",
    brief,
    budgetCents: ruleset.budget,
    rules,
    lines,
    rejected: rejected.slice(0, 4),
    source: "device",
  };
}

export function sanitizeModelPlan(brief: string, raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const stated = parseBudget(brief);
  let budget = stated ?? 7500;
  if (!stated && typeof record.budgetCents === "number" && Number.isFinite(record.budgetCents)) {
    budget = record.budgetCents < 500 ? Math.round(record.budgetCents * 100) : Math.round(record.budgetCents);
  }
  budget = Math.min(Math.max(budget, 500), 500000);

  const linesIn = Array.isArray(record.lines) ? record.lines : [];
  const lines: PlanLine[] = [];
  let spent = 0;
  for (const line of linesIn) {
    if (!line || typeof line !== "object") continue;
    const item = line as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId : "";
    const product = getProduct(productId);
    if (!product || lines.some((existing) => existing.productId === productId)) continue;
    const qty = item.qty === 2 ? 2 : 1;
    if (spent + product.price * qty > budget) continue;
    const why = typeof item.why === "string" ? item.why.trim().slice(0, 140) : product.blurb;
    lines.push({ productId, qty, why: why || product.blurb });
    spent += product.price * qty;
    if (lines.length >= 5) break;
  }
  if (lines.length === 0) return null;

  const rules = Array.isArray(record.rules)
    ? record.rules.filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0).slice(0, 5).map((rule) => rule.trim().slice(0, 120))
    : [];
  if (!rules.some((rule) => rule.includes(money(budget).replace(".00", "")))) {
    rules.unshift(`Spend at most ${money(budget)}`);
  }

  const rejectedIn = Array.isArray(record.rejected) ? record.rejected : [];
  const rejected: Rejection[] = [];
  for (const item of rejectedIn) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const productId = typeof entry.productId === "string" ? entry.productId : "";
    if (!getProduct(productId) || lines.some((line) => line.productId === productId)) continue;
    const reason = typeof entry.reason === "string" ? entry.reason.trim().slice(0, 120) : "Outside the mandate.";
    rejected.push({ productId, reason: reason || "Outside the mandate." });
    if (rejected.length >= 4) break;
  }

  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 60) : "A cart inside the brief";
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim().slice(0, 280)
      : "The agent kept the cart inside the mandate.";

  return {
    title,
    summary,
    brief,
    budgetCents: budget,
    rules,
    lines,
    rejected,
    source: "grok",
  };
}
