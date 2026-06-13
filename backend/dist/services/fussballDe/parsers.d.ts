import type { TeamMatch, TeamStanding } from './types';
export type PrintableMatch = {
    date?: string;
    competition?: string;
    homeTeam: string;
    awayTeam: string;
    matchUrl?: string;
};
export declare const parseMatches: (html: string, source: string) => TeamMatch[];
export declare const parseStandings: (html: string, source: string) => TeamStanding[];
export declare const parsePrintableMatches: (html: string) => PrintableMatch[];
//# sourceMappingURL=parsers.d.ts.map