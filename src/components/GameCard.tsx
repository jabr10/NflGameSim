import Link from "next/link";
import { DriverList, FantasyChips, FootageChips, UsageAssumptionList } from "@/components/GameSurfaces";
import { formatKickoff, formatPct, formatWeather } from "@/lib/format";
import { teamMeta } from "@/lib/teams";
import type { Confidence, Driver, FootageRef, PlayerSim, SlateGame, UsageAssumption } from "@/lib/types";

export function GameCard({
  game,
  homeWinProb,
  awayWinProb,
  confidence,
  drivers = [],
  footage_refs = [],
  usage_assumptions = [],
  players = [],
}: {
  game: SlateGame;
  homeWinProb?: number;
  awayWinProb?: number;
  confidence?: Confidence;
  drivers?: Driver[];
  footage_refs?: FootageRef[];
  usage_assumptions?: UsageAssumption[];
  players?: PlayerSim[];
}) {
  const away = teamMeta(game.away);
  const home = teamMeta(game.home);
  const confidenceLabel = confidence?.label;

  return (
    <Link
      href={`/games/${game.game_id}`}
      className="group flex flex-col rounded-xl border border-white/10 bg-[#121a2b] p-4 transition hover:border-emerald-400/40 hover:bg-[#161f33]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight text-white">
            <span style={{ color: away.primary }}>{game.away}</span>
            <span className="mx-1.5 text-slate-500">@</span>
            <span style={{ color: home.primary }}>{game.home}</span>
          </p>
          <p className="text-xs text-slate-400">
            {away.name} at {home.name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
            {game.status}
          </span>
          {confidenceLabel ? (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200">
              conf {confidenceLabel}
              {confidence?.band ? ` · ${confidence.band}` : ""}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-300">{formatKickoff(game.kickoff)}</p>
      <p className="mt-1 text-xs text-slate-500">
        {game.venue.name}
        {game.venue.indoor ? " · indoor" : ""} · {formatWeather(game.weather)}
      </p>
      {homeWinProb != null && awayWinProb != null ? (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>
              {game.away} {formatPct(awayWinProb, 0)}
            </span>
            <span>model win</span>
            <span>
              {game.home} {formatPct(homeWinProb, 0)}
            </span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="bg-slate-400" style={{ width: `${awayWinProb * 100}%` }} />
            <div className="bg-emerald-400" style={{ width: `${homeWinProb * 100}%` }} />
          </div>
        </div>
      ) : null}
      {drivers.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Drivers</p>
          <div className="mt-1 text-sm">
            <DriverList drivers={drivers} limit={2} compact />
          </div>
        </div>
      ) : null}
      {footage_refs.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Footage</p>
          <FootageChips refs={footage_refs} limit={3} />
        </div>
      ) : null}
      {usage_assumptions.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Usage</p>
          <UsageAssumptionList assumptions={usage_assumptions} compact limit={3} />
        </div>
      ) : null}
      {players.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
            Fantasy mean / p10–p90
          </p>
          <FantasyChips players={players} limit={3} />
        </div>
      ) : null}
      <p className="mt-3 text-xs text-emerald-400/80 group-hover:text-emerald-300">
        Open model card →
      </p>
    </Link>
  );
}
