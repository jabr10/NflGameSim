import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import type { FootageElevates, SimResult, Slate } from "./types";

const FIXTURES_DIR = path.join(process.cwd(), "fixtures");

function readJson<T>(rel: string): T {
  const full = path.join(FIXTURES_DIR, rel);
  const raw = fs.readFileSync(full, "utf8");
  return JSON.parse(raw) as T;
}

export const loadSlate = cache((): Slate => {
  return readJson<Slate>("slate.json");
});

export const loadElevates = cache((): FootageElevates => {
  return readJson<FootageElevates>("footage-elevates.week1.json");
});

export const loadGame = cache((gameId: string): SimResult => {
  if (!/^[\w-]+$/.test(gameId)) {
    throw new Error("Invalid game_id");
  }
  return readJson<SimResult>(path.join("games", `${gameId}.json`));
});

export function gameExists(gameId: string): boolean {
  if (!/^[\w-]+$/.test(gameId)) return false;
  return fs.existsSync(path.join(FIXTURES_DIR, "games", `${gameId}.json`));
}

export const loadAllGames = cache((): SimResult[] => {
  const slate = loadSlate();
  return slate.games.map((g) => loadGame(g.game_id));
});
