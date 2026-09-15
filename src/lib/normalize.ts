import { teamMeta } from "./teams";
import type {
  Confidence,
  ConfidenceBand,
  Driver,
  ElevateRow,
  FootageElevates,
  FootageRef,
  PlayerSim,
  Quantiles,
  Scoring,
  SimResult,
  Slate,
  SlateGame,
  TeamBox,
  TeamInfo,
  ToggleApplied,
  Usage,
  UsageAssumption,
  UsageBaseline,
  Venue,
  Weather,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asBoolean(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function firstNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const k of keys) {
    if (typeof obj[k] === "number" && Number.isFinite(obj[k])) return obj[k];
  }
  return fallback;
}

function firstString(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const k of keys) {
    if (typeof obj[k] === "string" && obj[k].length > 0) return obj[k];
  }
  return fallback;
}

function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

function requireRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  return raw;
}

function requireString(raw: Record<string, unknown>, keys: string[], label: string): string {
  const v = firstString(raw, keys);
  if (!v) throw new Error(`Missing ${label}`);
  return v;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function teamAbbr(v: unknown): string {
  if (typeof v === "string") return v;
  if (isRecord(v)) return firstString(v, ["abbr", "team", "id", "code"]);
  return "";
}

function teamName(v: unknown, abbr: string): string {
  if (isRecord(v) && typeof v.name === "string" && v.name) return v.name;
  return teamMeta(abbr).name;
}

function teamInfoFrom(v: unknown, fallbackAbbr = ""): TeamInfo {
  const abbr = teamAbbr(v) || fallbackAbbr;
  if (!abbr) throw new Error("Missing team abbreviation");
  return { abbr, name: teamName(v, abbr) };
}

function pickTeam(raw: Record<string, unknown>, side: "home" | "away"): TeamInfo {
  const nested = isRecord(raw.teams) ? raw.teams[side] : undefined;
  const alt = raw[`${side}_team`];
  const flat = raw[side];
  const v = nested ?? alt ?? (isRecord(flat) ? flat : undefined);
  if (v != null) return teamInfoFrom(v);
  if (typeof flat === "string") return teamInfoFrom(flat);
  throw new Error(`Missing ${side} team`);
}

function pickTeamAbbr(raw: Record<string, unknown>, side: "home" | "away"): string {
  const nested = isRecord(raw.teams) ? raw.teams[side] : undefined;
  const alt = raw[`${side}_team`];
  const flat = raw[side];
  const abbr = teamAbbr(nested) || teamAbbr(alt) || teamAbbr(flat);
  if (!abbr) throw new Error(`Missing ${side} team`);
  return abbr;
}

function meanKey(field: string): string[] {
  return [field, `${field}_mean`, `mean_${field}`];
}

function normalizeVenue(raw: unknown): Venue {
  const v = isRecord(raw) ? raw : {};
  const roof = firstString(v, ["roof"]).toLowerCase();
  const indoor =
    typeof v.indoor === "boolean"
      ? v.indoor
      : roof === "dome" || roof === "indoor" || roof === "retractable_closed";
  return {
    name: firstString(v, ["name", "stadium", "venue"], "TBD"),
    city: firstString(v, ["city"], ""),
    state: firstString(v, ["state", "region"], ""),
    indoor,
  };
}

function normalizeWeather(raw: unknown): Weather {
  const v = isRecord(raw) ? raw : {};
  const temp = firstNumber(v, ["temp_f", "temp", "temperature_f"], Number.NaN);
  const wind = firstNumber(v, ["wind_mph", "wind"], Number.NaN);
  const precip = firstNumber(v, ["precip_pct", "precip", "precip_prob", "rain_pct"], Number.NaN);
  return {
    temp_f: Number.isFinite(temp) ? temp : null,
    wind_mph: Number.isFinite(wind) ? wind : null,
    condition: firstString(v, ["condition", "summary", "desc"], "Unknown"),
    precip_pct: Number.isFinite(precip) ? precip : null,
  };
}

function normalizeQuantiles(raw: unknown): Quantiles | null {
  if (!isRecord(raw)) return null;
  const mean = firstNumber(raw, ["mean", "mu", "avg", "p50", "q50"]);
  const p50 = firstNumber(raw, ["p50", "q50", "median"], mean);
  return {
    mean,
    p10: firstNumber(raw, ["p10", "q10", "lo"]),
    p50,
    p90: firstNumber(raw, ["p90", "q90", "hi"]),
  };
}

function normalizeUsage(raw: unknown): Usage {
  const v = isRecord(raw) ? raw : {};
  return {
    snap_share: firstNumber(v, ["snap_share", "snaps"]),
    rush_share: firstNumber(v, ["rush_share"]),
    target_share: firstNumber(v, ["target_share"]),
    route_share: firstNumber(v, ["route_share"]),
  };
}

function normalizeTeamBox(raw: unknown): TeamBox {
  const v = isRecord(raw) ? raw : {};
  return {
    points: firstNumber(v, meanKey("points")),
    pass_yards: firstNumber(v, meanKey("pass_yards").concat(meanKey("pass_yds"))),
    rush_yards: firstNumber(v, meanKey("rush_yards").concat(meanKey("rush_yds"))),
    pass_attempts: firstNumber(v, meanKey("pass_attempts").concat(meanKey("pass_atts"))),
    rush_attempts: firstNumber(v, meanKey("rush_attempts").concat(meanKey("rush_atts"))),
    sacks_taken: firstNumber(v, meanKey("sacks_taken").concat(meanKey("sacks"))),
    turnovers: firstNumber(v, meanKey("turnovers")),
  };
}

export function confidenceBand(label: string): ConfidenceBand {
  const l = label.toLowerCase();
  if (/\bhigh\b/.test(l) && !/\blow\b/.test(l)) return "high";
  if (/\bmed(ium)?\b/.test(l)) return "medium";
  return "low";
}

function scoreForBand(band: ConfidenceBand, explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  if (band === "high") return 0.75;
  if (band === "medium") return 0.5;
  return 0.25;
}

function normalizeConfidence(raw: Record<string, unknown>): Confidence {
  const extraReasons = asStringList(raw.confidence_reasons).concat(
    asStringList(raw.confidence_notes),
  );
  const c = raw.confidence;
  if (typeof c === "string") {
    const label = c.trim() || "low";
    const band = confidenceBand(label);
    const reasons = extraReasons;
    return {
      label,
      band,
      score: scoreForBand(band),
      note: reasons[0] ?? `${label} week-1 confidence band`,
      reasons,
    };
  }
  const obj = isRecord(c) ? c : {};
  const label = firstString(obj, ["label", "band", "level"], "low");
  const band = confidenceBand(firstString(obj, ["band"], label));
  const nestedReasons = asStringList(obj.reasons).concat(asStringList(obj.notes));
  const reasons = extraReasons.length > 0 ? extraReasons : nestedReasons;
  const note = firstString(obj, ["note", "detail", "summary"], reasons[0] ?? "");
  return {
    label,
    band,
    score: scoreForBand(band, typeof obj.score === "number" ? obj.score : undefined),
    note,
    reasons,
  };
}

function normalizeDriver(raw: unknown, index: number): Driver {
  if (typeof raw === "string" && raw.trim()) {
    return { id: `driver_${index}`, title: raw.trim(), detail: "" };
  }
  const v = isRecord(raw) ? raw : {};
  return {
    id: firstString(v, ["id", "key"], `driver_${index}`),
    title: firstString(v, ["title", "name", "headline"], `Driver ${index + 1}`),
    detail: firstString(v, ["detail", "note", "text", "body"], ""),
  };
}

function normalizeFootageRef(raw: unknown): FootageRef | null {
  if (!isRecord(raw)) return null;
  const player_id = firstString(raw, ["player_id", "id"]);
  const player_name = firstString(raw, ["player_name", "name"]);
  if (!player_id && !player_name) return null;
  const kindRaw = firstString(raw, ["kind", "type", "direction"], "elevate").toLowerCase();
  const kind: FootageRef["kind"] = kindRaw.includes("down") ? "downgrade" : "elevate";
  const status = firstString(raw, ["status"]);
  return {
    player_id: player_id || player_name,
    player_name: player_name || player_id,
    team: firstString(raw, ["team"]),
    pos: firstString(raw, ["pos", "position"]),
    kind,
    source: firstString(raw, ["source"], "fixture"),
    label: firstString(raw, ["label", "headline", "note", "why"]),
    ...(status ? { status } : {}),
  };
}

function normalizePlayer(raw: unknown): PlayerSim | null {
  if (!isRecord(raw)) return null;
  const player_id = firstString(raw, ["player_id", "id"]);
  const name = firstString(raw, ["name", "player_name"]);
  if (!player_id && !name) return null;
  const propsRaw = firstDefined(raw, ["prop_quantiles", "props", "quantiles"]);
  const prop_quantiles: Record<string, Quantiles> = {};
  if (isRecord(propsRaw)) {
    for (const [key, value] of Object.entries(propsRaw)) {
      const q = normalizeQuantiles(value);
      if (q) prop_quantiles[key] = q;
    }
  }
  const fantasyRaw = isRecord(raw.fantasy) ? raw.fantasy : {};
  const scoring = (firstString(fantasyRaw, ["scoring"], "half_ppr") || "half_ppr") as Scoring;
  const assumption = firstString(raw, ["usage_assumption", "assumption_note"]);
  const baselineRaw = firstDefined(raw, ["usage_baseline", "baseline_usage"]);
  return {
    player_id: player_id || name,
    name: name || player_id,
    team: firstString(raw, ["team"]),
    pos: firstString(raw, ["pos", "position"]),
    usage: normalizeUsage(raw.usage),
    ...(isRecord(baselineRaw) ? { usage_baseline: normalizeUsage(baselineRaw) } : {}),
    ...(assumption ? { usage_assumption: assumption } : {}),
    prop_quantiles,
    fantasy: {
      mean: firstNumber(fantasyRaw, ["mean", "pts", "points"], firstNumber(raw, ["fantasy_mean"])),
      p10: firstNumber(fantasyRaw, ["p10"], firstNumber(raw, ["fantasy_p10"])),
      p90: firstNumber(fantasyRaw, ["p90"], firstNumber(raw, ["fantasy_p90"])),
      scoring,
    },
    anytime_td_prob: firstNumber(
      raw,
      ["anytime_td_prob", "atd_prob", "anytime_td"],
      isRecord(raw.usage) ? firstNumber(raw.usage, ["anytime_td_prob", "atd_prob"]) : 0,
    ),
  };
}

function normalizeToggle(raw: unknown): ToggleApplied | null {
  if (!isRecord(raw)) return null;
  const player_id = firstString(raw, ["player_id", "id"]);
  if (!player_id) return null;
  const out: ToggleApplied = { player_id };
  const injury = firstString(raw, ["injury"]);
  const usage = firstString(raw, ["usage"]);
  if (injury) out.injury = injury;
  if (usage) out.usage = usage;
  return out;
}

function boolMap(raw: unknown): Record<string, boolean> {
  if (!isRecord(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function normalizeCopyRules(raw: unknown): Record<string, boolean> {
  const out = boolMap(raw);
  if (!isRecord(raw)) return out;
  if (raw.no_lock === true) out.no_lock = true;
  if (raw.no_plus_ev === true) out.no_plus_ev = true;
  if (raw.no_scraped_odds === true) {
    out.no_scraped_odds = true;
    out.hide_scraped_odds = true;
  }
  return out;
}

export function normalizeUsageAssumption(raw: unknown, index: number): UsageAssumption | null {
  if (typeof raw === "string" && raw.trim()) {
    return { id: `usage_${index}`, title: raw.trim(), detail: "" };
  }
  if (!isRecord(raw)) return null;
  const title = firstString(raw, ["title", "name", "headline", "assumption", "label"]);
  const detail = firstString(raw, ["detail", "note", "text", "body", "assumption"]);
  const player_id = firstString(raw, ["player_id", "id"]);
  const player_name = firstString(raw, ["player_name", "name"]);
  if (!title && !detail && !player_id && !player_name) return null;
  return {
    id: firstString(raw, ["id", "key"], player_id || `usage_${index}`),
    ...(player_id ? { player_id } : {}),
    ...(player_name ? { player_name } : {}),
    ...(firstString(raw, ["team"]) ? { team: firstString(raw, ["team"]) } : {}),
    ...(firstString(raw, ["pos", "position"])
      ? { pos: firstString(raw, ["pos", "position"]) }
      : {}),
    title: title || player_name || player_id || `Usage ${index + 1}`,
    detail: detail === title ? "" : detail,
  };
}

export function normalizeUsageAssumptions(raw: unknown): UsageAssumption[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map(normalizeUsageAssumption).filter((x): x is UsageAssumption => x != null);
  }
  if (!isRecord(raw)) return [];
  return Object.entries(raw)
    .map(([key, value], index) => {
      if (typeof value === "string") {
        return normalizeUsageAssumption({ id: key, title: key, detail: value }, index);
      }
      if (isRecord(value)) {
        return normalizeUsageAssumption({ id: key, ...value }, index);
      }
      return null;
    })
    .filter((x): x is UsageAssumption => x != null);
}

export function normalizeUsageBaseline(raw: unknown, index: number, key = ""): UsageBaseline | null {
  if (!isRecord(raw)) return null;
  const player_id = firstString(raw, ["player_id", "id"], key);
  const player_name = firstString(raw, ["player_name", "name"]);
  const usageRaw = isRecord(raw.usage) ? raw.usage : raw;
  const usage = normalizeUsage(usageRaw);
  const note = firstString(raw, ["note", "detail", "text", "body"]);
  if (!player_id && !player_name && !note && Object.values(usage).every((n) => n === 0)) {
    return null;
  }
  return {
    id: firstString(raw, ["id", "key"], player_id || `baseline_${index}`),
    ...(player_id ? { player_id } : {}),
    ...(player_name ? { player_name } : {}),
    ...(firstString(raw, ["team"]) ? { team: firstString(raw, ["team"]) } : {}),
    ...(firstString(raw, ["pos", "position"])
      ? { pos: firstString(raw, ["pos", "position"]) }
      : {}),
    usage,
    note,
  };
}

export function normalizeUsageBaselines(raw: unknown): UsageBaseline[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((row, i) => normalizeUsageBaseline(row, i)).filter((x): x is UsageBaseline => x != null);
  }
  if (!isRecord(raw)) return [];
  return Object.entries(raw)
    .map(([key, value], index) => normalizeUsageBaseline(isRecord(value) ? value : {}, index, key))
    .filter((x): x is UsageBaseline => x != null);
}

function normalizeMarketLeans(raw: unknown, home: TeamInfo, away: TeamInfo) {
  const v = isRecord(raw) ? raw : {};
  const homeWin = firstNumber(v, ["home_win_prob", "win_prob_home", `${home.abbr}_win_prob`]);
  const awayWin = firstNumber(v, ["away_win_prob", "win_prob_away", `${away.abbr}_win_prob`], 1 - homeWin);
  return {
    home_win_prob: homeWin,
    away_win_prob: awayWin,
    proj_margin_home: firstNumber(v, ["proj_margin_home", "margin_home", "spread_home"]),
    proj_total: firstNumber(v, ["proj_total", "total"]),
    margin_p10: firstNumber(v, ["margin_p10"]),
    margin_p90: firstNumber(v, ["margin_p90"]),
    total_p10: firstNumber(v, ["total_p10"]),
    total_p90: firstNumber(v, ["total_p90"]),
    note: firstString(
      v,
      ["note", "detail"],
      "Model-only projection. No book line attached — type your own line to estimate P(over).",
    ),
  };
}

export function normalizeSlateGame(raw: unknown): SlateGame {
  const g = requireRecord(raw, "slate game");
  return {
    game_id: requireString(g, ["game_id", "id"], "game_id"),
    away: pickTeamAbbr(g, "away"),
    home: pickTeamAbbr(g, "home"),
    kickoff: requireString(g, ["kickoff", "start", "kickoff_et"], "kickoff"),
    status: firstString(g, ["status"], "scheduled"),
    venue: normalizeVenue(g.venue),
    weather: normalizeWeather(g.weather),
  };
}

export function normalizeSlate(raw: unknown): Slate {
  const s = requireRecord(raw, "slate");
  const gamesRaw = s.games;
  if (!Array.isArray(gamesRaw) || gamesRaw.length === 0) {
    throw new Error("slate.games must be a non-empty array");
  }
  return {
    schema_version: firstString(s, ["schema_version", "schema"], "1.0.0"),
    season: asNumber(s.season),
    week: asNumber(s.week),
    season_type: "REG",
    scoring_default: (firstString(s, ["scoring_default", "scoring"], "half_ppr") || "half_ppr") as Scoring,
    timezone: firstString(s, ["timezone", "tz"], "America/New_York"),
    games: gamesRaw.map(normalizeSlateGame),
  };
}

export function normalizeSimResult(raw: unknown): SimResult {
  const g = requireRecord(raw, "sim result");
  const away = pickTeam(g, "away");
  const home = pickTeam(g, "home");
  const boxRaw = isRecord(g.team_box) ? g.team_box : {};
  const playersRaw = Array.isArray(g.players) ? g.players : [];
  const driversRaw = Array.isArray(g.drivers) ? g.drivers : [];
  const refsRaw = Array.isArray(g.footage_refs) ? g.footage_refs : [];
  const togglesRaw = Array.isArray(g.toggles_applied) ? g.toggles_applied : [];
  const assumptionsRaw = firstDefined(g, ["usage_assumptions", "assumptions"]);
  const baselineRaw = firstDefined(g, ["usage_baseline", "usage_baselines"]);
  return {
    schema_version: firstString(g, ["schema_version", "schema"], "1.0.0"),
    game_id: requireString(g, ["game_id", "id"], "game_id"),
    season: asNumber(g.season),
    week: asNumber(g.week),
    season_type: "REG",
    scoring: (firstString(g, ["scoring"], "half_ppr") || "half_ppr") as Scoring,
    // Spo GAME_* packs omit kickoff/status/venue/weather; those live on slate.json.
    kickoff: firstString(g, ["kickoff", "start", "kickoff_et"]),
    status: firstString(g, ["status"], "scheduled"),
    venue: normalizeVenue(g.venue),
    weather: normalizeWeather(g.weather),
    teams: { away, home },
    market_leans: normalizeMarketLeans(g.market_leans, home, away),
    team_box: {
      away: normalizeTeamBox(boxRaw.away),
      home: normalizeTeamBox(boxRaw.home),
    },
    players: playersRaw.map(normalizePlayer).filter((p): p is PlayerSim => p != null),
    drivers: driversRaw.map(normalizeDriver),
    confidence: normalizeConfidence(g),
    copy_rules: normalizeCopyRules(g.copy_rules),
    user_line_hooks: boolMap(g.user_line_hooks),
    toggles_applied: togglesRaw.map(normalizeToggle).filter((t): t is ToggleApplied => t != null),
    footage_refs: refsRaw.map(normalizeFootageRef).filter((r): r is FootageRef => r != null),
    usage_assumptions: normalizeUsageAssumptions(assumptionsRaw),
    usage_baseline: normalizeUsageBaselines(baselineRaw),
  };
}

/** Fill kickoff/venue/weather/status from slate (or a previous sim) when Spo GAME_* omit them. */
export function mergeScheduleFrom(sim: SimResult, from: SimResult | {
  kickoff: string;
  status: string;
  venue: SimResult["venue"];
  weather: SimResult["weather"];
}): SimResult {
  const venueMissing = !sim.venue.name || sim.venue.name === "TBD";
  const weatherMissing = !sim.weather.condition || sim.weather.condition === "Unknown";
  return {
    ...sim,
    kickoff: sim.kickoff || from.kickoff,
    status: from.status || sim.status,
    venue: venueMissing ? from.venue : sim.venue,
    weather: weatherMissing ? from.weather : sim.weather,
  };
}

function normalizeElevateRow(raw: unknown): ElevateRow | null {
  if (!isRecord(raw)) return null;
  const player_id = firstString(raw, ["player_id", "id"]);
  const player_name = firstString(raw, ["player_name", "name"]);
  if (!player_id && !player_name) return null;
  const kindRaw = firstString(raw, ["kind", "type", "direction"], "elevate").toLowerCase();
  const kind: ElevateRow["kind"] = kindRaw.includes("down") ? "downgrade" : "elevate";
  const status = firstString(raw, ["status"]);
  const why = firstString(raw, ["why", "headline", "label", "title"]);
  return {
    game_id: firstString(raw, ["game_id"]),
    player_id: player_id || player_name,
    player_name: player_name || player_id,
    team: firstString(raw, ["team"]),
    pos: firstString(raw, ["pos", "position"]),
    kind,
    headline: why,
    note: firstString(raw, ["note", "detail", "body", "why"]),
    ...(status ? { status } : {}),
  };
}

export function normalizeElevates(raw: unknown): FootageElevates {
  const e = requireRecord(raw, "elevates");
  const rowsRaw = Array.isArray(e.rows)
    ? e.rows
    : Array.isArray(e.elevates)
      ? e.elevates
      : Array.isArray(e.items)
        ? e.items
        : [];
  return {
    schema_version: firstString(e, ["schema_version", "schema"], "1.0.0"),
    season: asNumber(e.season),
    week: asNumber(e.week),
    source: firstString(e, ["source"], "fixture"),
    rows: rowsRaw.map(normalizeElevateRow).filter((r): r is ElevateRow => r != null),
  };
}
