# Data pipeline — git as the database

**Decision, 2026-07-29:** the funding dataset is a committed JSON file
(`data/funding.json`), not a Postgres database. This supersedes §9 of the design
spec, which specified Supabase.

## Why

The spec's own refresh semantics describe git. §4.6 wants: unchanged → bump a
timestamp; changed → back to `pending` **with a diff**; disappeared → mark stale,
**never delete**. §4.5 wants a queue where someone approves, edits or rejects,
reading one evidence quote per item.

That is a pull request. Building it on Postgres means writing a review UI, an
auth layer for that UI, and a diff renderer — to reproduce what code review
already does, for a dataset of ~400 rows that changes once a week and is
read-only to the public.

What dropping the database buys:

- **No secrets.** There is no anon key, no service-role key, nothing to leak or
  rotate.
- **The review gate stops being a policy.** Under Postgres, "only approved
  records are public" is an RLS policy someone must apply and verify — get it
  wrong and every unreviewed LLM extraction is readable by anyone with the anon
  key. Here, unapproved records are simply not in the deployed artifact.
- **No idle-pause risk.** A funding site sees term-time bursts and vacation
  silence, which is exactly the traffic shape that gets a free-tier project
  suspended.
- **Versioned data.** Rollback is `git revert`.

## What it costs

The review queue is a PR diff, so reviewers need to be comfortable with GitHub.
If reviewing is ever delegated to someone who isn't, a hosted database with a
web admin becomes the better trade. `docs/reference-schema.sql` keeps the
relational model for that case.

## File format

```jsonc
{
  "status": "placeholder" | "live",
  "generated_at": "2026-08-04T03:00:00Z" | null,
  "items": [ /* FundingItem — see lib/types.ts */ ]
}
```

`status` is explicit rather than derived from `items.length`, and the asymmetry
is deliberate:

| `status` | Site serves |
|---|---|
| `placeholder` | Invented sample awards, behind the sample-data banner |
| `live` | The file's items — **never** sample data, even if `items` is empty |

A scraper bug that empties a live dataset must produce an honest empty listing,
not a silent reversion to fabricated awards. Deriving the mode from whether the
array happens to be empty would allow exactly that.

## Invariants

`lib/dataset.ts` validates the file; `test/dataset.test.mjs` runs it in CI. Two
of the rules were CHECK constraints in the Postgres schema and carry over
unchanged, because they are what stops a half-extracted record rendering as an
award a student could act on:

- `deadline_type = 'fixed'` **must** have a `deadline_date`.
- `deadline_type = 'fixed'` **must** have an `evidence_quote`. An extraction that
  cannot quote a source sentence for its deadline records `unknown` instead of
  guessing (§4.4).
- `deadline_type = 'annual_recurring'` **must** have a `deadline_recurrence` and
  an `evidence_quote`. Added after the first real crawl — see below.

Plus: unique ids, absolute `source_url` (it is the trust link on every card),
`YYYY-MM-DD` dates, known enum values, and no record whose `status` is anything
other than `approved`.

Validation runs at module load in `lib/data.ts`, so a malformed file fails the
build — on the scraper's own pull request, not in front of a student.

## What the first real crawl changed (2026-07-29)

Three colleges were discovered, fetched and extracted by hand as a spike
before committing to the full pipeline, then discovery was generalised to all
31. Six findings, each now encoded somewhere rather than written down here only.

**1. "Recurs annually" was wrong for most recurring awards.**
Of the ten recurring awards found, three were *termly* (Newnham's book grants,
equipment grants and Master's research fund), four ran *from 1 January*
(Churchill's four sizarships), and one closed on *1 June each year* (the
Kathleen Hughes Memorial Fund). The enum name promised a cycle the data does
not have. Records now carry `deadline_recurrence` — the source's own wording —
and the UI prints that instead of a generic label. A recurring record that
cannot state its cycle degrades to `unknown`, the same rule as a `fixed`
deadline with no date. Enforced in `lib/dataset.ts` and `test/dataset.test.mjs`.

**2. Funding pages compete with fundraising pages, and fundraising wins.**
On a college website "funding" points in two opposite directions: money coming
to a student, and money coming from a donor. Colleges publish far more of the
latter. `scripts/discover-funding-pages.mjs` therefore scores both ways, with
donor vocabulary (donate, giving, legacy, alumni, campaign, benefactor)
*subtracting*. Darwin College is the proof: the only funding-shaped links on its
homepage are `/alumni-and-supporters/donate/` and the campaign page, so the
homepage pass returns **zero** rather than a confident wrong answer — and the
crawl-depth fallback below then finds the real page at `/study/awards/`.

**3. One line of CMS boilerplate can fence off a whole college.**
Newnham runs Drupal, whose stock robots.txt disallows a path containing a
wildcard in the middle. Reading that as a literal prefix yields `/`, which
matches every URL *and* wins the longest-match tie-break — the crawler silently
skips a college that never asked it to. `test/robots.test.mjs` pins the correct
wildcard semantics, along with crawl-delay precedence and named-agent groups.

**4. Coverage is 31 of 31, but only after adding crawl depth.**
The homepage pass alone reached 29. Darwin and Peterhouse do not link student
funding from their homepage at all — a crawl-depth problem, not a scoring one,
so the fix was more URLs rather than looser keywords (loosening them would just
promote the donation pages the scoring exists to reject). Two fallbacks now fire
when the homepage pass scores below 30: the site sitemap, then one hop through
the homepage own section pages. Final routes: 8 homepage-only, 8 sitemap,
7 second-level, 8 both. Only Emmanuel still scores under 30, and its page
(/admissions/postgraduates/funding) is correct — just a short path carrying
few signals.

**5. Section noise had to become a hard exclusion, not a penalty.**
Wolfson top hit was a news story whose URL contained "travel-grants". Penalising
the path did not work: the article genuinely lists amounts, eligibility and how
to apply, so it earned those content points honestly and climbed back to the top.
The page is disqualified by what it IS — an article — not by how it reads. News,
blog, event, person and dated paths are now excluded outright, and the count of
dropped URLs is reported per college (443 across the 31), because a silent filter
reads as "this college has no funding page" when it may mean the opposite.

**6. Scoring lives in scripts/lib/score.mjs so it can be tested.**
A regex that silently matches nothing looks identical to one that works. A shell
heredoc ate the word-boundary escapes during development, turning the news filter
into a pattern containing literal backspace characters — it compiled, ran, matched
nothing, and raised no error. test/discovery-score.test.mjs asserts against the
real URLs that shaped each rule, and fails outright on any signal containing a
control character.

## What extraction taught us (2026-07-30)

**7. A funding index page is not all the college's own funding.**
Girton's page lists the Donald Robertson Travel Fund — grants for "strenuous
open-air holidays in the Long Vacation, preferably among mountains" — under a
heading reading "University and College Travel Awards", and its secretary is at
trin.cam.ac.uk. Attributing it to Girton would tell a student at another college
that they cannot apply, which is false. Extraction records only funds the page
presents as the college's own; mixed pages need the heading read, not just the
list. This is the attribution version of the donor-page trap: the vocabulary is
right and the owner is wrong.

**8. Not every prize is something you can apply for.**
Downing publishes about twenty-five named prizes, nearly all of them "Awarded by
Governing Body. Applications are not required." They are real, but a listing that
fills with awards a student cannot act on buries the ones they can. Only
actionable awards were extracted in this pass. Whether the product should show
non-applicable honours at all — and how to mark them if so — is a design
decision, not an extraction one.

**9. Verbatim means verbatim, including the source's typos.**
`scripts/verify-evidence.mjs` re-fetches every `source_url` and checks that each
`evidence_quote` really appears. On its first run it failed exactly one record:
Trinity's page reads "January-July 2026,or by 31st May" with no space after the
comma, and the quote had been silently tidied while the record was written. A
quote that has drifted is worse than no quote, because it looks like
verification. The checker normalises whitespace and quote characters only — it
will not normalise a paraphrase into a match.

It is deliberately not part of `npm test`: it makes live requests to 31
colleges' servers, and a college editing its own page is not a reason to fail
someone's build. Run it when adding records, and on a schedule beside the
scraper.

## Scraper contract (Phases 1–3, not yet built)

Weekly GitHub Actions cron:

1. Crawl the 31 seeds in `lib/colleges.ts` (robots.txt, 1 req/s/host,
   contactable User-Agent).
2. Fetch HTML **and PDF**.
3. Extract with one Claude call per page, forced structured output, every record
   carrying an `evidence_quote`.
4. Diff against the current `data/funding.json`.
5. Open a pull request with the new file.

Review the diff, merge, and Vercel redeploys. Items that disappear from source
are dropped from the file rather than deleted from history — the record of them
lives in git.
