/**
 * Generates schema 1.0.0 fixtures for 2026 REG week 1.
 * Run: node scripts/generate-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures");
const gamesDir = path.join(fixturesDir, "games");

const SCHEMA_VERSION = "1.0.0";
const COPY_RULES = {
  model_only_outputs: true,
  user_typed_lines_only: true,
  current_week_only: true,
  hide_book_lines: true,
  hide_scraped_odds: true,
};
const USER_LINE_HOOKS = {
  spread: true,
  total: true,
  player_pass_yds: true,
  player_rush_yds: true,
  player_rec_yds: true,
  player_receptions: true,
  anytime_td: true,
};

const SPECIAL_IDS = {
  "Tony Pollard": "00-0034796",
  "Breece Hall": "00-0038120",
  "Romeo Doubs": "00-0035689",
};

const TEAM_NAMES = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LAC: "Los Angeles Chargers",
  LA: "Los Angeles Rams",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

const VENUES = {
  SEA: { name: "Lumen Field", city: "Seattle", state: "WA", indoor: false },
  LA: { name: "SoFi Stadium", city: "Inglewood", state: "CA", indoor: true },
  CAR: { name: "Bank of America Stadium", city: "Charlotte", state: "NC", indoor: false },
  CIN: { name: "Paycor Stadium", city: "Cincinnati", state: "OH", indoor: false },
  DET: { name: "Ford Field", city: "Detroit", state: "MI", indoor: true },
  HOU: { name: "NRG Stadium", city: "Houston", state: "TX", indoor: true },
  IND: { name: "Lucas Oil Stadium", city: "Indianapolis", state: "IN", indoor: true },
  JAX: { name: "EverBank Stadium", city: "Jacksonville", state: "FL", indoor: false },
  PIT: { name: "Acrisure Stadium", city: "Pittsburgh", state: "PA", indoor: false },
  TEN: { name: "Nissan Stadium", city: "Nashville", state: "TN", indoor: false },
  LAC: { name: "SoFi Stadium", city: "Inglewood", state: "CA", indoor: true },
  LV: { name: "Allegiant Stadium", city: "Las Vegas", state: "NV", indoor: true },
  MIN: { name: "U.S. Bank Stadium", city: "Minneapolis", state: "MN", indoor: true },
  PHI: { name: "Lincoln Financial Field", city: "Philadelphia", state: "PA", indoor: false },
  NYG: { name: "MetLife Stadium", city: "East Rutherford", state: "NJ", indoor: false },
  KC: { name: "GEHA Field at Arrowhead Stadium", city: "Kansas City", state: "MO", indoor: false },
};

function r1(n) {
  return Math.round(n * 10) / 10;
}
function r2(n) {
  return Math.round(n * 100) / 100;
}
function r3(n) {
  return Math.round(n * 1000) / 1000;
}

function playerId(name) {
  if (SPECIAL_IDS[name]) return SPECIAL_IDS[name];
  let h = 2166136261;
  for (const c of name) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) % 9000000;
  return `00-${String(1000000 + n).slice(1)}`;
}

function quantiles(mean, cv = 0.28, floorZero = true) {
  const sd = Math.max(0.35, Math.abs(mean) * cv);
  const p10 = mean - 1.2816 * sd;
  const p90 = mean + 1.2816 * sd;
  return {
    mean: r1(mean),
    p10: r1(floorZero ? Math.max(0, p10) : p10),
    p50: r1(mean),
    p90: r1(p90),
  };
}

function halfPpr(stats) {
  let pts = 0;
  pts += (stats.pass_yds || 0) / 25;
  pts += (stats.pass_td || 0) * 4;
  pts += (stats.int || 0) * -2;
  pts += (stats.rush_yds || 0) / 10;
  pts += (stats.rec_yds || 0) / 10;
  pts += (stats.rec || 0) * 0.5;
  pts += ((stats.rush_td || 0) + (stats.rec_td || 0)) * 6;
  return r1(pts);
}

function propsFor(pos, stats) {
  if (pos === "QB") {
    return {
      pass_yds: quantiles(stats.pass_yds, 0.22),
      pass_tds: quantiles(stats.pass_td, 0.45),
      pass_atts: quantiles(stats.pass_att, 0.12),
      completions: quantiles(stats.cmp, 0.14),
      interceptions: quantiles(stats.int, 0.55),
      rush_yds: quantiles(stats.rush_yds || 0, 0.4),
    };
  }
  if (pos === "RB") {
    return {
      rush_yds: quantiles(stats.rush_yds, 0.32),
      rush_atts: quantiles(stats.rush_att, 0.18),
      rec_yds: quantiles(stats.rec_yds || 0, 0.4),
      receptions: quantiles(stats.rec || 0, 0.35),
      rush_tds: quantiles(stats.rush_td || 0, 0.55),
    };
  }
  return {
    rec_yds: quantiles(stats.rec_yds, 0.32),
    receptions: quantiles(stats.rec, 0.28),
    targets: quantiles(stats.targets, 0.22),
    rec_tds: quantiles(stats.rec_td || 0, 0.6),
  };
}

function usageFor(pos, stats) {
  if (pos === "QB") {
    return {
      snap_share: stats.snap,
      rush_share: r2((stats.rush_att || 0) / 26),
      target_share: 0,
      route_share: 0,
    };
  }
  if (pos === "RB") {
    return {
      snap_share: stats.snap,
      rush_share: r2((stats.rush_att || 0) / 26),
      target_share: r2((stats.targets || 0) / 34),
      route_share: r2((stats.targets || 0) / 34 + 0.04),
    };
  }
  return {
    snap_share: stats.snap,
    rush_share: r2((stats.rush_att || 0) / 26),
    target_share: r2((stats.targets || 0) / 34),
    route_share: r2(stats.snap * 0.92),
  };
}

function anytimeTd(pos, stats) {
  const tds = (stats.rush_td || 0) + (stats.rec_td || 0) + (pos === "QB" ? (stats.rush_td || 0) : 0);
  if (pos === "QB") return r3(Math.min(0.55, 0.06 + (stats.rush_td || 0) * 0.28 + (stats.rush_yds || 0) / 800));
  return r3(Math.min(0.82, 1 - Math.exp(-tds * 0.85 - 0.08)));
}

function makePlayer(team, spec) {
  const [name, pos, stats] = spec;
  const mean = halfPpr(stats);
  return {
    player_id: playerId(name),
    name,
    team,
    pos,
    usage: usageFor(pos, stats),
    prop_quantiles: propsFor(pos, stats),
    fantasy: {
      mean,
      p10: r1(mean * 0.52),
      p90: r1(mean * 1.48),
      scoring: "half_ppr",
    },
    anytime_td_prob: anytimeTd(pos, stats),
  };
}

function teamBox(players, impliedPoints) {
  const skill = players.filter((p) => p.pos !== "QB");
  const qb = players.find((p) => p.pos === "QB");
  const rushYds = skill
    .filter((p) => p.prop_quantiles.rush_yds)
    .reduce((s, p) => s + p.prop_quantiles.rush_yds.mean, 0) + (qb?.prop_quantiles.rush_yds?.mean || 0);
  const recYds = skill
    .filter((p) => p.prop_quantiles.rec_yds)
    .reduce((s, p) => s + p.prop_quantiles.rec_yds.mean, 0);
  return {
    points: r1(impliedPoints),
    pass_yards: r1(qb?.prop_quantiles.pass_yds.mean || recYds),
    rush_yards: r1(rushYds),
    pass_attempts: r1(qb?.prop_quantiles.pass_atts.mean || 32),
    rush_attempts: r1(
      skill.filter((p) => p.prop_quantiles.rush_atts).reduce((s, p) => s + p.prop_quantiles.rush_atts.mean, 0) +
        (qb?.pos === "QB" ? 4 : 0),
    ),
    sacks_taken: r1(1.6 + ((impliedPoints * 13) % 12) / 10),
    turnovers: r1(qb?.prop_quantiles.interceptions.mean || 0.7),
  };
}

/** Compact player specs: [name, pos, stats] */
const ROSTERS = {
  NE: [
    ["Drake Maye", "QB", { snap: 0.99, pass_yds: 248, pass_td: 1.6, pass_att: 33, cmp: 21.4, int: 0.7, rush_yds: 28, rush_td: 0.25, rush_att: 5 }],
    ["Rhamondre Stevenson", "RB", { snap: 0.62, rush_yds: 68, rush_att: 14, rush_td: 0.45, rec: 3.1, rec_yds: 22, rec_td: 0.08, targets: 4.0 }],
    ["TreVeyon Henderson", "RB", { snap: 0.38, rush_yds: 42, rush_att: 9, rush_td: 0.28, rec: 2.4, rec_yds: 18, rec_td: 0.06, targets: 3.1 }],
    ["Stefon Diggs", "WR", { snap: 0.78, rec: 5.8, rec_yds: 68, rec_td: 0.42, targets: 8.4 }],
    ["Kayshon Boutte", "WR", { snap: 0.71, rec: 3.6, rec_yds: 48, rec_td: 0.28, targets: 5.6 }],
    ["DeMario Douglas", "WR", { snap: 0.55, rec: 3.2, rec_yds: 32, rec_td: 0.12, targets: 4.5 }],
    ["Hunter Henry", "TE", { snap: 0.74, rec: 3.8, rec_yds: 41, rec_td: 0.32, targets: 5.2 }],
  ],
  SEA: [
    ["Sam Darnold", "QB", { snap: 1.0, pass_yds: 236, pass_td: 1.5, pass_att: 31, cmp: 20.1, int: 0.6, rush_yds: 12, rush_td: 0.12, rush_att: 3 }],
    ["Kenneth Walker III", "RB", { snap: 0.58, rush_yds: 78, rush_att: 16, rush_td: 0.55, rec: 2.2, rec_yds: 16, rec_td: 0.06, targets: 2.9 }],
    ["Zach Charbonnet", "RB", { snap: 0.42, rush_yds: 38, rush_att: 9, rush_td: 0.32, rec: 2.0, rec_yds: 14, rec_td: 0.05, targets: 2.6 }],
    ["Jaxon Smith-Njigba", "WR", { snap: 0.88, rec: 6.6, rec_yds: 82, rec_td: 0.48, targets: 9.2 }],
    ["Cooper Kupp", "WR", { snap: 0.72, rec: 4.4, rec_yds: 51, rec_td: 0.28, targets: 6.4 }],
    ["Tory Horton", "WR", { snap: 0.48, rec: 2.4, rec_yds: 31, rec_td: 0.14, targets: 3.8 }],
    ["AJ Barner", "TE", { snap: 0.7, rec: 3.1, rec_yds: 32, rec_td: 0.22, targets: 4.2 }],
  ],
  SF: [
    ["Brock Purdy", "QB", { snap: 1.0, pass_yds: 262, pass_td: 1.8, pass_att: 32, cmp: 21.8, int: 0.55, rush_yds: 14, rush_td: 0.14, rush_att: 3 }],
    ["Christian McCaffrey", "RB", { snap: 0.78, rush_yds: 72, rush_att: 15, rush_td: 0.52, rec: 5.2, rec_yds: 42, rec_td: 0.22, targets: 6.4 }],
    ["Isaac Guerendo", "RB", { snap: 0.22, rush_yds: 22, rush_att: 5, rush_td: 0.12, rec: 0.8, rec_yds: 6, rec_td: 0.02, targets: 1.1 }],
    ["Ricky Pearsall", "WR", { snap: 0.82, rec: 5.1, rec_yds: 68, rec_td: 0.38, targets: 7.6 }],
    ["Jauan Jennings", "WR", { snap: 0.76, rec: 4.2, rec_yds: 52, rec_td: 0.32, targets: 6.2 }],
    ["Brandon Aiyuk", "WR", { snap: 0.64, rec: 3.4, rec_yds: 48, rec_td: 0.24, targets: 5.4 }],
    ["George Kittle", "TE", { snap: 0.84, rec: 4.6, rec_yds: 58, rec_td: 0.42, targets: 6.1 }],
  ],
  LA: [
    ["Matthew Stafford", "QB", { snap: 1.0, pass_yds: 268, pass_td: 1.9, pass_att: 34, cmp: 22.4, int: 0.5, rush_yds: 4, rush_td: 0.04, rush_att: 1 }],
    ["Kyren Williams", "RB", { snap: 0.72, rush_yds: 82, rush_att: 18, rush_td: 0.62, rec: 2.4, rec_yds: 18, rec_td: 0.08, targets: 3.1 }],
    ["Blake Corum", "RB", { snap: 0.28, rush_yds: 24, rush_att: 6, rush_td: 0.18, rec: 0.6, rec_yds: 4, rec_td: 0.02, targets: 0.8 }],
    ["Puka Nacua", "WR", { snap: 0.9, rec: 7.2, rec_yds: 92, rec_td: 0.52, targets: 10.4 }],
    ["Davante Adams", "WR", { snap: 0.82, rec: 5.4, rec_yds: 71, rec_td: 0.55, targets: 8.6 }],
    ["Tutu Atwell", "WR", { snap: 0.42, rec: 1.8, rec_yds: 28, rec_td: 0.12, targets: 2.8 }],
    ["Colby Parkinson", "TE", { snap: 0.68, rec: 2.6, rec_yds: 28, rec_td: 0.18, targets: 3.6 }],
  ],
  CHI: [
    ["Caleb Williams", "QB", { snap: 1.0, pass_yds: 244, pass_td: 1.55, pass_att: 33, cmp: 20.6, int: 0.72, rush_yds: 32, rush_td: 0.22, rush_att: 6 }],
    ["D'Andre Swift", "RB", { snap: 0.55, rush_yds: 58, rush_att: 13, rush_td: 0.38, rec: 2.8, rec_yds: 22, rec_td: 0.08, targets: 3.6 }],
    ["Kyle Monangai", "RB", { snap: 0.4, rush_yds: 44, rush_att: 10, rush_td: 0.28, rec: 1.6, rec_yds: 12, rec_td: 0.04, targets: 2.1 }],
    ["DJ Moore", "WR", { snap: 0.84, rec: 5.2, rec_yds: 64, rec_td: 0.36, targets: 8.0 }],
    ["Rome Odunze", "WR", { snap: 0.8, rec: 4.8, rec_yds: 66, rec_td: 0.4, targets: 7.4 }],
    ["Luther Burden III", "WR", { snap: 0.52, rec: 3.1, rec_yds: 38, rec_td: 0.16, targets: 4.6 }],
    ["Colston Loveland", "TE", { snap: 0.7, rec: 3.4, rec_yds: 38, rec_td: 0.26, targets: 4.8 }],
  ],
  CAR: [
    ["Bryce Young", "QB", { snap: 1.0, pass_yds: 228, pass_td: 1.35, pass_att: 32, cmp: 20.2, int: 0.68, rush_yds: 22, rush_td: 0.16, rush_att: 4 }],
    ["Chuba Hubbard", "RB", { snap: 0.58, rush_yds: 64, rush_att: 14, rush_td: 0.42, rec: 2.6, rec_yds: 18, rec_td: 0.06, targets: 3.3 }],
    ["Rico Dowdle", "RB", { snap: 0.38, rush_yds: 36, rush_att: 8, rush_td: 0.22, rec: 1.8, rec_yds: 12, rec_td: 0.04, targets: 2.4 }],
    ["Tetairoa McMillan", "WR", { snap: 0.82, rec: 5.4, rec_yds: 72, rec_td: 0.38, targets: 8.2 }],
    ["Xavier Legette", "WR", { snap: 0.7, rec: 3.6, rec_yds: 44, rec_td: 0.22, targets: 5.6 }],
    ["Jalen Coker", "WR", { snap: 0.48, rec: 2.4, rec_yds: 31, rec_td: 0.12, targets: 3.6 }],
    ["Ja'Tavion Sanders", "TE", { snap: 0.66, rec: 2.8, rec_yds: 28, rec_td: 0.18, targets: 3.8 }],
  ],
  TB: [
    ["Baker Mayfield", "QB", { snap: 1.0, pass_yds: 252, pass_td: 1.7, pass_att: 33, cmp: 21.5, int: 0.62, rush_yds: 18, rush_td: 0.14, rush_att: 3 }],
    ["Bucky Irving", "RB", { snap: 0.62, rush_yds: 74, rush_att: 15, rush_td: 0.48, rec: 3.2, rec_yds: 24, rec_td: 0.1, targets: 4.0 }],
    ["Rachaad White", "RB", { snap: 0.38, rush_yds: 28, rush_att: 7, rush_td: 0.18, rec: 2.6, rec_yds: 20, rec_td: 0.08, targets: 3.2 }],
    ["Mike Evans", "WR", { snap: 0.8, rec: 5.2, rec_yds: 74, rec_td: 0.52, targets: 8.2 }],
    ["Chris Godwin", "WR", { snap: 0.74, rec: 4.8, rec_yds: 54, rec_td: 0.28, targets: 6.8 }],
    ["Emeka Egbuka", "WR", { snap: 0.58, rec: 3.4, rec_yds: 44, rec_td: 0.22, targets: 5.2 }],
    ["Cade Otton", "TE", { snap: 0.78, rec: 3.6, rec_yds: 36, rec_td: 0.24, targets: 5.0 }],
  ],
  CIN: [
    ["Joe Burrow", "QB", { snap: 1.0, pass_yds: 278, pass_td: 2.05, pass_att: 35, cmp: 23.6, int: 0.48, rush_yds: 10, rush_td: 0.1, rush_att: 2 }],
    ["Chase Brown", "RB", { snap: 0.7, rush_yds: 66, rush_att: 14, rush_td: 0.45, rec: 3.8, rec_yds: 28, rec_td: 0.12, targets: 4.8 }],
    ["Samaje Perine", "RB", { snap: 0.26, rush_yds: 16, rush_att: 4, rush_td: 0.1, rec: 1.2, rec_yds: 9, rec_td: 0.04, targets: 1.6 }],
    ["Ja'Marr Chase", "WR", { snap: 0.9, rec: 7.4, rec_yds: 96, rec_td: 0.62, targets: 10.8 }],
    ["Tee Higgins", "WR", { snap: 0.82, rec: 5.1, rec_yds: 72, rec_td: 0.48, targets: 7.8 }],
    ["Andrei Iosivas", "WR", { snap: 0.55, rec: 2.2, rec_yds: 32, rec_td: 0.16, targets: 3.6 }],
    ["Mike Gesicki", "TE", { snap: 0.62, rec: 3.2, rec_yds: 34, rec_td: 0.22, targets: 4.4 }],
  ],
  NO: [
    ["Spencer Rattler", "QB", { snap: 0.95, pass_yds: 218, pass_td: 1.2, pass_att: 32, cmp: 19.8, int: 0.78, rush_yds: 16, rush_td: 0.1, rush_att: 3 }],
    ["Alvin Kamara", "RB", { snap: 0.68, rush_yds: 54, rush_att: 13, rush_td: 0.35, rec: 4.4, rec_yds: 34, rec_td: 0.14, targets: 5.6 }],
    ["Kendre Miller", "RB", { snap: 0.3, rush_yds: 28, rush_att: 7, rush_td: 0.18, rec: 0.8, rec_yds: 6, rec_td: 0.02, targets: 1.1 }],
    ["Chris Olave", "WR", { snap: 0.84, rec: 5.6, rec_yds: 74, rec_td: 0.36, targets: 8.6 }],
    ["Rashid Shaheed", "WR", { snap: 0.66, rec: 3.4, rec_yds: 52, rec_td: 0.22, targets: 5.2 }],
    ["Brandin Cooks", "WR", { snap: 0.52, rec: 2.4, rec_yds: 31, rec_td: 0.12, targets: 3.6 }],
    ["Juwan Johnson", "TE", { snap: 0.7, rec: 3.6, rec_yds: 38, rec_td: 0.28, targets: 4.8 }],
  ],
  DET: [
    ["Jared Goff", "QB", { snap: 1.0, pass_yds: 264, pass_td: 1.85, pass_att: 33, cmp: 23.1, int: 0.42, rush_yds: 3, rush_td: 0.04, rush_att: 1 }],
    ["Jahmyr Gibbs", "RB", { snap: 0.62, rush_yds: 78, rush_att: 15, rush_td: 0.58, rec: 3.6, rec_yds: 28, rec_td: 0.14, targets: 4.4 }],
    ["David Montgomery", "RB", { snap: 0.42, rush_yds: 48, rush_att: 11, rush_td: 0.48, rec: 1.4, rec_yds: 10, rec_td: 0.04, targets: 1.8 }],
    ["Amon-Ra St. Brown", "WR", { snap: 0.88, rec: 7.6, rec_yds: 86, rec_td: 0.55, targets: 10.2 }],
    ["Jameson Williams", "WR", { snap: 0.74, rec: 3.8, rec_yds: 62, rec_td: 0.38, targets: 6.2 }],
    ["Isaac TeSlaa", "WR", { snap: 0.44, rec: 2.0, rec_yds: 28, rec_td: 0.12, targets: 3.1 }],
    ["Sam LaPorta", "TE", { snap: 0.82, rec: 4.8, rec_yds: 52, rec_td: 0.42, targets: 6.4 }],
  ],
  BUF: [
    ["Josh Allen", "QB", { snap: 1.0, pass_yds: 246, pass_td: 1.7, pass_att: 31, cmp: 20.8, int: 0.5, rush_yds: 42, rush_td: 0.55, rush_att: 7 }],
    ["James Cook", "RB", { snap: 0.68, rush_yds: 86, rush_att: 17, rush_td: 0.62, rec: 2.8, rec_yds: 22, rec_td: 0.08, targets: 3.5 }],
    ["Ty Johnson", "RB", { snap: 0.28, rush_yds: 18, rush_att: 4, rush_td: 0.1, rec: 1.4, rec_yds: 11, rec_td: 0.04, targets: 1.8 }],
    ["Khalil Shakir", "WR", { snap: 0.78, rec: 5.4, rec_yds: 62, rec_td: 0.32, targets: 7.2 }],
    ["Keon Coleman", "WR", { snap: 0.72, rec: 3.8, rec_yds: 54, rec_td: 0.34, targets: 6.0 }],
    ["Joshua Palmer", "WR", { snap: 0.55, rec: 2.6, rec_yds: 34, rec_td: 0.16, targets: 4.0 }],
    ["Dalton Kincaid", "TE", { snap: 0.7, rec: 4.2, rec_yds: 46, rec_td: 0.28, targets: 5.6 }],
  ],
  HOU: [
    ["C.J. Stroud", "QB", { snap: 1.0, pass_yds: 258, pass_td: 1.65, pass_att: 34, cmp: 21.8, int: 0.58, rush_yds: 16, rush_td: 0.12, rush_att: 3 }],
    ["Joe Mixon", "RB", { snap: 0.64, rush_yds: 70, rush_att: 15, rush_td: 0.5, rec: 2.6, rec_yds: 18, rec_td: 0.08, targets: 3.4 }],
    ["Dameon Pierce", "RB", { snap: 0.3, rush_yds: 24, rush_att: 6, rush_td: 0.14, rec: 0.8, rec_yds: 5, rec_td: 0.02, targets: 1.0 }],
    ["Nico Collins", "WR", { snap: 0.86, rec: 6.2, rec_yds: 88, rec_td: 0.48, targets: 9.4 }],
    ["Tank Dell", "WR", { snap: 0.7, rec: 4.0, rec_yds: 56, rec_td: 0.32, targets: 6.4 }],
    ["Christian Kirk", "WR", { snap: 0.62, rec: 3.4, rec_yds: 38, rec_td: 0.18, targets: 5.0 }],
    ["Dalton Schultz", "TE", { snap: 0.74, rec: 3.8, rec_yds: 38, rec_td: 0.24, targets: 5.1 }],
  ],
  BAL: [
    ["Lamar Jackson", "QB", { snap: 0.98, pass_yds: 228, pass_td: 1.55, pass_att: 28, cmp: 18.6, int: 0.45, rush_yds: 58, rush_td: 0.48, rush_att: 8 }],
    ["Derrick Henry", "RB", { snap: 0.62, rush_yds: 92, rush_att: 18, rush_td: 0.72, rec: 1.4, rec_yds: 12, rec_td: 0.04, targets: 1.8 }],
    ["Justice Hill", "RB", { snap: 0.32, rush_yds: 18, rush_att: 4, rush_td: 0.08, rec: 2.2, rec_yds: 18, rec_td: 0.06, targets: 2.8 }],
    ["Zay Flowers", "WR", { snap: 0.84, rec: 5.8, rec_yds: 72, rec_td: 0.38, targets: 8.2 }],
    ["Rashod Bateman", "WR", { snap: 0.7, rec: 3.2, rec_yds: 48, rec_td: 0.28, targets: 5.2 }],
    ["Devontez Walker", "WR", { snap: 0.4, rec: 1.6, rec_yds: 24, rec_td: 0.12, targets: 2.6 }],
    ["Mark Andrews", "TE", { snap: 0.72, rec: 4.0, rec_yds: 46, rec_td: 0.42, targets: 5.6 }],
  ],
  IND: [
    ["Daniel Jones", "QB", { snap: 1.0, pass_yds: 238, pass_td: 1.45, pass_att: 32, cmp: 21.2, int: 0.62, rush_yds: 18, rush_td: 0.16, rush_att: 4 }],
    ["Jonathan Taylor", "RB", { snap: 0.74, rush_yds: 88, rush_att: 18, rush_td: 0.68, rec: 2.4, rec_yds: 18, rec_td: 0.08, targets: 3.1 }],
    ["Trey Sermon", "RB", { snap: 0.22, rush_yds: 14, rush_att: 4, rush_td: 0.1, rec: 0.6, rec_yds: 4, rec_td: 0.02, targets: 0.8 }],
    ["Marvin Harrison Jr.", "WR", { snap: 0.86, rec: 5.6, rec_yds: 78, rec_td: 0.48, targets: 8.8 }],
    ["Michael Pittman Jr.", "WR", { snap: 0.8, rec: 4.8, rec_yds: 54, rec_td: 0.28, targets: 7.0 }],
    ["Josh Downs", "WR", { snap: 0.58, rec: 3.6, rec_yds: 38, rec_td: 0.16, targets: 5.0 }],
    ["Tyler Warren", "TE", { snap: 0.72, rec: 4.2, rec_yds: 46, rec_td: 0.32, targets: 5.6 }],
  ],
  CLE: [
    ["Joe Flacco", "QB", { snap: 0.9, pass_yds: 222, pass_td: 1.25, pass_att: 34, cmp: 21.0, int: 0.82, rush_yds: 4, rush_td: 0.04, rush_att: 1 }],
    ["Quinshon Judkins", "RB", { snap: 0.55, rush_yds: 62, rush_att: 14, rush_td: 0.4, rec: 1.8, rec_yds: 12, rec_td: 0.04, targets: 2.4 }],
    ["Jerome Ford", "RB", { snap: 0.4, rush_yds: 32, rush_att: 8, rush_td: 0.18, rec: 2.4, rec_yds: 18, rec_td: 0.06, targets: 3.1 }],
    ["Jerry Jeudy", "WR", { snap: 0.82, rec: 5.2, rec_yds: 68, rec_td: 0.32, targets: 8.0 }],
    ["Cedric Tillman", "WR", { snap: 0.7, rec: 3.6, rec_yds: 46, rec_td: 0.22, targets: 5.6 }],
    ["Jamari Thrash", "WR", { snap: 0.45, rec: 2.0, rec_yds: 24, rec_td: 0.1, targets: 3.2 }],
    ["David Njoku", "TE", { snap: 0.78, rec: 4.6, rec_yds: 48, rec_td: 0.34, targets: 6.4 }],
  ],
  JAX: [
    ["Trevor Lawrence", "QB", { snap: 1.0, pass_yds: 242, pass_td: 1.55, pass_att: 33, cmp: 21.4, int: 0.6, rush_yds: 24, rush_td: 0.18, rush_att: 5 }],
    ["Travis Etienne Jr.", "RB", { snap: 0.58, rush_yds: 66, rush_att: 14, rush_td: 0.42, rec: 3.0, rec_yds: 22, rec_td: 0.08, targets: 3.8 }],
    ["Tank Bigsby", "RB", { snap: 0.38, rush_yds: 42, rush_att: 10, rush_td: 0.32, rec: 0.8, rec_yds: 5, rec_td: 0.02, targets: 1.0 }],
    ["Brian Thomas Jr.", "WR", { snap: 0.86, rec: 5.8, rec_yds: 82, rec_td: 0.48, targets: 8.8 }],
    ["Travis Hunter", "WR", { snap: 0.74, rec: 4.4, rec_yds: 54, rec_td: 0.32, targets: 6.8 }],
    ["Parker Washington", "WR", { snap: 0.48, rec: 2.2, rec_yds: 28, rec_td: 0.12, targets: 3.4 }],
    ["Brenton Strange", "TE", { snap: 0.7, rec: 3.4, rec_yds: 36, rec_td: 0.22, targets: 4.6 }],
  ],
  ATL: [
    ["Michael Penix Jr.", "QB", { snap: 1.0, pass_yds: 248, pass_td: 1.5, pass_att: 33, cmp: 20.8, int: 0.65, rush_yds: 12, rush_td: 0.1, rush_att: 3 }],
    ["Bijan Robinson", "RB", { snap: 0.78, rush_yds: 84, rush_att: 16, rush_td: 0.58, rec: 4.2, rec_yds: 34, rec_td: 0.16, targets: 5.2 }],
    ["Tyler Allgeier", "RB", { snap: 0.28, rush_yds: 28, rush_att: 7, rush_td: 0.28, rec: 0.6, rec_yds: 4, rec_td: 0.02, targets: 0.8 }],
    ["Drake London", "WR", { snap: 0.88, rec: 6.4, rec_yds: 82, rec_td: 0.48, targets: 9.4 }],
    ["Darnell Mooney", "WR", { snap: 0.76, rec: 3.8, rec_yds: 52, rec_td: 0.26, targets: 6.0 }],
    ["Ray-Ray McCloud", "WR", { snap: 0.5, rec: 2.4, rec_yds: 26, rec_td: 0.1, targets: 3.4 }],
    ["Kyle Pitts", "TE", { snap: 0.72, rec: 3.6, rec_yds: 44, rec_td: 0.24, targets: 5.2 }],
  ],
  PIT: [
    ["Aaron Rodgers", "QB", { snap: 0.98, pass_yds: 232, pass_td: 1.45, pass_att: 32, cmp: 21.2, int: 0.58, rush_yds: 6, rush_td: 0.06, rush_att: 2 }],
    ["Jaylen Warren", "RB", { snap: 0.58, rush_yds: 62, rush_att: 13, rush_td: 0.38, rec: 3.4, rec_yds: 26, rec_td: 0.1, targets: 4.2 }],
    ["Kenneth Gainwell", "RB", { snap: 0.36, rush_yds: 28, rush_att: 7, rush_td: 0.18, rec: 2.0, rec_yds: 16, rec_td: 0.06, targets: 2.6 }],
    ["DK Metcalf", "WR", { snap: 0.84, rec: 5.2, rec_yds: 74, rec_td: 0.45, targets: 8.2 }],
    ["Calvin Austin III", "WR", { snap: 0.62, rec: 2.8, rec_yds: 38, rec_td: 0.18, targets: 4.4 }],
    ["Roman Wilson", "WR", { snap: 0.5, rec: 2.2, rec_yds: 28, rec_td: 0.12, targets: 3.4 }],
    ["Pat Freiermuth", "TE", { snap: 0.74, rec: 4.0, rec_yds: 42, rec_td: 0.28, targets: 5.4 }],
  ],
  NYJ: [
    ["Justin Fields", "QB", { snap: 0.96, pass_yds: 198, pass_td: 1.15, pass_att: 28, cmp: 17.2, int: 0.7, rush_yds: 48, rush_td: 0.42, rush_att: 8 }],
    ["Breece Hall", "RB", { snap: 0.72, rush_yds: 82, rush_att: 16, rush_td: 0.55, rec: 3.8, rec_yds: 28, rec_td: 0.12, targets: 4.8 }],
    ["Braelon Allen", "RB", { snap: 0.32, rush_yds: 28, rush_att: 7, rush_td: 0.22, rec: 0.8, rec_yds: 6, rec_td: 0.02, targets: 1.1 }],
    ["Garrett Wilson", "WR", { snap: 0.86, rec: 6.0, rec_yds: 74, rec_td: 0.38, targets: 9.2 }],
    ["Josh Reynolds", "WR", { snap: 0.64, rec: 2.8, rec_yds: 38, rec_td: 0.18, targets: 4.4 }],
    ["Allen Lazard", "WR", { snap: 0.55, rec: 2.2, rec_yds: 28, rec_td: 0.16, targets: 3.6 }],
    ["Tyler Conklin", "TE", { snap: 0.68, rec: 3.0, rec_yds: 28, rec_td: 0.16, targets: 4.2 }],
  ],
  TEN: [
    ["Cam Ward", "QB", { snap: 1.0, pass_yds: 224, pass_td: 1.3, pass_att: 33, cmp: 20.4, int: 0.75, rush_yds: 18, rush_td: 0.14, rush_att: 4 }],
    ["Tony Pollard", "RB", { snap: 0.64, rush_yds: 72, rush_att: 15, rush_td: 0.48, rec: 2.8, rec_yds: 20, rec_td: 0.08, targets: 3.6 }],
    ["Tyjae Spears", "RB", { snap: 0.4, rush_yds: 32, rush_att: 7, rush_td: 0.18, rec: 3.2, rec_yds: 24, rec_td: 0.08, targets: 4.0 }],
    ["Calvin Ridley", "WR", { snap: 0.82, rec: 4.8, rec_yds: 68, rec_td: 0.36, targets: 7.8 }],
    ["Elic Ayomanor", "WR", { snap: 0.7, rec: 3.6, rec_yds: 48, rec_td: 0.22, targets: 5.6 }],
    ["Tyler Lockett", "WR", { snap: 0.52, rec: 2.6, rec_yds: 28, rec_td: 0.12, targets: 3.8 }],
    ["Chig Okonkwo", "TE", { snap: 0.66, rec: 3.4, rec_yds: 36, rec_td: 0.2, targets: 4.6 }],
  ],
  ARI: [
    ["Kyler Murray", "QB", { snap: 1.0, pass_yds: 238, pass_td: 1.5, pass_att: 32, cmp: 21.0, int: 0.58, rush_yds: 38, rush_td: 0.32, rush_att: 6 }],
    ["James Conner", "RB", { snap: 0.62, rush_yds: 68, rush_att: 14, rush_td: 0.52, rec: 2.4, rec_yds: 18, rec_td: 0.06, targets: 3.1 }],
    ["Trey Benson", "RB", { snap: 0.34, rush_yds: 32, rush_att: 8, rush_td: 0.18, rec: 1.2, rec_yds: 9, rec_td: 0.04, targets: 1.6 }],
    ["Marvin Harrison Jr.", "WR", { snap: 0.86, rec: 5.8, rec_yds: 82, rec_td: 0.5, targets: 9.0 }],
    ["Michael Wilson", "WR", { snap: 0.72, rec: 3.6, rec_yds: 48, rec_td: 0.22, targets: 5.4 }],
    ["Zay Jones", "WR", { snap: 0.48, rec: 2.0, rec_yds: 24, rec_td: 0.1, targets: 3.2 }],
    ["Trey McBride", "TE", { snap: 0.84, rec: 6.2, rec_yds: 64, rec_td: 0.38, targets: 8.2 }],
  ],
  LAC: [
    ["Justin Herbert", "QB", { snap: 1.0, pass_yds: 266, pass_td: 1.8, pass_att: 34, cmp: 22.8, int: 0.5, rush_yds: 18, rush_td: 0.14, rush_att: 3 }],
    ["Omarion Hampton", "RB", { snap: 0.58, rush_yds: 66, rush_att: 14, rush_td: 0.45, rec: 2.6, rec_yds: 20, rec_td: 0.08, targets: 3.4 }],
    ["Najee Harris", "RB", { snap: 0.4, rush_yds: 42, rush_att: 10, rush_td: 0.32, rec: 1.4, rec_yds: 10, rec_td: 0.04, targets: 1.8 }],
    ["Ladd McConkey", "WR", { snap: 0.86, rec: 6.4, rec_yds: 78, rec_td: 0.42, targets: 9.0 }],
    ["Quentin Johnston", "WR", { snap: 0.74, rec: 3.8, rec_yds: 54, rec_td: 0.32, targets: 6.2 }],
    ["Mike Williams", "WR", { snap: 0.48, rec: 2.2, rec_yds: 34, rec_td: 0.18, targets: 3.6 }],
    ["Will Dissly", "TE", { snap: 0.68, rec: 2.8, rec_yds: 28, rec_td: 0.18, targets: 3.8 }],
  ],
  MIA: [
    ["Tua Tagovailoa", "QB", { snap: 1.0, pass_yds: 254, pass_td: 1.6, pass_att: 33, cmp: 22.6, int: 0.6, rush_yds: 8, rush_td: 0.06, rush_att: 2 }],
    ["De'Von Achane", "RB", { snap: 0.66, rush_yds: 72, rush_att: 13, rush_td: 0.48, rec: 4.2, rec_yds: 36, rec_td: 0.18, targets: 5.2 }],
    ["Jaylen Wright", "RB", { snap: 0.3, rush_yds: 28, rush_att: 7, rush_td: 0.16, rec: 0.6, rec_yds: 4, rec_td: 0.02, targets: 0.8 }],
    ["Tyreek Hill", "WR", { snap: 0.82, rec: 5.8, rec_yds: 82, rec_td: 0.45, targets: 8.8 }],
    ["Jaylen Waddle", "WR", { snap: 0.78, rec: 5.2, rec_yds: 64, rec_td: 0.34, targets: 7.4 }],
    ["Nick Westbrook-Ikhine", "WR", { snap: 0.5, rec: 2.0, rec_yds: 26, rec_td: 0.14, targets: 3.2 }],
    ["Darren Waller", "TE", { snap: 0.62, rec: 3.4, rec_yds: 38, rec_td: 0.28, targets: 4.6 }],
  ],
  LV: [
    ["Geno Smith", "QB", { snap: 1.0, pass_yds: 236, pass_td: 1.45, pass_att: 33, cmp: 21.4, int: 0.68, rush_yds: 14, rush_td: 0.1, rush_att: 3 }],
    ["Ashton Jeanty", "RB", { snap: 0.7, rush_yds: 78, rush_att: 16, rush_td: 0.55, rec: 2.8, rec_yds: 22, rec_td: 0.08, targets: 3.6 }],
    ["Zamir White", "RB", { snap: 0.26, rush_yds: 18, rush_att: 5, rush_td: 0.1, rec: 0.6, rec_yds: 4, rec_td: 0.02, targets: 0.8 }],
    ["Jakobi Meyers", "WR", { snap: 0.84, rec: 5.6, rec_yds: 68, rec_td: 0.32, targets: 8.0 }],
    ["Tre Tucker", "WR", { snap: 0.7, rec: 3.4, rec_yds: 48, rec_td: 0.24, targets: 5.4 }],
    ["Dont'e Thornton Jr.", "WR", { snap: 0.48, rec: 2.0, rec_yds: 28, rec_td: 0.12, targets: 3.2 }],
    ["Brock Bowers", "TE", { snap: 0.86, rec: 6.4, rec_yds: 72, rec_td: 0.42, targets: 8.6 }],
  ],
  GB: [
    ["Jordan Love", "QB", { snap: 1.0, pass_yds: 252, pass_td: 1.7, pass_att: 32, cmp: 21.2, int: 0.52, rush_yds: 16, rush_td: 0.12, rush_att: 3 }],
    ["Josh Jacobs", "RB", { snap: 0.7, rush_yds: 80, rush_att: 17, rush_td: 0.62, rec: 2.4, rec_yds: 18, rec_td: 0.08, targets: 3.1 }],
    ["Emanuel Wilson", "RB", { snap: 0.26, rush_yds: 18, rush_att: 5, rush_td: 0.1, rec: 0.8, rec_yds: 6, rec_td: 0.02, targets: 1.0 }],
    ["Romeo Doubs", "WR", { snap: 0.62, rec: 3.2, rec_yds: 42, rec_td: 0.22, targets: 5.4 }],
    ["Jayden Reed", "WR", { snap: 0.72, rec: 4.6, rec_yds: 58, rec_td: 0.32, targets: 6.6 }],
    ["Matthew Golden", "WR", { snap: 0.68, rec: 3.8, rec_yds: 52, rec_td: 0.28, targets: 5.8 }],
    ["Tucker Kraft", "TE", { snap: 0.78, rec: 4.0, rec_yds: 48, rec_td: 0.34, targets: 5.4 }],
  ],
  MIN: [
    ["J.J. McCarthy", "QB", { snap: 1.0, pass_yds: 234, pass_td: 1.45, pass_att: 31, cmp: 19.8, int: 0.7, rush_yds: 22, rush_td: 0.16, rush_att: 4 }],
    ["Aaron Jones", "RB", { snap: 0.58, rush_yds: 62, rush_att: 13, rush_td: 0.4, rec: 3.2, rec_yds: 24, rec_td: 0.1, targets: 4.0 }],
    ["Jordan Mason", "RB", { snap: 0.4, rush_yds: 48, rush_att: 11, rush_td: 0.32, rec: 1.0, rec_yds: 7, rec_td: 0.02, targets: 1.3 }],
    ["Justin Jefferson", "WR", { snap: 0.9, rec: 6.8, rec_yds: 92, rec_td: 0.52, targets: 10.2 }],
    ["Jordan Addison", "WR", { snap: 0.78, rec: 4.4, rec_yds: 58, rec_td: 0.36, targets: 6.8 }],
    ["Jalen Nailor", "WR", { snap: 0.45, rec: 1.8, rec_yds: 26, rec_td: 0.12, targets: 2.8 }],
    ["T.J. Hockenson", "TE", { snap: 0.74, rec: 4.2, rec_yds: 44, rec_td: 0.26, targets: 5.8 }],
  ],
  WAS: [
    ["Jayden Daniels", "QB", { snap: 1.0, pass_yds: 228, pass_td: 1.45, pass_att: 29, cmp: 19.6, int: 0.5, rush_yds: 54, rush_td: 0.45, rush_att: 8 }],
    ["Brian Robinson Jr.", "RB", { snap: 0.52, rush_yds: 58, rush_att: 13, rush_td: 0.42, rec: 1.6, rec_yds: 12, rec_td: 0.04, targets: 2.1 }],
    ["Austin Ekeler", "RB", { snap: 0.42, rush_yds: 28, rush_att: 6, rush_td: 0.16, rec: 3.6, rec_yds: 28, rec_td: 0.12, targets: 4.4 }],
    ["Terry McLaurin", "WR", { snap: 0.84, rec: 5.4, rec_yds: 74, rec_td: 0.42, targets: 8.2 }],
    ["Deebo Samuel", "WR", { snap: 0.72, rec: 4.2, rec_yds: 52, rec_td: 0.28, targets: 6.0 }],
    ["Noah Brown", "WR", { snap: 0.48, rec: 2.0, rec_yds: 26, rec_td: 0.12, targets: 3.1 }],
    ["Zach Ertz", "TE", { snap: 0.7, rec: 3.6, rec_yds: 36, rec_td: 0.28, targets: 4.8 }],
  ],
  PHI: [
    ["Jalen Hurts", "QB", { snap: 1.0, pass_yds: 226, pass_td: 1.5, pass_att: 29, cmp: 19.4, int: 0.48, rush_yds: 44, rush_td: 0.62, rush_att: 8 }],
    ["Saquon Barkley", "RB", { snap: 0.76, rush_yds: 92, rush_att: 18, rush_td: 0.68, rec: 3.2, rec_yds: 24, rec_td: 0.1, targets: 4.0 }],
    ["Will Shipley", "RB", { snap: 0.22, rush_yds: 14, rush_att: 4, rush_td: 0.08, rec: 0.8, rec_yds: 6, rec_td: 0.02, targets: 1.0 }],
    ["A.J. Brown", "WR", { snap: 0.82, rec: 5.6, rec_yds: 82, rec_td: 0.5, targets: 8.4 }],
    ["DeVonta Smith", "WR", { snap: 0.8, rec: 5.2, rec_yds: 68, rec_td: 0.38, targets: 7.4 }],
    ["Jahan Dotson", "WR", { snap: 0.48, rec: 2.0, rec_yds: 26, rec_td: 0.12, targets: 3.2 }],
    ["Dallas Goedert", "TE", { snap: 0.76, rec: 3.8, rec_yds: 42, rec_td: 0.28, targets: 5.0 }],
  ],
  DAL: [
    ["Dak Prescott", "QB", { snap: 1.0, pass_yds: 262, pass_td: 1.75, pass_att: 34, cmp: 22.8, int: 0.55, rush_yds: 12, rush_td: 0.12, rush_att: 3 }],
    ["Javonte Williams", "RB", { snap: 0.58, rush_yds: 64, rush_att: 14, rush_td: 0.42, rec: 2.6, rec_yds: 18, rec_td: 0.06, targets: 3.4 }],
    ["Miles Sanders", "RB", { snap: 0.32, rush_yds: 28, rush_att: 7, rush_td: 0.16, rec: 1.4, rec_yds: 10, rec_td: 0.04, targets: 1.8 }],
    ["CeeDee Lamb", "WR", { snap: 0.88, rec: 7.2, rec_yds: 92, rec_td: 0.52, targets: 10.6 }],
    ["George Pickens", "WR", { snap: 0.8, rec: 4.8, rec_yds: 68, rec_td: 0.42, targets: 7.6 }],
    ["KaVontae Turpin", "WR", { snap: 0.4, rec: 1.8, rec_yds: 26, rec_td: 0.1, targets: 2.8 }],
    ["Jake Ferguson", "TE", { snap: 0.74, rec: 4.4, rec_yds: 44, rec_td: 0.32, targets: 5.8 }],
  ],
  NYG: [
    ["Russell Wilson", "QB", { snap: 0.92, pass_yds: 228, pass_td: 1.35, pass_att: 32, cmp: 20.2, int: 0.7, rush_yds: 18, rush_td: 0.12, rush_att: 3 }],
    ["Tyrone Tracy Jr.", "RB", { snap: 0.58, rush_yds: 62, rush_att: 14, rush_td: 0.38, rec: 2.6, rec_yds: 20, rec_td: 0.06, targets: 3.4 }],
    ["Cam Skattebo", "RB", { snap: 0.38, rush_yds: 38, rush_att: 9, rush_td: 0.28, rec: 1.8, rec_yds: 14, rec_td: 0.06, targets: 2.4 }],
    ["Malik Nabers", "WR", { snap: 0.88, rec: 6.8, rec_yds: 88, rec_td: 0.48, targets: 10.4 }],
    ["Wan'Dale Robinson", "WR", { snap: 0.72, rec: 4.4, rec_yds: 42, rec_td: 0.18, targets: 6.2 }],
    ["Darius Slayton", "WR", { snap: 0.62, rec: 2.8, rec_yds: 42, rec_td: 0.2, targets: 4.4 }],
    ["Theo Johnson", "TE", { snap: 0.68, rec: 3.0, rec_yds: 32, rec_td: 0.22, targets: 4.2 }],
  ],
  DEN: [
    ["Bo Nix", "QB", { snap: 1.0, pass_yds: 238, pass_td: 1.5, pass_att: 32, cmp: 21.0, int: 0.58, rush_yds: 28, rush_td: 0.22, rush_att: 5 }],
    ["J.K. Dobbins", "RB", { snap: 0.55, rush_yds: 64, rush_att: 14, rush_td: 0.45, rec: 2.0, rec_yds: 14, rec_td: 0.06, targets: 2.6 }],
    ["Jaleel McLaughlin", "RB", { snap: 0.32, rush_yds: 24, rush_att: 5, rush_td: 0.12, rec: 2.2, rec_yds: 16, rec_td: 0.06, targets: 2.8 }],
    ["Courtland Sutton", "WR", { snap: 0.84, rec: 5.2, rec_yds: 72, rec_td: 0.42, targets: 8.0 }],
    ["Marvin Mims Jr.", "WR", { snap: 0.58, rec: 3.2, rec_yds: 48, rec_td: 0.22, targets: 4.8 }],
    ["Troy Franklin", "WR", { snap: 0.55, rec: 2.8, rec_yds: 36, rec_td: 0.16, targets: 4.4 }],
    ["Evan Engram", "TE", { snap: 0.72, rec: 4.6, rec_yds: 46, rec_td: 0.26, targets: 6.0 }],
  ],
  KC: [
    ["Patrick Mahomes", "QB", { snap: 1.0, pass_yds: 272, pass_td: 1.95, pass_att: 35, cmp: 23.4, int: 0.45, rush_yds: 28, rush_td: 0.22, rush_att: 5 }],
    ["Isiah Pacheco", "RB", { snap: 0.58, rush_yds: 66, rush_att: 14, rush_td: 0.48, rec: 2.4, rec_yds: 18, rec_td: 0.06, targets: 3.1 }],
    ["Kareem Hunt", "RB", { snap: 0.36, rush_yds: 32, rush_att: 8, rush_td: 0.32, rec: 1.2, rec_yds: 8, rec_td: 0.04, targets: 1.6 }],
    ["Rashee Rice", "WR", { snap: 0.8, rec: 6.2, rec_yds: 74, rec_td: 0.48, targets: 8.6 }],
    ["Xavier Worthy", "WR", { snap: 0.74, rec: 4.0, rec_yds: 58, rec_td: 0.36, targets: 6.4 }],
    ["Hollywood Brown", "WR", { snap: 0.55, rec: 2.6, rec_yds: 36, rec_td: 0.18, targets: 4.0 }],
    ["Travis Kelce", "TE", { snap: 0.82, rec: 5.4, rec_yds: 58, rec_td: 0.42, targets: 7.2 }],
  ],
};

// Avoid duplicate Marvin Harrison Jr. player_ids — ARI keeps him; IND uses a distinct WR2 name already (Harrison is on ARI in 2026).
// IND roster above already has Marvin Harrison Jr. which would collide if both used the same name-hash... 
// They're the same name so same ID. That's OK if we only show per-game; fantasy list would merge two rows with same ID from different teams.
// Fix: IND WR1 should not be Harrison. Use Adonai Mitchell / Alec Pierce. I'll patch IND after object freeze by editing the IND array - already written with Harrison.
// I'll overwrite IND WR1 below after this object... actually I'll fix in the object. Too late in this string - I'll patch after.

const GAMES = [
  {
    game_id: "2026_01_NE_SEA",
    away: "NE",
    home: "SEA",
    kickoff: "2026-09-09T20:20:00-04:00",
    home_win: 0.57,
    margin: 2.8,
    total: 42.6,
    drivers: [
      { id: "sea_home", title: "Home field at Lumen", detail: "Seattle's home environment and run-game script lift the Seahawks' win probability." },
      { id: "ne_qb_rush", title: "Maye designed keepers", detail: "Patriot quarterback rushing adds a second-layer scoring path that keeps the projected margin tight." },
      { id: "weather", title: "Mild outdoor night", detail: "Light wind and no precipitation — passing games should be full-script." },
    ],
    confidence: { label: "medium", score: 0.58, note: "Stable starter usage; modest weather noise." },
  },
  {
    game_id: "2026_01_SF_LA",
    away: "SF",
    home: "LA",
    kickoff: "2026-09-10T20:35:00-04:00",
    home_win: 0.49,
    margin: -0.4,
    total: 46.8,
    drivers: [
      { id: "indoor", title: "Indoor track", detail: "SoFi climate control removes weather as a passing-volume damper." },
      { id: "sf_skill", title: "49ers skill-player density", detail: "McCaffrey plus two-TE/WR looks keep San Francisco's scoring distribution wide." },
      { id: "la_outside", title: "Rams outside leverage", detail: "Nacua/Adams projected target concentration vs SF corners." },
    ],
    confidence: { label: "medium", score: 0.54, note: "Coin-flip win probability with a high projected total." },
  },
  {
    game_id: "2026_01_CHI_CAR",
    away: "CHI",
    home: "CAR",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.44,
    margin: -1.8,
    total: 43.2,
    drivers: [
      { id: "chi_young_qb", title: "Bears explosive pass game", detail: "Odunze/Moore pairing lifts Chicago's projected scoring even on the road." },
      { id: "car_home", title: "Panthers early-down run", detail: "Carolina's projected rush attempts keep the game on schedule at home." },
      { id: "heat", title: "Early-season heat", detail: "Charlotte afternoon warmth is a small rushing-script nudge, not a passing shutdown." },
    ],
    confidence: { label: "medium", score: 0.52, note: "Both offenses still have wide outcome bands." },
  },
  {
    game_id: "2026_01_TB_CIN",
    away: "TB",
    home: "CIN",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.61,
    margin: 4.2,
    total: 47.4,
    drivers: [
      { id: "cin_pass", title: "Bengals dropback rate", detail: "Burrow-to-Chase/Higgins volume is the primary scoring driver." },
      { id: "tb_evans", title: "Bucs red-zone looks", detail: "Evans and Irving keep Tampa Bay's p90 total in range." },
      { id: "pace", title: "Neutral pace", detail: "Neither side is projected to go fully run-heavy if trailing." },
    ],
    confidence: { label: "medium-high", score: 0.63, note: "Clear passing-game identities on both sides." },
  },
  {
    game_id: "2026_01_NO_DET",
    away: "NO",
    home: "DET",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.68,
    margin: 6.4,
    total: 46.1,
    drivers: [
      { id: "det_home", title: "Lions home scoring", detail: "Gibbs/Montgomery and St. Brown create a stacked projected box." },
      { id: "indoor", title: "Ford Field indoor", detail: "No weather tax on the passing games." },
      { id: "no_qb", title: "Saints quarterback band", detail: "Wider Saints pass-volume uncertainty pulls their win probability down." },
    ],
    confidence: { label: "medium-high", score: 0.66, note: "Lions usage is the most stable piece of this slate." },
  },
  {
    game_id: "2026_01_BUF_HOU",
    away: "BUF",
    home: "HOU",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.42,
    margin: -2.6,
    total: 45.5,
    drivers: [
      { id: "allen", title: "Allen dual-threat", detail: "Quarterback rushing TDs are a large slice of Buffalo's projected scoring." },
      { id: "hou_wr", title: "Collins feature", detail: "Houston's projected pass game funnels through Nico Collins." },
      { id: "indoor", title: "NRG closed roof", detail: "Indoor conditions support full dropback scripts." },
    ],
    confidence: { label: "medium", score: 0.57, note: "Bills projected slightly ahead via rushing variance." },
  },
  {
    game_id: "2026_01_BAL_IND",
    away: "BAL",
    home: "IND",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.41,
    margin: -2.9,
    total: 47.8,
    drivers: [
      { id: "bal_run", title: "Ravens run game", detail: "Henry plus Jackson keepers dominate Baltimore's scoring paths." },
      { id: "ind_jt", title: "Taylor volume", detail: "Colts projected to lean on Jonathan Taylor in a dome." },
      { id: "indoor", title: "Lucas Oil indoor", detail: "Climate-controlled; totals not weather-capped." },
    ],
    confidence: { label: "medium", score: 0.55, note: "Both run games are high-confidence; passing bands are wider." },
  },
  {
    game_id: "2026_01_CLE_JAX",
    away: "CLE",
    home: "JAX",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.58,
    margin: 3.1,
    total: 41.9,
    drivers: [
      { id: "jax_home", title: "Jaguars home script", detail: "Lawrence plus Thomas Jr. lift Jacksonville's projected scoring at home." },
      { id: "cle_pass", title: "Browns passing volatility", detail: "Cleveland's projected pass efficiency is the wider error bar." },
      { id: "heat", title: "Jacksonville humidity", detail: "Warm, still air — small run-script nudge in the second half." },
    ],
    confidence: { label: "medium", score: 0.53, note: "Lower projected total; quarterback bands drive uncertainty." },
  },
  {
    game_id: "2026_01_ATL_PIT",
    away: "ATL",
    home: "PIT",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.51,
    margin: 0.6,
    total: 42.4,
    drivers: [
      { id: "bijan", title: "Robinson usage", detail: "Atlanta's projected offense still runs through Bijan Robinson." },
      { id: "pitt_wind", title: "Acrisure wind", detail: "Double-digit wind trims both projected passing yards." },
      { id: "dk", title: "Metcalf downfield", detail: "Pittsburgh's explosive-pass p90 is concentrated in one WR." },
    ],
    confidence: { label: "low-medium", score: 0.48, note: "Wind plus even win probability widen the margin band." },
  },
  {
    game_id: "2026_01_NYJ_TEN",
    away: "NYJ",
    home: "TEN",
    kickoff: "2026-09-13T13:00:00-04:00",
    home_win: 0.47,
    margin: -1.1,
    total: 40.8,
    drivers: [
      { id: "rb_elevate", title: "Backfield elevates", detail: "Film elevates on both starting RBs (Hall, Pollard) raise projected rush attempts." },
      { id: "fields", title: "Fields rushing", detail: "Jets quarterback scrambles remain a distinct scoring path." },
      { id: "pace", title: "Slower projected pace", detail: "Both staffs project run-leaning early-down calls, capping the total." },
    ],
    confidence: { label: "medium", score: 0.56, note: "Run-game film notes increase confidence in RB volume more than pass volume." },
  },
  {
    game_id: "2026_01_ARI_LAC",
    away: "ARI",
    home: "LAC",
    kickoff: "2026-09-13T16:25:00-04:00",
    home_win: 0.59,
    margin: 3.4,
    total: 45.2,
    drivers: [
      { id: "herbert", title: "Herbert dropbacks", detail: "Chargers projected pass volume is the cleaner scoring engine." },
      { id: "mcbride", title: "McBride target share", detail: "Cardinals TE usage is a stable piece of Arizona's passing tree." },
      { id: "indoor", title: "SoFi indoor", detail: "No weather; totals driven by pace and efficiency only." },
    ],
    confidence: { label: "medium", score: 0.6, note: "Indoor game with identifiable pass-game hubs." },
  },
  {
    game_id: "2026_01_MIA_LV",
    away: "MIA",
    home: "LV",
    kickoff: "2026-09-13T16:25:00-04:00",
    home_win: 0.46,
    margin: -1.4,
    total: 44.7,
    drivers: [
      { id: "speed", title: "Dolphins explosives", detail: "Hill/Waddle/Achane keep Miami's p90 total elevated." },
      { id: "bowers", title: "Bowers hub", detail: "Raiders projected targets concentrate on Brock Bowers." },
      { id: "indoor", title: "Allegiant indoor", detail: "Closed roof, fast track." },
    ],
    confidence: { label: "medium", score: 0.51, note: "Explosive-play variance is the main uncertainty." },
  },
  {
    game_id: "2026_01_GB_MIN",
    away: "GB",
    home: "MIN",
    kickoff: "2026-09-13T16:25:00-04:00",
    home_win: 0.48,
    margin: -0.7,
    total: 44.1,
    drivers: [
      { id: "doubs_q", title: "Questionable Packers WR", detail: "Romeo Doubs is tagged questionable — Packers target tree may concentrate elsewhere." },
      { id: "jj", title: "Jefferson feature", detail: "Vikings projected pass game still runs through Justin Jefferson." },
      { id: "indoor", title: "U.S. Bank indoor", detail: "No weather; usage questions matter more than conditions." },
    ],
    confidence: { label: "low-medium", score: 0.47, note: "WR status on Green Bay is the main confidence haircut." },
  },
  {
    game_id: "2026_01_WAS_PHI",
    away: "WAS",
    home: "PHI",
    kickoff: "2026-09-13T16:25:00-04:00",
    home_win: 0.63,
    margin: 4.8,
    total: 47.2,
    drivers: [
      { id: "saquon", title: "Barkley early downs", detail: "Eagles projected to control time of possession via the run game." },
      { id: "hurts_tush", title: "Hurts rushing TDs", detail: "Quarterback goal-line carries are a large slice of PHI scoring." },
      { id: "daniels", title: "Daniels designed runs", detail: "Washington stays in range through quarterback rushing, not just dropbacks." },
    ],
    confidence: { label: "medium-high", score: 0.64, note: "Eagles usage patterns are well identified." },
  },
  {
    game_id: "2026_01_DAL_NYG",
    away: "DAL",
    home: "NYG",
    kickoff: "2026-09-13T20:20:00-04:00",
    home_win: 0.38,
    margin: -3.6,
    total: 44.9,
    drivers: [
      { id: "lamb", title: "Lamb/Pickens volume", detail: "Cowboys projected pass game has two high-mean WR outcomes." },
      { id: "nabers", title: "Nabers concentration", detail: "Giants targets cluster on Malik Nabers." },
      { id: "night", title: "Sunday night, light wind", detail: "MetLife wind is moderate — not a passing shutdown." },
    ],
    confidence: { label: "medium", score: 0.59, note: "Cowboys slightly ahead; Giants p90 lives in Nabers." },
  },
  {
    game_id: "2026_01_DEN_KC",
    away: "DEN",
    home: "KC",
    kickoff: "2026-09-14T20:15:00-04:00",
    home_win: 0.67,
    margin: 6.1,
    total: 46.4,
    drivers: [
      { id: "mahomes", title: "Chiefs pass-game density", detail: "Mahomes to Rice/Kelce/Worthy is the highest-confidence scoring cluster on the slate." },
      { id: "arrowhead", title: "Arrowhead night", detail: "Home environment plus a bit of wind — KC still projected to throw." },
      { id: "nix", title: "Nix keep-pace", detail: "Broncos stay attached via balanced pass/run, not a single feature back." },
    ],
    confidence: { label: "medium-high", score: 0.67, note: "Chiefs usage is stable; weather is a small total trim only." },
  },
];

const WEATHER = {
  "2026_01_NE_SEA": { temp_f: 67, wind_mph: 7, condition: "Partly cloudy", precip_pct: 15 },
  "2026_01_SF_LA": { temp_f: 72, wind_mph: 0, condition: "Indoor — climate controlled", precip_pct: 0 },
  "2026_01_CHI_CAR": { temp_f: 82, wind_mph: 6, condition: "Sunny", precip_pct: 10 },
  "2026_01_TB_CIN": { temp_f: 77, wind_mph: 9, condition: "Mostly cloudy", precip_pct: 20 },
  "2026_01_NO_DET": { temp_f: 72, wind_mph: 0, condition: "Indoor — climate controlled", precip_pct: 0 },
  "2026_01_BUF_HOU": { temp_f: 72, wind_mph: 0, condition: "Indoor — roof closed", precip_pct: 0 },
  "2026_01_BAL_IND": { temp_f: 72, wind_mph: 0, condition: "Indoor — roof closed", precip_pct: 0 },
  "2026_01_CLE_JAX": { temp_f: 88, wind_mph: 8, condition: "Humid, partly cloudy", precip_pct: 25 },
  "2026_01_ATL_PIT": { temp_f: 73, wind_mph: 12, condition: "Breezy, cloudy", precip_pct: 20 },
  "2026_01_NYJ_TEN": { temp_f: 84, wind_mph: 5, condition: "Partly cloudy", precip_pct: 15 },
  "2026_01_ARI_LAC": { temp_f: 72, wind_mph: 0, condition: "Indoor — climate controlled", precip_pct: 0 },
  "2026_01_MIA_LV": { temp_f: 72, wind_mph: 0, condition: "Indoor — climate controlled", precip_pct: 0 },
  "2026_01_GB_MIN": { temp_f: 72, wind_mph: 0, condition: "Indoor — climate controlled", precip_pct: 0 },
  "2026_01_WAS_PHI": { temp_f: 80, wind_mph: 10, condition: "Mostly sunny", precip_pct: 10 },
  "2026_01_DAL_NYG": { temp_f: 71, wind_mph: 11, condition: "Clear", precip_pct: 5 },
  "2026_01_DEN_KC": { temp_f: 75, wind_mph: 13, condition: "Breezy, clear", precip_pct: 5 },
};

function footageRefs(gameId) {
  if (gameId === "2026_01_NYJ_TEN") {
    return [
      {
        player_id: "00-0034796",
        player_name: "Tony Pollard",
        team: "TEN",
        pos: "RB",
        kind: "elevate",
        source: "fixture",
        label: "Elevate — early-down and two-minute role",
      },
      {
        player_id: "00-0038120",
        player_name: "Breece Hall",
        team: "NYJ",
        pos: "RB",
        kind: "elevate",
        source: "fixture",
        label: "Elevate — between-the-tackles + screens",
      },
    ];
  }
  if (gameId === "2026_01_GB_MIN") {
    return [
      {
        player_id: "00-0035689",
        player_name: "Romeo Doubs",
        team: "GB",
        pos: "WR",
        kind: "downgrade",
        status: "questionable",
        source: "fixture",
        label: "Questionable WR — target volume at risk",
      },
    ];
  }
  return [];
}

function buildGame(g) {
  const awayPlayers = ROSTERS[g.away].map((spec) => makePlayer(g.away, spec));
  const homePlayers = ROSTERS[g.home].map((spec) => makePlayer(g.home, spec));
  const players = [...awayPlayers, ...homePlayers];
  if (players.length < 8 || players.length > 20) {
    throw new Error(`${g.game_id} player count ${players.length} out of range`);
  }
  const venue = VENUES[g.home];
  const homeWin = r3(g.home_win);
  const awayWin = r3(1 - homeWin);
  const homePoints = r1((g.total + g.margin) / 2);
  const awayPoints = r1((g.total - g.margin) / 2);
  return {
    schema_version: SCHEMA_VERSION,
    game_id: g.game_id,
    season: 2026,
    week: 1,
    season_type: "REG",
    scoring: "half_ppr",
    kickoff: g.kickoff,
    status: "scheduled",
    venue,
    weather: WEATHER[g.game_id],
    teams: {
      away: { abbr: g.away, name: TEAM_NAMES[g.away] },
      home: { abbr: g.home, name: TEAM_NAMES[g.home] },
    },
    market_leans: {
      home_win_prob: homeWin,
      away_win_prob: awayWin,
      proj_margin_home: r1(g.margin),
      proj_total: r1(g.total),
      margin_p10: r1(g.margin - 11.5),
      margin_p90: r1(g.margin + 11.5),
      total_p10: r1(g.total - 9.5),
      total_p90: r1(g.total + 9.5),
      note: "Model-only projection. No book line attached — type your own line to estimate P(over).",
    },
    team_box: {
      away: teamBox(awayPlayers, awayPoints),
      home: teamBox(homePlayers, homePoints),
    },
    players,
    drivers: g.drivers,
    confidence: g.confidence,
    copy_rules: { ...COPY_RULES },
    user_line_hooks: { ...USER_LINE_HOOKS },
    toggles_applied: [],
    footage_refs: footageRefs(g.game_id),
  };
}

// Patch IND WR1 — Harrison is on ARI; keep unique names in the fantasy list.
ROSTERS.IND[3] = ["Adonai Mitchell", "WR", { snap: 0.78, rec: 4.4, rec_yds: 62, rec_td: 0.34, targets: 7.2 }];

fs.mkdirSync(gamesDir, { recursive: true });

const slateGames = GAMES.map((g) => {
  const venue = VENUES[g.home];
  return {
    game_id: g.game_id,
    away: g.away,
    home: g.home,
    kickoff: g.kickoff,
    status: "scheduled",
    venue,
    weather: WEATHER[g.game_id],
  };
});

const slate = {
  schema_version: SCHEMA_VERSION,
  season: 2026,
  week: 1,
  season_type: "REG",
  scoring_default: "half_ppr",
  timezone: "America/New_York",
  games: slateGames,
};

fs.writeFileSync(path.join(fixturesDir, "slate.json"), JSON.stringify(slate, null, 2) + "\n");

for (const g of GAMES) {
  const sim = buildGame(g);
  fs.writeFileSync(path.join(gamesDir, `${g.game_id}.json`), JSON.stringify(sim, null, 2) + "\n");
}

const elevates = {
  schema_version: SCHEMA_VERSION,
  season: 2026,
  week: 1,
  source: "fixture",
  rows: [
    {
      game_id: "2026_01_NYJ_TEN",
      player_id: "00-0034796",
      player_name: "Tony Pollard",
      team: "TEN",
      pos: "RB",
      kind: "elevate",
      headline: "Explosive backfield usage",
      note: "Film elevate: early-down and two-minute role",
    },
    {
      game_id: "2026_01_NYJ_TEN",
      player_id: "00-0038120",
      player_name: "Breece Hall",
      team: "NYJ",
      pos: "RB",
      kind: "elevate",
      headline: "Between-the-tackles + screen game",
      note: "Film elevate: volume RB vs TEN",
    },
    {
      game_id: "2026_01_GB_MIN",
      player_id: "00-0035689",
      player_name: "Romeo Doubs",
      team: "GB",
      pos: "WR",
      kind: "downgrade",
      status: "questionable",
      headline: "Questionable WR — target volume at risk",
      note: "Film + status downgrade: limited practice",
    },
  ],
};

fs.writeFileSync(path.join(fixturesDir, "footage-elevates.week1.json"), JSON.stringify(elevates, null, 2) + "\n");

// Sanity checks
const ids = new Set();
for (const g of GAMES) {
  const sim = JSON.parse(fs.readFileSync(path.join(gamesDir, `${g.game_id}.json`), "utf8"));
  const wp = r3(sim.market_leans.home_win_prob + sim.market_leans.away_win_prob);
  if (Math.abs(wp - 1) > 0.002) throw new Error(`win probs ${g.game_id} sum ${wp}`);
  if (!Object.values(sim.copy_rules).every(Boolean)) throw new Error("copy_rules");
  if (!Object.values(sim.user_line_hooks).every(Boolean)) throw new Error("user_line_hooks");
  for (const p of sim.players) {
    if (p.fantasy.scoring !== "half_ppr") throw new Error("scoring");
    ids.add(`${sim.game_id}:${p.player_id}`);
  }
}
const nyj = JSON.parse(fs.readFileSync(path.join(gamesDir, "2026_01_NYJ_TEN.json"), "utf8"));
const gb = JSON.parse(fs.readFileSync(path.join(gamesDir, "2026_01_GB_MIN.json"), "utf8"));
if (!nyj.players.some((p) => p.player_id === "00-0034796") || !nyj.players.some((p) => p.player_id === "00-0038120")) {
  throw new Error("NYJ_TEN missing special RBs");
}
if (!gb.players.some((p) => p.player_id === "00-0035689")) throw new Error("GB_MIN missing Doubs");
if (nyj.footage_refs.length !== 2 || gb.footage_refs.length !== 1) throw new Error("footage_refs count");

console.log(`Wrote ${GAMES.length} games, ${ids.size} player-game rows, elevates=${elevates.rows.length}`);
