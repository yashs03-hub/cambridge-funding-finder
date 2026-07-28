# Cambridge Funding Finder — Design Spec

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Supersedes:** `cambridge-funding-finder-master.md` where they conflict

---

## 1. Problem

Cambridge students leave small funding unclaimed because it is unfindable, not because they are ineligible.

The University maintains [student-funding.cam.ac.uk](https://www.student-funding.cam.ac.uk/), which indexes most *central postgraduate* funding — Gates, Cambridge Trust, UKRI, Harding. It deliberately does not aggregate college and department awards. The University's own funding page says so directly:

> "For College funding, see individual College websites."
> "small part-cost bursaries may be available to current postgraduate students from colleges and departments for fieldwork, hardship, conferences, etc."

That is the gap. The funding universe splits into a **head** (large, well-publicised, already indexed centrally) and a **tail** (small, scattered, per-college — travel grants, hardship funds, book grants, conference bursaries, prizes). Nobody aggregates the tail, and it is where money goes unclaimed.

## 2. Scope decisions

| Decision | Choice | Rationale |
|---|---|---|
| Funding universe | **Long tail only** | Re-scraping the central database duplicates a maintained index and inherits its staleness. Link out to it instead. |
| Audience | **Undergraduate and postgraduate** | College funds rarely split cleanly by level. Costs one eligibility tag, not a second build. |
| v1 breadth | **All 31 colleges. Departments later.** | Colleges are the higher-value half and a bounded, enumerable set. ~150 departments is a separate phase. |
| Deployment | **Public, stateless assistant** | No login, no stored personal data, no GDPR surface. The assistant asks for year/subject/status in the prompt rather than remembering it. |

**Explicitly out of scope for v1:** departments and faculties; CRSid-authenticated pages; user accounts and saved shortlists; external (non-Cambridge) funders; application submission or tracking.

## 3. The core constraint

**The product's value is that a student trusts the deadline.** Every design decision below follows from that.

This makes an unreviewed LLM extraction unacceptable as a live record. One wrong deadline that costs someone an application is worse than fifty missing entries. Accuracy beats coverage; coverage beats polish.

## 4. Data acquisition

Five stages, independently testable.

### 4.1 Seed
`providers` table, 31 colleges, each with a root URL and — where discoverable — a known funding index URL.

The master spec called for no manual seed list. We seed 31 *root URLs* only. Funding items themselves are still fully discovered and extracted automatically. Hand-listing 31 college websites is an afternoon that never needs redoing; hand-listing 400 funding items is a job that would need redoing every term.

### 4.2 Discover
Bounded crawl (depth ≤ 3) from each seed, scoring URLs and anchor text against: `fund · grant · bursary · prize · scholarship · travel · hardship · award · studentship`.

Politeness, non-negotiable:
- Respect `robots.txt`.
- 1 request/second/host, single concurrent connection per host.
- Descriptive `User-Agent` including a contact URL.
- If any college asks us to stop, we stop and remove them.

### 4.3 Fetch
HTML **and PDF**. A large share of college funds live only in PDF regulations or Tutorial Office documents; an HTML-only crawler misses the most valuable half of the tail.

### 4.4 Extract
One Claude call per page, forced structured output, returning zero-or-more `FundingItem` records.

Every record must carry an **`evidence_quote`**: the verbatim source sentence supporting the deadline and amount.

This is the highest-leverage field in the schema. It converts "do I trust this model?" — unanswerable — into "does this sentence say what the record says?" — answerable in two seconds. It also makes hallucination visible rather than plausible, because a fabricated deadline usually cannot produce a matching quote.

An extraction that cannot produce an `evidence_quote` for a deadline must set `deadline_type = unknown` rather than guess.

### 4.5 Review
New and changed items land `pending`. A minimal admin view approves, edits or rejects. **Only `approved` records are public.**

31 colleges is a few hundred items, so the first pass is an evening, not a project. Because review reads one sentence per item rather than a page, it stays tractable.

### 4.6 Refresh
Weekly re-scrape:
- unchanged → bump `last_verified_at`
- changed → back to `pending` with a diff
- disappeared → mark `stale`, **never delete**

Ongoing review is therefore near-zero: only diffs surface.

## 5. Data model

```
Provider
  id, name, kind ENUM(college, department), url, funding_index_url

FundingItem
  id, provider_id FK, title, type, description,
  eligibility_text, eligibility_tags[],
  amount_text,
  deadline_type ENUM(fixed, rolling, annual_recurring, unknown),
  deadline_date NULL,
  application_method, source_url,
  evidence_quote,                        -- verbatim source sentence
  status ENUM(pending, approved, rejected, stale),
  confidence,
  last_scraped_at, last_verified_at,
  embedding vector(1536)

ScrapeRun
  id, provider_id, run_at, pages_crawled,
  items_found, items_new, items_changed, errors
```

Two deliberate choices:

- **`deadline_type = unknown` is a first-class value**, not a null that renders blank. "We don't know" and "there is no deadline" must never look the same to a student.
- **`last_verified_at` is separate from `last_scraped_at`.** Scraped means we fetched it; verified means a human, or an unchanged re-scrape, confirmed it.

## 6. AI assistant

The master spec proposed four subagents. Three of the four stages are not model-shaped work:

| Master spec stage | Reality | Verdict |
|---|---|---|
| Intent extraction | genuine LLM work | **keep** |
| Retrieval | SQL filters + pgvector | deterministic query |
| Matching / ranking | genuine LLM work | **keep** |
| Response composer | string formatting | TypeScript |

**Final pipeline:** free text → *(LLM)* structured query → *(SQL + pgvector, top ~40 candidates)* → *(LLM)* ranked shortlist of 5 → render in TS.

Roughly 3–5s and about half the token cost of the four-call version, with no quality loss.

### Guardrails
- The assistant may never state a deadline or amount absent from the record.
- Every recommendation shows `last_verified_at` and links to source.
- Every recommendation carries an explicit **"why this might not fit"** caveat. Eligibility at Cambridge is narrow and college-bound; a shortlist that only argues *for* each item is actively misleading.

### Evaluation
A small hand-labelled test set (~30 realistic student queries with expert-judged relevant items) built in Phase 4. Worth reusing the Council-of-Judges harness (Cohen's κ, blind preference scoring) once there is a baseline to compare against.

## 7. Frontend

Two v1 nav items: **COLLEGES** and **ASK**. `DEPARTMENTS` is added only when it has data — an empty tab reads worse than an absent one.

- **Hero** — display type used exactly once, full-bleed, no max-width.
- **Listing** — filters for college, type, and deadline status (open / rolling / recurring / unknown). Cards use a comfortable max-width for readability.
- **Assistant** — free-text prompt, ranked recommendations in tinted cards.
- Every card carries `Verified <n> days ago` and a source link. This is the trust mechanism, not decoration.

## 8. Design system

Carried from the master spec, with two changes validated in the mockup.

### 8.1 Typeface — Feijoa (changed)

The master spec specified Saans. **The product uses Feijoa** (Kris Sowersby, Klim Type Foundry), the University of Cambridge brand face, in the licensed `-Cambridge` cut.

Three static cuts are available locally: `Feijoa-Medium-Cambridge`, `Feijoa-MediumItalic-Cambridge`, `Feijoa-Bold-Cambridge`.

**Consequence: the 300/380/570/790 weight ladder collapses to two weights.** That ladder assumed a variable font; Feijoa here is static. macOS also registers the cuts as three *separate families*, so naive `font-weight` produces browser-synthesised fake bold. They must be rebuilt into one synthetic family:

```css
@font-face{ font-family:'Feijoa';
  src:local('Feijoa Medium'), local('Feijoa-Medium-Cambridge');
  font-weight:100 500; font-style:normal; }
@font-face{ font-family:'Feijoa';
  src:local('Feijoa Medium Italic'), local('Feijoa-MediumItalic-Cambridge');
  font-weight:100 500; font-style:italic; }
@font-face{ font-family:'Feijoa';
  src:local('Feijoa Bold'), local('Feijoa-Bold-Cambridge');
  font-weight:501 900; font-style:normal; }
```

Mapping: `300 / 380 → Medium`, `570 / 790 → Bold`.

**Licensing.** The installed files are a *desktop* licence. Serving them as webfonts from a public site would be redistribution and is not permitted. The site therefore uses `src: local()` **exclusively** and never transmits a font file. Cambridge users with Feijoa installed see it; everyone else falls back.

Font stack:
```
'Feijoa', 'Feijoa Medium-Cambridge', 'Newsreader', ui-serif, Georgia, serif
```

Newsreader is the public fallback — a warm high-contrast serif close to Feijoa in spirit. It measures **~16% narrower** than Feijoa on the same string, so headline wrap points differ for fallback visitors. Layouts must not depend on a specific wrap.

*If a Klim webfont licence is later obtained, the `@font-face` blocks gain `url()` sources and nothing else changes.*

### 8.2 Theme — light (changed)

The master spec set `theme: dark`, with Void Blue as canvas and Paper White as text. **The product is light.** Cambridge Blue `#8EE8D8` is the canvas; Void Blue `#133844` is the ink. Canvas and ink swap roles.

| Token | Value | Role | On canvas |
|---|---|---|---|
| `--color-canvas` | `#8EE8D8` | page canvas | — |
| `--color-ink` | `#133844` | text, hairlines, pill borders | 8.76:1 |
| `--color-surface` | `#D1F9F1` | listing-card fill (subtle lift) | 1.26:1 |
| `--color-loud` | `#911449` | active states, links, CTAs, urgent deadlines | 6.12:1 |
| `--color-purple` | `#681FB1` | Colleges category marker | 6.07:1 |
| `--color-green` | `#13553A` | Prizes category marker | 6.15:1 |
| `--rule` | `ink @ 60%` | boundary lines | 3.22:1 |
| `--muted` | `ink @ 85%` | secondary text | 5.63:1 |
| `--faint` | `ink @ 74%` | tertiary text (floor) | 4.53:1 |

Three consequences of the inversion, each measured rather than judged by eye:

**a. The original category accents were correct.** Dark Cherry, Dark Purple and Dark Green measure 6.12 / 6.07 / 6.15 on the light canvas and all pass. They had been calibrated for a light background; the dark canvas was the mismatch. (On the dark canvas they measured 1.43 / 1.44 / 1.42 — indistinguishable from the canvas *and from one another*.) No lift is needed or wanted.

**b. Warm Blue cannot be the loud accent.** `#00BDB6` measures **1.64:1** on the canvas — mint on mint. Darkening it does not rescue it: every teal that becomes legible against the canvas converges on the ink (`#005B57` reaches 5.57:1 on canvas but only 1.57:1 against ink, so it reads as body text). The loud role therefore moves to **Dark Cherry `#911449`**, the only warm hue in the palette and maximally distinct from both canvas and ink.

*Consequence:* Colleges moves from cherry to **purple**, Prizes stays green. Warm Blue is retired from the interactive palette.

**c. Alpha tokens inherited from the dark theme all failed.** `white @70%` on void blue is 6.98:1; `ink @70%` on mint is 4.10:1 — below AA. Alpha degrades asymmetrically toward a light canvas. All opacity values were re-derived against the measured floor. Because the usable range between full ink and the 4.5:1 floor is only ~26% of alpha, a three-step opacity hierarchy does not fit: **hierarchy below secondary comes from size and weight, not further opacity steps.**

### 8.3 The one dark surface

The master spec permitted Light Blue fill on assistant response cards only — the single light surface in a dark system, so recommendations separate from listings.

Inverted, that role survives but flips: `#D1F9F1` now measures 1.26:1 against the canvas and cannot separate anything. **Assistant response cards become the one dark surface** — `#133844` fill with white text (12.52:1 internally, 8.76:1 against the canvas). Same role, mirrored. Light Blue is demoted to listing-card fill.

### 8.4 Unchanged

Type scale, spacing scale and radii carried over unchanged. Ghost pills only — no filled buttons. Flat only — no shadows, glows or elevation. One typeface. Display sizes reserved for the hero.

### 8.5 Verification

Every colour pairing is measured in-browser with alpha composited against its actual background, not approximated from token values. Current state: **minimum text contrast 4.53:1, minimum graphic contrast 3.22:1, zero failures** across 26 pairings. Structural rules verified programmatically: no box-shadows anywhere, no filled pills, single typeface on all rendered text, no horizontal overflow at 1440px.

This check should be kept as a test when the design system moves into the real frontend.

## 9. Stack

| Layer | Choice | Note |
|---|---|---|
| Frontend | Next.js (current, App Router) on Vercel | Master spec pinned 14; that is several majors behind. |
| Database | Supabase Postgres + pgvector | |
| Scraper | Python worker on **GitHub Actions weekly cron** | A weekly batch job does not justify a hosted worker; Edge Functions are a poor fit for Python. |
| LLM | Claude API | Extraction + two assistant calls. |

## 10. Build order

| Phase | Deliverable |
|---|---|
| 0 | Schema, politeness harness, 31 seeded providers |
| 1 | Scrape + extract **3 colleges**, tune extraction, build review queue |
| 2 | Listing UI against that real data |
| 3 | Scale to all 31 colleges, first full review pass |
| 4 | AI assistant + hand-labelled eval set |

UI comes *before* the full scrape deliberately. Designing cards against three colleges of real, messy data beats designing against mock data and discovering the mess later.

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Wrong deadline costs a student an application | **Highest** | Review queue; `evidence_quote`; `unknown` as first-class; `last_verified_at` and source link on every card; disclaimer |
| Extraction quality varies wildly across 31 heterogeneous sites | High | Phase 1 tunes on 3 colleges before scaling |
| Funding hidden behind CRSid login | Medium | Out of scope for v1; public pages only |
| A college objects to crawling | Medium | robots.txt, rate limiting, contactable UA; remove on request |
| Feijoa unavailable to most public visitors | Low | `local()`-only + Newsreader fallback; layout must not depend on wrap points |

## 12. Assumptions

- Public pages only; no authenticated scraping in v1.
- Listings are aggregated from public pages. A prominent disclaimer states that students must confirm details with the college before relying on a deadline.
- No real funding data has been collected yet. The mockup at `mockup/index.html` uses invented sample data throughout.

---

## Appendix — open questions from the master spec

| # | Question | Resolution |
|---|---|---|
| 1 | Public pages only, or authenticated later? | Public only for v1. |
| 2 | Robots.txt / rate-limit policy? | Respect robots.txt; 1 req/s/host; contactable UA; remove on request. |
| 3 | Assistant login or stateless? | Stateless. No accounts in v1. |
| 4 | Pilot or full coverage? | All 31 colleges. Departments deferred. |
