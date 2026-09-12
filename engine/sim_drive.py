"""Drive/possession Monte Carlo with per-player attribution.

Team points still come from drive outcomes; yards/TDs/INTs are allocated
to players from remapped PlayerUsage shares inside each drive.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple
import numpy as np


DRIVE_OUTCOMES = ("punt", "fg", "td", "turnover", "end_half")

PLAYER_STAT_KEYS = (
    "pass_yds",
    "rush_yds",
    "rec_yds",
    "receptions",
    "pass_td",
    "rush_td",
    "rec_td",
    "interceptions",
    "sacks",
    "pass_att",
    "rush_att",
    "targets",
)


@dataclass
class TeamRates:
    team: str
    pass_rate: float = 0.58
    points_per_drive: float = 1.85
    td_rate: float = 0.22
    fg_rate: float = 0.18
    turnover_rate: float = 0.10
    sack_rate: float = 0.07
    pass_ypa: float = 7.2
    rush_ypc: float = 4.3


@dataclass
class PlayerUsage:
    player_id: str
    name: str
    team: str
    position: str
    snap_share: float = 0.0
    target_share: float = 0.0
    rush_share: float = 0.0
    pass_share: float = 0.0  # QB
    rz_td_share: float = 0.0
    sack_share: float = 0.0


@dataclass
class SimConfig:
    n_sims: int = 8000
    seed: int = 42
    scoring: str = "half_ppr"


@dataclass
class GameState:
    home: TeamRates
    away: TeamRates
    players: List[PlayerUsage]
    toggles: List[dict] = field(default_factory=list)


def _drive_outcome(rng: np.random.Generator, off: TeamRates, deff: TeamRates) -> str:
    # Lightweight outcome mix; replace with calibrated multinomial from nflverse later.
    td = np.clip(off.td_rate - 0.03 * (deff.sack_rate - 0.06), 0.08, 0.35)
    fg = np.clip(off.fg_rate, 0.10, 0.28)
    to = np.clip(off.turnover_rate + 0.5 * (deff.sack_rate - 0.06), 0.05, 0.18)
    end = 0.04
    punt = max(0.05, 1.0 - td - fg - to - end)
    return rng.choice(DRIVE_OUTCOMES, p=np.array([punt, fg, td, to, end]) / (punt + fg + td + to + end))


def _norm_weights(values: Sequence[float]) -> Optional[np.ndarray]:
    arr = np.asarray(values, dtype=float)
    arr = np.clip(arr, 0.0, None)
    s = float(arr.sum())
    if s <= 1e-12:
        return None
    return arr / s


def _pick_index(rng: np.random.Generator, weights: Sequence[float]) -> Optional[int]:
    w = _norm_weights(weights)
    if w is None:
        return None
    return int(rng.choice(len(w), p=w))


def _catch_rate(pos: str) -> float:
    if pos == "WR":
        return 0.65
    if pos == "TE":
        return 0.72
    if pos == "RB":
        return 0.78
    return 0.68


def _drive_volume(rng: np.random.Generator, off: TeamRates, outcome: str) -> Tuple[float, float, int, int]:
    """Return pass_yds, rush_yds, pass_att, rush_att for one drive."""
    pass_rate = float(np.clip(off.pass_rate, 0.35, 0.78))
    if outcome == "td":
        total_yds = float(np.clip(rng.normal(74.0, 11.0), 48.0, 98.0))
        n_plays = int(rng.integers(6, 12))
    elif outcome == "fg":
        total_yds = float(np.clip(rng.normal(49.0, 10.0), 28.0, 72.0))
        n_plays = int(rng.integers(5, 10))
    elif outcome == "turnover":
        total_yds = float(np.clip(rng.normal(27.0, 10.0), 4.0, 55.0))
        n_plays = int(rng.integers(2, 7))
    elif outcome == "punt":
        total_yds = float(np.clip(rng.normal(21.0, 8.0), 0.0, 42.0))
        n_plays = int(rng.integers(3, 7))
    else:  # end_half
        total_yds = float(np.clip(rng.normal(14.0, 7.0), 0.0, 36.0))
        n_plays = int(rng.integers(1, 5))

    pass_yds = total_yds * pass_rate
    rush_yds = total_yds * (1.0 - pass_rate)
    pass_yds *= float(np.clip(off.pass_ypa / 7.2, 0.85, 1.15))
    rush_yds *= float(np.clip(off.rush_ypc / 4.3, 0.85, 1.15))

    pass_att = max(1, int(round(n_plays * pass_rate))) if total_yds > 0 else 0
    rush_att = max(0, n_plays - pass_att)
    if rush_yds > 0 and rush_att == 0:
        rush_att = 1
    return pass_yds, rush_yds, pass_att, rush_att


def _allocate_drive(
    rng: np.random.Generator,
    off: TeamRates,
    deff: TeamRates,
    offense: Sequence[PlayerUsage],
    bags: Dict[str, Dict[str, float]],
    team_pass: List[float],
    team_rush: List[float],
    team_sacks: List[float],
    team_to: List[float],
    outcome: str,
    sim_i: int,
) -> None:
    """Mutate per-sim player bags + team volume trackers for one drive."""
    if not offense:
        return

    pass_yds, rush_yds, pass_att, rush_att = _drive_volume(rng, off, outcome)
    team_pass[sim_i] += pass_yds
    team_rush[sim_i] += rush_yds

    sack_rate = float(np.clip(deff.sack_rate, 0.03, 0.14))
    n_sacks = int(rng.binomial(max(pass_att, 1), min(0.35, sack_rate))) if pass_att else 0
    if n_sacks:
        sack_yds = float(n_sacks) * float(rng.uniform(5.0, 9.0))
        pass_yds = max(0.0, pass_yds - sack_yds)
        team_sacks[sim_i] += float(n_sacks)

    qbs = [p for p in offense if p.position == "QB"]
    rushers = [p for p in offense if p.rush_share > 1e-6]
    receivers = [p for p in offense if p.target_share > 1e-6 and p.position != "QB"]

    if qbs and (pass_yds > 0 or pass_att > 0):
        w = _norm_weights([max(p.pass_share, 0.01 if p.position == "QB" else 0.0) for p in qbs])
        if w is None:
            w = np.ones(len(qbs)) / len(qbs)
        for i, qb in enumerate(qbs):
            bags[qb.player_id]["pass_yds"] += pass_yds * float(w[i])
            bags[qb.player_id]["pass_att"] += pass_att * float(w[i])

    if rushers and (rush_yds > 0 or rush_att > 0):
        w = _norm_weights([p.rush_share for p in rushers])
        if w is not None:
            for i, rb in enumerate(rushers):
                bags[rb.player_id]["rush_yds"] += rush_yds * float(w[i])
                bags[rb.player_id]["rush_att"] += rush_att * float(w[i])

    if receivers and pass_att > 0:
        w = _norm_weights([p.target_share for p in receivers])
        if w is not None:
            tgt_counts = rng.multinomial(pass_att, w)
            for i, recv in enumerate(receivers):
                t = int(tgt_counts[i])
                if t <= 0:
                    continue
                bags[recv.player_id]["targets"] += float(t)
                cr = _catch_rate(recv.position)
                catches = int(rng.binomial(t, cr))
                bags[recv.player_id]["receptions"] += float(catches)
            for i, recv in enumerate(receivers):
                bags[recv.player_id]["rec_yds"] += pass_yds * float(w[i]) * 0.92

    if outcome == "td":
        scorers = [p for p in offense if p.rz_td_share > 1e-6 or p.rush_share > 0.05 or p.target_share > 0.05]
        if not scorers:
            scorers = list(offense)
        idx = _pick_index(rng, [max(p.rz_td_share, 0.01 * (p.rush_share + p.target_share)) for p in scorers])
        if idx is not None:
            scorer = scorers[idx]
            rush_bias = scorer.rush_share / max(scorer.rush_share + scorer.target_share, 1e-6)
            if scorer.position == "QB":
                if rng.random() < 0.22 and scorer.rush_share > 0.02:
                    bags[scorer.player_id]["rush_td"] += 1.0
                else:
                    if qbs:
                        qb_idx = _pick_index(rng, [max(p.pass_share, 0.01) for p in qbs])
                        if qb_idx is not None:
                            bags[qbs[qb_idx].player_id]["pass_td"] += 1.0
                    if receivers:
                        r_idx = _pick_index(rng, [p.target_share for p in receivers])
                        if r_idx is not None:
                            bags[receivers[r_idx].player_id]["rec_td"] += 1.0
                    elif scorer.position in ("WR", "TE", "RB"):
                        bags[scorer.player_id]["rec_td"] += 1.0
            elif scorer.position == "RB" or (rush_bias > 0.55 and scorer.rush_share > 0.05):
                bags[scorer.player_id]["rush_td"] += 1.0
            else:
                bags[scorer.player_id]["rec_td"] += 1.0
                if qbs:
                    qb_idx = _pick_index(rng, [max(p.pass_share, 0.01) for p in qbs])
                    if qb_idx is not None:
                        bags[qbs[qb_idx].player_id]["pass_td"] += 1.0

    if outcome == "turnover":
        team_to[sim_i] += 1.0
        if qbs and rng.random() < 0.55:
            qb_idx = _pick_index(rng, [max(p.pass_share, 0.01) for p in qbs])
            if qb_idx is not None:
                bags[qbs[qb_idx].player_id]["interceptions"] += 1.0


def _empty_bag() -> Dict[str, float]:
    return {k: 0.0 for k in PLAYER_STAT_KEYS}


def simulate_game(state: GameState, cfg: SimConfig) -> dict:
    """Return team + per-player sample arrays; export.py maps to sim-result schema."""
    rng = np.random.default_rng(cfg.seed)
    n = cfg.n_sims
    home_pts = np.zeros(n)
    away_pts = np.zeros(n)
    home_pass = [0.0] * n
    home_rush = [0.0] * n
    away_pass = [0.0] * n
    away_rush = [0.0] * n
    home_sacks = [0.0] * n  # sacks taken by home offense (allowed by away)
    away_sacks = [0.0] * n
    home_to = [0.0] * n
    away_to = [0.0] * n

    players = list(state.players)
    home_pl = [p for p in players if p.team == state.home.team]
    away_pl = [p for p in players if p.team == state.away.team]

    # Accumulate per-sim bags then stack into arrays
    player_bags: Dict[str, List[Dict[str, float]]] = {p.player_id: [] for p in players}

    for i in range(n):
        bags = {p.player_id: _empty_bag() for p in players}
        hp = ap = 0
        for _ in range(11):
            o = _drive_outcome(rng, state.home, state.away)
            if o == "td":
                hp += 7
            elif o == "fg":
                hp += 3
            _allocate_drive(
                rng,
                state.home,
                state.away,
                home_pl,
                bags,
                home_pass,
                home_rush,
                home_sacks,
                home_to,
                o,
                i,
            )

            o = _drive_outcome(rng, state.away, state.home)
            if o == "td":
                ap += 7
            elif o == "fg":
                ap += 3
            _allocate_drive(
                rng,
                state.away,
                state.home,
                away_pl,
                bags,
                away_pass,
                away_rush,
                away_sacks,
                away_to,
                o,
                i,
            )

        home_pts[i] = hp
        away_pts[i] = ap
        for p in players:
            player_bags[p.player_id].append(bags[p.player_id])

    # Stack player bags → arrays
    player_arrays: Dict[str, Dict[str, np.ndarray]] = {}
    for pid, bag_list in player_bags.items():
        player_arrays[pid] = {
            k: np.asarray([b[k] for b in bag_list], dtype=float) for k in PLAYER_STAT_KEYS
        }

    margin = home_pts - away_pts
    total = home_pts + away_pts
    return {
        "home_pts": home_pts,
        "away_pts": away_pts,
        "home_pass_yds": np.asarray(home_pass, dtype=float),
        "away_pass_yds": np.asarray(away_pass, dtype=float),
        "home_rush_yds": np.asarray(home_rush, dtype=float),
        "away_rush_yds": np.asarray(away_rush, dtype=float),
        "home_sacks": np.asarray(home_sacks, dtype=float),
        "away_sacks": np.asarray(away_sacks, dtype=float),
        "home_turnovers": np.asarray(home_to, dtype=float),
        "away_turnovers": np.asarray(away_to, dtype=float),
        "players": player_arrays,
        "home_win_prob": float(np.mean(margin > 0) + 0.5 * np.mean(margin == 0)),
        "proj_margin_home": float(np.mean(margin)),
        "proj_total": float(np.mean(total)),
        "margin_p10": float(np.quantile(margin, 0.10)),
        "margin_p90": float(np.quantile(margin, 0.90)),
        "total_p10": float(np.quantile(total, 0.10)),
        "total_p90": float(np.quantile(total, 0.90)),
    }
