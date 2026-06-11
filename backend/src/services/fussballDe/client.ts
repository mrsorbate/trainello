import { z } from 'zod';
import { createHttpClient } from './http';
import { parseMatches, parseStandings } from './parsers';
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
}
