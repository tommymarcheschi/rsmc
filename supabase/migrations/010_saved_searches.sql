-- Trove: Tier 3.12 — saved searches
--
-- Pairs with the DSL parser on /browse hunt mode. Once a user crafts a
-- useful query (e.g. "Pre-2017 sleepers with raw <$20 and pop <100"),
-- they can star it here and come back with one click.
--
-- url_search stores the canonical query string WITHOUT the leading "?",
-- so `mode=hunt&pop_lt=100&before=2017` is what lives in the column.
-- Rebuilding the link is just `/browse?{url_search}`.

create table if not exists saved_searches (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    url_search text not null,
    created_at timestamptz not null default now()
);

-- Single-user app, so no user_id column. Enforce global uniqueness on
-- name so re-saving the same slot overwrites via upsert semantics in
-- application code.
create unique index if not exists idx_saved_searches_name on saved_searches (name);

alter table saved_searches disable row level security;
