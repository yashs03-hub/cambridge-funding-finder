# Cambridge Funding Finder

Aggregates the **long tail** of Cambridge college funding — travel grants, hardship
funds, book grants, conference bursaries and prizes — that no central database
indexes, plus an AI assistant that matches a student's free-text need to the
right awards.

The University's own funding page points students at individual college websites
for exactly this material. That gap is the product.

## Status — 2026-07-28

Design phase complete. **No application code written yet.**

| | |
|---|---|
| `docs/superpowers/specs/2026-07-28-cambridge-funding-finder-design.md` | Authoritative design spec |
| `mockup/index.html` | Static design mockup, invented sample data |
| `cambridge-funding-finder-master.md` (in `~/Downloads`) | Original brief — superseded by the spec where they conflict |

## Running the mockup

```sh
cd mockup && python3 -m http.server 8420 --bind 127.0.0.1
open http://localhost:8420
```

Static HTML, no build step. Append `#answer` to the URL to open the assistant
result immediately.

**The mockup contains no real funding data.** Colleges are real; every award,
amount and deadline is invented for design review.

## Typeface

Feijoa (Klim Type Foundry, Cambridge cut), loaded via `src: local()` **only** —
the installed files are a desktop licence and must never be served. Visitors
without it fall back to Newsreader, which measures ~16% narrower, so layouts
must not depend on specific wrap points.

## Next step

Phase 0 of the build plan in §10 of the spec: schema, politeness harness, and
31 seeded college providers.
