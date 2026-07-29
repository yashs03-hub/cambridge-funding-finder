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

Plus: unique ids, absolute `source_url` (it is the trust link on every card),
`YYYY-MM-DD` dates, known enum values, and no record whose `status` is anything
other than `approved`.

Validation runs at module load in `lib/data.ts`, so a malformed file fails the
build — on the scraper's own pull request, not in front of a student.

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
