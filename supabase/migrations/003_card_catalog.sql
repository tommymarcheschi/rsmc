-- Trove: Static card + set catalog
--
-- Source of truth for everything that doesn't change after a set releases:
-- card metadata, images, set info. Live pricing snapshots live in
-- price_history (rolled forward by a separate cron job).
--
-- Populated by `npm run ingest:catalog`, which pages through the Pokémon TCG
-- API and upserts everything. After ingest, /browse and /api/cards read from
-- here directly instead of round-tripping to api.pokemontcg.io on every load.

-- ============================================
-- sets — one row per Pokémon TCG set
-- ============================================
create table if not exists sets (
    id text primary key,
    name text not null,
    series text,
    printed_total integer,
    total integer,
    release_date date,
    symbol_url text,
    logo_url text,
    ingested_at timestamptz not null default now()
);

create index if not exists idx_sets_release_date on sets (release_date desc);

-- ============================================
-- cards — one row per printed card
-- ============================================
create table if not exists cards (
    id text primary key,
    set_id text references sets(id) on delete cascade,
    name text not null,
    supertype text,
    subtypes text[],
    hp text,
    types text[],
    number text not null,
    artist text,
    rarity text,
    national_pokedex_numbers integer[],
    image_small text,
    image_large text,
    -- Combat data is small and rarely queried directly — keep as jsonb so
    -- we don't have to chase normalization through three more tables.
    attacks jsonb,
    weaknesses jsonb,
    resistances jsonb,
    retreat_cost text[],
    -- TCGPlayer / CardMarket blocks are kept on the card row because they
    -- arrive in the same TCG API response. Refreshed by the price job; the
    -- column suffixes match the upstream JSON shape so we can pass the
    -- whole blob through to the existing client code unchanged.
    tcgplayer_url text,
    tcgplayer_prices jsonb,
    tcgplayer_updated_at timestamptz,
    cardmarket_url text,
    cardmarket_prices jsonb,
    cardmarket_updated_at timestamptz,
    ingested_at timestamptz not null default now()
);

create index if not exists idx_cards_set_id on cards (set_id);
create index if not exists idx_cards_rarity on cards (rarity);
create index if not exists idx_cards_types on cards using gin (types);
-- Lowercase name index for case-insensitive prefix lookups.
create index if not exists idx_cards_name_lower on cards (lower(name));

-- pg_trgm enables fuzzy / substring search via a GIN index. Lets us run
-- WHERE name ILIKE '%char%' efficiently on the full catalog.
create extension if not exists pg_trgm;
create index if not exists idx_cards_name_trgm on cards using gin (name gin_trgm_ops);
