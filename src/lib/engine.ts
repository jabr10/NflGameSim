import fs from "node:fs";
import path from "node:path";
import { ENGINE_NOT_WIRED } from "./constants";
import type { SimRequest, SimResult } from "./types";

const IN_REPO_RUN_SIM = [
  path.join(process.cwd(), "engine", "run_sim.py"),
  path.join(process.cwd(), "sim", "run_sim.py"),
  path.join(process.cwd(), "run_sim.py"),
];

export class EngineNotWiredError extends Error {
  readonly code = ENGINE_NOT_WIRED;
  constructor(message = "In-app engine is not wired yet. Python run_sim lands in M2.") {
    super(message);
    this.name = "EngineNotWiredError";
  }
}

export function engineModulePath(): string | null {
  return IN_REPO_RUN_SIM.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * In-app only. No ENGINE_BASE / external HTTP.
 * M2 will call the in-repo Python `run_sim` once that module exists.
 */
export async function runSim(_request: SimRequest): Promise<SimResult> {
  if (!engineModulePath()) {
    throw new EngineNotWiredError(
      "In-app engine is not wired yet. Python run_sim lands in M2.",
    );
  }
  throw new EngineNotWiredError(
    "In-app engine module is present but run_sim is not wired yet (M2).",
  );
}
