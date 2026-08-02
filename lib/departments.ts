import type { SeedProvider } from './colleges';

/**
 * Departments — PILOT SUBSET, not the full set (§2 defers departments).
 *
 * The University's department A–Z lists 124 hosts, but it conflates academic
 * departments with administrative units: `philanthropy`, `alumni`, `museums`,
 * `map`, `jobs`, `information-compliance` and the two study portals all appear
 * in the same list. Enumeration is therefore a filtering job, not a copy job,
 * and it is the part of this phase most likely to go silently wrong — a
 * department omitted from the seed list is indistinguishable from a department
 * with no funding.
 *
 * These ten were chosen to answer three questions before committing to ~90:
 *
 *   1. Do departments publish their own student funding, or only signpost to
 *      colleges and the central database? (Emmanuel already showed a college
 *      doing the latter; if departments do it at scale the yield is zero.)
 *   2. Is the long-tail ratio good enough to be worth listing? 275 of 446
 *      college records are long tail. If departments return mostly large PhD
 *      studentships already on student-funding.cam.ac.uk, adding them buries
 *      the small awards that are the reason to visit.
 *   3. How often is a "departmental" fund actually a college or University
 *      fund being signposted? Attribution is expected to be the dominant
 *      failure mode here, where extraction was the dominant one for colleges.
 *
 * Spread deliberately across five Schools and weighted toward large teaching
 * departments, which are likelier to run their own travel and hardship funds
 * than a small research institute.
 */
export const DEPARTMENT_PILOT: SeedProvider[] = [
  // School of Arts and Humanities
  { slug: 'dept-classics',    name: 'Faculty of Classics',                url: 'https://www.classics.cam.ac.uk', fundingIndexUrl: null },
  { slug: 'dept-english',     name: 'Faculty of English',                 url: 'https://www.english.cam.ac.uk',  fundingIndexUrl: null },

  // School of the Humanities and Social Sciences
  { slug: 'dept-history',     name: 'Faculty of History',                 url: 'https://www.hist.cam.ac.uk',     fundingIndexUrl: null },
  { slug: 'dept-archaeology', name: 'Department of Archaeology',          url: 'https://www.arch.cam.ac.uk',     fundingIndexUrl: null },

  // School of the Physical Sciences
  { slug: 'dept-geography',   name: 'Department of Geography',            url: 'https://www.geog.cam.ac.uk',     fundingIndexUrl: null },
  { slug: 'dept-chemistry',   name: 'Yusuf Hamied Department of Chemistry', url: 'https://www.ch.cam.ac.uk',     fundingIndexUrl: null },
  { slug: 'dept-maths',       name: 'Faculty of Mathematics',             url: 'https://www.maths.cam.ac.uk',    fundingIndexUrl: null },

  // School of Technology
  { slug: 'dept-engineering', name: 'Department of Engineering',          url: 'https://www.eng.cam.ac.uk',      fundingIndexUrl: null },
  { slug: 'dept-compsci',     name: 'Department of Computer Science and Technology', url: 'https://www.cst.cam.ac.uk', fundingIndexUrl: null },

  // School of Clinical Medicine
  { slug: 'dept-medicine',    name: 'School of Clinical Medicine',        url: 'https://www.medschl.cam.ac.uk',  fundingIndexUrl: null },
];

/**
 * Slugs are prefixed `dept-` so a department can never collide with a college
 * in `data/funding.json`, whose ids are `<provider>-<title>`. Cheap insurance:
 * `history` as a department and a hypothetical college of the same name would
 * otherwise produce records that look like duplicates of each other.
 */
export const DEPARTMENT_SLUG_PREFIX = 'dept-';
