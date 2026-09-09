import { FantasyTable, type FantasyRow } from "@/components/FantasyTable";
import { loadAllGames, loadSlate } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default function FantasyPage() {
  const slate = loadSlate();
  const games = loadAllGames();

  const rows: FantasyRow[] = games
    .flatMap((game) => {
      const opp = (team: string) =>
        team === game.teams.home.abbr ? game.teams.away.abbr : game.teams.home.abbr;
      return game.players.map((p) => ({
        player_id: p.player_id,
        name: p.name,
        team: p.team,
        pos: p.pos,
        opponent: opp(p.team),
        game_id: game.game_id,
        mean: p.fantasy.mean,
        p10: p.fantasy.p10,
        p90: p.fantasy.p90,
        scoring: p.fantasy.scoring,
      }));
    })
    .sort((a, b) => b.mean - a.mean);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Current week · {slate.scoring_default} · schema {slate.schema_version}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
          Fantasy week list
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Ranked by fantasy.mean ({slate.scoring_default}) across all {slate.games.length} game
          fixtures.
        </p>
      </header>
      <FantasyTable rows={rows} />
    </div>
  );
}
