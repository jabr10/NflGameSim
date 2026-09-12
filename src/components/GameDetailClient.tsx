"use client";

import { useMemo, useState } from "react";
import { DriverList, FantasyChips, FootageChips, UsageAssumptionList } from "@/components/GameSurfaces";
import { TypedLineInput } from "@/components/TypedLineInput";
import { N_SIMS_DEFAULT, SCHEMA_VERSION, SCORING_DEFAULT } from "@/lib/constants";
import { formatKickoff, formatNum, formatPct, formatSigned, formatWeather, propLabel } from "@/lib/format";
import { confidenceBand, normalizeSimResult } from "@/lib/normalize";
import { marginQuantiles, totalQuantiles } from "@/lib/prob-over";
import type { Confidence, InjuryToggle, PlayerToggle, SimResult, UsageToggle } from "@/lib/types";

const INJURY_OPTIONS: InjuryToggle[] = ["active", "questionable", "out"];
const USAGE_OPTIONS: UsageToggle[] = ["base", "up", "down"];

function defaultToggles(sim: SimResult): Record<string, PlayerToggle> {
  return Object.fromEntries(
    sim.players.map((p) => [
      p.player_id,
      { player_id: p.player_id, injury: "active" as const, usage: "base" as const },
    ]),
  );
}

export function GameDetailClient({ initial }: { initial: SimResult }) {
  const [sim, setSim] = useState(initial);
  const [toggles, setToggles] = useState(() => defaultToggles(initial));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const marginQ = useMemo(() => marginQuantiles(sim.market_leans), [sim.market_leans]);
  const totalQ = useMemo(() => totalQuantiles(sim.market_leans), [sim.market_leans]);

  function patchToggle(playerId: string, patch: Partial<PlayerToggle>) {
    setToggles((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], ...patch, player_id: playerId },
    }));
  }

  async function resim() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: SCHEMA_VERSION,
          game_id: sim.game_id,
          season: sim.season,
          week: sim.week,
          scoring: SCORING_DEFAULT,
          n_sims: N_SIMS_DEFAULT,
          include_footage_defaults: true,
          toggles: Object.values(toggles),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || body.code || `Re-sim failed (${res.status})`);
      }
      const next = normalizeSimResult(body as unknown);
      setSim(next);
      setNotice("Re-sim returned an in-app engine result.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-sim failed");
    } finally {
      setBusy(false);
    }
  }

  const awayPlayers = sim.players.filter((p) => p.team === sim.teams.away.abbr);
  const homePlayers = sim.players.filter((p) => p.team === sim.teams.home.abbr);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          {sim.season} · week {sim.week} {sim.season_type} · {sim.scoring} · schema {sim.schema_version}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {sim.teams.away.abbr} @ {sim.teams.home.abbr}
        </h1>
        <p className="text-slate-400">
          {sim.teams.away.name} at {sim.teams.home.name}
        </p>
        <p className="text-sm text-slate-300">
          {formatKickoff(sim.kickoff)} · {sim.venue.name} ({sim.venue.city}, {sim.venue.state}
          {sim.venue.indoor ? ", indoor" : ""}) · {formatWeather(sim.weather)}
        </p>
        <p className="text-xs text-slate-500">Status: {sim.status}</p>
        <div className="pt-2">
          <FantasyChips players={sim.players} limit={5} />
        </div>
      </header>

      <ConfidenceBandCard confidence={sim.confidence} />

      {(sim.footage_refs ?? []).length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Footage refs
          </h2>
          <div className="mt-3">
            <FootageChips refs={sim.footage_refs ?? []} />
          </div>
        </section>
      ) : null}

      {(sim.usage_assumptions ?? []).length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Usage assumptions
          </h2>
          <div className="mt-3">
            <UsageAssumptionList assumptions={sim.usage_assumptions ?? []} />
          </div>
        </section>
      ) : null}

      {(sim.usage_baseline ?? []).length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Usage baseline
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {(sim.usage_baseline ?? []).map((row) => (
              <li key={row.id}>
                <p className="font-medium text-white">
                  {row.player_name || row.player_id || row.id}
                  {row.team || row.pos ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {[row.team, row.pos].filter(Boolean).join(" ")}
                    </span>
                  ) : null}
                </p>
                <p className="font-mono text-xs text-slate-500">
                  snap {formatPct(row.usage.snap_share, 0)} · rush {formatPct(row.usage.rush_share, 0)} ·
                  target {formatPct(row.usage.target_share, 0)} · route{" "}
                  {formatPct(row.usage.route_share, 0)}
                </p>
                {row.note ? <p className="text-slate-400">{row.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Model leans
        </h2>
        <p className="mt-1 text-sm text-slate-400">{sim.market_leans.note}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={`${sim.teams.away.abbr} win`}
            value={formatPct(sim.market_leans.away_win_prob)}
          />
          <Stat
            label={`${sim.teams.home.abbr} win`}
            value={formatPct(sim.market_leans.home_win_prob)}
          />
          <Stat
            label="Proj margin (home)"
            value={formatSigned(sim.market_leans.proj_margin_home)}
            sub={`p10 ${formatSigned(sim.market_leans.margin_p10)} · p90 ${formatSigned(sim.market_leans.margin_p90)}`}
          />
          <Stat
            label="Proj total"
            value={formatNum(sim.market_leans.proj_total)}
            sub={`p10 ${formatNum(sim.market_leans.total_p10)} · p90 ${formatNum(sim.market_leans.total_p90)}`}
          />
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <TypedLineInput label="Your home-margin line" quantiles={marginQ} />
          <TypedLineInput label="Your total line" quantiles={totalQ} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <TeamBoxCard side="Away" abbr={sim.teams.away.abbr} name={sim.teams.away.name} box={sim.team_box.away} />
        <TeamBoxCard side="Home" abbr={sim.teams.home.abbr} name={sim.teams.home.name} box={sim.team_box.home} />
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Injury / usage toggles
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              What-if controls. Re-sim posts a sim-request 1.0.0 body (no typed lines) to the in-app
              engine (`python -m engine.cli_sim`).
            </p>
          </div>
          <button
            type="button"
            onClick={resim}
            disabled={busy}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Re-simming…" : "Re-sim"}
          </button>
        </div>
        {notice ? (
          <p
            className="mt-3 text-sm text-emerald-300"
          >
            {notice}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Injury</th>
                <th className="py-2 pr-3">Usage</th>
              </tr>
            </thead>
            <tbody>
              {sim.players.map((p) => {
                const t = toggles[p.player_id];
                return (
                  <tr key={p.player_id} className="border-t border-white/5">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {p.team} {p.pos}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={t?.injury ?? "active"}
                        onChange={(e) =>
                          patchToggle(p.player_id, { injury: e.target.value as InjuryToggle })
                        }
                        className="rounded-md border border-white/10 bg-[#0b1220] px-2 py-1 text-slate-200"
                      >
                        {INJURY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={t?.usage ?? "base"}
                        onChange={(e) =>
                          patchToggle(p.player_id, { usage: e.target.value as UsageToggle })
                        }
                        className="rounded-md border border-white/10 bg-[#0b1220] px-2 py-1 text-slate-200"
                      >
                        {USAGE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          toggles_applied: {sim.toggles_applied.length === 0 ? "[]" : JSON.stringify(sim.toggles_applied)}
        </p>
      </section>

      <PlayerTable title={`${sim.teams.away.abbr} players`} players={awayPlayers} />
      <PlayerTable title={`${sim.teams.home.abbr} players`} players={homePlayers} />

      {(sim.drivers ?? []).length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Drivers</h2>
          <div className="mt-3">
            <DriverList drivers={sim.drivers} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

const BAND_SEGMENTS: Array<{ key: Confidence["band"]; label: string }> = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

function ConfidenceBandCard({ confidence }: { confidence: Confidence }) {
  const active = confidence.band ?? confidenceBand(confidence.label);
  return (
    <section className="rounded-xl border border-amber-400/30 bg-[#121a2b] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
        Confidence band
      </h2>
      <p className="mt-2 text-lg font-semibold capitalize text-white">{confidence.label}</p>
      <p className="text-sm text-slate-400">
        Score {formatNum(confidence.score, 2)}
        {confidence.note ? ` · ${confidence.note}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {BAND_SEGMENTS.map((seg) => {
          const on = seg.key === active;
          const tone =
            seg.key === "low"
              ? on
                ? "bg-amber-400 text-slate-950"
                : "bg-amber-400/15 text-amber-200/70"
              : seg.key === "medium"
                ? on
                  ? "bg-sky-400 text-slate-950"
                  : "bg-white/5 text-slate-500"
                : on
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-white/5 text-slate-500";
          return (
            <div
              key={seg.key}
              className={`rounded-md px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide ${tone}`}
            >
              {seg.label}
            </div>
          );
        })}
      </div>
      {(confidence.reasons ?? []).length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {(confidence.reasons ?? []).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-xl text-white">{value}</dd>
      {sub ? <p className="font-mono text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function TeamBoxCard({
  side,
  abbr,
  name,
  box,
}: {
  side: string;
  abbr: string;
  name: string;
  box: SimResult["team_box"]["home"];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
        {side} box · {abbr}
      </h2>
      <p className="text-xs text-slate-500">{name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <BoxStat label="Points" value={formatNum(box.points)} />
        <BoxStat label="Pass yds" value={formatNum(box.pass_yards, 0)} />
        <BoxStat label="Rush yds" value={formatNum(box.rush_yards, 0)} />
        <BoxStat label="Pass att" value={formatNum(box.pass_attempts, 0)} />
        <BoxStat label="Rush att" value={formatNum(box.rush_attempts, 0)} />
        <BoxStat label="Sacks taken" value={formatNum(box.sacks_taken)} />
        <BoxStat label="Turnovers" value={formatNum(box.turnovers)} />
      </dl>
    </section>
  );
}

function BoxStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-100">{value}</dd>
    </div>
  );
}

function PlayerTable({
  title,
  players,
}: {
  title: string;
  players: SimResult["players"];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      <div className="mt-3 space-y-4">
        {players.map((p) => (
          <article key={p.player_id} className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-white">
                {p.name}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {p.pos} · {p.player_id}
                </span>
              </h3>
              <p className="font-mono text-sm text-emerald-300">
                half_ppr {formatNum(p.fantasy.mean)}{" "}
                <span className="text-slate-500">
                  (p10 {formatNum(p.fantasy.p10)} / p90 {formatNum(p.fantasy.p90)})
                </span>
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              snap {formatPct(p.usage.snap_share, 0)} · rush share {formatPct(p.usage.rush_share, 0)} ·
              target share {formatPct(p.usage.target_share, 0)} · route share{" "}
              {formatPct(p.usage.route_share, 0)}
            </p>
            {p.usage_baseline ? (
              <p className="text-xs text-slate-600">
                baseline snap {formatPct(p.usage_baseline.snap_share, 0)} · rush{" "}
                {formatPct(p.usage_baseline.rush_share, 0)} · target{" "}
                {formatPct(p.usage_baseline.target_share, 0)} · route{" "}
                {formatPct(p.usage_baseline.route_share, 0)}
              </p>
            ) : null}
            {p.usage_assumption ? (
              <p className="mt-1 text-xs text-sky-200/80">{p.usage_assumption}</p>
            ) : null}
            <p className="mt-2 text-sm text-slate-300">
              Anytime TD{" "}
              <span className="font-mono font-semibold text-white">
                {formatPct(p.anytime_td_prob)}
              </span>
              <span className="ml-2 text-xs text-slate-500">from anytime_td_prob</span>
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {Object.entries(p.prop_quantiles).map(([key, q]) => (
                <TypedLineInput key={key} label={propLabel(key)} quantiles={q} step="0.5" />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
