import type { FundingData, FundingItem } from './types';

/**
 * ⚠ INVENTED DATA. Every award, amount and deadline below is fabricated for
 * design review, carried over from mockup/index.html. The colleges are real;
 * nothing else on this page is. No scraping has been run.
 *
 * This exists so the site runs with zero configuration before Phase 1 has
 * produced any real records. `FundingData.isSample` is set true here and the
 * banner is driven from that flag, so these can never render as if real.
 *
 * Deadlines are expressed as OFFSETS from today rather than fixed dates, so
 * the urgent / open / closed states stay demonstrable instead of all drifting
 * into the past and making the listing look broken.
 */

const DAY = 86_400_000;

function iso(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
}

export function sampleData(now: Date = new Date()): FundingData {
  const verified = new Date(now.getTime() - 3 * DAY).toISOString();
  const scraped = verified;

  const base = {
    status: 'approved' as const,
    confidence: null,
    last_scraped_at: scraped,
    last_verified_at: verified,
    // Default; the one recurring sample overrides it. Required on every
    // record so the sample set exercises the same invariants as live data.
    deadline_recurrence: null as string | null,
    // The sample set is all long tail by construction — it exists to show the
    // listing doing its actual job.
    long_tail: true,
  };

  const items: FundingItem[] = [
    {
      ...base,
      id: 'sample-1', provider_id: 'trinity', provider_name: 'Trinity College',
      title: 'Travelling Studentship', type: 'travel',
      description: "Supports vacation travel connected to a member's course of study, including fieldwork and archive visits abroad.",
      eligibility_text: 'Members of Trinity College reading any subject.',
      eligibility_tags: ['Travel', 'UG + PG', 'Any subject'],
      amount_text: 'up to £1,200',
      deadline_type: 'fixed', deadline_date: iso(now, 17),
      application_method: 'Apply via the Tutorial Office.',
      source_url: 'https://www.trin.cam.ac.uk',
      evidence_quote: 'Applications close on 14 August and awards of up to £1,200 are made.',
    },
    {
      ...base,
      id: 'sample-2', provider_id: 'st-johns', provider_name: "St John's College",
      title: 'Student Hardship Fund', type: 'hardship',
      description: 'Discretionary assistance for members facing unexpected financial difficulty during their course. Assessed case by case by the Tutorial Office.',
      eligibility_text: 'Matriculated members in unexpected financial difficulty.',
      eligibility_tags: ['Hardship', 'Need-based', 'UG + PG'],
      amount_text: 'Variable',
      deadline_type: 'rolling', deadline_date: null,
      application_method: 'Speak to your Tutor.',
      source_url: 'https://www.joh.cam.ac.uk',
      evidence_quote: 'Applications may be made at any point during the year.',
    },
    {
      ...base,
      id: 'sample-3', provider_id: 'kings', provider_name: "King's College",
      title: 'Book & Equipment Grant', type: 'grant',
      description: 'Annual allowance towards books, software and course equipment. Claimed against receipts at the end of each term.',
      eligibility_text: 'Undergraduate members.',
      eligibility_tags: ['Grant', 'UG', 'Any subject'],
      amount_text: '£150 / year',
      deadline_type: 'annual_recurring', deadline_date: null,
      deadline_recurrence: 'Claimed at the end of each term',
      application_method: 'Submit receipts to the Tutorial Office.',
      source_url: 'https://www.kings.cam.ac.uk',
      evidence_quote: 'An allowance of £150 per year is available to undergraduates.',
    },
    {
      ...base,
      id: 'sample-4', provider_id: 'newnham', provider_name: 'Newnham College',
      title: 'Conference Attendance Bursary', type: 'travel',
      description: 'Part-cost support for postgraduates presenting at an academic conference. Priority given to first-time presenters.',
      eligibility_text: 'Postgraduate members presenting at a conference.',
      eligibility_tags: ['Travel', 'PG only', 'Presenting'],
      amount_text: 'up to £500',
      deadline_type: 'fixed', deadline_date: iso(now, 63),
      application_method: 'Online form.',
      source_url: 'https://newn.cam.ac.uk',
      evidence_quote: 'The closing date is 30 September; awards do not exceed £500.',
    },
    {
      ...base,
      id: 'sample-5', provider_id: 'emmanuel', provider_name: 'Emmanuel College',
      title: 'Vacation Study Grant', type: 'grant',
      description: 'Support for academic work undertaken during the Long Vacation where residence in Cambridge is required.',
      eligibility_text: null,
      eligibility_tags: ['Grant', 'UG + PG'],
      amount_text: null,
      // No evidence_quote could be produced for a deadline, so the extractor
      // must record `unknown` rather than guess. See §4.4.
      deadline_type: 'unknown', deadline_date: null,
      application_method: null,
      source_url: 'https://www.emma.cam.ac.uk',
      evidence_quote: null,
    },
    {
      ...base,
      id: 'sample-6', provider_id: 'girton', provider_name: 'Girton College',
      title: 'Instrumental Music Prize', type: 'prize',
      description: 'Awarded by audition to members showing outstanding instrumental or vocal achievement, regardless of subject read.',
      eligibility_text: 'Any member, by audition.',
      eligibility_tags: ['Prize', 'By audition', 'UG + PG'],
      amount_text: '£400',
      deadline_type: 'fixed', deadline_date: iso(now, 75),
      application_method: 'Audition in Michaelmas.',
      source_url: 'https://www.girton.cam.ac.uk',
      evidence_quote: 'Auditions are held in October and the prize is £400.',
    },
    {
      ...base,
      id: 'sample-7', provider_id: 'downing', provider_name: 'Downing College',
      title: 'Fieldwork Support Fund', type: 'travel',
      description: 'Contributions towards travel, accommodation and consumables for fieldwork forming part of a research degree.',
      eligibility_text: 'Postgraduate research students.',
      eligibility_tags: ['Travel', 'PG only', 'Research'],
      amount_text: 'up to £800',
      deadline_type: 'rolling', deadline_date: null,
      application_method: 'Applications reviewed termly.',
      source_url: 'https://www.dow.cam.ac.uk',
      evidence_quote: 'Applications are considered termly, up to a maximum of £800.',
    },
    {
      ...base,
      id: 'sample-8', provider_id: 'selwyn', provider_name: 'Selwyn College',
      title: 'Elective Travel Award', type: 'prize',
      description: 'For clinical students undertaking an elective placement overseas. Report on return is a condition of the award.',
      eligibility_text: 'Clinical undergraduates.',
      eligibility_tags: ['Travel', 'Clinical', 'UG'],
      amount_text: 'up to £900',
      deadline_type: 'fixed', deadline_date: iso(now, 95),
      application_method: 'Written application to the Senior Tutor.',
      source_url: 'https://www.sel.cam.ac.uk',
      evidence_quote: 'Applications must be received by 1 November.',
    },
    {
      // Not in the mockup — added so the `closed` state is visible. Real data
      // goes stale between weekly refreshes, and a passed deadline rendered as
      // open is the highest-severity failure in §11.
      ...base,
      id: 'sample-9', provider_id: 'jesus', provider_name: 'Jesus College',
      title: 'Summer Language Bursary', type: 'bursary',
      description: 'Towards the cost of an intensive language course taken abroad during the Long Vacation.',
      eligibility_text: 'Members taking a language relevant to their course.',
      eligibility_tags: ['Travel', 'UG + PG', 'Languages'],
      amount_text: 'up to £600',
      deadline_type: 'fixed', deadline_date: iso(now, -9),
      application_method: 'Online form.',
      source_url: 'https://www.jesus.cam.ac.uk',
      evidence_quote: 'The deadline for applications is in June each year.',
    },
  ];

  return {
    items,
    providerCount: new Set(items.map((i) => i.provider_id)).size,
    lastRefreshedAt: verified,
    isSample: true,
  };
}
