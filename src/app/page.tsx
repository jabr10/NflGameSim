import { ElevatesStrip } from "@/components/ElevatesStrip";
import { GameCard } from "@/components/GameCard";
import { WEEK_PACK_REL } from "@/lib/constants";
import { loadAllGames, loadElevates, loadSlate, weekPackSource } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default function WeekBoardPage() {
  const slate = loadSlate();
  const elevates = loadElevates();
  const games = loadAllGames();
  const source = weekPackSource();
  const byId = Object.fromEntries(games.map((g) => [g.game_id, g]));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Current week · model-only · {slate.scoring_default} · schema {slate.schema_version}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
          {slate.season} week {slate.week} {slate.season_type}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {slate.games.length} games · kickoffs in {slate.timezone.replace("_", " ")} · type your own
          lines on each game page
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {source === "data"
            ? `Week pack · ${WEEK_PACK_REL}`
            : `Spo week pack not landed yet · falling back to fixtures/ (elevates still from fixtures)`}
        </p>
      </header>
      <ElevatesStrip rows={elevates.rows} />
      <section className="grid gap-4 md:grid-cols-2">
        {slate.games.map((game) => {
          const sim = byId[game.game_id];
          return (
            <GameCard
              key={game.game_id}
              game={game}
              homeWinProb={sim?.market_leans.home_win_prob}
              awayWinProb={sim?.market_leans.away_win_prob}
              confidence={sim?.confidence}
              drivers={sim?.drivers}
              footage_refs={sim?.footage_refs}
              usage_assumptions={sim?.usage_assumptions}
              players={sim?.players}
            />
          );
        })}
      </section>
    </div>
  );
}
