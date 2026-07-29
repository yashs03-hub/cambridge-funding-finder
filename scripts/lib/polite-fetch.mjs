/**
 * Polite fetching for the crawl stages (§4.2).
 *
 * Three rules, and the middle one is the one that is easy to get wrong:
 *
 *   1. Identify ourselves with a contactable User-Agent.
 *   2. Obey robots.txt — including Crawl-delay, which several Cambridge
 *      colleges set to 5s. Our own 1 req/s floor is NOT automatically the
 *      polite choice; the site's number wins whenever it is larger.
 *   3. One request at a time per host.
 *
 * Churchill's robots.txt blocks ClaudeBot outright and rate-limits everything
 * else. We are not ClaudeBot — we are a named aggregator that links back to
 * the source page — but a site that has bothered to write crawler rules has
 * told us how it wants to be treated, so we follow the wildcard group
 * strictly and give colleges a token to block if they want us gone.
 */
import { setTimeout as sleep } from 'node:timers/promises';

export const UA_TOKEN = 'CambridgeFundingFinder';
export const UA =
  'CambridgeFundingFinder/0.1 (+https://github.com/yashs03-hub/cambridge-funding-finder)';

/** Our floor. The effective delay is max(this, robots Crawl-delay). */
const MIN_DELAY_MS = 1100;
const TIMEOUT_MS = 25_000;

const robotsCache = new Map(); // origin -> Rules
const lastHit = new Map(); // host -> epoch ms

/**
 * Parse robots.txt into the rules that apply to us.
 *
 * Group selection follows the standard: the most specific matching
 * User-Agent group wins and the wildcard group is the fallback, so a site
 * that names us explicitly overrides its own wildcard group in either
 * direction. Consecutive User-Agent lines share one group.
 */
export function parseRobots(text, uaToken = UA_TOKEN) {
  const groups = [];
  let current = null;
  let lastLineWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    if (!current) continue;
    lastLineWasAgent = false;

    if (field === 'disallow') current.rules.push({ allow: false, path: value });
    else if (field === 'allow') current.rules.push({ allow: true, path: value });
    else if (field === 'crawl-delay') {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) current.delay = n;
    }
  }

  const token = uaToken.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  const chosen = named.length ? named : wildcard;

  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.reduce((m, g) => (g.delay != null && g.delay > m ? g.delay : m), 0);
  return {
    rules,
    delayMs: Math.max(MIN_DELAY_MS, delay * 1000),
    matchedNamedGroup: named.length > 0,
  };
}

const patternCache = new Map();

/**
 * Compile a robots.txt path pattern to a regex.
 *
 * An asterisk matches any run of characters and a trailing dollar sign
 * anchors the end; everything else is a literal prefix match.
 *
 * Truncating the pattern at the first asterisk and prefix-matching that
 * instead is a trap. Drupal ships a default rule disallowing
 * slash-asterisk-slash-media-slash-oembed, whose literal prefix is a bare
 * slash — under a prefix-only reading it matches every path on the site, and
 * because it is a long string it also wins the longest-match tie-break. One
 * line of CMS boilerplate silently fences off the whole college. Newnham
 * runs Drupal and that is exactly what happened on the first discovery run.
 */
function pathPattern(pattern) {
  let re = patternCache.get(pattern);
  if (re) return re;
  let p = pattern;
  const anchored = p.endsWith('$');
  if (anchored) p = p.slice(0, -1);
  const body = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  re = new RegExp('^' + body + (anchored ? '$' : ''));
  patternCache.set(pattern, re);
  return re;
}

/**
 * Longest-match wins, Allow beating Disallow on equal length — the rule
 * Google documents, and the one that makes a blanket Disallow plus a
 * specific Allow behave the way a site author expects. Specificity is the
 * length of the pattern, but only among patterns that genuinely match.
 */
export function isAllowed(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (r.path === '') continue; // Disallow with no value means allow all
    if (!pathPattern(r.path).test(pathname)) continue;
    if (
      !best ||
      r.path.length > best.path.length ||
      (r.path.length === best.path.length && r.allow)
    ) {
      best = r;
    }
  }
  return best ? best.allow : true;
}

async function getRobots(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = { rules: [], delayMs: MIN_DELAY_MS, matchedNamedGroup: false };
  try {
    const res = await fetch(origin + '/robots.txt', {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 4xx means no robots.txt, which means no restrictions. 5xx is ambiguous;
    // treat it as restrictive rather than assume a struggling server wants us.
    if (res.status >= 500) {
      rules = {
        rules: [{ allow: false, path: '/' }],
        delayMs: MIN_DELAY_MS,
        matchedNamedGroup: false,
      };
    } else if (res.ok) {
      rules = parseRobots(await res.text());
    }
  } catch {
    /* unreachable robots.txt behaves like a 404: no restrictions */
  }
  robotsCache.set(origin, rules);
  return rules;
}

/**
 * Fetch a URL, honouring robots.txt and per-host pacing.
 * Returns { ok, status, url, body, contentType, blocked }.
 */
export async function politeFetch(url) {
  const u = new URL(url);
  const robots = await getRobots(u.origin);

  if (!isAllowed(robots.rules, u.pathname)) {
    return { ok: false, status: 0, url, body: '', contentType: '', blocked: true };
  }

  const since = Date.now() - (lastHit.get(u.host) ?? 0);
  if (since < robots.delayMs) await sleep(robots.delayMs - since);
  lastHit.set(u.host, Date.now());

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/pdf,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('pdf') ? '' : await res.text();
    return { ok: res.ok, status: res.status, url: res.url, body, contentType, blocked: false };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      body: '',
      contentType: '',
      blocked: false,
      error: err.message,
    };
  }
}

export async function robotsFor(origin) {
  return getRobots(origin);
}
