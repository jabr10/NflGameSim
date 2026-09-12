import { N_SIMS_CAP, N_SIMS_DEFAULT, SCHEMA_VERSION, SCORING_DEFAULT } from "./constants";
import type { InjuryToggle, PlayerToggle, Scoring, SimRequest, UsageToggle } from "./types";

const INJURY: InjuryToggle[] = ["active", "questionable", "out"];
const USAGE: UsageToggle[] = ["base", "up", "down"];

export type ParseOk = { ok: true; value: SimRequest };
export type ParseErr = { ok: false; error: string };
export type ParseResult = ParseOk | ParseErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function parseToggle(raw: unknown): PlayerToggle | null {
  if (!isRecord(raw)) return null;
  const player_id =
    typeof raw.player_id === "string"
      ? raw.player_id
      : typeof raw.id === "string"
        ? raw.id
        : "";
  if (!player_id) return null;
  const injuryRaw = typeof raw.injury === "string" ? raw.injury : "active";
  const usageRaw = typeof raw.usage === "string" ? raw.usage : "base";
  const injury = (INJURY as string[]).includes(injuryRaw) ? (injuryRaw as InjuryToggle) : "active";
  const usage = (USAGE as string[]).includes(usageRaw) ? (usageRaw as UsageToggle) : "base";
  return { player_id, injury, usage };
}

export function parseSimRequest(
  raw: unknown,
  defaults: { season: number; week: number },
): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "sim-request must be an object" };

  const game_id = typeof raw.game_id === "string" ? raw.game_id.trim() : "";
  if (!game_id) return { ok: false, error: "game_id is required" };

  const schema =
    typeof raw.schema_version === "string"
      ? raw.schema_version
      : typeof raw.schema === "string"
        ? raw.schema
        : SCHEMA_VERSION;
  if (schema !== SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported schema_version ${schema}` };
  }

  const scoringRaw =
    typeof raw.scoring === "string" && raw.scoring.length > 0 ? raw.scoring : SCORING_DEFAULT;
  if (scoringRaw !== "half_ppr") {
    return { ok: false, error: "Only half_ppr scoring is supported" };
  }
  const scoring = scoringRaw as Scoring;

  const season = raw.season == null ? defaults.season : asInt(raw.season);
  const week = raw.week == null ? defaults.week : asInt(raw.week);
  if (season == null || week == null) return { ok: false, error: "season and week must be numbers" };

  let n_sims = N_SIMS_DEFAULT;
  if (raw.n_sims != null) {
    const n = asInt(raw.n_sims);
    if (n == null) return { ok: false, error: "n_sims must be a number" };
    if (n < 1) return { ok: false, error: "n_sims must be at least 1" };
    n_sims = Math.min(n, N_SIMS_CAP);
  }

  let seed: number | undefined;
  if (raw.seed != null) {
    const s = asInt(raw.seed);
    if (s == null) return { ok: false, error: "seed must be a number" };
    seed = s;
  }

  const include_footage_defaults =
    typeof raw.include_footage_defaults === "boolean" ? raw.include_footage_defaults : true;

  const togglesRaw = Array.isArray(raw.toggles) ? raw.toggles : [];
  const toggles = togglesRaw.map(parseToggle).filter((t): t is PlayerToggle => t != null);

  const value: SimRequest = {
    schema_version: SCHEMA_VERSION,
    game_id,
    season,
    week,
    scoring,
    n_sims,
    include_footage_defaults,
    toggles,
  };
  if (seed != null) value.seed = seed;
  return { ok: true, value };
}
