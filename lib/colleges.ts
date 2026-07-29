import type { Provider } from './types';

/**
 * The 31 Cambridge colleges — Phase 0's seed set (§4.1).
 *
 * We seed ROOT URLs only. Funding items themselves are still fully
 * discovered and extracted automatically by the crawler. Hand-listing 31
 * college websites is an afternoon that never needs redoing; hand-listing
 * 400 funding items is a job that would need redoing every term.
 *
 * `fundingIndexUrl` is deliberately null everywhere. It is populated by the
 * discover stage, not guessed here — a wrong funding URL sends the crawler
 * somewhere plausible and silently wrong, which is worse than no hint.
 *
 * Root URLs verified to resolve by scripts/verify-seed-urls.mjs.
 */
export interface SeedProvider {
  slug: string;
  name: string;
  url: string;
  fundingIndexUrl: string | null;
}

export const COLLEGES: SeedProvider[] = [
  { slug: 'christs',        name: "Christ's College",        url: 'https://www.christs.cam.ac.uk',       fundingIndexUrl: null },
  { slug: 'churchill',      name: 'Churchill College',       url: 'https://www.chu.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'clare',          name: 'Clare College',           url: 'https://www.clare.cam.ac.uk',         fundingIndexUrl: null },
  { slug: 'clare-hall',     name: 'Clare Hall',              url: 'https://www.clarehall.cam.ac.uk',     fundingIndexUrl: null },
  { slug: 'corpus-christi', name: 'Corpus Christi College',  url: 'https://www.corpus.cam.ac.uk',        fundingIndexUrl: null },
  { slug: 'darwin',         name: 'Darwin College',          url: 'https://www.darwin.cam.ac.uk',        fundingIndexUrl: null },
  { slug: 'downing',        name: 'Downing College',         url: 'https://www.dow.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'emmanuel',       name: 'Emmanuel College',        url: 'https://www.emma.cam.ac.uk',          fundingIndexUrl: null },
  { slug: 'fitzwilliam',    name: 'Fitzwilliam College',     url: 'https://www.fitz.cam.ac.uk',          fundingIndexUrl: null },
  { slug: 'girton',         name: 'Girton College',          url: 'https://www.girton.cam.ac.uk',        fundingIndexUrl: null },
  { slug: 'gonville-caius', name: 'Gonville & Caius College',url: 'https://www.cai.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'homerton',       name: 'Homerton College',        url: 'https://www.homerton.cam.ac.uk',      fundingIndexUrl: null },
  { slug: 'hughes-hall',    name: 'Hughes Hall',             url: 'https://www.hughes.cam.ac.uk',        fundingIndexUrl: null },
  { slug: 'jesus',          name: 'Jesus College',           url: 'https://www.jesus.cam.ac.uk',         fundingIndexUrl: null },
  { slug: 'kings',          name: "King's College",          url: 'https://www.kings.cam.ac.uk',         fundingIndexUrl: null },
  { slug: 'lucy-cavendish', name: 'Lucy Cavendish College',  url: 'https://www.lucy.cam.ac.uk',          fundingIndexUrl: null },
  { slug: 'magdalene',      name: 'Magdalene College',       url: 'https://www.magd.cam.ac.uk',          fundingIndexUrl: null },
  { slug: 'murray-edwards', name: 'Murray Edwards College',  url: 'https://www.murrayedwards.cam.ac.uk', fundingIndexUrl: null },
  // Newnham serves from the bare domain; www.newn redirects. Pinned to the
  // canonical host so the weekly crawl does not pay a redirect on every page.
  { slug: 'newnham',        name: 'Newnham College',         url: 'https://newn.cam.ac.uk',              fundingIndexUrl: null },
  { slug: 'pembroke',       name: 'Pembroke College',        url: 'https://www.pem.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'peterhouse',     name: 'Peterhouse',              url: 'https://www.pet.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'queens',         name: "Queens' College",         url: 'https://www.queens.cam.ac.uk',        fundingIndexUrl: null },
  { slug: 'robinson',       name: 'Robinson College',        url: 'https://www.robinson.cam.ac.uk',      fundingIndexUrl: null },
  { slug: 'st-catharines',  name: "St Catharine's College",  url: 'https://www.caths.cam.ac.uk',         fundingIndexUrl: null },
  { slug: 'st-edmunds',     name: "St Edmund's College",     url: 'https://www.st-edmunds.cam.ac.uk',    fundingIndexUrl: null },
  { slug: 'st-johns',       name: "St John's College",       url: 'https://www.joh.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'selwyn',         name: 'Selwyn College',          url: 'https://www.sel.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'sidney-sussex',  name: 'Sidney Sussex College',   url: 'https://www.sid.cam.ac.uk',           fundingIndexUrl: null },
  { slug: 'trinity',        name: 'Trinity College',         url: 'https://www.trin.cam.ac.uk',          fundingIndexUrl: null },
  { slug: 'trinity-hall',   name: 'Trinity Hall',            url: 'https://www.trinhall.cam.ac.uk',      fundingIndexUrl: null },
  { slug: 'wolfson',        name: 'Wolfson College',         url: 'https://www.wolfson.cam.ac.uk',       fundingIndexUrl: null },
];

/** Scope is locked at all 31 colleges for v1; departments are a later phase (§2). */
export const EXPECTED_COLLEGE_COUNT = 31;

export function toProviders(): Provider[] {
  return COLLEGES.map((c) => ({
    id: c.slug,
    name: c.name,
    kind: 'college' as const,
    url: c.url,
    funding_index_url: c.fundingIndexUrl,
  }));
}
