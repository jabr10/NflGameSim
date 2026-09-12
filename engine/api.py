"""In-app sim API: sim-request dict → sim-result dict (schema 1.0.0).

Pure Python entrypoint for Bobby's Next `/api/sim` wrap. No Flask/HTTP.
"""

from __future__ import annotations

import copy
import json
import os
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .export import build_sim_result, validate_sim_result_keys
from .footage_bridge import bridge_for_game
from .rates import load_player_usage, load_team_rates, player_usage_for_teams, team_rates_lookup
from .sim_drive import GameState, PlayerUsage, SimConfig, TeamRates, simulate_game

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_KEYS = ("game_id", "season", "week")
TOGGLE_KINDS = frozenset(
    {"out", "doubtful", "questionable_play_prob", "snap_pct", "target_share", "rush_share"}
)


class SimAPIError(Exception):
    """Structured API error with machine-readable code."""

    def __init__(self, message: str, code: str = "ENGINE"):
        super().__init__(message)
        self.message = message
        self.code = code

    def to_dict(self) -> Dict[str, str]:
        return {"error": self.message, "code": self.code}


def data_dir() -> Path:
    """Root containing `week/` and `rates/` (default: repo `out/`)."""
    env = os.environ.get("NFL_SIM_DATA_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return ROOT / "out"


def max_n_sims() -> int:
    raw = os.environ.get("NFL_SIM_MAX_N", "8000")
    try:
        return max(1000, int(raw))
    except ValueError:
        return 8000


def default_scoring() -> str:
    return os.environ.get("NFL_SIM_DEFAULT_SCORING", "half_ppr")


def _snapshot_baselines(players: Sequence[PlayerUsage]) -> Dict[str, Dict[str, float]]:
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


def _note(
    assumptions: List[Dict[str, Any]],
    pid: str,
    field: str,
    before: float,
    after: float,
    reason: str,
) -> None:
    if abs(before - after) < 1e-9:
        return
    assumptions.append(
        {
            "player_id": pid,
            "field": field,
            "from": float(before),
            "to": float(after),
            "reason": reason,
        }
    )


def apply_user_toggles(
    players: List[PlayerUsage],
    toggles: Sequence[Dict[str, Any]],
) -> Tuple[List[PlayerUsage], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Merge user toggles onto players.

    - out → zero shares
    - doubtful → scale shares by 0.25
    - questionable_play_prob → scale shares by value (0–1)
    - snap_pct / target_share / rush_share → set absolute share
    """
    by_id = {p.player_id: p for p in players}
    assumptions: List[Dict[str, Any]] = []
    applied: List[Dict[str, Any]] = []

    for raw in toggles:
        if not isinstance(raw, dict):
            raise SimAPIError("Toggle must be an object", "BAD_TOGGLE")
        pid = raw.get("player_id")
        kind = raw.get("kind")
        if not pid or not kind:
            raise SimAPIError("Toggle missing player_id or kind", "BAD_TOGGLE")
        if kind not in TOGGLE_KINDS:
            raise SimAPIError(f"Unknown toggle kind: {kind}", "BAD_TOGGLE")

        toggle = {
            "player_id": str(pid),
            "kind": str(kind),
            "value": raw.get("value"),
            "source": raw.get("source") or "user",
        }
        applied.append(toggle)

        p = by_id.get(str(pid))
        if p is None:
            continue

        if kind == "out":
            for field in ("snap_share", "rush_share", "target_share", "pass_share", "rz_td_share"):
                before = float(getattr(p, field))
                setattr(p, field, 0.0)
                _note(assumptions, p.player_id, field, before, 0.0, "user Out — zeroed")
        elif kind == "doubtful":
            scale = 0.25
            for field in ("snap_share", "rush_share", "target_share"):
                before = float(getattr(p, field))
                after = before * scale
                setattr(p, field, after)
                _note(assumptions, p.player_id, field, before, after, "user Doubtful scale")
        elif kind == "questionable_play_prob":
            val = toggle["value"]
            if val is None:
                raise SimAPIError("questionable_play_prob requires numeric value", "BAD_TOGGLE")
            try:
                scale = float(val)
            except (TypeError, ValueError) as e:
                raise SimAPIError(f"questionable_play_prob value invalid: {val}", "BAD_TOGGLE") from e
            if not (0.0 <= scale <= 1.0):
                raise SimAPIError("questionable_play_prob must be in [0, 1]", "BAD_TOGGLE")
            for field in ("snap_share", "rush_share", "target_share"):
                before = float(getattr(p, field))
                after = before * scale
                setattr(p, field, after)
                _note(
                    assumptions,
                    p.player_id,
                    field,
                    before,
                    after,
                    f"user questionable_play_prob={scale}",
                )
        elif kind in ("snap_pct", "target_share", "rush_share"):
            val = toggle["value"]
            if val is None:
                raise SimAPIError(f"{kind} requires numeric value", "BAD_TOGGLE")
            try:
                share = float(val)
            except (TypeError, ValueError) as e:
                raise SimAPIError(f"{kind} value invalid: {val}", "BAD_TOGGLE") from e
            if not (0.0 <= share <= 1.0):
                raise SimAPIError(f"{kind} must be in [0, 1]", "BAD_TOGGLE")
            field = "snap_share" if kind == "snap_pct" else kind
            before = float(getattr(p, field))
            setattr(p, field, share)
            _note(assumptions, p.player_id, field, before, share, f"user set {kind}")

    return players, applied, assumptions


def _load_slate(season: int, week: int, root: Path) -> Dict[str, Any]:
    slate_path = root / "week" / str(season) / f"w{week}" / "slate.json"
    if not slate_path.is_file():
        raise SimAPIError(f"Slate not found: {slate_path}", "ENGINE")
    try:
        return json.loads(slate_path.read_text())
    except json.JSONDecodeError as e:
        raise SimAPIError(f"Invalid slate JSON at {slate_path}: {e}", "ENGINE") from e


def _find_game(slate: Dict[str, Any], game_id: str) -> Dict[str, Any]:
    for g in slate.get("games") or []:
        if g.get("game_id") == game_id:
            return g
    raise SimAPIError(f"Unknown game_id: {game_id}", "UNKNOWN_GAME")


def _cap_n_sims(n: Optional[int]) -> int:
    cap = max_n_sims()
    if n is None:
        return min(8000, cap)
    try:
        n_int = int(n)
    except (TypeError, ValueError) as e:
        raise SimAPIError(f"n_sims must be an integer, got {n!r}", "ENGINE") from e
    if n_int < 1000:
        raise SimAPIError("n_sims must be >= 1000", "ENGINE")
    return min(n_int, cap)


def _resolve_seed(seed: Any) -> int:
    if seed is None:
        return random.randint(0, 2**31 - 1)
    try:
        return int(seed)
    except (TypeError, ValueError) as e:
        raise SimAPIError(f"seed must be int or null, got {seed!r}", "ENGINE") from e


def run_sim(request: dict) -> dict:
    """Validate sim-request, load slate/rates, apply footage+toggles, sim, return sim-result."""
    if not isinstance(request, dict):
        raise SimAPIError("request must be a JSON object", "ENGINE")

    missing = [k for k in REQUIRED_KEYS if k not in request or request[k] is None]
    if missing:
        raise SimAPIError(f"Missing required keys: {', '.join(missing)}", "ENGINE")

    game_id = str(request["game_id"])
    try:
        season = int(request["season"])
        week = int(request["week"])
    except (TypeError, ValueError) as e:
        raise SimAPIError(f"season/week must be integers: {e}", "ENGINE") from e

    scoring = request.get("scoring") or default_scoring()
    if scoring not in ("half_ppr", "ppr", "standard"):
        raise SimAPIError(f"Invalid scoring: {scoring}", "ENGINE")

    toggles_in = request.get("toggles")
    if toggles_in is None:
        toggles_in = []
    if not isinstance(toggles_in, list):
        raise SimAPIError("toggles must be an array", "BAD_TOGGLE")

    include_footage = request.get("include_footage_defaults", True)
    if include_footage is None:
        include_footage = True

    n_sims = _cap_n_sims(request.get("n_sims"))
    seed = _resolve_seed(request.get("seed"))

    root = data_dir()
    slate = _load_slate(season, week, root)
    game = _find_game(slate, game_id)
    home, away = game["home_team"], game["away_team"]

    rates_path = root / "rates"
    try:
        team_df = load_team_rates(rates_path)
        player_df = load_player_usage(rates_path)
    except FileNotFoundError as e:
        raise SimAPIError(str(e), "ENGINE") from e

    lookup = team_rates_lookup(team_df)
    home_rates: TeamRates = lookup.get(home) or TeamRates(team=home)
    away_rates: TeamRates = lookup.get(away) or TeamRates(team=away)

    players = player_usage_for_teams([home, away], df=player_df)
    baselines = _snapshot_baselines(players)
    players = copy.deepcopy(players)

    footage_refs: List[Dict[str, Any]] = []
    toggles_applied: List[Dict[str, Any]] = []
    usage_assumptions: List[Dict[str, Any]] = []
    reasons: List[str] = []

    if include_footage:
        bridged = bridge_for_game(season, week, home, away, players)
        players = bridged["players"]
        toggles_applied.extend(bridged.get("toggles") or [])
        footage_refs = bridged.get("footage_refs") or []
        usage_assumptions.extend(bridged.get("usage_assumptions") or [])
        if bridged.get("row_count"):
            reasons.append(
                f"Footage rows applied: {bridged['row_count']} ({bridged.get('footage_path')})"
            )

    players, user_toggles, user_assumptions = apply_user_toggles(players, toggles_in)
    toggles_applied.extend(user_toggles)
    usage_assumptions.extend(user_assumptions)

    if week <= 1:
        conf = "low"
        reasons.append("Week-1 prior-heavy rates (prior-season samples + shrinkage)")
    else:
        conf = "med"

    cap = max_n_sims()
    if request.get("n_sims") is not None and int(request["n_sims"]) > cap:
        reasons.append(f"n_sims capped at NFL_SIM_MAX_N={cap}")

    cfg = SimConfig(n_sims=n_sims, seed=seed, scoring=scoring)
    state = GameState(home=home_rates, away=away_rates, players=players, toggles=toggles_applied)
    try:
        raw = simulate_game(state, cfg)
    except Exception as e:  # noqa: BLE001 — surface as ENGINE
        raise SimAPIError(f"simulate_game failed: {e}", "ENGINE") from e

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
        toggles_applied=toggles_applied,
        footage_refs=footage_refs,
        drivers=[
            f"Model drive MC (attributed): {away} @ {home}",
            f"pass_rate {home}={home_rates.pass_rate:.2f} vs {away}={away_rates.pass_rate:.2f}",
            f"td_rate {home}={home_rates.td_rate:.2f} / {away}={away_rates.td_rate:.2f}",
        ],
        usage_baselines=baselines,
        usage_assumptions=usage_assumptions,
    )
    missing_keys = validate_sim_result_keys(result)
    if missing_keys:
        raise SimAPIError(f"sim-result missing keys: {missing_keys}", "ENGINE")
    return result
