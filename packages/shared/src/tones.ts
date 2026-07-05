import type { ToneProfile } from "./types.js";

/**
 * Default tone profiles (from the MVP blueprint). Generating a spread of registers —
 * rather than one "best" guess — gives the human a real choice and surfaces angles a single
 * prompt would miss. These are configurable per tenant.
 */
export const TONE_PROFILES: ToneProfile[] = [
  {
    id: "provocative",
    name: "Provocative",
    character: "Bold, contrarian hook, emoji-punctuated.",
    exampleTrigger: "AI amplifies your data — including the bad parts.",
  },
  {
    id: "data-driven",
    name: "Data-driven",
    character: "Leads with a hard statistic and a cited source.",
    exampleTrigger: "Poor data quality costs enterprises $12.9M annually.",
  },
  {
    id: "educational",
    name: "Educational",
    character: "Explains a concept, positions the offer as the answer.",
    exampleTrigger: "What 'data observability' actually means.",
  },
  {
    id: "story-human",
    name: "Story / human",
    character: "A customer scenario or relatable pain.",
    exampleTrigger: "The night a bad dataset broke a forecast.",
  },
  {
    id: "direct-cta",
    name: "Direct CTA",
    character: "Short, offer-forward, conversion-focused.",
    exampleTrigger: "Is your data AI-ready? Let's talk.",
  },
];

export const DEFAULT_TONE_IDS = TONE_PROFILES.map((t) => t.id);

export function getTone(id: string): ToneProfile | undefined {
  return TONE_PROFILES.find((t) => t.id === id);
}
