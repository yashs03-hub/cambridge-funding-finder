# Cambridge Funding Finder

Aggregates the **long tail** of Cambridge college funding — travel grants, hardship
funds, book grants, conference bursaries and prizes — that no central database
indexes, plus an AI assistant that matches a student's free-text need to the
right awards.

The University's own funding page points students at individual college websites
for exactly this material. That gap is the product.

## Status — 2026-07-29

**Next.js app scaffolded.** It builds, runs, and renders the verified light design
system against sample data. No real funding data has been collected — the site
runs on invented awards and says so on every page.

| | |
|---|---|
| `docs/superpowers/specs/2026-07-28-cambridge-funding-finder-design.md` | Authoritative design spec |
| `app/`, `components/`, `lib/` | The Next.js application |
| `supabase/schema.sql` + `seed_providers.sql` | Phase 0 schema and the 31 seeded colleges |
| `test/` | Design-system contrast audit + deadline/filter/seed tests |
| `mockup/index.html` | The original static design mockup (superseded by the app) |

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

**No configuration is required.** With `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` unset, the site serves invented sample awards and
shows the sample-data banner. Copy `.env.example` to `.env.local` to point it at a
real database.

```sh
npm test             # 32 tests — contrast audit, deadline logic, filters, seed list
npm run typecheck
npm run build
```

## Database

Apply in the Supabase SQL editor, in order:

```
supabase/schema.sql          # tables, enums, constraints, RLS
supabase/seed_providers.sql  # the 31 colleges (GENERATED — edit lib/colleges.ts)
```

`seed_providers.sql` is generated: edit `lib/colleges.ts`, then run
`node scripts/gen-seed-sql.mjs`. A test fails if the two drift apart.

**The review gate is enforced by RLS, not by the app.** `lib/data.ts` filters on
`status = 'approved'`, but the anon key is public and anyone can query the REST
endpoint directly — so the policy in `schema.sql` is what actually keeps
unreviewed LLM extractions off the site. After applying, verify:

```sh
curl "$SUPABASE_URL/rest/v1/funding_items?select=id,status&status=eq.pending" \
     -H "apikey: $ANON_KEY"      # must return []
```

## Verifying the seed list

```sh
node scripts/verify-seed-urls.mjs
```

Fetches all 31 college root URLs (1 req/s, descriptive User-Agent) and fails if any
stops resolving. All 31 returned HTTP 200 on 2026-07-29.

## Design system

The token values in `app/globals.css` are **measured, not chosen** — see §8.2 of the
spec. `test/contrast.test.mjs` re-derives all 26 pairings from that file with alpha
composited against the real background, so a token that drifts past the 4.53:1 floor
fails the suite rather than shipping.

One fix was made during the port: the assistant card's metadata divider was
`rgba(255,255,255,.2)` in the mockup — 1.85:1 against the ink fill, below the 3:1
every other boundary line holds to. The mockup's audit only measured against the
mint canvas, so the interior of the one dark surface was never checked. Now `.4`
(3.33:1).

## Typeface

Feijoa (Klim Type Foundry, Cambridge cut), loaded via `src: local()` **only** —
the installed files are a desktop licence and must never be served. Visitors
without it fall back to Newsreader, which measures ~16% narrower, so layouts
must not depend on specific wrap points.

## What is not built

- **The scraper.** Phases 1–3: discover, fetch (HTML *and* PDF), extract with
  `evidence_quote`, review queue, weekly GitHub Actions cron.
- **The assistant.** Phase 4. `/api/ask` returns a real `501` explaining this
  rather than the mockup's canned answer — there are no reviewed records to search,
  and a plausible fabricated shortlist is the exact failure this product exists to
  prevent.
- **Embeddings.** The schema has `vector(1536)`, but Anthropic has no embeddings
  endpoint — that column needs a second provider (OpenAI is 1536-dim; Voyage is
  1024 and would change the schema). At ~400 awards, Postgres full-text search is
  likely the better v1 answer. Decide at Phase 4.
