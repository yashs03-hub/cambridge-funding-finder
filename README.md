# Cambridge Funding Finder

Aggregates the **long tail** of Cambridge college funding — travel grants, hardship
funds, book grants, conference bursaries and prizes — that no central database
indexes, plus an AI assistant that matches a student's free-text need to the
right awards.

The University's own funding page points students at individual college websites
for exactly this material. That gap is the product.

## Status — 2026-07-29

**Next.js app scaffolded.** It builds, runs, and renders the verified light design
system. No real funding data has been collected — the site runs on invented awards
and says so on every page.

| | |
|---|---|
| `docs/superpowers/specs/2026-07-28-cambridge-funding-finder-design.md` | Authoritative design spec |
| `docs/data-pipeline.md` | Why there is no database, and the scraper contract |
| `app/`, `components/`, `lib/` | The Next.js application |
| `data/funding.json` | The dataset — currently a placeholder |
| `test/` | Contrast audit, dataset validation, deadline/filter/seed tests |
| `mockup/index.html` | The original static design mockup (superseded by the app) |

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

**No configuration, no keys, no services.** The funding data is a committed JSON
file, so a fresh clone runs immediately.

```sh
npm test             # 44 tests
npm run typecheck
npm run build
```

## Data

There is no database. `data/funding.json` holds the dataset; the scraper will
write it and open a pull request, and reviewing the PR diff *is* the review queue
from §4.5. Full reasoning in [`docs/data-pipeline.md`](docs/data-pipeline.md) —
the short version is that the spec's refresh semantics (changed → back to
`pending` *with a diff*, disappeared → never delete) describe git, and running it
on Postgres means rebuilding code review badly.

The file's `status` field decides what the site serves:

| `status` | Site serves |
|---|---|
| `placeholder` | Invented sample awards, behind the sample-data banner |
| `live` | The file's items — **never** sample data, even if `items` is empty |

That asymmetry is deliberate: a scraper bug that empties a live dataset must
render an honest empty listing, not silently revert to fabricated awards.

`lib/dataset.ts` validates the file at module load, so a malformed dataset fails
the build — on the scraper's own PR rather than in front of a student. Two of its
rules were CHECK constraints in the original Postgres schema and carry over
unchanged: a `fixed` deadline must have both a date and an `evidence_quote`.

`docs/reference-schema.sql` keeps the relational model, unapplied, in case
reviewing is ever delegated to someone who won't use GitHub.

## Verifying the seed list

```sh
node scripts/verify-seed-urls.mjs
```

Fetches all 31 college root URLs (1 req/s, descriptive User-Agent) and fails if
any stops resolving. All 31 returned HTTP 200 on 2026-07-29.

## Design system

The token values in `app/globals.css` are **measured, not chosen** — see §8.2 of
the spec. `test/contrast.test.mjs` re-derives all 26 pairings from that file with
alpha composited against the real background, so a token that drifts past the
4.53:1 floor fails the suite rather than shipping.

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
  `evidence_quote`, open a PR, weekly GitHub Actions cron. Contract in
  `docs/data-pipeline.md`.
- **The assistant.** Phase 4. `/api/ask` returns a real `501` explaining this
  rather than the mockup's canned answer — there are no reviewed records to
  search, and a plausible fabricated shortlist is the exact failure this product
  exists to prevent.
- **Semantic search.** The spec specified pgvector, but Anthropic has no
  embeddings endpoint, so it would mean a second vendor and a second key. At ~400
  awards, plain text matching over the committed dataset is almost certainly
  enough. Revisit if the departments phase lands.
