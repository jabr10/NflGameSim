"""Map simulate_game raw output + player usage → sim-result schema JSON."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from .fantasy import fantasy_points
from .sim_drive import PlayerUsage, SimConfig

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"


def _q(arr: np.ndarray, p: float) -> float:
    return float(np.quantile(arr, p))


def _mean(arr: np.ndarray) -> float:
    return float(np.mean(arr))


def _usage_snapshot(p: PlayerUsage) -> Dict[str, float]:
    return {
        "snap_share": float(p.snap_share),
        "target_share": float(p.target_share),
        "rush_share": float(p.rush_share),
        "pass_share": float(p.pass_share),
        "rz_td_share": float(p.rz_td_share),
    }


def _player_proj_from_usage(
    p: PlayerUsage,
    home_pts_mean: float,
    away_pts_mean: float,
    home_team: str,
    away_team: str,
    team_pass_yds: float,
    team_rush_yds: float,
    team_pass_att: float,
    team_rush_att: float,
    team_targets: float,
    scoring: str,
    rng: np.random.Generator,
    n: int = 8000,
) -> Dict[str, Any]:
    """Fallback: lightweight player projections from usage shares (pre-attribution path)."""
    pass_att = team_pass_att * (p.pass_share if p.position == "QB" else 0.0)
    pass_yds = team_pass_yds * (p.pass_share if p.position == "QB" else 0.0)
    pass_td = (1.6 if p.position == "QB" else 0.0) * max(p.pass_share, 0.5 if p.position == "QB" else 0.0)
    interceptions = 0.7 * max(p.pass_share, 0.5 if p.position == "QB" else 0.0) if p.position == "QB" else 0.0

    rush_att = team_rush_att * p.rush_share
    rush_yds = team_rush_yds * p.rush_share
    rush_td = 0.55 * p.rz_td_share if p.position in ("RB", "QB") else 0.15 * p.rz_td_share

    targets = team_targets * p.target_share if p.position != "QB" else 0.0
    catch_rate = 0.65 if p.position == "WR" else (0.72 if p.position == "TE" else 0.78)
    receptions = targets * catch_rate
    ypr = 12.5 if p.position == "WR" else (10.0 if p.position == "TE" else 7.5)
    rec_yds = receptions * ypr
    rec_td = 0.45 * p.rz_td_share if p.position in ("WR", "TE", "RB") else 0.0

    anytime = float(1.0 - np.exp(-(rush_td + rec_td + (0.1 * pass_td if p.position == "QB" else 0.0))))

    def noisy(mean, scale, size):
        return np.clip(rng.normal(mean, max(scale, 1e-6), size=size), 0, None)

    pass_yds_s = noisy(pass_yds, 55 if p.position == "QB" else 1, n) if p.position == "QB" else np.zeros(n)
    rush_yds_s = noisy(rush_yds, max(12.0, rush_yds * 0.35), n)
    rec_yds_s = noisy(rec_yds, max(10.0, rec_yds * 0.4), n) if p.position != "QB" else np.zeros(n)
    rec_s = noisy(receptions, max(1.0, receptions * 0.35), n) if p.position != "QB" else np.zeros(n)
    pass_td_s = noisy(pass_td, 0.7, n) if p.position == "QB" else np.zeros(n)
    rush_td_s = noisy(rush_td, 0.35, n)
    rec_td_s = noisy(rec_td, 0.3, n) if p.position != "QB" else np.zeros(n)
    int_s = noisy(interceptions, 0.4, n) if p.position == "QB" else np.zeros(n)

    fant = np.array(
        [
            fantasy_points(
                {
                    "pass_yds": pass_yds_s[i],
                    "pass_td": pass_td_s[i],
                    "interceptions": int_s[i],
                    "rush_yds": rush_yds_s[i],
                    "rush_td": rush_td_s[i],
                    "receptions": rec_s[i],
                    "rec_yds": rec_yds_s[i],
                    "rec_td": rec_td_s[i],
                },
                scoring=scoring,
            )
            for i in range(n)
        ]
    )

    usage: Dict[str, Any] = {
        "pass_att_mean": float(pass_att) if p.position == "QB" else None,
        "pass_yds_mean": float(pass_yds) if p.position == "QB" else None,
        "pass_td_mean": float(pass_td) if p.position == "QB" else None,
        "interceptions_mean": float(interceptions) if p.position == "QB" else None,
        "rush_att_mean": float(rush_att) if rush_att > 0.05 else (float(rush_att) if p.position in ("RB", "QB") else None),
        "rush_yds_mean": float(rush_yds) if rush_yds > 0.5 or p.position in ("RB", "QB") else None,
        "rush_td_mean": float(rush_td) if p.position in ("RB", "QB", "WR") else None,
        "targets_mean": float(targets) if p.position != "QB" else None,
        "receptions_mean": float(receptions) if p.position != "QB" else None,
        "rec_yds_mean": float(rec_yds) if p.position != "QB" else None,
        "rec_td_mean": float(rec_td) if p.position != "QB" else None,
        "anytime_td_prob": float(np.clip(anytime, 0, 1)),
        "sacks_mean": None,
    }

    prop_q: Dict[str, Any] = {"anytime_td": {"prob": usage["anytime_td_prob"]}}
    if p.position == "QB":
        prop_q["pass_yds"] = {"mean": _mean(pass_yds_s), "p10": _q(pass_yds_s, 0.1), "p50": _q(pass_yds_s, 0.5), "p90": _q(pass_yds_s, 0.9)}
        prop_q["rush_yds"] = {"mean": _mean(rush_yds_s), "p10": _q(rush_yds_s, 0.1), "p50": _q(rush_yds_s, 0.5), "p90": _q(rush_yds_s, 0.9)}
    elif p.position == "RB":
        prop_q["rush_yds"] = {"mean": _mean(rush_yds_s), "p10": _q(rush_yds_s, 0.1), "p50": _q(rush_yds_s, 0.5), "p90": _q(rush_yds_s, 0.9)}
        prop_q["rec_yds"] = {"mean": _mean(rec_yds_s), "p10": _q(rec_yds_s, 0.1), "p50": _q(rec_yds_s, 0.5), "p90": _q(rec_yds_s, 0.9)}
        prop_q["receptions"] = {"mean": _mean(rec_s), "p10": _q(rec_s, 0.1), "p50": _q(rec_s, 0.5), "p90": _q(rec_s, 0.9)}
    else:
        prop_q["rec_yds"] = {"mean": _mean(rec_yds_s), "p10": _q(rec_yds_s, 0.1), "p50": _q(rec_yds_s, 0.5), "p90": _q(rec_yds_s, 0.9)}
        prop_q["receptions"] = {"mean": _mean(rec_s), "p10": _q(rec_s, 0.1), "p50": _q(rec_s, 0.5), "p90": _q(rec_s, 0.9)}

    return {
        "player_id": p.player_id,
        "name": p.name,
        "team": p.team,
        "position": p.position,
        "snap_pct_mean": float(np.clip(p.snap_share, 0, 1)),
        "usage": usage,
        "prop_quantiles": prop_q,
        "fantasy": {
            "mean": _mean(fant),
            "p10": _q(fant, 0.1),
            "p90": _q(fant, 0.9),
            "scoring": scoring,
        },
    }


def _fantasy_from_arrays(arrs: Dict[str, np.ndarray], scoring: str) -> np.ndarray:
    n = len(next(iter(arrs.values())))
    out = np.zeros(n)
    for i in range(n):
        out[i] = fantasy_points(
            {
                "pass_yds": float(arrs.get("pass_yds", np.zeros(n))[i]),
                "pass_td": float(arrs.get("pass_td", np.zeros(n))[i]),
                "interceptions": float(arrs.get("interceptions", np.zeros(n))[i]),
                "rush_yds": float(arrs.get("rush_yds", np.zeros(n))[i]),
                "rush_td": float(arrs.get("rush_td", np.zeros(n))[i]),
                "receptions": float(arrs.get("receptions", np.zeros(n))[i]),
                "rec_yds": float(arrs.get("rec_yds", np.zeros(n))[i]),
                "rec_td": float(arrs.get("rec_td", np.zeros(n))[i]),
            },
            scoring=scoring,
        )
    return out


def _player_proj_from_arrays(
    p: PlayerUsage,
    arrs: Dict[str, np.ndarray],
    scoring: str,
    usage_baseline: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Build player object from attributed sim sample arrays."""
    n = len(arrs["pass_yds"])
    zeros = np.zeros(n)
    pass_yds = arrs.get("pass_yds", zeros)
    rush_yds = arrs.get("rush_yds", zeros)
    rec_yds = arrs.get("rec_yds", zeros)
    receptions = arrs.get("receptions", zeros)
    pass_td = arrs.get("pass_td", zeros)
    rush_td = arrs.get("rush_td", zeros)
    rec_td = arrs.get("rec_td", zeros)
    ints = arrs.get("interceptions", zeros)
    pass_att = arrs.get("pass_att", zeros)
    rush_att = arrs.get("rush_att", zeros)
    targets = arrs.get("targets", zeros)
    sacks = arrs.get("sacks", zeros)

    fant = _fantasy_from_arrays(arrs, scoring)
    anytime = float(np.mean((rush_td + rec_td) > 0))

    usage: Dict[str, Any] = {
        "pass_att_mean": float(_mean(pass_att)) if p.position == "QB" else None,
        "pass_yds_mean": float(_mean(pass_yds)) if p.position == "QB" else None,
        "pass_td_mean": float(_mean(pass_td)) if p.position == "QB" else None,
        "interceptions_mean": float(_mean(ints)) if p.position == "QB" else None,
        "rush_att_mean": float(_mean(rush_att)) if _mean(rush_att) > 0.05 or p.position in ("RB", "QB") else None,
        "rush_yds_mean": float(_mean(rush_yds)) if _mean(rush_yds) > 0.5 or p.position in ("RB", "QB") else None,
        "rush_td_mean": float(_mean(rush_td)) if p.position in ("RB", "QB", "WR") else None,
        "targets_mean": float(_mean(targets)) if p.position != "QB" else None,
        "receptions_mean": float(_mean(receptions)) if p.position != "QB" else None,
        "rec_yds_mean": float(_mean(rec_yds)) if p.position != "QB" else None,
        "rec_td_mean": float(_mean(rec_td)) if p.position != "QB" else None,
        "anytime_td_prob": float(np.clip(anytime, 0, 1)),
        "sacks_mean": float(_mean(sacks)) if _mean(sacks) > 0 else None,
    }

    prop_q: Dict[str, Any] = {"anytime_td": {"prob": usage["anytime_td_prob"]}}
    if p.position == "QB":
        prop_q["pass_yds"] = {"mean": _mean(pass_yds), "p10": _q(pass_yds, 0.1), "p50": _q(pass_yds, 0.5), "p90": _q(pass_yds, 0.9)}
        prop_q["rush_yds"] = {"mean": _mean(rush_yds), "p10": _q(rush_yds, 0.1), "p50": _q(rush_yds, 0.5), "p90": _q(rush_yds, 0.9)}
    elif p.position == "RB":
        prop_q["rush_yds"] = {"mean": _mean(rush_yds), "p10": _q(rush_yds, 0.1), "p50": _q(rush_yds, 0.5), "p90": _q(rush_yds, 0.9)}
        prop_q["rec_yds"] = {"mean": _mean(rec_yds), "p10": _q(rec_yds, 0.1), "p50": _q(rec_yds, 0.5), "p90": _q(rec_yds, 0.9)}
        prop_q["receptions"] = {"mean": _mean(receptions), "p10": _q(receptions, 0.1), "p50": _q(receptions, 0.5), "p90": _q(receptions, 0.9)}
    else:
        prop_q["rec_yds"] = {"mean": _mean(rec_yds), "p10": _q(rec_yds, 0.1), "p50": _q(rec_yds, 0.5), "p90": _q(rec_yds, 0.9)}
        prop_q["receptions"] = {"mean": _mean(receptions), "p10": _q(receptions, 0.1), "p50": _q(receptions, 0.5), "p90": _q(receptions, 0.9)}

    obj: Dict[str, Any] = {
        "player_id": p.player_id,
        "name": p.name,
        "team": p.team,
        "position": p.position,
        "snap_pct_mean": float(np.clip(p.snap_share, 0, 1)),
        "usage": usage,
        "prop_quantiles": prop_q,
        "fantasy": {
            "mean": _mean(fant),
            "p10": _q(fant, 0.1),
            "p90": _q(fant, 0.9),
            "scoring": scoring,
        },
    }
    if usage_baseline is not None:
        obj["usage_baseline"] = usage_baseline
    return obj


def build_sim_result(
    game: Dict[str, Any],
    season: int,
    week: int,
    raw: Dict[str, Any],
    players: Sequence[PlayerUsage],
    cfg: SimConfig,
    team_rates: Optional[Dict[str, Any]] = None,
    confidence: str = "med",
    confidence_reasons: Optional[List[str]] = None,
    toggles_applied: Optional[List[dict]] = None,
    footage_refs: Optional[List[dict]] = None,
    drivers: Optional[List[str]] = None,
    usage_baselines: Optional[Dict[str, Dict[str, float]]] = None,
    usage_assumptions: Optional[List[dict]] = None,
) -> Dict[str, Any]:
    home = game["home_team"]
    away = game["away_team"]
    home_pts = np.asarray(raw["home_pts"], dtype=float)
    away_pts = np.asarray(raw["away_pts"], dtype=float)

    attributed = raw.get("players") or {}

    def vol(team: str):
        tr = (team_rates or {}).get(team)
        if tr is None:
            return 230.0, 120.0, 34.0, 26.0, 32.0, 2.3, 1.1
        pass_ypa = getattr(tr, "pass_ypa", 7.2)
        rush_ypc = getattr(tr, "rush_ypc", 4.3)
        pass_rate = getattr(tr, "pass_rate", 0.58)
        plays = 62.0
        pass_att = plays * pass_rate
        rush_att = plays * (1 - pass_rate)
        return (
            pass_att * pass_ypa,
            rush_att * rush_ypc,
            pass_att,
            rush_att,
            pass_att * 0.95,
            getattr(tr, "sack_rate", 0.07) * 35,
            getattr(tr, "turnover_rate", 0.1) * 11,
        )

    h_py, h_ry, h_pa, h_ra, h_tg, h_sk, h_to = vol(home)
    a_py, a_ry, a_pa, a_ra, a_tg, a_sk, a_to = vol(away)

    if "home_pass_yds" in raw:
        h_py = _mean(np.asarray(raw["home_pass_yds"], dtype=float))
        h_ry = _mean(np.asarray(raw["home_rush_yds"], dtype=float))
        a_py = _mean(np.asarray(raw["away_pass_yds"], dtype=float))
        a_ry = _mean(np.asarray(raw["away_rush_yds"], dtype=float))
    if "home_sacks" in raw:
        h_sk = _mean(np.asarray(raw["home_sacks"], dtype=float))
        a_sk = _mean(np.asarray(raw["away_sacks"], dtype=float))
    if "home_turnovers" in raw:
        h_to = _mean(np.asarray(raw["home_turnovers"], dtype=float))
        a_to = _mean(np.asarray(raw["away_turnovers"], dtype=float))

    rng = np.random.default_rng(cfg.seed + 17)
    game_players = [p for p in players if p.team in (home, away)]
    game_players = sorted(game_players, key=lambda p: (p.position != "QB", -p.snap_share, -p.target_share, -p.rush_share))
    trimmed: List[PlayerUsage] = []
    for team in (home, away):
        tp = [p for p in game_players if p.team == team]
        qbs = [p for p in tp if p.position == "QB"][:1]
        rbs = [p for p in tp if p.position == "RB"][:3]
        wrs = [p for p in tp if p.position == "WR"][:4]
        tes = [p for p in tp if p.position == "TE"][:2]
        trimmed.extend(qbs + rbs + wrs + tes)

    player_objs = []
    for p in trimmed:
        baseline = (usage_baselines or {}).get(p.player_id)
        if p.player_id in attributed and attributed[p.player_id]:
            player_objs.append(
                _player_proj_from_arrays(p, attributed[p.player_id], cfg.scoring, usage_baseline=baseline)
            )
        else:
            if p.team == home:
                py, ry, pa, ra, tg = h_py, h_ry, h_pa, h_ra, h_tg
            else:
                py, ry, pa, ra, tg = a_py, a_ry, a_pa, a_ra, a_tg
            obj = _player_proj_from_usage(
                p,
                _mean(home_pts),
                _mean(away_pts),
                home,
                away,
                py,
                ry,
                pa,
                ra,
                tg,
                cfg.scoring,
                rng,
                n=min(cfg.n_sims, 4000),
            )
            if baseline is not None:
                obj["usage_baseline"] = baseline
            player_objs.append(obj)

    enriched_drivers = list(drivers or [])
    if not enriched_drivers:
        enriched_drivers = [
            f"{home} pass_rate/td_rate vs {away} sack pressure (model rates)",
            "Usage shares from nflverse player stats (shrunk)",
        ]
    if toggles_applied:
        outs = [t for t in toggles_applied if t.get("kind") == "out"]
        if outs:
            enriched_drivers.append(f"Out toggles applied: {len(outs)} player(s) zeroed + heir remap")
    if usage_assumptions:
        enriched_drivers.append(f"Usage assumptions tracked: {len(usage_assumptions)} share moves")
    enriched_drivers.append("Player props from drive-loop attribution (sim sample arrays)")

    away_win = float(np.mean(away_pts > home_pts) + 0.5 * np.mean(away_pts == home_pts))
    result = {
        "schema_version": "1.0.0",
        "game_id": game["game_id"],
        "season": int(season),
        "week": int(week),
        "home_team": home,
        "away_team": away,
        "n_sims": int(cfg.n_sims),
        "seed": int(cfg.seed),
        "scoring": cfg.scoring,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": confidence,
        "confidence_reasons": confidence_reasons or [],
        "toggles_applied": toggles_applied or [],
        "footage_refs": footage_refs or [],
        "market_leans": {
            "home_win_prob": float(raw["home_win_prob"]),
            "away_win_prob": away_win,
            "proj_margin_home": float(raw["proj_margin_home"]),
            "proj_total": float(raw["proj_total"]),
            "margin_p10": float(raw["margin_p10"]),
            "margin_p90": float(raw["margin_p90"]),
            "total_p10": float(raw["total_p10"]),
            "total_p90": float(raw["total_p90"]),
            "note": "Model-only. No sportsbook line. User may type a line client-side for P(over).",
        },
        "user_line_hooks": {
            "supports_typed_spread": True,
            "supports_typed_total": True,
            "supports_typed_player_lines": True,
            "sample_delivery": "summary_plus_quantiles",
        },
        "team_box": {
            "home": {
                "team": home,
                "points_mean": _mean(home_pts),
                "points_p10": _q(home_pts, 0.1),
                "points_p90": _q(home_pts, 0.9),
                "pass_yds_mean": float(h_py),
                "rush_yds_mean": float(h_ry),
                "sacks_mean": float(h_sk),
                "turnovers_mean": float(h_to),
            },
            "away": {
                "team": away,
                "points_mean": _mean(away_pts),
                "points_p10": _q(away_pts, 0.1),
                "points_p90": _q(away_pts, 0.9),
                "pass_yds_mean": float(a_py),
                "rush_yds_mean": float(a_ry),
                "sacks_mean": float(a_sk),
                "turnovers_mean": float(a_to),
            },
        },
        "players": player_objs,
        "drivers": enriched_drivers,
        "copy_rules": {
            "no_lock": True,
            "no_plus_ev": True,
            "no_scraped_odds": True,
        },
    }
    if usage_assumptions:
        result["usage_assumptions"] = usage_assumptions
    return result


def write_sim_result(
    result: Dict[str, Any],
    out_root: Optional[Path] = None,
) -> Path:
    out_root = out_root or OUT
    dest = out_root / "week" / str(result["season"]) / f"w{result['week']}" / "games" / f"{result['game_id']}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(result, indent=2))
    return dest


def required_sim_result_keys() -> List[str]:
    return [
        "schema_version",
        "game_id",
        "season",
        "week",
        "n_sims",
        "seed",
        "scoring",
        "generated_at",
        "confidence",
        "toggles_applied",
        "market_leans",
        "team_box",
        "players",
        "copy_rules",
    ]


def validate_sim_result_keys(result: Dict[str, Any]) -> List[str]:
    missing = [k for k in required_sim_result_keys() if k not in result]
    ml_req = ["home_win_prob", "away_win_prob", "proj_margin_home", "proj_total", "margin_p10", "margin_p90", "total_p10", "total_p90"]
    if "market_leans" in result:
        missing += [f"market_leans.{k}" for k in ml_req if k not in result["market_leans"]]
    if "team_box" in result:
        for side in ("home", "away"):
            box = result["team_box"].get(side, {})
            for k in ("team", "points_mean", "points_p10", "points_p90", "pass_yds_mean", "rush_yds_mean"):
                if k not in box:
                    missing.append(f"team_box.{side}.{k}")
    if "copy_rules" in result:
        for k in ("no_lock", "no_plus_ev", "no_scraped_odds"):
            if k not in result["copy_rules"]:
                missing.append(f"copy_rules.{k}")
    return missing
