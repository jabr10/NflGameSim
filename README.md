# NflGameSim

Standalone Next.js App Router NFL game simulator for the **current week**. Model projections plus user-typed lines. Default fantasy scoring is **half_ppr**. Schema version **1.0.0**.

This is not a Footage/NflLeans tab. There is no odds scrape, no book logos, and no deep links. Type your own lines on a game page to see approximate P(over) from model quantiles.

## Run locally

```bash
npm install
cp .env.example .env.local
# fill in Clerk keys, then:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Routes are private behind Clerk. Use `/sign-in` and `/sign-up`.

```bash
npm run build
npm start
```

Vercel deploy is out of scope for this MVP.

## Clerk env

Copy `.env.example` to `.env.local`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Optional (already in the example):

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

Create a Clerk application and paste the keys. Middleware (`src/middleware.ts`) protects every route except sign-in and sign-up once real keys are set. Placeholder keys are only so `next build` can compile; they do not turn auth on.

## Fixtures

Loaded on the server with `fs` / `path` from `fixtures/` (no external HTTP).

| File | What |
| --- | --- |
| `fixtures/slate.json` | 2026 REG week 1, 16 games, `scoring_default: half_ppr`, `timezone: America/New_York` |
| `fixtures/games/{game_id}.json` | Sim-result 1.0.0 for each game |
| `fixtures/footage-elevates.week1.json` | Film elevate/downgrade rows for the week-board strip |

Regenerate (optional):

```bash
node scripts/generate-fixtures.mjs
```

Special footage refs:

- `2026_01_NYJ_TEN` — RB elevates for `00-0034796` (Tony Pollard) and `00-0038120` (Breece Hall)
- `2026_01_GB_MIN` — questionable WR downgrade for `00-0035689` (Romeo Doubs)

## App routes

- `/` week board (16 games + elevates strip)
- `/games/[game_id]` model card, typed lines, injury/usage toggles, stub Re-sim
- `/fantasy` players ranked by `fantasy.mean` half_ppr
- `POST /api/sim` auth-required stub; returns the same fixture

Typed lines use mean/p10/p50/p90 for approx P(over). Anytime TD uses `anytime_td_prob`.
