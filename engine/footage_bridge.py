"""Map Footage elevates JSON → toggles + footage_refs + usage remaps."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"


def load_footage_week(
    season: int,
    week: int,
    path: Optional[Path] = None,
) -> Dict[str, Any]:
    candidates = []
    if path:
        candidates.append(Path(path))
    candidates += [
        FIXTURES / f"footage-elevates.week{week}.json",
        FIXTURES / f"footage-elevates.week{week}.example.json",
        FIXTURES / "footage-elevates.week1.example.json",
    ]
    for p in candidates:
        if p.is_file():
            doc = json.loads(p.read_text())
            doc["_path"] = str(p)
            return doc
    return {
        "schema_version": "1.0.0",
        "season": season,
        "week": week,
        "generated_at": None,
        "source": "fixture",
        "rows": [],
        "_path": None,
    }


def rows_for_teams(doc: Dict[str, Any], teams: List[str]) -> List[Dict[str, Any]]:
    teamset = {t.upper() for t in teams}
    return [r for r in (doc.get("rows") or []) if str(r.get("team", "")).upper() in teamset]


def to_toggles_and_refs(
    rows: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    toggles: List[Dict[str, Any]] = []
    refs: List[Dict[str, Any]] = []
    for r in rows:
        pid = r["player_id"]
        status = r.get("status")
        direction = r["direction"]
        refs.append(
            {
                "player_id": pid,
                "direction": direction,
                "prop_family": r["prop_family"],
                "confidence": r["confidence"],
                "why": r.get("why") or "",
            }
        )
        if status == "Out":
            toggles.append({"player_id": pid, "kind": "out", "value": None, "source": "footage"})
        elif status == "Doubtful":
            toggles.append({"player_id": pid, "kind": "doubtful", "value": None, "source": "footage"})
        elif status == "Questionable" or direction == "contingent":
            toggles.append(
                {
                    "player_id": pid,
                    "kind": "questionable_play_prob",
                    "value": 0.55,
                    "source": "footage",
                }
            )
        elif direction == "downgrade" and r.get("prop_family") in ("rush", "rec", "pass"):
            kind = {"rush": "rush_share", "rec": "target_share", "pass": "snap_pct"}[r["prop_family"]]
            toggles.append({"player_id": pid, "kind": kind, "value": 0.75, "source": "footage"})
    return toggles, refs


def apply_usage_remaps(
    players: List[Any],
    rows: List[Dict[str, Any]],
) -> Tuple[List[Any], List[Dict[str, Any]]]:
    """Zero Out players, remap shares to heirs; return (players, usage_assumptions)."""
    by_id = {p.player_id: p for p in players}
    assumptions: List[Dict[str, Any]] = []

    def _note(pid: str, field: str, before: float, after: float, reason: str) -> None:
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

    for r in rows:
        status = r.get("status")
        pid = r["player_id"]
        if status == "Out" and pid in by_id:
            p = by_id[pid]
            donated_rush, donated_tgt, donated_pass = p.rush_share, p.target_share, p.pass_share
            donated_rz, donated_snap = p.rz_td_share, p.snap_share
            for field, before in (
                ("snap_share", donated_snap),
                ("rush_share", donated_rush),
                ("target_share", donated_tgt),
                ("pass_share", donated_pass),
                ("rz_td_share", donated_rz),
            ):
                _note(pid, field, before, 0.0, "Out — zeroed")
            p.snap_share = 0.0
            p.rush_share = 0.0
            p.target_share = 0.0
            p.pass_share = 0.0
            p.rz_td_share = 0.0
            heir = r.get("heir_player_id")
            if heir and heir in by_id:
                h = by_id[heir]
                fam = r.get("prop_family")
                if fam == "rush":
                    before = h.rush_share
                    h.rush_share = min(1.0, h.rush_share + donated_rush)
                    _note(heir, "rush_share", before, h.rush_share, f"heir of Out {pid}")
                    before_s = h.snap_share
                    h.snap_share = min(1.0, max(h.snap_share, 0.55))
                    _note(heir, "snap_share", before_s, h.snap_share, f"heir of Out {pid}")
                    if donated_rz > 0:
                        before_rz = h.rz_td_share
                        h.rz_td_share = min(1.0, h.rz_td_share + donated_rz)
                        _note(heir, "rz_td_share", before_rz, h.rz_td_share, f"heir of Out {pid}")
                elif fam == "rec":
                    before = h.target_share
                    h.target_share = min(1.0, h.target_share + donated_tgt)
                    _note(heir, "target_share", before, h.target_share, f"heir of Out {pid}")
                    before_s = h.snap_share
                    h.snap_share = min(1.0, max(h.snap_share, 0.55))
                    _note(heir, "snap_share", before_s, h.snap_share, f"heir of Out {pid}")
                elif fam == "pass":
                    before = h.pass_share
                    h.pass_share = min(1.0, h.pass_share + donated_pass)
                    _note(heir, "pass_share", before, h.pass_share, f"heir of Out {pid}")
                    before_s = h.snap_share
                    h.snap_share = 1.0
                    _note(heir, "snap_share", before_s, h.snap_share, f"heir of Out {pid}")
        elif status == "Questionable" and pid in by_id:
            p = by_id[pid]
            for field in ("snap_share", "rush_share", "target_share"):
                before = getattr(p, field)
                after = before * 0.55
                setattr(p, field, after)
                _note(pid, field, before, after, "Questionable play_prob scale")
        elif r.get("direction") == "downgrade" and pid in by_id:
            p = by_id[pid]
            for field in ("snap_share", "rush_share", "target_share"):
                before = getattr(p, field)
                after = before * 0.85
                setattr(p, field, after)
                _note(pid, field, before, after, "Footage downgrade")
    return players, assumptions


def bridge_for_game(
    season: int,
    week: int,
    home: str,
    away: str,
    players: List[Any],
    path: Optional[Path] = None,
) -> Dict[str, Any]:
    doc = load_footage_week(season, week, path=path)
    rows = rows_for_teams(doc, [home, away])
    toggles, refs = to_toggles_and_refs(rows)
    players, assumptions = apply_usage_remaps(players, rows)
    return {
        "toggles": toggles,
        "footage_refs": refs,
        "players": players,
        "usage_assumptions": assumptions,
        "footage_path": doc.get("_path"),
        "row_count": len(rows),
    }
