---
name: trove-verify
description: Verify Trove app/UI/SSR code changes actually render correctly, against real data. Use this WHENEVER you change a Svelte route/component, a +page.server.ts loader, the browse/card/rankings/collection/sets surfaces, or anything whose effect shows up in a rendered page — and before claiming any such change "works" or is "verified". Handles the env/gate/key gotchas that otherwise make local pages silently render empty and produce false "it's broken" or false "it works" conclusions.
---

# Trove — verify app changes locally (the reliable way)

Verifying Trove rendering is deceptively failure-prone: three independent
gotchas each make pages render **empty**, which looks identical to a real
bug. Claude has repeatedly wasted time (and drawn wrong conclusions) by
skipping this ritual. Run it for any change observable in a rendered page.

## Why the obvious approach fails

- **The `Claude_Preview` MCP sandbox has no outbound network.** `preview_*`
  tools cannot reach the dev server or Supabase here. Bash *does* have
  network. So verify with a Bash-launched dev server + `curl`, never the
  preview MCP.
- **Prod (pokeapp-nu.vercel.app) is password-gated** (`hooks.server.ts`).
  Raw curl of prod → 303 /login. You can confirm deploy freshness via the
  `?next=` echo, but not see rendered content. Verify *local* code instead.
- **The `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` in `.env.local` is stale
  (HTTP 401).** The app's anon client then reads **zero rows** from
  `card_index`, so every data-backed surface (/browse hunt, /card Market
  Signals + Discovery Scores, /rankings, /sets) renders empty even though
  the code and prod data are fine. This is NOT RLS (018 is applied) and
  NOT a code defect — it's a stale local key. The launcher script works
  around it for local SSR by overriding that var with the (valid,
  RLS-bypassing) service-role key. Local-only, never committed. The real
  fix is the user re-pulling the key (`npx vercel env pull`, project
  `pokeapp`) — mention it; don't block on it.

## Procedure

### 1. Start the server (handles all three gotchas)

```
bash /Users/tommymarcheschi/dev/rsmc/.claude/skills/trove-verify/scripts/start-verify-server.sh [PORT]
```

Default PORT 5199. It sources the main `.env.local` *by value* (never
symlinks it — that self-symlink destroys the creds; see memory
`feedback_envlocal_symlink_hazard`), unsets the gate, overrides the dead
key, launches `vite dev`, and blocks until the server prints `ready in`
(or reports the failure). Run from any worktree — it resolves the repo
dir itself. It auto-kills a prior server on the same port, so re-running
after an edit is safe (Vite HMR usually makes even that unnecessary).

### 2. Curl the affected route(s) and assert on the rendered HTML

`curl -s --max-time 45 "http://localhost:PORT/<route>"`. Grep for the
markup your change produces. Useful routes/params:

- Variant-grouped grid (data-rich): `/browse?mode=hunt&set=<setId>&require_psa10=1`
  — hunt mode reads `set` (eq set_id) + `require_psa10=1`; it is NOT a
  `q=set:` DSL. Add `&sort=<value>` to test a SORT_OPTIONS entry.
- A card page: `/card/<card_id>` (e.g. `/card/base1-4`).
- Rankings, optionally focused: `/rankings?q=<name>&set=<setId>`.
- Remember HTML-escaping: an href `?a=1&b=2` renders as `&amp;` — grep
  accordingly (`&amp;`), it is correct.

### 3. Cross-check against real data (this is what makes it *verification*)

A rendered number is only trustworthy if it matches the source row. Query
`card_index` directly with the **service-role** key (valid; the anon key
is the dead one) and compare:

```
set -a; . /Users/tommymarcheschi/dev/rsmc/.env.local; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$PUBLIC_SUPABASE_URL/rest/v1/card_index?select=card_id,<cols>&<filter>"
```

For honesty-gated UI (only-show-when-real signals), assert BOTH
directions: the signal renders for rows that qualify, and is **absent**
for rows that don't (null / low-confidence). Count rendered instances vs.
a `Prefer: count=exact` HEAD count of qualifying rows — they should match.
Do not use the Supabase MCP token for any of this: it points at a
different project (BMAG), never Trove.

### 4. Stop the server

```
pkill -f "vite dev --port PORT"
```

## Known-noise (do not misdiagnose as your bug)

- `/card/*` SSR logs `pokemontcg.io 429` / shows partial degraded
  sections. Pre-existing, unrelated rate-limit. The `card_index`-backed
  blocks (Market Signals, Discovery Scores) still render — judge your
  change by those, not by the pokemontcg-fed sections.
- A `200` with `[]` / `content-range: */0` from the **anon** key on a
  `card_index`-family table = RLS, not your code. Service-role returning
  rows confirms the data exists.

## Doctrine

"svelte-check passed" is type-safety, not proof the feature renders.
Never claim a rendered change is verified without having actually fetched
the page and cross-checked the values against the source row. If the
environment genuinely blocks the render (and the launcher's overrides
don't fix it), say so explicitly — "not verified, here's why" beats a
confident guess.
