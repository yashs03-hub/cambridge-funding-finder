import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('lib/colleges.ts', 'utf8');
const rows = [...src.matchAll(/slug:\s*'([^']+)',\s*name:\s*(["'])(.+?)\2,\s*url:\s*'([^']+)'/g)]
  .map(m => ({ slug: m[1], name: m[3], url: m[4] }));
if (rows.length !== 31) { console.error('parsed', rows.length); process.exit(1); }
const esc = s => s.replace(/'/g, "''");
const body = rows.map(r => `  ('${esc(r.slug)}', '${esc(r.name)}', 'college', '${r.url}', null)`).join(',\n');
writeFileSync('supabase/seed_providers.sql', `-- ═══════════════════════════════════════════════════════════════════
-- The 31 Cambridge colleges — Phase 0 seed set (spec §4.1).
--
-- GENERATED from lib/colleges.ts. Edit that file, not this one:
--   node scripts/gen-seed-sql.mjs
--
-- Root URLs only. Funding items are still fully discovered and extracted
-- by the crawler; hand-listing 31 college websites is an afternoon that
-- never needs redoing, hand-listing 400 awards is a job that needs redoing
-- every term.
--
-- funding_index_url is null everywhere by design. It is populated by the
-- discover stage, not guessed — a wrong funding URL sends the crawler
-- somewhere plausible and silently wrong, which is worse than no hint.
--
-- All 31 roots verified to return HTTP 200: node scripts/verify-seed-urls.mjs
-- ═══════════════════════════════════════════════════════════════════

insert into providers (id, name, kind, url, funding_index_url) values
${body}
on conflict (id) do update
  set name = excluded.name,
      url  = excluded.url;
`);
console.log('wrote supabase/seed_providers.sql with', rows.length, 'rows');
