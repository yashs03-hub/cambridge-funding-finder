/**
 * Fallback discovery for colleges whose homepage does not link funding.
 *
 * Homepage-only discovery reached 29 of 31. The two it missed were not
 * blocking us and were not scoring badly — they simply do not put student
 * funding in their top-level navigation, which is an information-architecture
 * choice, not a crawler problem. Two cheaper-than-crawling routes exist:
 *
 *   1. sitemap.xml — the site telling us its own URL list. Free and complete
 *      where it exists (Darwin and Wolfson publish sitemap indexes).
 *   2. one hop through the homepage's own section pages, for sites with no
 *      sitemap at all (Peterhouse, Selwyn).
 *
 * Both stay inside the same politeFetch, so robots.txt and crawl-delay still
 * apply — Trinity Hall asks for 10s between requests and gets it.
 */
import { politeFetch } from './polite-fetch.mjs';

/** Follow a sitemap, including one level of <sitemapindex>, and return URLs. */
export async function sitemapUrls(origin, { maxSitemaps = 6, cap = 4000 } = {}) {
  const candidates = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
  let root = null;
  for (const path of candidates) {
    const res = await politeFetch(origin + path);
    if (res.ok && res.body.includes('<')) {
      root = res.body;
      break;
    }
  }
  if (!root) return [];

  const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  if (!/<sitemapindex/i.test(root)) return locs(root).slice(0, cap);

  const out = [];
  // Prefer sub-sitemaps whose own filename hints at pages rather than posts,
  // so a news-heavy site does not spend the budget on articles.
  const subs = locs(root)
    .sort((a, b) => scoreSitemapName(b) - scoreSitemapName(a))
    .slice(0, maxSitemaps);
  for (const sub of subs) {
    const res = await politeFetch(sub);
    if (res.ok) out.push(...locs(res.body));
    if (out.length >= cap) break;
  }
  return out.slice(0, cap);
}

function scoreSitemapName(url) {
  const u = url.toLowerCase();
  let s = 0;
  if (/page/.test(u)) s += 3;
  if (/post|news|event|article/.test(u)) s -= 3;
  return s;
}

/**
 * One hop: fetch the homepage's own section pages and collect their links.
 * Used only when there is no sitemap.
 */
export async function secondLevelUrls(origin, homeHtml, { maxSections = 8 } = {}) {
  const host = new URL(origin).host;
  const links = [...homeHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => {
      try {
        const u = new URL(m[1], origin);
        u.hash = '';
        return u;
      } catch {
        return null;
      }
    })
    .filter((u) => u && u.host === host && /^https?:$/.test(u.protocol));

  // Section pages are shallow. A funding page almost always hangs off one of
  // the study / student-life / admissions branches, not off a news article.
  const seen = new Set();
  const sections = links
    .filter((u) => {
      const depth = u.pathname.split('/').filter(Boolean).length;
      return depth >= 1 && depth <= 2 && !/\/news\/|\/events?\//.test(u.pathname);
    })
    .filter((u) => (seen.has(u.href) ? false : (seen.add(u.href), true)))
    .sort((a, b) => sectionScore(b.pathname) - sectionScore(a.pathname))
    .slice(0, maxSections);

  const out = [];
  for (const s of sections) {
    const res = await politeFetch(s.href);
    if (!res.ok || !res.body) continue;
    for (const m of res.body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
      try {
        const u = new URL(m[1], s.href);
        u.hash = '';
        if (u.host === host && /^https?:$/.test(u.protocol)) out.push(u.href);
      } catch {
        /* skip */
      }
    }
  }
  return [...new Set(out)];
}

function sectionScore(path) {
  const p = path.toLowerCase();
  let s = 0;
  if (/stud(y|ent)|admission|apply|undergrad|postgrad|graduate/.test(p)) s += 5;
  if (/support|welfare|life|current/.test(p)) s += 3;
  if (/alumni|giving|donate|develop|about|history|visit|conference|shop/.test(p)) s -= 5;
  return s;
}
