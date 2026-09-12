"""CLI: stdin (or --file) sim-request JSON → stdout sim-result JSON.

Usage (from /workspace/nfl-game-sim):
  .venv/bin/python -m engine.cli_sim <<'JSON'
  {"game_id":"2026_01_ARI_LAC","season":2026,"week":1,"n_sims":1000,"toggles":[]}
  JSON

  .venv/bin/python -m engine.cli_sim --file request.json

On error: non-zero exit and stderr JSON {"error": "...", "code": "..."}.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from .api import SimAPIError, run_sim


def _emit_error(message: str, code: str = "ENGINE", exit_code: int = 1) -> None:
    sys.stderr.write(json.dumps({"error": message, "code": code}) + "\n")
    raise SystemExit(exit_code)


def _load_request(argv: Optional[List[str]] = None) -> Dict[str, Any]:
    p = argparse.ArgumentParser(description="NflGameSim in-app sim CLI (sim-request → sim-result)")
    p.add_argument(
        "--file",
        "-f",
        type=str,
        default=None,
        help="Path to sim-request JSON (default: read stdin)",
    )
    args = p.parse_args(argv)

    if args.file:
        path = Path(args.file)
        if not path.is_file():
            _emit_error(f"Request file not found: {path}", "ENGINE")
        raw = path.read_text()
    else:
        raw = sys.stdin.read()

    if not raw or not raw.strip():
        _emit_error("Empty request body", "ENGINE")
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as e:
        _emit_error(f"Invalid JSON: {e}", "ENGINE")
    if not isinstance(doc, dict):
        _emit_error("Request root must be a JSON object", "ENGINE")
    return doc


def main(argv: Optional[List[str]] = None) -> None:
    request = _load_request(argv)
    try:
        result = run_sim(request)
    except SimAPIError as e:
        _emit_error(e.message, e.code)
    except Exception as e:  # noqa: BLE001
        _emit_error(f"Unhandled engine error: {e}", "ENGINE")
    sys.stdout.write(json.dumps(result) + "\n")


if __name__ == "__main__":
    main()
