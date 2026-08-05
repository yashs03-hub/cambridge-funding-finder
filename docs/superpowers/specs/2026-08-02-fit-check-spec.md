# Fit Check — Design Spec

**Date:** 2026-08-02
**Status:** Draft, for discussion with Yash
**Extends:** `2026-07-28-cambridge-funding-finder-design.md` §6 (AI assistant), reuses its infrastructure rather than replacing it

---

## 1. Problem

The listing and the `/ask` assistant both answer "which awards might fit me." Neither answers the question a student actually has once they've found one: **"what does this fund's own criteria want, and where does my situation not yet match it?"**

That gap is also the monetization answer for a product whose raw data is public: aggregation alone is a UI improvement over the college's own page, which is not something students pay for. A feature that reads a fund's actual stated criteria against a student's actual situation and tells them what's missing is a genuine step up from "public info, nicer layout" — provided it does not claim more than the data supports.

## 2. What this explicitly is not

**Not a probability.** The rejected version of this idea was "tell the student their % chance of winning." Most of these awards get single-digit-to-low-double-digit applicants a year, and nobody has (or should try to obtain) labelled outcome data — successful and rejected applications — for them. A confident-sounding number built on that little data is not a prediction, and a wrong one costs a student a shot at money they need. This is the same failure mode §3 of the parent spec names as the highest-severity risk in the whole product ("a plausible but wrong record is far worse than a missing one"), just moved from data extraction to advice-giving. Fit Check never outputs a score, a percentage, or any language implying likelihood.

**Not a predictive model.** No training data, no fine-tuning, no comparison against past applicants. It is a single model call reading two pieces of text against each other: the record's own `eligibility_text` / `description` / `evidence_quote`, and what the student wrote about themselves. Same shape as the existing `/ask` assistant, applied to one record instead of ranking many.

## 3. Scope decisions

| Decision | Choice | Rationale |
|---|---|---|
| Grounding | **Only the stored record's own fields** (`eligibility_text`, `description`, `evidence_quote`, `amount_text`) | Same guardrail as `ask()` — the model must not introduce a criterion the source page never stated. |
| Output shape | **Matches / gaps list, no score** | §2 above. A gap the model names must be traceable to a specific clause in the record. |
| Entry point | **Per-award, opt-in** ("Check my fit" on a specific `FundingCard`/`RecommendationCard`), not folded into `/ask` | `/ask` answers "which awards" across ~450 records; this answers "this one award" in depth. Conflating them would mean re-running a heavy prompt against every candidate on every query. |
| State | **Stateless**, same as `/ask` | No accounts, no stored drafts, matches parent spec §2's "no login, no stored personal data, no GDPR surface." The student's text is sent to the model call and discarded after the response, same as `/ask`'s query. |
| Monetization boundary | **Not decided in this spec** | Free/paid split is a product decision for you and Yash, not an engineering one. The implementation should make it a single gate (e.g. a rate limit or flag on the route handler) so the decision can change without touching the prompt or the guardrails. |

**Explicitly out of scope:** a success score of any kind; storing or reusing a student's submitted text beyond the single request; comparing against any other student's application; anything requiring the student to create an account.

## 4. Worked example

Using a record already in `data/funding.json` (Wolfson College Hardship Fund):

> eligibility_text: "Both undergraduates and postgraduates may apply, except students in their first term of study, students who have not taken out Tuition or Maintenance loans for which they are eligible, part-time students, any student who has already completed all the requirements for their degree, and PhD students who have already completed four years of full-time study."

Student input: *"I'm a Wolfson PhD student, 5th year, hit with unexpected medical bills, need help with living costs and my college bill this term."*

Expected output shape:
- ⚠️ blocker — "This fund excludes PhD students who've completed four years of full-time study; you said you're in year 5. Confirm your exact registration status before applying."
- ⚠️ scope mismatch — "The fund excludes 'regular College bills'; your college-bill costs likely won't qualify even if the medical-cost portion does."
- ✅ unstated precondition — "Confirm in your application that you've taken out your Maintenance Loan — that's a stated requirement you didn't mention."

Every line traces to a clause in `eligibility_text` — nothing here is inferred from outside the record.

## 5. Technical design — extends `lib/assistant.ts`

New function alongside `ask()`, same file, same model-call shape:

```ts
export interface FitCheckResult {
  matches: FitPoint[];
  gaps: FitPoint[];
}
interface FitPoint {
  point: string;       // the specific clause or fact, in the model's words
  basis: string;       // the exact source field it came from (eligibility_text | description | evidence_quote)
}

export async function checkFit(
  item: FundingItem,
  studentInput: string,
): Promise<FitCheckResult>
```

Reuses:
- `OPENAI_API_KEY` / `isAssistantConfigured()` — same key, same "off means honestly off" behaviour as `/ask`.
- The `AssistantUnavailable` error class and the three-failure-mode handling in `app/api/ask/route.ts` (no key → 501, sample data → 501, model unreachable → 503) — copied to a new `app/api/fit-check/route.ts` rather than branching inside the existing route, so `/ask`'s behaviour can't regress.
- The id/field discipline from `ask()`'s guardrails (§6 of the parent spec): the model receives the record's fields as structured input, same as `candidateLine()` does today, and may only write text that attributes to a named field — never introduce a number, date or rule the record doesn't contain.

### Guardrails (extending §6's guardrails, not replacing them)

1. No score, percentage, or likelihood language in either `matches` or `gaps` — enforced by the system prompt and spot-checked in the eval set (§6).
2. Every `FitPoint` must set `basis` to one of the record's own field names. A point with no traceable basis is dropped before rendering, same pattern as `ask()` dropping a recommendation with no `caveat`.
3. The model never sees or infers anything about the student beyond the literal text they submitted — no name, no assumed background, mirroring rule 6 of the existing `SYSTEM` prompt.
4. If `eligibility_text` is `null` (many records legitimately have no stated eligibility), the response says so plainly rather than inventing criteria to react to.

## 6. Evaluation

Same instinct as the parent spec's §6 evaluation section, applied here: a small hand-built set (~15–20 pairs of a real record + a plausible student situation, with expert-judged correct gaps) to check two things before shipping — that flagged gaps are genuinely traceable to the record, and that no output drifts into score/probability language. Cheaper to build than the parent spec's 30-query set, since it's judging one record against one input rather than ranking across the dataset.

## 7. Decisions (2026-08-02)

1. **Monetization gate: not decided — free to start, deliberately.** Correction from an earlier draft of this doc, which had this backwards. The plan is the opposite of paid-from-launch: pilot manually first, then let real students use Fit Check for free, and use that actual usage/feedback to find out whether it's something they'd pay for at all — rather than guessing a price before anyone has touched it. Whether/how to charge is left an open question for later, informed by that feedback, not fixed now. The route-handler gate (§3) still exists as a single toggle point so a paid tier can be switched on later without touching the prompt or guardrails — but nothing about launch requires it to be paid.
2. **Frontend surface: in-place expansion.** A "Check my fit" control on `FundingCard`/`RecommendationCard` that expands inline, confirmed — no new page, no new nav item, matches the parent spec's "don't add UI surface before it's earned" instinct.
3. **Pilot manually first: confirmed.** Before writing `checkFit()` or the route, you and Yash will do the matches/gaps comparison by hand for a handful of real students — both to sanity-check the output and to start gathering the feedback that (1) above depends on.
