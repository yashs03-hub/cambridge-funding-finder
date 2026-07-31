# Extraction rules

The contract for turning a college's cached page text into funding records.
Followed by `scripts/extract-awards.mjs` (API path) and by the per-college
extraction agents. Kept in one place so both paths cannot drift apart, and so
the rules are reviewable as a diff rather than buried in prompt strings.

**Every rule below exists because of a specific wrong record.** None is
hypothetical. Read the parenthetical before deciding a rule is over-cautious.

---

You are building a public listing students rely on to decide where to apply.
A plausible but wrong record is far worse than a missing one: it costs a
student an application they cannot get back. When in doubt, omit the award, or
record less about it.

### 1. Evidence quotes are verbatim

Copy the supporting sentence character for character from the page text —
including typos, doubled spaces and missing spaces. Do not tidy, paraphrase,
correct or join sentences.

`scripts/promote-extracted.mjs` re-fetches the page and rejects any record
whose quote is not found, so a tidied quote is a deleted record. If you cannot
copy an exact sentence, you may not make the claim it would support.

(*Trinity's page reads `January-July 2026,or by 31st May` with no space after
the comma. A hand-written record silently fixed it and failed verification.*)

The reliable technique: locate the sentence in the file and slice it out
programmatically, then assert the slice round-trips, rather than retyping it.

### 2. Only this college's own funding

These pages routinely list University-wide funds, NHS bursaries, government
support and external charities alongside the college's own awards. Record
**only** what this college itself offers. If a fund is described as
University-wide, external, national, or is administered by another college,
omit it and count it.

(*Girton's page lists the Donald Robertson Travel Fund — "strenuous open-air
holidays… preferably among mountains" — under a heading reading "University
**and** College Travel Awards", secretary at `trin.cam.ac.uk`. Recording it as
Girton's would tell students elsewhere they cannot apply, which is false.*)

### 3. Omit the central schemes

Already indexed centrally, so listing them is duplication: Cambridge Bursary
Scheme, student loans, Disabled Students' Allowance, NHS bursaries.

### 4. Only awards a student can apply for or be considered for

Many colleges list prizes "awarded by the Governing Body" where "applications
are not required". Those are honours, not opportunities. Omit and count them.

(*Downing publishes ~25 such prizes. Listing them buries the awards a student
can actually act on.*)

### 5. Deadlines are claims and need evidence

`deadline_type` is exactly one of:

| Value | When | Also set |
|---|---|---|
| `fixed` | The text gives an explicit calendar date **including the year** | `deadline_date` as `YYYY-MM-DD`; quote the sentence containing that date |
| `annual_recurring` | Recurs on a stated cycle with no full date — "each term", "by 1 June each year", "from 1 January" | `deadline_recurrence` in the source's own words; quote the sentence stating it |
| `rolling` | The text explicitly says applications are accepted at any time | — |
| `unknown` | **Everything else**, including when a deadline obviously exists but the page does not state it | — |

`unknown` is a normal, correct answer. Never guess a date.

(*The enum promised "annual" and the data was not: of ten recurring awards at
the first three colleges, three were termly and four ran from 1 January. A
generic "Recurs annually" label was wrong for seven of ten.*)

### 6. Do not invent amounts

`amount_text` is a faithful short rendering of what the page says, or `null`.
Never estimate. Keep the source's word order — write "£21.00 a week from
2025-26", not a rearrangement.

### 7. Titles are the page's own names

Exactly as written, even if they look odd. *"Pamela Thayer & Arts and
Humanities PhD Studentship"* is a real heading; keep it.

### 8. Some pages contain no awards. Returning zero is correct.

Pages listing past recipients, student trip reports, news, staff profiles or
archives use **identical vocabulary** to funding pages. Quoting them produces
records that look verifiable and are worthless.

Decide what each page **is** before extracting anything. If it is a report,
recipient list, news item, archive or profile, skip it entirely and count it.
A heading naming a person or a past year is a record of an outcome, not an
opportunity.

(*Pembroke's `/travel-grant-reports/` page yielded 29 "awards" that were
student names and destinations — "Ahrandeep Aujla - Medical elective in Japan,
Summer 2016". Every quote was verbatim, so all 29 passed the evidence check.
**Verifying that a quote exists is not verifying that the record is an
award.** This rule is the only thing that catches it.*)

### 9. Flag the long tail

This product exists for funding no central database indexes: travel grants,
hardship funds, book and equipment grants, conference bursaries, elective
funds, music and sports awards, small prizes.

Set `long_tail: true` on those. Set `long_tail: false` on large named
scholarships and studentships (roughly £5,000+), which are usually indexed
centrally. Record both — a college genuinely offers both, and silently
dropping one is its own kind of lie — but the flag lets the listing lead with
what is not findable elsewhere.

---

## Record shape

```jsonc
{
  "title": "string",                 // the page's own name
  "type": "travel|hardship|grant|prize|bursary|scholarship",
  "description": "string",           // 1-3 factual sentences from the page
  "eligibility_text": "string|null",
  "eligibility_tags": ["short", "lowercase"],
  "amount_text": "string|null",
  "deadline_type": "fixed|annual_recurring|rolling|unknown",
  "deadline_date": "YYYY-MM-DD|null",
  "deadline_recurrence": "string|null",
  "application_method": "string|null",
  "evidence_quote": "string",        // VERBATIM
  "source_url": "string",            // first line of the file the quote came from
  "long_tail": true
}
```

Plus per-college counts: `honours_omitted`, `external_omitted`, `pages_skipped`.
Counting what was dropped matters — a silent omission reads as "this college
has no funding" when it may mean the opposite.
