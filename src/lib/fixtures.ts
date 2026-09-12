import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { ELEVATES_REL, RATES_REL, WEEK_PACK_REL } from "./constants";
import { normalizeElevates, normalizeSimResult, normalizeSlate } from "./normalize";
import type { FootageElevates, RateFile, SimResult, Slate } from "./types";

const DATA_WEEK_DIR = path.join(process.cwd(), WEEK_PACK_REL);
const FIXTURES_DIR = path.join(process.cwd(), "fixtures");
const RATES_DIR = path.join(process.cwd(), RATES_REL);

function readJsonFile(full: string): unknown {
  const raw = fs.readFileSync(full, "utf8");
  return JSON.parse(raw) as unknown;
}

export function weekPackReady(): boolean {
  return fs.existsSync(path.join(DATA_WEEK_DIR, "slate.json"));
}

export function weekPackSource(): "data" | "fixtures" {
  return weekPackReady() ? "data" : "fixtures";
}

function slatePath(): string {
  if (weekPackReady()) return path.join(DATA_WEEK_DIR, "slate.json");
  return path.join(FIXTURES_DIR, "slate.json");
}

function resolveGamePath(gameId: string): string | null {
  const dataPath = path.join(DATA_WEEK_DIR, "games", `${gameId}.json`);
  if (fs.existsSync(dataPath)) return dataPath;
  if (!weekPackReady()) {
    const fixturePath = path.join(FIXTURES_DIR, "games", `${gameId}.json`);
    if (fs.existsSync(fixturePath)) return fixturePath;
  }
  return null;
}

export const loadSlate = cache((): Slate => {
  return normalizeSlate(readJsonFile(slatePath()));
});

export const loadElevates = cache((): FootageElevates => {
  return normalizeElevates(readJsonFile(path.join(FIXTURES_DIR, ELEVATES_REL)));
});

export const loadGame = cache((gameId: string): SimResult => {
  if (!/^[\w-]+$/.test(gameId)) {
    throw new Error("Invalid game_id");
  }
  const full = resolveGamePath(gameId);
  if (!full) throw new Error(`Unknown game_id: ${gameId}`);
  return normalizeSimResult(readJsonFile(full));
});

export function gameExists(gameId: string): boolean {
  if (!/^[\w-]+$/.test(gameId)) return false;
  return resolveGamePath(gameId) != null;
}

export const loadAllGames = cache((): SimResult[] => {
  const slate = loadSlate();
  return slate.games.map((g) => loadGame(g.game_id));
});

export const loadRates = cache((): RateFile[] => {
  if (!fs.existsSync(RATES_DIR)) return [];
  return fs
    .readdirSync(RATES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      data: readJsonFile(path.join(RATES_DIR, name)),
    }));
});
