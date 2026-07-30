-- ══════════════════════════════════════════════════════════════════════
-- Cambridge Funding Finder — relational form of the data model (spec §5)
--
-- ⚠ NOT APPLIED. This project does not use a database — the dataset is a
-- committed JSON file. See docs/data-pipeline.md for the decision and why.
--
-- Kept for one reason: if reviewing is ever delegated to someone who won't
-- use GitHub, a hosted database with a web admin becomes the better trade,
-- and this is the schema to apply. Seed providers from lib/colleges.ts.
--
-- The two CHECK constraints below live on as runtime validation in
-- lib/dataset.ts — dropping the database did not drop the invariants.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────────────────
do $$ begin
  create type provider_kind as enum ('college', 'department');
exception when duplicate_object then null; end $$;

do $$ begin
  create type funding_type as enum ('travel', 'hardship', 'grant', 'prize', 'bursary', 'scholarship');
exception when duplicate_object then null; end $$;

-- `unknown` is a first-class value, NOT a null that renders blank.
-- "We don't know when this closes" and "this has no deadline" are different
-- facts and must never look the same to a student.
do $$ begin
  create type deadline_type as enum ('fixed', 'rolling', 'annual_recurring', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type item_status as enum ('pending', 'approved', 'rejected', 'stale');
exception when duplicate_object then null; end $$;

-- ── providers ────────────────────────────────────────────────────────
create table if not exists providers (
  id                text primary key,          -- slug, e.g. 'trinity'
  name              text not null,
  kind              provider_kind not null default 'college',
  url               text not null,
  funding_index_url text,
  created_at        timestamptz not null default now()
);

-- ── funding_items ────────────────────────────────────────────────────
create table if not exists funding_items (
  id                 uuid primary key default uuid_generate_v4(),
  provider_id        text not null references providers(id) on delete cascade,
  title              text not null,
  type               funding_type not null,
  description        text not null default '',
  eligibility_text   text,
  eligibility_tags   text[] not null default '{}',
  amount_text        text,

  deadline_type      deadline_type not null default 'unknown',
  deadline_date      date,

  -- How a recurring award recurs, in the source's own words.
  -- The enum says "annual" and the data mostly is not: the first three
  -- colleges crawled produced termly book grants, termly equipment grants,
  -- sizarships running from 1 January, and a fund closing 1 June each year.
  -- A generic "Recurs annually" label was wrong for seven of the ten
  -- recurring awards found, so the cycle is carried per record.
  deadline_recurrence text,

  application_method text,
  source_url         text not null,

  -- The verbatim source sentence backing the deadline and amount. The
  -- highest-leverage field in the schema: it converts "do I trust this
  -- model?" — unanswerable — into "does this sentence say what the record
  -- says?", answerable in two seconds. It also makes hallucination visible
  -- rather than plausible, because a fabricated deadline usually cannot
  -- produce a matching quote.
  evidence_quote     text,

  status             item_status not null default 'pending',
  confidence         real,

  last_scraped_at    timestamptz not null default now(),
  -- Distinct from last_scraped_at. Scraped means we fetched it; verified
  -- means a human, or an unchanged re-scrape, confirmed it.
  last_verified_at   timestamptz not null default now(),

  embedding          vector(1536),

  -- A fixed deadline without a date is not a fixed deadline. Without this,
  -- a half-extracted record renders as an open award with a blank date —
  -- the highest-severity failure in §11.
  constraint fixed_deadline_has_date
    check (deadline_type <> 'fixed' or deadline_date is not null),

  -- An extraction that cannot produce an evidence_quote for a deadline must
  -- record `unknown` rather than guess (§4.4). This makes that a database
  -- rule instead of a prompt instruction the model may quietly ignore.
  constraint dated_deadline_has_evidence
    check (deadline_type <> 'fixed' or evidence_quote is not null),

  -- A recurrence is a claim about when a student can apply, so it carries the
  -- same evidence burden as a fixed date, and a record that cannot state its
  -- cycle has not established that it has one.
  constraint recurring_states_its_cycle
    check (deadline_type <> 'annual_recurring'
           or (deadline_recurrence is not null and evidence_quote is not null)),
  constraint recurrence_only_when_recurring
    check (deadline_type = 'annual_recurring' or deadline_recurrence is null),

  unique (provider_id, source_url, title)
);

create index if not exists funding_items_status_idx    on funding_items (status);
create index if not exists funding_items_provider_idx  on funding_items (provider_id);
create index if not exists funding_items_deadline_idx  on funding_items (deadline_date);
create index if not exists funding_items_type_idx      on funding_items (type);

-- pgvector index for the assistant's retrieval stage (§6). ivfflat needs
-- rows before it is worth building; create it after the first full scrape.
-- create index funding_items_embedding_idx on funding_items
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── scrape_runs ──────────────────────────────────────────────────────
create table if not exists scrape_runs (
  id            uuid primary key default uuid_generate_v4(),
  provider_id   text not null references providers(id) on delete cascade,
  run_at        timestamptz not null default now(),
  pages_crawled integer not null default 0,
  items_found   integer not null default 0,
  items_new     integer not null default 0,
  items_changed integer not null default 0,
  errors        text
);

create index if not exists scrape_runs_provider_idx on scrape_runs (provider_id, run_at desc);

-- ══════════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- The review gate is enforced HERE, not in the app. lib/data.ts also filters
-- on status = 'approved', but that filter is cosmetic: the anon key is
-- public and anyone can query the REST endpoint directly. Without the policy
-- below, every unreviewed LLM extraction — the exact records §4.5 says must
-- never ship — is readable by anyone who opens devtools.
--
-- Verify after applying:
--   curl "$SUPABASE_URL/rest/v1/funding_items?select=id,status&status=eq.pending" \
--        -H "apikey: $ANON_KEY"
--   → must return []
-- ══════════════════════════════════════════════════════════════════════

alter table providers     enable row level security;
alter table funding_items enable row level security;
alter table scrape_runs   enable row level security;

drop policy if exists "providers are public" on providers;
create policy "providers are public"
  on providers for select
  to anon, authenticated
  using (true);

drop policy if exists "only approved items are public" on funding_items;
create policy "only approved items are public"
  on funding_items for select
  to anon, authenticated
  using (status = 'approved');

-- scrape_runs is operational telemetry. No anon policy at all, so RLS denies
-- by default; the scraper and review tooling use the service_role key, which
-- bypasses RLS.

-- Writes are service_role only. No insert/update/delete policy is defined for
-- anon or authenticated, so RLS denies them by default. Do not add one
-- without a matching review workflow — an anon write path would let anyone
-- insert a funding record with any deadline they liked.
