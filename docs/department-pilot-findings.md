# Department pilot — findings

**Run 2026-08-02. Ten departments discovered and fetched, the five most
promising extracted. Recommendation: do not proceed to the remaining ~85.**

This is a negative result, recorded because the next person to look at the
department A–Z will otherwise reach the same question and pay the same cost to
answer it.

---

## Numbers

| | Colleges | Department pilot |
|---|---|---|
| Providers | 31 | 10 discovered, 5 extracted |
| Pages fetched | 147 | 49 |
| Money mentions | 761 | **25** |
| Money mentions per page | 5.2 | **0.5** |
| Awards recorded | 449 | **12** |
| Long tail | 275 (61%) | **5 (42%)** |
| Long tail per provider | **8.9** | **1.0** |

The five extracted were chosen as the *most* promising — the ones with money
mentions or a genuine funding index. The other five had zero money mentions
between them. So 1.0 long-tail awards per provider is an optimistic figure,
not a representative one.

Omitted during extraction: **37 external/University funds, 5 job adverts, 6
honours** — against 12 records kept. More was rejected than recorded.

---

## Why departments differ from colleges

**Colleges support students they already have. Departments recruit students
they do not.**

That single difference explains almost everything below. A college publishes
travel grants, hardship funds and book grants for its current members. A
department publishes studentships to attract applicants — and a funded PhD
position is a job advert, not a grant a current student can apply for.

The vocabulary is identical. Chemistry's highest-scoring funding page was
literally `/jobs/studentships`.

### Three consequences

**1. The long tail is not there.** Not one of the ten top discovery candidates
was a travel grant, hardship fund, book grant or conference bursary. Seven of
ten were studentships, which `student-funding.cam.ac.uk` already indexes —
the one thing this product exists *not* to duplicate.

**2. Departmental pages are mostly other people's money.** Engineering
recorded **zero** awards while omitting 10 external funds and 3 job adverts:
its entire "funding opportunities" page is signposting plus recruitment.
Archaeology, the best performer, omitted 14 external funds to keep 6.

**3. Some pages are not about students at all.** Mathematics' top-scoring page
was the Adams Prize — awarded to UK appointment holders under 40, not
students. The extractor correctly rejected it, but only because the rule was
written after discovery surfaced it.

---

## Quality of what survived

Of the 5 records flagged `long_tail`, honest assessment:

| Record | Verdict |
|---|---|
| Anthony Wilkin Ethnology and Archaeology Fund | genuine |
| The Dorothy Garrod Memorial Trust Fund | genuine |
| Rayleigh-Knight Prize | genuine |
| **University Fieldwork Fund** | **likely mis-attributed** — the name says University |
| Faculty of History Trust Funds | a container, not an award; no amount, no deadline |

So **three usable long-tail awards from five departments**, and one attribution
error that survived despite rule 11 stating the risk explicitly. That is the
important part: *an explicit attribution rule was not sufficient*. A fund whose
name literally begins "University" was still recorded as departmental.

At college scale, attribution errors were rare enough to catch by reading. At
department scale — where the majority of every page is someone else's fund —
they would need a dedicated verification pass, which is a new gate to build.

---

## Extrapolation

~85 remaining departments at the observed rate:

- **~50 genuine long-tail awards** (+18% on the current 275)
- **~150 large studentships** duplicating the central database
- **an unknown number of attribution errors** requiring human review

The cost is one crawl and ~85 extraction agents. The benefit is real but
modest, and it arrives bundled with three times as many records that make the
listing worse.

---

## Recommendation

**Stop here.** Higher-value work with the same effort:

1. **The weekly cron.** 446 records decay from the day they were scraped;
   nothing currently detects a changed deadline. Freshness protects the value
   already built.
2. **Deadline sorting.** 354 of 446 records have `unknown` deadlines. Ranking
   evidenced deadlines first is a UI change worth more than 50 extra records.
3. **Societies** (never started) look worse than departments on every axis:
   frequently no website, often a Facebook page, and dominated by
   past-winner pages that rule 8 already excludes.

**If departments are wanted later**, the narrow version is defensible: crawl
them, but promote **only** `long_tail: true` records, and add an attribution
verification pass. That yields the ~50 without the ~150 that dilute.

---

## What was built and kept

Reusable regardless of the decision:

- `lib/departments.ts` — the 10-department pilot seed list, with notes on why
  enumeration is a filtering problem (the A–Z mixes 124 hosts including
  `philanthropy`, `museums`, `map` and both study portals).
- `--seeds` / `--out` on discovery and `--discovery` on fetch, so any provider
  set reuses the pipeline rather than forking it.
- Extraction rules 10 (job adverts) and 11 (attribution), which apply to any
  non-college provider.

Nothing from this pilot was promoted into `data/funding.json`.

---

## Appendix — the full pilot output

Preserved here because the conclusion above is committed and the raw candidate
files are gitignored. A negative result whose evidence has been deleted is just
an assertion.

### Per department

| Department | Awards | Long tail | External omitted | Job adverts omitted | Honours omitted |
|---|---|---|---|---|---|
| Department of Archaeology | 6 | 3 | 14 | 0 | 0 |
| Department of Computer Science and Technology | 3 | 0 | 8 | 2 | 5 |
| Department of Engineering | 0 | 0 | 10 | 3 | 0 |
| Faculty of History | 2 | 1 | 5 | 0 | 0 |
| Faculty of Mathematics | 1 | 1 | 0 | 0 | 1 |

### Every record extracted

| Provider | Award | Tier | Amount | Deadline |
|---|---|---|---|---|
| Archaeology | Department of Archaeology MPhil Bursary | large | £15000 | unknown |
| Archaeology | The McBurney/St Edmund's College MPhil Bursary in Geoarchaeology | large | — | unknown |
| Archaeology | Thomas Mulvey Egyptology Fund | large | One award of £5000 for each of the two degree programmes | unknown |
| Archaeology | Anthony Wilkin Ethnology and Archaeology Fund | **tail** | — | annual_recurring |
| Archaeology | The Dorothy Garrod Memorial Trust Fund | **tail** | — | annual_recurring |
| Archaeology | University Fieldwork Fund | **tail** | — | annual_recurring |
| Computer Science and Technology | Premium Research Studentship | large | — | annual_recurring |
| Computer Science and Technology | The Hopper Studentship | large | — | unknown |
| Computer Science and Technology | CASCADE Computer Architecture & Semiconductor Design Centre | large | — | unknown |
| History | Colombo: Layered Histories in the Global South City Studentship | large | full tuition fees at the University of Cambridge over three years, plus a maintenance allowance of £21,805 per year and a budget for training and research | fixed |
| History | Faculty of History Trust Funds | **tail** | — | unknown |
| Mathematics | Rayleigh-Knight Prize | **tail** | — | fixed |

Read the tier column against the product premise: of twelve records, five are
long tail, and of those five only three survive inspection — the "University
Fieldwork Fund" is almost certainly mis-attributed and "Faculty of History
Trust Funds" is a container rather than an award.

Three usable long-tail awards, from the five most promising of ten departments.
