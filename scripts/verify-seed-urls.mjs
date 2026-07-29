/**
 * Verify every seeded college root URL resolves.
 *
 * The seed list is hand-written, so it is exactly the kind of data that
 * rots quietly: a college moves to a new domain, the crawler finds nothing,
 * and the college simply reports zero awards forever. This makes that
 * failure loud.
 *
 * Politeness (§4.2) applies here too — this hits 31 real college servers:
 *   · one request at a time, no concurrency
 *   · >= 1s between requests
 *   · descriptive User-Agent with a contact URL
 *
 *   node scripts/verify-seed-urls.mjs
 */
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const UA =
  'CambridgeFundingFinder/0.1 (+https://github.com/yashs03-hub/cambridge-funding-finder; seed URL check)';

// Parse the TS seed list without needing a TS runtime.
const src = readFileSync(new URL('../lib/colleges.ts', import.meta.url), 'utf8');
const seeds = [...src.matchAll(/name:\s*(["'])(.+?)\1,\s*url:\s*'([^']+)'/g)].map((m) => ({
  name: m[2],
  url: m[3],
}));

if (seeds.length !== 31) {
  console.error(`Expected 31 seeded colleges, parsed ${seeds.length}`);
  process.exit(1);
}

const failures = [];

for (const [i, s] of seeds.entries()) {
  if (i > 0) await sleep(1100); // 1 req/s/host — different hosts, but be conservative
  let line;
  try {
    const res = await fetch(s.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    const moved = res.url.replace(/\/$/, '') !== s.url.replace(/\/$/, '');
    const ok = res.status >= 200 && res.status < 400;
    if (!ok) failures.push(`${s.name}: HTTP ${res.status}`);
    line = `${ok ? 'ok  ' : 'FAIL'} ${String(res.status).padEnd(4)} ${s.name.padEnd(28)} ${
      moved ? `→ ${res.url}` : s.url
    }`;
  } catch (err) {
    failures.push(`${s.name}: ${err.message}`);
    line = `FAIL ---- ${s.name.padEnd(28)} ${s.url}  (${err.message})`;
  }
  console.log(line);
}

console.log(`\n${seeds.length - failures.length}/${seeds.length} resolved`);
if (failures.length) {
  console.error('\nFailures:\n' + failures.map((f) => '  · ' + f).join('\n'));
  process.exit(1);
}
