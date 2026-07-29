-- ═══════════════════════════════════════════════════════════════════
-- The 31 Cambridge colleges — Phase 0 seed set (spec §4.1).
--
-- GENERATED from lib/colleges.ts. Edit that file, not this one:
--   node scripts/gen-seed-sql.mjs
--
-- Root URLs only. Funding items are still fully discovered and extracted
-- by the crawler; hand-listing 31 college websites is an afternoon that
-- never needs redoing, hand-listing 400 awards is a job that needs redoing
-- every term.
--
-- funding_index_url is null everywhere by design. It is populated by the
-- discover stage, not guessed — a wrong funding URL sends the crawler
-- somewhere plausible and silently wrong, which is worse than no hint.
--
-- All 31 roots verified to return HTTP 200: node scripts/verify-seed-urls.mjs
-- ═══════════════════════════════════════════════════════════════════

insert into providers (id, name, kind, url, funding_index_url) values
  ('christs', 'Christ''s College', 'college', 'https://www.christs.cam.ac.uk', null),
  ('churchill', 'Churchill College', 'college', 'https://www.chu.cam.ac.uk', null),
  ('clare', 'Clare College', 'college', 'https://www.clare.cam.ac.uk', null),
  ('clare-hall', 'Clare Hall', 'college', 'https://www.clarehall.cam.ac.uk', null),
  ('corpus-christi', 'Corpus Christi College', 'college', 'https://www.corpus.cam.ac.uk', null),
  ('darwin', 'Darwin College', 'college', 'https://www.darwin.cam.ac.uk', null),
  ('downing', 'Downing College', 'college', 'https://www.dow.cam.ac.uk', null),
  ('emmanuel', 'Emmanuel College', 'college', 'https://www.emma.cam.ac.uk', null),
  ('fitzwilliam', 'Fitzwilliam College', 'college', 'https://www.fitz.cam.ac.uk', null),
  ('girton', 'Girton College', 'college', 'https://www.girton.cam.ac.uk', null),
  ('gonville-caius', 'Gonville & Caius College', 'college', 'https://www.cai.cam.ac.uk', null),
  ('homerton', 'Homerton College', 'college', 'https://www.homerton.cam.ac.uk', null),
  ('hughes-hall', 'Hughes Hall', 'college', 'https://www.hughes.cam.ac.uk', null),
  ('jesus', 'Jesus College', 'college', 'https://www.jesus.cam.ac.uk', null),
  ('kings', 'King''s College', 'college', 'https://www.kings.cam.ac.uk', null),
  ('lucy-cavendish', 'Lucy Cavendish College', 'college', 'https://www.lucy.cam.ac.uk', null),
  ('magdalene', 'Magdalene College', 'college', 'https://www.magd.cam.ac.uk', null),
  ('murray-edwards', 'Murray Edwards College', 'college', 'https://www.murrayedwards.cam.ac.uk', null),
  ('newnham', 'Newnham College', 'college', 'https://newn.cam.ac.uk', null),
  ('pembroke', 'Pembroke College', 'college', 'https://www.pem.cam.ac.uk', null),
  ('peterhouse', 'Peterhouse', 'college', 'https://www.pet.cam.ac.uk', null),
  ('queens', 'Queens'' College', 'college', 'https://www.queens.cam.ac.uk', null),
  ('robinson', 'Robinson College', 'college', 'https://www.robinson.cam.ac.uk', null),
  ('st-catharines', 'St Catharine''s College', 'college', 'https://www.caths.cam.ac.uk', null),
  ('st-edmunds', 'St Edmund''s College', 'college', 'https://www.st-edmunds.cam.ac.uk', null),
  ('st-johns', 'St John''s College', 'college', 'https://www.joh.cam.ac.uk', null),
  ('selwyn', 'Selwyn College', 'college', 'https://www.sel.cam.ac.uk', null),
  ('sidney-sussex', 'Sidney Sussex College', 'college', 'https://www.sid.cam.ac.uk', null),
  ('trinity', 'Trinity College', 'college', 'https://www.trin.cam.ac.uk', null),
  ('trinity-hall', 'Trinity Hall', 'college', 'https://www.trinhall.cam.ac.uk', null),
  ('wolfson', 'Wolfson College', 'college', 'https://www.wolfson.cam.ac.uk', null)
on conflict (id) do update
  set name = excluded.name,
      url  = excluded.url;
