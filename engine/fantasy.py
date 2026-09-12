"""Fantasy scoring helpers. Default half_ppr (Julian lock)."""

from __future__ import annotations

SCORING = {
    "standard": {"pass_yd": 0.04, "pass_td": 4.0, "int": -2.0, "rush_yd": 0.1, "rush_td": 6.0, "rec": 0.0, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0},
    "half_ppr": {"pass_yd": 0.04, "pass_td": 4.0, "int": -2.0, "rush_yd": 0.1, "rush_td": 6.0, "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0},
    "ppr": {"pass_yd": 0.04, "pass_td": 4.0, "int": -2.0, "rush_yd": 0.1, "rush_td": 6.0, "rec": 1.0, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0},
}


def fantasy_points(usage: dict, scoring: str = "half_ppr") -> float:
    s = SCORING[scoring]
    return (
        (usage.get("pass_yds") or 0) * s["pass_yd"]
        + (usage.get("pass_td") or 0) * s["pass_td"]
        + (usage.get("interceptions") or 0) * s["int"]
        + (usage.get("rush_yds") or 0) * s["rush_yd"]
        + (usage.get("rush_td") or 0) * s["rush_td"]
        + (usage.get("receptions") or 0) * s["rec"]
        + (usage.get("rec_yds") or 0) * s["rec_yd"]
        + (usage.get("rec_td") or 0) * s["rec_td"]
        + (usage.get("fum_lost") or 0) * s["fum_lost"]
    )
