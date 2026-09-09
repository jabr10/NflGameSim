import { ElevatesStrip } from "@/components/ElevatesStrip";
import { GameCard } from "@/components/GameCard";
import { loadAllGames, loadElevates, loadSlate } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default function WeekBoardPage() {
  const slate = loadSlate();
  const elevates = loadElevates();
  const games = loadAllGames();
  const leansById = Object.fromEntries(
    games.map((g) => [
      g.game_id,
      {
        home: g.market_leans.home_win_prob,
        away: g.market_leans.away_win_prob,
      },
    ]),
  );

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
      </header>
      <ElevatesStrip rows={elevates.rows} />
      <section className="grid gap-4 md:grid-cols-2">
        {slate.games.map((game) => (
          <GameCard
            key={game.game_id}
            game={game}
            homeWinProb={leansById[game.game_id]?.home}
            awayWinProb={leansById[game.game_id]?.away}
          />
        ))}
      </section>
    </div>
  );
}
