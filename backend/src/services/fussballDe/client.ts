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
    const validated = sourceInputSchema.parse(input);
    const html = await this.fetchHtml(validated.teamPageUrl);
    return parseStandings(html, validated.teamPageUrl);
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
