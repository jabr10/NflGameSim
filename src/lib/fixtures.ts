import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { ELEVATES_REL } from "./constants";
import { mergeScheduleFrom, normalizeElevates, normalizeSimResult, normalizeSlate } from "./normalize";
import type { FootageElevates, SimResult, Slate } from "./types";

function dataRoot(): string {
  const env = process.env.NFL_SIM_DATA_DIR?.trim();
  if (env) return path.isAbsolute(env) ? env : path.join(/*turbopackIgnore: true*/ process.cwd(), env);
  return path.join(process.cwd(), "data");
}

const DATA_WEEK_DIR = path.join(process.cwd(), "data", "week", "2026", "w1");
const FIXTURES_DIR = path.join(process.cwd(), "fixtures");

function weekDir(): string {
  const envDir = path.join(dataRoot(), "week", "2026", "w1");
  if (process.env.NFL_SIM_DATA_DIR?.trim()) return envDir;
  return DATA_WEEK_DIR;
}

function readJsonFile(full: string): unknown {
  const raw = fs.readFileSync(full, "utf8");
  return JSON.parse(raw) as unknown;
}

export function weekPackReady(): boolean {
  return fs.existsSync(path.join(weekDir(), "slate.json"));
}

export function weekPackSource(): "data" | "fixtures" | "mixed" {
  if (!weekPackReady()) return "fixtures";
  const slate = loadSlate();
  const dataGames = slate.games.filter((g) =>
    fs.existsSync(path.join(weekDir(), "games", `${g.game_id}.json`)),
  );
  if (dataGames.length === slate.games.length) return "data";
  return "mixed";
}

function slatePath(): string {
  const dataSlate = path.join(weekDir(), "slate.json");
  if (fs.existsSync(dataSlate)) return dataSlate;
  return path.join(FIXTURES_DIR, "slate.json");
}

function resolveGamePath(gameId: string): string | null {
  const dataPath = path.join(weekDir(), "games", `${gameId}.json`);
  if (fs.existsSync(dataPath)) return dataPath;
  const fixturePath = path.join(FIXTURES_DIR, "games", `${gameId}.json`);
  if (fs.existsSync(fixturePath)) return fixturePath;
  return null;
}

export const loadSlate = cache((): Slate => {
  return normalizeSlate(readJsonFile(slatePath()));
});

function attachElevateGameIds(elevates: FootageElevates, slate: Slate): FootageElevates {
  const byTeam = new Map<string, string>();
  for (const g of slate.games) {
    byTeam.set(g.home, g.game_id);
    byTeam.set(g.away, g.game_id);
  }
  return {
    ...elevates,
    rows: elevates.rows.map((row) =>
      row.game_id ? row : { ...row, game_id: byTeam.get(row.team) ?? "" },
    ),
  };
}

export const loadElevates = cache((): FootageElevates => {
  const elevates = normalizeElevates(readJsonFile(path.join(FIXTURES_DIR, ELEVATES_REL)));
  return attachElevateGameIds(elevates, loadSlate());
});

function applySlateContext(sim: SimResult): SimResult {
  const row = loadSlate().games.find((g) => g.game_id === sim.game_id);
  if (!row) return sim;
  return mergeScheduleFrom(sim, row);
}

export const loadGame = cache((gameId: string): SimResult => {
  if (!/^[\w-]+$/.test(gameId)) {
    throw new Error("Invalid game_id");
  }
  const full = resolveGamePath(gameId);
  if (!full) throw new Error(`Unknown game_id: ${gameId}`);
  return applySlateContext(normalizeSimResult(readJsonFile(full)));
});

export function gameExists(gameId: string): boolean {
  if (!/^[\w-]+$/.test(gameId)) return false;
  return resolveGamePath(gameId) != null;
}

export const loadAllGames = cache((): SimResult[] => {
  const slate = loadSlate();
  const games: SimResult[] = [];
  for (const g of slate.games) {
    if (!gameExists(g.game_id)) continue;
    try {
      games.push(loadGame(g.game_id));
    } catch (err) {
      console.error(`[fixtures] skipped ${g.game_id}`, err);
    }
  }
  return games;
});
