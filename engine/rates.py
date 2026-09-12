"""Load helpers for team/player rate stores used by the sim."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Union

import pandas as pd

from .sim_drive import PlayerUsage, TeamRates

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RATES_DIR = ROOT / "out" / "rates"

TEAM_PRIORS = {
    "pass_rate": 0.58,
    "td_rate": 0.22,
    "fg_rate": 0.18,
    "turnover_rate": 0.10,
    "sack_rate": 0.07,
    "sack_rate_allowed": 0.07,
    "pass_ypa": 7.2,
    "rush_ypc": 4.3,
    "points_per_drive": 1.85,
}

POSITION_USAGE_PRIORS = {
    "QB": {"snap_share": 0.98, "target_share": 0.0, "rush_share": 0.08, "pass_share": 0.95, "rz_td_share": 0.05},
    "RB": {"snap_share": 0.45, "target_share": 0.12, "rush_share": 0.45, "pass_share": 0.0, "rz_td_share": 0.35},
    "WR": {"snap_share": 0.70, "target_share": 0.22, "rush_share": 0.01, "pass_share": 0.0, "rz_td_share": 0.20},
    "TE": {"snap_share": 0.55, "target_share": 0.15, "rush_share": 0.0, "pass_share": 0.0, "rz_td_share": 0.15},
    "K": {"snap_share": 0.0, "target_share": 0.0, "rush_share": 0.0, "pass_share": 0.0, "rz_td_share": 0.0},
}


def shrink(obs: float, n: float, prior: float, prior_n: float = 8.0) -> float:
    """Bayesian-ish shrink of rate toward prior with weight prior_n."""
    n = max(0.0, float(n))
    return (obs * n + prior * prior_n) / (n + prior_n)


def rates_dir(path: Optional[Union[str, Path]] = None) -> Path:
    return Path(path) if path else DEFAULT_RATES_DIR


def load_team_rates(path: Optional[Union[str, Path]] = None) -> pd.DataFrame:
    d = rates_dir(path)
    parquet = d / "team_rates.parquet"
    js = d / "team_rates.json"
    if parquet.exists():
        return pd.read_parquet(parquet)
    if js.exists():
        return pd.DataFrame(json.loads(js.read_text()))
    raise FileNotFoundError(f"No team rates under {d}")


def load_player_usage(path: Optional[Union[str, Path]] = None) -> pd.DataFrame:
    d = rates_dir(path)
    parquet = d / "player_usage.parquet"
    js = d / "player_usage.json"
    if parquet.exists():
        return pd.read_parquet(parquet)
    if js.exists():
        return pd.DataFrame(json.loads(js.read_text()))
    raise FileNotFoundError(f"No player usage under {d}")


def team_rates_lookup(df: Optional[pd.DataFrame] = None) -> Dict[str, TeamRates]:
    if df is None:
        df = load_team_rates()
    out: Dict[str, TeamRates] = {}
    for _, row in df.iterrows():
        out[str(row["team"])] = TeamRates(
            team=str(row["team"]),
            pass_rate=float(row.get("pass_rate", TEAM_PRIORS["pass_rate"])),
            points_per_drive=float(row.get("points_per_drive", TEAM_PRIORS["points_per_drive"])),
            td_rate=float(row.get("td_rate", TEAM_PRIORS["td_rate"])),
            fg_rate=float(row.get("fg_rate", TEAM_PRIORS["fg_rate"])),
            turnover_rate=float(row.get("turnover_rate", TEAM_PRIORS["turnover_rate"])),
            sack_rate=float(row.get("sack_rate", TEAM_PRIORS["sack_rate"])),
            pass_ypa=float(row.get("pass_ypa", TEAM_PRIORS["pass_ypa"])),
            rush_ypc=float(row.get("rush_ypc", TEAM_PRIORS["rush_ypc"])),
        )
    return out


def player_usage_for_teams(
    teams: List[str],
    df: Optional[pd.DataFrame] = None,
    positions: Optional[List[str]] = None,
) -> List[PlayerUsage]:
    if df is None:
        df = load_player_usage()
    positions = positions or ["QB", "RB", "WR", "TE"]
    team_set = set(teams)
    sub = df[df["team"].isin(team_set) & df["position"].isin(positions)].copy()
    players: List[PlayerUsage] = []
    for _, row in sub.iterrows():
        players.append(
            PlayerUsage(
                player_id=str(row["player_id"]),
                name=str(row.get("name") or row.get("player_name") or "Unknown"),
                team=str(row["team"]),
                position=str(row["position"]),
                snap_share=float(row.get("snap_share") or 0.0),
                target_share=float(row.get("target_share") or 0.0),
                rush_share=float(row.get("rush_share") or 0.0),
                pass_share=float(row.get("pass_share") or 0.0),
                rz_td_share=float(row.get("rz_td_share") or 0.0),
                sack_share=float(row.get("sack_share") or 0.0),
            )
        )
    return players


def get_team_rates_or_prior(team: str, lookup: Optional[Dict[str, TeamRates]] = None) -> TeamRates:
    lookup = lookup or team_rates_lookup()
    if team in lookup:
        return lookup[team]
    return TeamRates(
        team=team,
        pass_rate=TEAM_PRIORS["pass_rate"],
        points_per_drive=TEAM_PRIORS["points_per_drive"],
        td_rate=TEAM_PRIORS["td_rate"],
        fg_rate=TEAM_PRIORS["fg_rate"],
        turnover_rate=TEAM_PRIORS["turnover_rate"],
        sack_rate=TEAM_PRIORS["sack_rate"],
        pass_ypa=TEAM_PRIORS["pass_ypa"],
        rush_ypc=TEAM_PRIORS["rush_ypc"],
    )
