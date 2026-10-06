import { listPresets } from "@/lib/till/catalog";
import { CAFE_BRIEF } from "@/lib/till/cafe";

export type MandateKind = "cafe" | "dinner" | "screen" | "gift" | "travel" | "custom";

export type MandateScenario = {
  kind: MandateKind;
  label: string;
  context: string;
  heading: string[];
  hint: string;
  brief: string;
  presetId: string | null;
};

const samples = listPresets();
const sample = (id: string) => samples.find((entry) => entry.id === id)!;

export const MANDATES: MandateScenario[] = [
  {
    kind: "cafe",
    label: "Cafe restock",
    context: "The cafe counter",
    heading: ["Oat milk,", "beans", "& cups."],
    hint: "Live stock replan · Counter Supply",
    brief: CAFE_BRIEF,
    presetId: null,
  },
  {
    kind: "dinner",
    label: sample("dinner").label,
    context: "The dinner table",
    heading: ["Six people.", "One good", "dinner."],
    hint: sample("dinner").hint,
    brief: sample("dinner").brief,
    presetId: "dinner",
  },
  {
    kind: "screen",
    label: "Phone repair",
    context: "The repair counter",
    heading: ["New glass.", "A clear", "limit."],
    hint: sample("screen").hint,
    brief: sample("screen").brief,
    presetId: "screen",
  },
  {
    kind: "gift",
    label: sample("gift").label,
    context: "The gift desk",
    heading: ["A little", "prehistoric", "delight."],
    hint: sample("gift").hint,
    brief: sample("gift").brief,
    presetId: "gift",
  },
  {
    kind: "travel",
    label: "A Lisbon weekend",
    context: "The weekend itinerary",
    heading: ["A weekend.", "A few local", "finds."],
    hint: "Custom brief · demo travel catalog",
    brief: "Weekend in Lisbon for two, under $400, prefer local makers.",
    presetId: null,
  },
  {
    kind: "custom",
    label: "Your own mandate",
    context: "Your mandate",
    heading: ["Your brief.", "Your", "boundaries."],
    hint: "Write a job and a dollar cap",
    brief: "",
    presetId: null,
  },
];

export function scenarioFor(kind: MandateKind): MandateScenario {
  return MANDATES.find((scenario) => scenario.kind === kind)!;
}

export function kindForBrief(brief: string): MandateKind {
  if (/cafe|restock|espresso|oat milk/i.test(brief)) return "cafe";
  if (/dinner|host|supper/i.test(brief)) return "dinner";
  if (/phone|screen|cracked|repair/i.test(brief)) return "screen";
  if (/gift|dinosaur|dino|kid|child/i.test(brief)) return "gift";
  if (/lisbon|weekend|travel|hotel/i.test(brief)) return "travel";
  return "custom";
}
