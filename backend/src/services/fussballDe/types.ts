export type MatchResult = {
  home?: number;
  away?: number;
};

export type TeamMatch = {
  date?: string;
  homeTeam: string;
  awayTeam: string;
  competition?: string;
  venue?: string;
  statusText?: string;
  result?: MatchResult;
  source: string;
};

export type TeamStanding = {
  rank?: number;
  team: string;
  played?: number;
  goalDiff?: number;
  points?: number;
  source: string;
};

export type TeamSourceInput = {
  teamPageUrl: string;
};
