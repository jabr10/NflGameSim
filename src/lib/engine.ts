import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { N_SIMS_CAP, NFL_SIM_DATA_DIR_DEFAULT } from "./constants";
import { normalizeSimResult } from "./normalize";
import type { SimRequest, SimResult } from "./types";

export class SimEngineError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code = "ENGINE", status = 400) {
    super(message);
    this.name = "SimEngineError";
    this.status = status;
    this.code = code;
  }
}

function dataDir(): string {
  const env = process.env.NFL_SIM_DATA_DIR?.trim();
  if (env) return path.isAbsolute(env) ? env : path.join(/*turbopackIgnore: true*/ process.cwd(), env);
  return path.join(process.cwd(), NFL_SIM_DATA_DIR_DEFAULT);
}

function maxNSims(): string {
  const env = process.env.NFL_SIM_MAX_N?.trim();
  if (env && /^\d+$/.test(env)) return String(Math.max(1000, Number(env)));
  return String(N_SIMS_CAP);
}

function pythonBin(): string {
  return process.env.PYTHON_BIN?.trim() || "python3";
}

function cliArgs(): string[] {
  const cli = path.join(process.cwd(), "engine", "cli_sim.py");
  const init = path.join(process.cwd(), "engine", "__init__.py");
  if (fs.existsSync(cli) && fs.existsSync(init)) {
    return [pythonBin(), "-m", "engine.cli_sim"];
  }
  if (fs.existsSync(cli)) {
    return [pythonBin(), cli];
  }
  throw new SimEngineError(
    "In-app engine CLI missing (engine/cli_sim.py).",
    "ENGINE",
    500,
  );
}

function parseEngineError(stdout: string, stderr: string): { error: string; code: string; status: number } {
  for (const raw of [stdout, stderr]) {
    const text = raw.trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string; code?: string; status?: number };
      if (parsed && (parsed.error || parsed.message || parsed.code)) {
        return {
          error: parsed.error || parsed.message || "Engine error",
          code: parsed.code || "ENGINE",
          status: typeof parsed.status === "number" ? parsed.status : 400,
        };
      }
    } catch {
      // not JSON
    }
  }
  const detail = (stderr || stdout).trim();
  return {
    error: detail || "Engine process failed",
    code: "ENGINE",
    status: 500,
  };
}

function spawnCli(payload: unknown): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const [bin, ...args] = cliArgs();
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ bin, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NFL_SIM_DATA_DIR: dataDir(),
        NFL_SIM_MAX_N: maxNSims(),
        NFL_SIM_DEFAULT_SCORING: "half_ppr",
        PYTHONPATH: [process.cwd(), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SimEngineError(
          `Failed to spawn in-app engine (${bin}): ${err.message}`,
          "ENGINE",
          500,
        ),
      );
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/**
 * In-app only. No ENGINE_BASE / external HTTP.
 * Always spawns `python -m engine.cli_sim` (stdin JSON → stdout JSON).
 */
export async function runSim(request: SimRequest): Promise<SimResult> {
  const payload = {
    schema_version: request.schema_version,
    game_id: request.game_id,
    season: request.season,
    week: request.week,
    scoring: request.scoring,
    n_sims: Math.min(Math.max(request.n_sims, 1000), N_SIMS_CAP),
    include_footage_defaults: request.include_footage_defaults,
    toggles: request.toggles,
    ...(request.seed != null ? { seed: request.seed } : {}),
  };

  const { code, stdout, stderr } = await spawnCli(payload);
  if (code !== 0) {
    const err = parseEngineError(stdout, stderr);
    throw new SimEngineError(err.error, err.code, err.status);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new SimEngineError("Engine returned invalid JSON", "ENGINE", 500);
  }
  if (raw && typeof raw === "object" && "error" in raw && !("game_id" in raw)) {
    const err = parseEngineError(stdout, "");
    throw new SimEngineError(err.error, err.code, err.status);
  }
  return normalizeSimResult(raw);
}
