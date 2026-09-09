export type Scoring = "half_ppr";

export type Quantiles = {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
};

export type Venue = {
  name: string;
  city: string;
  state: string;
  indoor: boolean;
};

export type Weather = {
  temp_f: number | null;
  wind_mph: number | null;
  condition: string;
  precip_pct: number | null;
};

export type SlateGame = {
  game_id: string;
  away: string;
  home: string;
  kickoff: string;
  status: string;
  venue: Venue;
  weather: Weather;
};

export type Slate = {
  schema_version: string;
  season: number;
  week: number;
  season_type: "REG";
  scoring_default: Scoring;
  timezone: string;
  games: SlateGame[];
};

export type TeamInfo = {
  abbr: string;
  name: string;
};

export type MarketLeans = {
  home_win_prob: number;
  away_win_prob: number;
  proj_margin_home: number;
  proj_total: number;
  margin_p10: number;
  margin_p90: number;
  total_p10: number;
  total_p90: number;
  note: string;
};

export type TeamBox = {
  points: number;
  pass_yards: number;
  rush_yards: number;
  pass_attempts: number;
  rush_attempts: number;
  sacks_taken: number;
  turnovers: number;
};

export type Usage = {
  snap_share: number;
  rush_share: number;
  target_share: number;
  route_share: number;
};

export type PlayerSim = {
  player_id: string;
  name: string;
  team: string;
  pos: string;
  usage: Usage;
  prop_quantiles: Record<string, Quantiles>;
  fantasy: {
    mean: number;
    p10: number;
    p90: number;
    scoring: Scoring;
  };
  anytime_td_prob: number;
};

export type Driver = {
  id: string;
  title: string;
  detail: string;
};

export type ConfidenceBand = "low" | "medium" | "high";

export type Confidence = {
  label: string;
  band: ConfidenceBand;
  score: number;
  note: string;
  reasons: string[];
};

export type FootageRef = {
  player_id: string;
  player_name: string;
  team: string;
  pos: string;
  kind: "elevate" | "downgrade";
  source: string;
  label: string;
  status?: string;
};

export type ToggleApplied = {
  player_id: string;
  injury?: string;
  usage?: string;
};

export type SimResult = {
  schema_version: string;
  game_id: string;
  season: number;
  week: number;
  season_type: "REG";
  scoring: Scoring;
  kickoff: string;
  status: string;
  venue: Venue;
  weather: Weather;
  teams: {
    away: TeamInfo;
    home: TeamInfo;
  };
  market_leans: MarketLeans;
  team_box: {
    away: TeamBox;
    home: TeamBox;
  };
  players: PlayerSim[];
  drivers: Driver[];
  confidence: Confidence;
  copy_rules: Record<string, boolean>;
  user_line_hooks: Record<string, boolean>;
  toggles_applied: ToggleApplied[];
  footage_refs: FootageRef[];
};

export type ElevateRow = {
  game_id: string;
  player_id: string;
  player_name: string;
  team: string;
  pos: string;
  kind: "elevate" | "downgrade";
  headline: string;
  note: string;
  status?: string;
};

export type FootageElevates = {
  schema_version: string;
  season: number;
  week: number;
  source: string;
  rows: ElevateRow[];
};

export type InjuryToggle = "active" | "questionable" | "out";
export type UsageToggle = "base" | "up" | "down";

export type PlayerToggle = {
  player_id: string;
  injury: InjuryToggle;
  usage: UsageToggle;
};
