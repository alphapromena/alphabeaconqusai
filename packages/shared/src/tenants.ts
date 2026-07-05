import type { TenantConfig } from "./types.js";
import { DEFAULT_TONE_IDS } from "./tones.js";

/**
 * Seed configuration for the first tenant — Alpha Pro MENA.
 * Brand voice and offer are drawn from alphapromena.com. This is the grounding every daily
 * run uses; the knowledge base (uploaded docs) enriches it further.
 */
export const ALPHA_PRO_MENA: TenantConfig = {
  tenantId: "alpha-pro-mena",

  // Publish once a day at 2:00 PM Jordan time.
  schedule: { time: "14:00", timezone: "Asia/Amman" },

  // What every post should orbit.
  topics: [
    "Ataccama One (data quality, governance, catalog, MDM)",
    "Enterprise data solutions & data engineering",
    "Agentic AI",
    "AI readiness & data-for-AI",
    "Data observability & regulatory compliance",
  ],

  // Public sources to watch (NOT LinkedIn feeds — that's against LinkedIn's API terms).
  // The fetcher discovers each site's RSS/feed when the collector stage is implemented.
  sources: [
    // Direct RSS feeds (reliable, no discovery needed).
    { id: "dataversity", kind: "rss", value: "https://www.dataversity.net/feed/", label: "DATAVERSITY" },
    { id: "kdnuggets", kind: "rss", value: "https://www.kdnuggets.com/feed", label: "KDnuggets" },
    { id: "venturebeat-ai", kind: "rss", value: "https://venturebeat.com/category/ai/feed/", label: "VentureBeat AI" },
    { id: "unite-ai", kind: "rss", value: "https://www.unite.ai/feed/", label: "Unite.AI" },
    { id: "wamda", kind: "rss", value: "https://www.wamda.com/feed", label: "Wamda (MENA tech)" },
    // Site feeds (auto-discovered).
    { id: "ataccama-blog", kind: "blog", value: "https://www.ataccama.com/blog", label: "Ataccama Blog" },
    { id: "ataccama-news", kind: "news", value: "https://www.ataccama.com/company/newsroom", label: "Ataccama Newsroom" },
    { id: "tdwi", kind: "blog", value: "https://tdwi.org", label: "TDWI" },
    { id: "bigdatawire", kind: "news", value: "https://www.bigdatawire.com", label: "BigDATAwire (Datanami)" },
    // Keyword watches via Google News (varied angles keep runs from repeating).
    { id: "kw-data-quality", kind: "keyword", value: "enterprise data quality" },
    { id: "kw-data-governance", kind: "keyword", value: "data governance" },
    { id: "kw-agentic-ai", kind: "keyword", value: "agentic AI enterprise" },
    { id: "kw-mdm", kind: "keyword", value: "master data management" },
    { id: "kw-ai-readiness", kind: "keyword", value: "AI readiness data" },
    { id: "kw-data-catalog", kind: "keyword", value: "data catalog observability" },
    { id: "kw-cdo", kind: "keyword", value: "chief data officer strategy" },
    { id: "kw-mena-data", kind: "keyword", value: "Middle East data regulation AI" },
    { id: "kw-ataccama", kind: "keyword", value: "Ataccama" },
  ],

  postsPerRun: 5,
  toneProfileIds: DEFAULT_TONE_IDS, // 5-tone spread; the voice below keeps all of them professional
  limits: { maxOnDemandPerDay: 5, maxRegenerationsPerDraft: 3 },

  brand: {
    companyProfile:
      "Alpha Pro MENA — the region's leading multi-practice AI and data firm, and the only certified Ataccama Solution Partner across the Middle East and North Africa (in strategic alliance with Baker Tilly).",
    offer:
      "Data governance & intelligence on Ataccama One, AI consulting & audits, custom AI and agentic-AI solutions, and full-stack platform development for enterprises.",
    differentiators: [
      "Only certified Ataccama Solution Partner in MENA",
      "Strategic alliance with Baker Tilly (audit, tax, advisory)",
      "AI + data engineering paired with regulatory/compliance depth",
      "Regional (MENA) expertise and network",
    ],
    standardCta: "Is your data AI-ready? Book a free discovery — let's talk.",
    contact: "info@alphapromena.com · +962 79 186 4006 · Amman, Jordan",

    voice: {
      rules: [
        "Professional, confident, and data-driven.",
        "Provocative only in a credible, insightful way (e.g. 'garbage in, garbage out') — never clickbait or crude.",
        "Grounded in facts; every statistic carries a real source.",
        "Always end on a clear call to action.",
        "Concise, scannable, LinkedIn-native; light, tasteful emoji use is acceptable.",
      ],
      dos: [
        "Speak to enterprise decision-makers (CDOs, CIOs, data leaders).",
        "Tie data quality/governance to AI outcomes.",
        "Reference Ataccama One and real capabilities when relevant.",
      ],
      donts: [
        "No inappropriate, offensive, discriminatory, political, or religious content.",
        "No profanity or unprofessional language.",
        "No unverifiable statistics or invented numbers.",
        "No unsubstantiated guarantees or hype-only claims.",
        "No disparaging named competitors.",
      ],
    },

    // Static brand-safety word list. General 'inappropriate content' is additionally enforced
    // by the voice.donts above (fed into the generation prompt) and the brand-safety guardrail.
    bannedTerms: ["guaranteed results", "100% accurate", "cheap", "hack", "scam"],
  },
};
