"""CLI: build slate + rates + game sim-results for a week.

Usage (from /workspace/nfl-game-sim):
  python -m engine.run_week
  python -m engine.run_week --season 2026 --week 1 --n-sims 8000 --max-games 16
  python -m engine.run_week --season 2026 --week 1 --skip-ingest --max-games 16
"""

from __future__ import annotations

import argparse
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .export import build_sim_result, validate_sim_result_keys, write_sim_result
from .footage_bridge import bridge_for_game
from .rates import load_player_usage, load_team_rates, player_usage_for_teams, team_rates_lookup
from .sim_drive import GameState, PlayerUsage, SimConfig, simulate_game

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"


def _snapshot_baselines(players: List[PlayerUsage]) -> Dict[str, Dict[str, float]]:
    return {
        p.player_id: {
            "snap_share": float(p.snap_share),
            "target_share": float(p.target_share),
            "rush_share": float(p.rush_share),
            "pass_share": float(p.pass_share),
            "rz_td_share": float(p.rz_td_share),
        }
        for p in players
    }


def write_report(info: Dict[str, Any], result_paths: List[str], extra_blockers: Optional[List[str]] = None) -> Path:
    blockers = list(info.get("blockers") or []) + list(extra_blockers or [])
    lines = [
        "# NFL Sim data-layer REPORT",
        "",
        f"- Generated (UTC): `{datetime.now(timezone.utc).isoformat()}`",
        f"- Season / week: **{info['season']} / w{info['week']}** ({info.get('season_type', 'REG')})",
        f"- Slate games: **{info.get('slate_games', 0)}**",
        f"- Rates source season: **{info.get('rates_source_season')}**",
        f"- Team rate rows: **{info.get('team_rate_rows')}**",
        f"- Player usage rows: **{info.get('player_usage_rows')}**",
        f"- Attribution: **drive-loop player samples (M1)**",
        "",
        "## Paths",
        f"- Slate: `{info.get('slate_path')}`",
    ]
    for k, v in (info.get("rate_paths") or {}).items():
        lines.append(f"- Rates {k}: `{v}`")
    for p in result_paths:
        lines.append(f"- Game result: `{p}`")
    lines.append(f"- This report: `{OUT / 'REPORT.md'}`")
    lines += ["", "## Blockers / notes"]
    if blockers:
        for b in blockers:
            lines.append(f"- {b}")
    else:
        lines.append("- None")
    lines += [
        "",
        "## Notes",
        "- Odds: model-only (no sportsbook scrape).",
        "- Scoring default: half_ppr.",
        "- Player props attributed inside drive MC (not post-hoc-only).",
        "- Week-1 uses prior-season nflverse stats shrunk toward league/position priors.",
        "",
    ]
    path = OUT / "REPORT.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines))
    return path


def load_existing_week(season: int, week: int) -> Dict[str, Any]:
    """Load slate + rates from disk; skip nflverse re-pull."""
    slate_path = OUT / "week" / str(season) / f"w{week}" / "slate.json"
    if not slate_path.is_file():
        raise FileNotFoundError(f"No slate at {slate_path}; run without --skip-ingest first")
    slate = json.loads(slate_path.read_text())
    team_df = load_team_rates()
    player_df = load_player_usage()
    meta_path = OUT / "rates" / "meta.json"
    rates_source = None
    if meta_path.is_file():
        try:
            rates_source = json.loads(meta_path.read_text()).get("source_season")
        except Exception:
            rates_source = None
    return {
        "season": season,
        "week": week,
        "season_type": slate.get("season_type") or "REG",
        "slate_path": str(slate_path),
        "slate_games": len(slate.get("games") or []),
        "rates_source_season": rates_source or (season - 1),
        "team_rate_rows": len(team_df),
        "player_usage_rows": len(player_df),
        "rate_paths": {
            "team_rates": str(OUT / "rates" / "team_rates.parquet"),
            "player_usage": str(OUT / "rates" / "player_usage.parquet"),
        },
        "blockers": ["skip-ingest: reused existing slate/rates (no nflverse re-pull)"],
        "slate": slate,
    }


def run(
    season: Optional[int] = None,
    week: Optional[int] = None,
    n_sims: int = 8000,
    seed: int = 42,
    scoring: str = "half_ppr",
    max_games: int = 1,
    skip_ingest: bool = False,
) -> Dict[str, Any]:
    if skip_ingest:
        if season is None or week is None:
            raise ValueError("--skip-ingest requires --season and --week")
        info = load_existing_week(season, week)
    else:
        from .ingest_nflverse import ingest_week

        info = ingest_week(season=season, week=week)
    slate = info["slate"]
    season = info["season"]
    week = info["week"]

    extra_blockers: List[str] = []
    try:
        team_df = load_team_rates()
        player_df = load_player_usage()
    except FileNotFoundError as e:
        extra_blockers.append(str(e))
        team_df = None
        player_df = None

    lookup = team_rates_lookup(team_df) if team_df is not None else {}
    result_paths: List[str] = []
    validation: Dict[str, Any] = {}

    games = slate.get("games") or []
    if not games:
        extra_blockers.append("Slate has zero games — cannot sim")
    for game in games[: max(1, max_games)]:
        home, away = game["home_team"], game["away_team"]
        home_rates = lookup.get(home) or __import__("engine.sim_drive", fromlist=["TeamRates"]).TeamRates(team=home)
        away_rates = lookup.get(away) or __import__("engine.sim_drive", fromlist=["TeamRates"]).TeamRates(team=away)
        players = player_usage_for_teams([home, away], df=player_df) if player_df is not None else []
        if not players:
            extra_blockers.append(f"No player usage for {away}@{home}; exporting with empty/minimal players")
        baselines = _snapshot_baselines(players)
        players = copy.deepcopy(players)
        bridged = bridge_for_game(season, week, home, away, players)
        players = bridged["players"]
        toggles = bridged["toggles"]
        footage_refs = bridged["footage_refs"]
        usage_assumptions = bridged.get("usage_assumptions") or []
        if bridged["row_count"]:
            reasons_extra = f"Footage rows applied: {bridged['row_count']} ({bridged.get('footage_path')})"
        else:
            reasons_extra = None
        cfg = SimConfig(n_sims=n_sims, seed=seed, scoring=scoring)
        state = GameState(home=home_rates, away=away_rates, players=players, toggles=toggles)
        raw = simulate_game(state, cfg)
        conf = "low" if week <= 1 else "med"
        reasons = []
        if week <= 1:
            reasons.append("Week-1 prior-heavy rates (prior-season samples + shrinkage)")
        if info.get("rates_source_season") and info["rates_source_season"] != season:
            reasons.append(f"Rates sourced from {info['rates_source_season']} REG stats")
        if reasons_extra:
            reasons.append(reasons_extra)
        if skip_ingest:
            reasons.append("Re-export from cached slate/rates (skip-ingest)")
        result = build_sim_result(
            game=game,
            season=season,
            week=week,
            raw=raw,
            players=players,
            cfg=cfg,
            team_rates=lookup,
            confidence=conf,
            confidence_reasons=reasons or ["Baseline rates"],
            toggles_applied=toggles,
            footage_refs=footage_refs,
            drivers=[
                f"Model drive MC (attributed): {away} @ {home}",
                f"pass_rate {home}={home_rates.pass_rate:.2f} vs {away}={away_rates.pass_rate:.2f}",
                f"td_rate {home}={home_rates.td_rate:.2f} / {away}={away_rates.td_rate:.2f}",
            ],
            usage_baselines=baselines,
            usage_assumptions=usage_assumptions,
        )
        missing = validate_sim_result_keys(result)
        validation[game["game_id"]] = {"missing": missing, "players": len(result.get("players") or [])}
        if missing:
            extra_blockers.append(f"{game['game_id']} missing keys: {missing}")
        path = write_sim_result(result)
        result_paths.append(str(path))

    report = write_report(info, result_paths, extra_blockers)
    return {
        "season": season,
        "week": week,
        "slate_path": info.get("slate_path"),
        "result_paths": result_paths,
        "report_path": str(report),
        "validation": validation,
        "blockers": list(info.get("blockers") or []) + extra_blockers,
        "slate_games": info.get("slate_games"),
        "team_rate_rows": info.get("team_rate_rows"),
        "player_usage_rows": info.get("player_usage_rows"),
    }


def main(argv: Optional[List[str]] = None) -> None:
    p = argparse.ArgumentParser(description="Coach Spo — ingest slate/rates and sim one+ games")
    p.add_argument("--season", type=int, default=None)
    p.add_argument("--week", type=int, default=None)
    p.add_argument("--n-sims", type=int, default=8000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--scoring", type=str, default="half_ppr", choices=["half_ppr", "ppr", "standard"])
    p.add_argument("--max-games", type=int, default=1, help="How many slate games to sim (default 1)")
    p.add_argument("--skip-ingest", action="store_true", help="Reuse existing slate/rates; no nflverse pull")
    args = p.parse_args(argv)
    out = run(
        season=args.season,
        week=args.week,
        n_sims=args.n_sims,
        seed=args.seed,
        scoring=args.scoring,
        max_games=args.max_games,
        skip_ingest=args.skip_ingest,
    )
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
