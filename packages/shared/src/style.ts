/**
 * Marketing-slop word list. Cheaper models lean on these ("seamless", "cutting-edge",
 * "unparalleled"…); they read as generic and off-brand for a data/AI firm. Fed into the
 * generation prompt (avoid up front) AND the style guardrail (flag if they slip through).
 */
export const MARKETING_BUZZWORDS: string[] = [
  "seamless",
  "seamlessly",
  "cutting edge",
  "unparalleled",
  "elevate",
  "supercharge",
  "unleash",
  "world class",
  "next generation",
  "game changer",
  "game changing",
  "revolutionize",
  "revolutionary",
  "paradigm shift",
  "best in class",
  "turnkey",
  "synergy",
  "synergies",
  "unlock the power",
];
