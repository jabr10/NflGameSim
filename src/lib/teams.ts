export type TeamMeta = {
  abbr: string;
  name: string;
  primary: string;
};

export const TEAMS: Record<string, TeamMeta> = {
  ARI: { abbr: "ARI", name: "Arizona Cardinals", primary: "#97233F" },
  ATL: { abbr: "ATL", name: "Atlanta Falcons", primary: "#A71930" },
  BAL: { abbr: "BAL", name: "Baltimore Ravens", primary: "#241773" },
  BUF: { abbr: "BUF", name: "Buffalo Bills", primary: "#00338D" },
  CAR: { abbr: "CAR", name: "Carolina Panthers", primary: "#0085CA" },
  CHI: { abbr: "CHI", name: "Chicago Bears", primary: "#0B162A" },
  CIN: { abbr: "CIN", name: "Cincinnati Bengals", primary: "#FB4F14" },
  CLE: { abbr: "CLE", name: "Cleveland Browns", primary: "#FF3C00" },
  DAL: { abbr: "DAL", name: "Dallas Cowboys", primary: "#003594" },
  DEN: { abbr: "DEN", name: "Denver Broncos", primary: "#FB4F14" },
  DET: { abbr: "DET", name: "Detroit Lions", primary: "#0076B6" },
  GB: { abbr: "GB", name: "Green Bay Packers", primary: "#203731" },
  HOU: { abbr: "HOU", name: "Houston Texans", primary: "#03202F" },
  IND: { abbr: "IND", name: "Indianapolis Colts", primary: "#002C5F" },
  JAX: { abbr: "JAX", name: "Jacksonville Jaguars", primary: "#006778" },
  KC: { abbr: "KC", name: "Kansas City Chiefs", primary: "#E31837" },
  LAC: { abbr: "LAC", name: "Los Angeles Chargers", primary: "#0080C6" },
  LA: { abbr: "LA", name: "Los Angeles Rams", primary: "#003594" },
  LV: { abbr: "LV", name: "Las Vegas Raiders", primary: "#A5ACAF" },
  MIA: { abbr: "MIA", name: "Miami Dolphins", primary: "#008E97" },
  MIN: { abbr: "MIN", name: "Minnesota Vikings", primary: "#4F2683" },
  NE: { abbr: "NE", name: "New England Patriots", primary: "#002244" },
  NO: { abbr: "NO", name: "New Orleans Saints", primary: "#D3BC8D" },
  NYG: { abbr: "NYG", name: "New York Giants", primary: "#0B2265" },
  NYJ: { abbr: "NYJ", name: "New York Jets", primary: "#125740" },
  PHI: { abbr: "PHI", name: "Philadelphia Eagles", primary: "#004C54" },
  PIT: { abbr: "PIT", name: "Pittsburgh Steelers", primary: "#FFB612" },
  SEA: { abbr: "SEA", name: "Seattle Seahawks", primary: "#69BE28" },
  SF: { abbr: "SF", name: "San Francisco 49ers", primary: "#AA0000" },
  TB: { abbr: "TB", name: "Tampa Bay Buccaneers", primary: "#D50A0A" },
  TEN: { abbr: "TEN", name: "Tennessee Titans", primary: "#4B92DB" },
  WAS: { abbr: "WAS", name: "Washington Commanders", primary: "#5A1414" },
};

export function teamMeta(abbr: string): TeamMeta {
  return TEAMS[abbr] ?? { abbr, name: abbr, primary: "#64748b" };
}
