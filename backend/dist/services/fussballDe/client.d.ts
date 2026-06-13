import type { TeamMatch, TeamSourceInput, TeamStanding } from './types';
export type FussballDeClientOptions = {
    timeoutMs?: number;
};
export type MatchplanRange = {
    from: string;
    to: string;
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
export declare const buildTeamPageUrl: (teamId: string) => string;
export declare class FussballDeClient {
    private readonly timeoutMs;
    constructor(options?: FussballDeClientOptions);
    getSpielplan(input: TeamSourceInput): Promise<TeamMatch[]>;
    getSpielplanForRange(input: TeamSourceInput, range: MatchplanRange): Promise<TeamMatch[]>;
    getLastMatches(input: TeamSourceInput): Promise<TeamMatch[]>;
    getAllMatches(input: TeamSourceInput): Promise<TeamMatch[]>;
    getPrintableSeasonMatches(input: TeamSourceInput, range: {
        from: string;
        to: string;
    }): Promise<TeamMatch[]>;
    getTabelle(input: TeamSourceInput): Promise<TeamStanding[]>;
    getTabelleWithDiagnostics(input: TeamSourceInput): Promise<StandingsFetchResult>;
    private fetchHtml;
    private extractHtmlFromAjaxPayload;
    private resolveMatchResults;
    private extractTeamId;
    private extractCompetitionIdFromPrintableUrl;
    private resolvePrintableCompetitionId;
    private getCurrentDateIso;
    private buildStandingsFromPrintableMatches;
}
//# sourceMappingURL=client.d.ts.map