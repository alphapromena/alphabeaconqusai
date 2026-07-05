import Parser from "rss-parser";
import type { Signal, Source } from "@alphabeacon/shared";

const parser = new Parser({ timeout: 12000, headers: { "User-Agent": "AlphaBeacon/1.0 (+https://alphapromena.com)" } });

/**
 * Collect raw market signal from a tenant's PUBLIC sources.
 *
 * - keyword  → Google News RSS search (free, no key)
 * - rss      → the feed URL directly
 * - blog/news→ discover the site's feed (common paths + <link rel=alternate>)
 *
 * LinkedIn feeds are never read — that's against LinkedIn's API terms.
 * One failing source never kills the run.
 */
export async function collectSignals(sources: Source[], perSource = 4, total = 20): Promise<Signal[]> {
  const batches = await Promise.all(sources.map((s) => collectOne(s, perSource).catch(() => [] as Signal[])));
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const sig of batches.flat()) {
    const key = (sig.url ?? sig.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sig);
    if (out.length >= total) break;
  }
  return out;
}

async function collectOne(source: Source, limit: number): Promise<Signal[]> {
  const feedUrl =
    source.kind === "keyword" ? googleNewsRss(source.value) : source.kind === "rss" ? source.value : await discoverFeed(source.value);
  if (!feedUrl) return [];

  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? []).slice(0, limit).map((item, i) => ({
    id: item.guid ?? item.link ?? `${source.id}-${i}`,
    sourceId: source.id,
    title: (item.title ?? "").trim(),
    url: item.link,
    summary: clean(item.contentSnippet ?? item.content ?? item.summary ?? "").slice(0, 400),
    collectedAt: new Date().toISOString(),
  }));
}

function googleNewsRss(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

/** Find a site's RSS/Atom feed: parse the HTML <link>, then fall back to common paths. */
async function discoverFeed(siteUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(siteUrl, { headers: { "User-Agent": "AlphaBeacon/1.0" } });
    const html = await res.text();
    const m = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i);
    if (m) {
      const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (href) return new URL(href, siteUrl).toString();
    }
  } catch {
    /* fall through to common paths */
  }
  for (const path of ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/blog/rss.xml"]) {
    const candidate = new URL(path, siteUrl).toString();
    try {
      await parser.parseURL(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
