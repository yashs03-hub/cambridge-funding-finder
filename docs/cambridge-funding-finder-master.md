# Cambridge Funding Finder — Master Spec

> Editorial restraint, Cambridge palette — a monochrome UI skeleton with one carried accent colour, built to list every college/department funding opportunity and let an AI assistant match students to the right one.

---

## Part 1 — Product Architecture

### 1. Concept

A single web app that aggregates every Cambridge funding opportunity and prize — split across two tabs, **Colleges** and **Departments** — plus an AI assistant that takes a free-text description of a student's need and recommends the best-fit opportunities to apply for.

AI-native, subagent-driven: scraping, structuring, and matching are each handled by a dedicated subagent rather than one monolithic pipeline.

### 2. Data acquisition

**Source:** scrape college and department websites directly (no manual seed list).

Cambridge has 31 colleges and ~150 departments/faculties. Each publishes funding/prize info differently. Treat scraping as its own subsystem.

**Scraper subagent** — given a college or department root URL, crawls for pages likely to contain funding/prize content (heuristics on URL/anchor text: "fund", "grant", "bursary", "prize", "scholarship", "travel grant", "hardship"), extracts raw text/PDF content, hands off to the structuring subagent.

**Structuring subagent** — takes raw scraped text and extracts a normalized record: `title`, `provider`, `type` (grant/prize/bursary/travel fund/hardship fund), `eligibility` (free text + tags: subject, year of study, nationality/fee-status, need-based y/n), `amount`, `deadline`, `application_method`, `source_url`, `last_scraped_at`. Flags low-confidence extractions for review rather than guessing.

**Refresh strategy** — batch re-scrape on a schedule (weekly/termly), with a diff/changelog so stale listings get flagged rather than silently dropped.

**Open question:** some college funding pages sit behind CRSid login. Recommend public-only for v1, scope authenticated scraping later if needed.

### 3. Data model (draft)

```
Provider
  id, name, kind ENUM(college, department), url

FundingItem
  id, provider_id (FK), title, type, description,
  eligibility_tags (array), amount_text, deadline_type,
  deadline_date (nullable), source_url, last_scraped_at,
  confidence_score

ScrapeLog
  id, provider_id, run_at, pages_crawled, items_found, items_changed
```

### 4. Frontend structure

Two tabs, filterable/searchable list in each:
- **Colleges tab** — filter by college, type, deadline status (open/closed/rolling)
- **Departments tab** — same, filter by department/faculty

Plus a persistent **AI Assistant** panel: free-text need in, ranked shortlist out with rationale, links to source, and deadline urgency.

### 5. AI assistant architecture (subagent-driven)

1. **Intent extraction subagent** — free text → structured query (subject area, degree level, funding type, need-based flag, nationality/fee status, urgency)
2. **Retrieval subagent** — structured filters + embedding similarity search over `description`/`eligibility_tags` (candidate generation only)
3. **Matching/ranking subagent** — scores fit, produces ranked shortlist with rationale and explicit "why this might not fit" caveats
4. **Response composer subagent** — formats shortlist for UI (title, provider, amount, deadline, one-line rationale, source link)

Worth reusing the Council-of-Judges evaluation harness (Cohen's κ / blind preference scoring) to sanity-check ranking quality against a hand-labelled test set later.

### 6. Suggested stack

- **Frontend:** Next.js 14 (App Router)
- **DB + auth:** Supabase (Postgres + pgvector for embedding search)
- **Scraping runtime:** Python worker, scheduled via cron or Supabase Edge Functions
- **LLM orchestration:** Claude Code / Claude API for the four subagents

### 7. Phased build plan

**Phase 1 — Data foundation:** pilot scraper (5 colleges + 5 departments), structuring subagent + manual QA, base schema live in Supabase.
**Phase 2 — Listing UI:** Colleges/Departments tabs, search + filter, no AI yet.
**Phase 3 — AI assistant:** intent → retrieval → ranking → composer pipeline, small hand-labelled eval set.
**Phase 4 — Scale scraping:** full 31 colleges + full department list, scheduling, changelog, review queue.

### 8. Open questions before build spec

1. Public pages only, or authenticated scraping later?
2. Robots.txt/rate-limit policy for scraping at scale?
3. Should the assistant require login (remember profile/status) or stay stateless per session?
4. Pilot scope or full Cambridge coverage for v1?

---

## Part 2 — Design System

> Adapted from the 21 TSI style reference: same editorial restraint (monochrome UI, hairline nav, ghost pill controls, non-linear type scale) with the crimson-photography accent replaced by the Cambridge palette. No fashion photography here — the "photographic surface" role is carried by Cambridge Warm Blue as the one chromatic note in an otherwise black/white/teal system, plus three muted category accents for Colleges / Departments / Prizes.

**Theme:** dark

### Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Void Blue | `#133844` | `--color-void-blue` | Page canvas, deepest surface layer, ghost-button borders on inverted elements (replaces Black Void) |
| Paper White | `#ffffff` | `--color-paper-white` | Primary text, nav labels, ghost-button borders, hairline rules, every UI stroke |
| Smoke | `#4d4d4d` | `--color-smoke` | Muted secondary borders/dividers when full white is too hot against dark blue |
| Cambridge Warm Blue | `#00BDB6` | `--color-warm-blue` | Dominant accent — the one chromatic note in the system; active tab state, primary CTA outline glow, assistant "thinking" state |
| Cambridge Blue | `#8EE8D8` | `--color-cambridge-blue` | Secondary accent — hover states, active filter chips, deadline "open" indicator |
| Cambridge Light Blue | `#D1F9F1` | `--color-light-blue` | Tint fill for rare light-mode surfaces (assistant response cards, highlighted match) |
| Dark Cherry | `#911449` | `--color-cherry` | Category accent — Colleges tab marker |
| Dark Purple | `#681FB1` | `--color-purple` | Category accent — Departments tab marker |
| Dark Green | `#13553A` | `--color-green` | Category accent — Prizes/AI-assistant marker |

Only Cambridge Warm Blue plays the role Crimson Heat played in the source system: it is the single colour allowed to feel "loud." Everything else stays monochrome or muted, and the three category accents are used sparingly — a 4px dot, a thin left-border on a card, never a filled background.

### Tokens — Typography

Unchanged from source. **Saans** — 300/380/570/790 weight ladder, 380 default, 570 mid-voice. Substitute: Inter, Manrope, General Sans.

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 12px | 1.3 | 0.6px | `--text-caption` |
| body-sm | 14px | 1.38 | 0.7px | `--text-body-sm` |
| body | 16px | 1.43 | 0.8px | `--text-body` |
| subheading | 20px | 1.3 | 1px | `--text-subheading` |
| heading-sm | 47px | 1.15 | -1.18px | `--text-heading-sm` |
| heading | 79px | 1.14 | -1.98px | `--text-heading` |
| heading-lg | 106px | 1.11 | -2.65px | `--text-heading-lg` |
| display | 130px | 1.08 | -3.25px | `--text-display` |
| display-lg | 136px | 1.05 | -3.4px | `--text-display-lg` |
| display-xl | 245px | 1 | -6.13px | `--text-display-xl` |

Non-linear scale rule holds: 12–20px cluster for UI chrome (positive tracking), 47px+ for editorial moments (negative tracking), nothing in between. For this product, display sizes are reserved for the funding-finder landing headline and the assistant's hero prompt screen — not for every page.

### Tokens — Spacing & Shapes

**Density:** comfortable. Same spacing scale (10/11/15/19/20/23/27/30/36/38/60/63/108/150/172px) and radii carried over:

| Element | Value |
|---------|-------|
| bodies | 8px |
| buttons | 70px |
| circular | 594px |

### Components (recoloured)

**Top Nav Bar** — 1px white hairline edge-to-edge on `--color-void-blue` canvas. Saans 12px/380/uppercase/0.6px, white. Logo left ('CAM|FUND' or similar wordmark with vertical bar separator), nav items ('COLLEGES', 'DEPARTMENTS', 'ASK THE ASSISTANT') at ~38px gaps, utility cluster right (SEARCH, LOGIN if scoped in).

**Ghost Pill Button** — 70px radius, 1px white border, transparent fill, 10px 20px padding, Saans 12px/380/uppercase/0.6px white. Active/selected state swaps the border to `--color-warm-blue` rather than filling the pill — no filled buttons anywhere in the system.

**Nav Link / Tab Label** — inline text only, Saans 12px/380/uppercase/0.6px white. Active tab gets a 1px underline in the category accent colour (cherry for Colleges, purple for Departments) instead of a filled background.

**Category Marker** — a 4px solid circle in the category accent colour (cherry/purple/green), prefixing each FundingItem card title — the only place the three secondary accents appear.

**Display Headline** — Saans 79–130px, weight 300 or 570, white on `--color-void-blue`. Used once, on the landing/hero screen only: a single declarative line (e.g. "every fund. one place.") — no photography behind it, just void blue and negative space, since this product has no editorial imagery to carry the accent instead.

**Body Card (FundingItem card)** — 8px radius, 1px `--color-smoke` border, transparent or void-blue fill, 20px padding. Title in Saans 16–20px/380/white with the category-accent dot; body copy 14px/380 white at 70% opacity; deadline/amount in `--color-cambridge-blue` as the only coloured text in the card.

**Assistant Response Card** — the one place `--color-light-blue` fill is permitted: a tinted card (light blue fill, void-blue text) for the AI's ranked recommendation, so it visually separates itself from the monochrome listing cards. Rationale text in void-blue at 80% opacity, source link underlined in warm blue.

### Do's and Don'ts (carried over, recoloured)

**Do**
- Use Saans (or Inter/Manrope) for all type.
- Apply 0.05em positive tracking on every uppercase 12–20px label.
- Apply -0.025em tight tracking on every display size 47px+.
- Use the 70px pill radius on every interactive control; never 8px on a button.
- Reserve `--color-warm-blue` for the single "loud" accent — active states, links, CTAs.
- Hold most of the UI to white-on-void-blue plus one hairline; let colour do the differentiating, not shape.
- Use weight 300 for the rare display headline moments; 380/570 for everything else.

**Don't**
- Do not fill buttons with a chromatic background — ghost/outline only, colour shows in the border, not the fill.
- Do not use more than one category accent on a single card.
- Do not use drop shadows, glows, or elevation effects — flat only.
- Do not introduce a second typeface or icon font.
- Do not use a max-width container on the landing/hero screen; content lists (funding cards) can use a comfortable max-width for readability since there's no photography dictating full-bleed here.
- Do not use display sizes below 47px or above 130px for this product — 245px was calibrated for fashion editorial and reads as excessive for a funding directory.

### Quick Start — CSS Custom Properties

```css
:root {
  /* Colors */
  --color-void-blue: #133844;
  --color-paper-white: #ffffff;
  --color-smoke: #4d4d4d;
  --color-warm-blue: #00BDB6;
  --color-cambridge-blue: #8EE8D8;
  --color-light-blue: #D1F9F1;
  --color-cherry: #911449;
  --color-purple: #681FB1;
  --color-green: #13553A;

  /* Typography */
  --font-saans: 'Saans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  --text-caption: 12px; --leading-caption: 1.3; --tracking-caption: 0.6px;
  --text-body-sm: 14px; --leading-body-sm: 1.38; --tracking-body-sm: 0.7px;
  --text-body: 16px; --leading-body: 1.43; --tracking-body: 0.8px;
  --text-subheading: 20px; --leading-subheading: 1.3; --tracking-subheading: 1px;
  --text-heading-sm: 47px; --leading-heading-sm: 1.15; --tracking-heading-sm: -1.18px;
  --text-heading: 79px; --leading-heading: 1.14; --tracking-heading: -1.98px;
  --text-heading-lg: 106px; --leading-heading-lg: 1.11; --tracking-heading-lg: -2.65px;
  --text-display: 130px; --leading-display: 1.08; --tracking-display: -3.25px;
  --text-display-lg: 136px; --leading-display-lg: 1.05; --tracking-display-lg: -3.4px;
  --text-display-xl: 245px; --leading-display-xl: 1; --tracking-display-xl: -6.13px;

  --font-weight-light: 300;
  --font-weight-w380: 380;
  --font-weight-w570: 570;
  --font-weight-w790: 790;

  /* Spacing */
  --spacing-10: 10px; --spacing-11: 11px; --spacing-15: 15px; --spacing-19: 19px;
  --spacing-20: 20px; --spacing-23: 23px; --spacing-27: 27px; --spacing-30: 30px;
  --spacing-36: 36px; --spacing-38: 38px; --spacing-60: 60px; --spacing-63: 63px;
  --spacing-108: 108px; --spacing-150: 150px; --spacing-172: 172px;

  /* Layout */
  --section-gap: 30-60px;
  --card-padding: 20px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-bodies: 8px;
  --radius-buttons: 70px;
  --radius-circular: 594px;

  /* Surfaces */
  --surface-page-canvas: #133844;
  --surface-hairline-rule: #ffffff;
  --surface-accent: #00BDB6;
}
```

### Tailwind v4

```css
@theme {
  --color-void-blue: #133844;
  --color-paper-white: #ffffff;
  --color-smoke: #4d4d4d;
  --color-warm-blue: #00BDB6;
  --color-cambridge-blue: #8EE8D8;
  --color-light-blue: #D1F9F1;
  --color-cherry: #911449;
  --color-purple: #681FB1;
  --color-green: #13553A;

  --font-saans: 'Saans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  --text-caption: 12px; --leading-caption: 1.3; --tracking-caption: 0.6px;
  --text-body-sm: 14px; --leading-body-sm: 1.38; --tracking-body-sm: 0.7px;
  --text-body: 16px; --leading-body: 1.43; --tracking-body: 0.8px;
  --text-subheading: 20px; --leading-subheading: 1.3; --tracking-subheading: 1px;
  --text-heading-sm: 47px; --leading-heading-sm: 1.15; --tracking-heading-sm: -1.18px;
  --text-heading: 79px; --leading-heading: 1.14; --tracking-heading: -1.98px;
  --text-heading-lg: 106px; --leading-heading-lg: 1.11; --tracking-heading-lg: -2.65px;
  --text-display: 130px; --leading-display: 1.08; --tracking-display: -3.25px;

  --spacing-10: 10px; --spacing-11: 11px; --spacing-15: 15px; --spacing-19: 19px;
  --spacing-20: 20px; --spacing-23: 23px; --spacing-27: 27px; --spacing-30: 30px;
  --spacing-36: 36px; --spacing-38: 38px; --spacing-60: 60px; --spacing-63: 63px;
  --spacing-108: 108px; --spacing-150: 150px; --spacing-172: 172px;

  --radius-bodies: 8px;
  --radius-buttons: 70px;
  --radius-circular: 594px;
}
```
