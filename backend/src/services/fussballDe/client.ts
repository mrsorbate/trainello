import { z } from 'zod';
import { createHttpClient } from './http';
import { parseMatches, parsePrintableMatches, parseStandings } from './parsers';
import type { TeamMatch, TeamSourceInput, TeamStanding } from './types';

const sourceInputSchema = z.object({
  teamPageUrl: z.string().url(),
});

export type FussballDeClientOptions = {
  timeoutMs?: number;
};

export type StandingsSourceAttempt = {
  url: string;
  ok: boolean;
  rowCount: number;
  error?: string;
};

export type StandingsFetchResult = {
  standings: TeamStanding[];
  attempts: StandingsSourceAttempt[];
  printableMatches?: Array<{
    date?: string;
    competition?: string;
    homeTeam: string;
    awayTeam: string;
    matchUrl?: string;
  }>;
};

/**
 * Builds a fussball.de team page URL from a team-id.
 * Example: buildTeamPageUrl('014MNGMQ0A000000VS5489B4VSEV8ON0')
 *   => 'https://www.fussball.de/verein-mannschaft/-/team-id/014MNGMQ0A000000VS5489B4VSEV8ON0'
 */
export const buildTeamPageUrl = (teamId: string): string =>
  `https://www.fussball.de/verein-mannschaft/-/team-id/${teamId}`;

export class FussballDeClient {
  private readonly timeoutMs: number;

  public constructor(options: FussballDeClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  public async getSpielplan(input: TeamSourceInput): Promise<TeamMatch[]> {
    const validated = sourceInputSchema.parse(input);
    const teamId = this.extractTeamId(validated.teamPageUrl);
    const url = teamId
      ? `https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/team-id/${teamId}`
      : validated.teamPageUrl;
    const html = await this.fetchHtml(url);
    return parseMatches(html, validated.teamPageUrl);
  }

  public async getTabelle(input: TeamSourceInput): Promise<TeamStanding[]> {
    const result = await this.getTabelleWithDiagnostics(input);
    return result.standings;
  }

  public async getTabelleWithDiagnostics(input: TeamSourceInput): Promise<StandingsFetchResult> {
    const validated = sourceInputSchema.parse(input);
    const teamId = this.extractTeamId(validated.teamPageUrl);
    const attempts: StandingsSourceAttempt[] = [];

    const candidateUrls = teamId
      ? [
          `https://www.fussball.de/ajax.team.standing/-/mode/PAGE/team-id/${teamId}`,
          `https://www.fussball.de/ajax.team.standings/-/mode/PAGE/team-id/${teamId}`,
          `https://www.fussball.de/ajax.team.tabelle/-/mode/PAGE/team-id/${teamId}`,
          validated.teamPageUrl,
        ]
      : [validated.teamPageUrl];

    for (const url of candidateUrls) {
      try {
        const html = await this.fetchHtml(url);
        const standings = parseStandings(html, url);
        attempts.push({
          url,
          ok: true,
          rowCount: standings.length,
        });

        if (standings.length > 0) {
          return { standings, attempts };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({
          url,
          ok: false,
          rowCount: 0,
          error: message,
        });
      }
    }

    const printableUrl = teamId
      ? `https://www.fussball.de/vereinsspielplan.druck/-/datum-bis/${this.getCurrentDateIso()}/datum-von/2025-07-01/id/${this.extractCompetitionIdFromPrintableUrl(validated.teamPageUrl) || '00ES8GN9L800006MVV0AG08LVUPGND5I'}/match-type/-1/max/999/mode/PRINT/show-venues/false/team-id/${teamId}`
      : undefined;

    if (printableUrl) {
      try {
        const printableHtml = await this.fetchHtml(printableUrl);
        const printableMatches = parsePrintableMatches(printableHtml);
        attempts.push({
          url: printableUrl,
          ok: true,
          rowCount: printableMatches.length,
        });
        if (printableMatches.length > 0) {
          const standings = await this.buildStandingsFromPrintableMatches(printableMatches);
          return { standings, attempts, printableMatches };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({
          url: printableUrl,
          ok: false,
          rowCount: 0,
          error: message,
        });
      }
    }

    return { standings: [], attempts };
  }

  private async fetchHtml(url: string): Promise<string> {
    const client = createHttpClient(this.timeoutMs);
    const response = await client.get<string>(url);
    return response.data;
  }

  private extractTeamId(teamPageUrl: string): string | undefined {
    const match = teamPageUrl.match(/\/team-id\/([^/#!?]+)/i);
    return match?.[1];
  }

  private extractCompetitionIdFromPrintableUrl(teamPageUrl: string): string | undefined {
    const match = teamPageUrl.match(/\/id\/([^/#!?]+)/i);
    return match?.[1];
  }

  private getCurrentDateIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async buildStandingsFromPrintableMatches(matches: Array<{ date?: string; competition?: string; homeTeam: string; awayTeam: string; matchUrl?: string }>): Promise<TeamStanding[]> {
    const client = createHttpClient(this.timeoutMs);
    const rowMap = new Map<string, TeamStanding & { gf: number; ga: number; games: number; won: number; draw: number; lost: number }>();

    const ensureRow = (teamName: string) => {
      const key = teamName.toLowerCase();
      if (!rowMap.has(key)) {
        rowMap.set(key, { team: teamName, source: 'print-view', gf: 0, ga: 0, games: 0, won: 0, draw: 0, lost: 0 });
      }
      return rowMap.get(key)!;
    };

    for (const match of matches) {
      if (!match.matchUrl) continue;
      try {
        const detail = await client.get<string>(match.matchUrl);
        const scoreMatch = detail.data.match(/([0-9]{1,2})\s*[:\-]\s*([0-9]{1,2})/);
        if (!scoreMatch) continue;

        const home = ensureRow(match.homeTeam);
        const away = ensureRow(match.awayTeam);
        const homeGoals = parseInt(scoreMatch[1], 10);
        const awayGoals = parseInt(scoreMatch[2], 10);

        home.games += 1;
        away.games += 1;
        home.gf += homeGoals;
        home.ga += awayGoals;
        away.gf += awayGoals;
        away.ga += homeGoals;

        if (homeGoals > awayGoals) {
          home.won += 1;
          home.points = (home.points || 0) + 3;
          away.lost += 1;
        } else if (homeGoals < awayGoals) {
          away.won += 1;
          away.points = (away.points || 0) + 3;
          home.lost += 1;
        } else {
          home.draw += 1;
          away.draw += 1;
          home.points = (home.points || 0) + 1;
          away.points = (away.points || 0) + 1;
        }
      } catch {
        continue;
      }
    }

    return Array.from(rowMap.values())
      .filter((row) => row.games > 0)
      .sort((a, b) => {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
        const bDiff = b.gf - b.ga;
        const aDiff = a.gf - a.ga;
        if (bDiff !== aDiff) return bDiff - aDiff;
        return a.team.localeCompare(b.team, 'de');
      })
      .map((row, index) => ({
        rank: index + 1,
        team: row.team,
        played: row.games,
        goalDiff: row.gf - row.ga,
        points: row.points || 0,
        source: 'print-view',
      }));
  }
}
