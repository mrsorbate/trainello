"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FussballDeClient = exports.buildTeamPageUrl = void 0;
const zod_1 = require("zod");
const http_1 = require("./http");
const parsers_1 = require("./parsers");
const sourceInputSchema = zod_1.z.object({
    teamPageUrl: zod_1.z.string().url(),
});
/**
 * Builds a fussball.de team page URL from a team-id.
 * Example: buildTeamPageUrl('014MNGMQ0A000000VS5489B4VSEV8ON0')
 *   => 'https://www.fussball.de/verein-mannschaft/-/team-id/014MNGMQ0A000000VS5489B4VSEV8ON0'
 */
const buildTeamPageUrl = (teamId) => `https://www.fussball.de/verein-mannschaft/-/team-id/${teamId}`;
exports.buildTeamPageUrl = buildTeamPageUrl;
class FussballDeClient {
    timeoutMs;
    constructor(options = {}) {
        this.timeoutMs = options.timeoutMs ?? 10000;
    }
    async getSpielplan(input) {
        const validated = sourceInputSchema.parse(input);
        const teamId = this.extractTeamId(validated.teamPageUrl);
        const url = teamId
            ? `https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/team-id/${teamId}`
            : validated.teamPageUrl;
        const html = await this.fetchHtml(url);
        return this.resolveMatchResults((0, parsers_1.parseMatches)(html, validated.teamPageUrl));
    }
    async getSpielplanForRange(input, range) {
        const validated = sourceInputSchema.parse(input);
        const teamId = this.extractTeamId(validated.teamPageUrl);
        const url = teamId
            ? `https://www.fussball.de/ajax.team.matchplan/-/mime-type/JSON/mode/PAGE/prev-season-allowed/false/show-filter/false/datum-von/${range.from}/datum-bis/${range.to}/match-type/-1/max/999/team-id/${teamId}`
            : validated.teamPageUrl;
        const raw = await this.fetchHtml(url);
        const html = this.extractHtmlFromAjaxPayload(raw);
        return this.resolveMatchResults((0, parsers_1.parseMatches)(html, validated.teamPageUrl));
    }
    async getLastMatches(input) {
        const validated = sourceInputSchema.parse(input);
        const teamId = this.extractTeamId(validated.teamPageUrl);
        const url = teamId
            ? `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`
            : validated.teamPageUrl;
        const html = await this.fetchHtml(url);
        return (0, parsers_1.parseMatches)(html, validated.teamPageUrl);
    }
    async getAllMatches(input) {
        const [lastMatches, nextMatches] = await Promise.all([
            this.getLastMatches(input),
            this.getSpielplan(input),
        ]);
        return [...lastMatches, ...nextMatches];
    }
    async getPrintableSeasonMatches(input, range) {
        const validated = sourceInputSchema.parse(input);
        const teamId = this.extractTeamId(validated.teamPageUrl);
        if (!teamId) {
            return [];
        }
        const competitionId = await this.resolvePrintableCompetitionId(validated.teamPageUrl);
        const baseUrl = `https://www.fussball.de/vereinsspielplan.druck/-/datum-bis/${range.to}/datum-von/${range.from}/match-type/-1/max/999/mode/PRINT/show-venues/false/team-id/${teamId}`;
        const candidateUrls = competitionId
            ? [`https://www.fussball.de/vereinsspielplan.druck/-/datum-bis/${range.to}/datum-von/${range.from}/id/${competitionId}/match-type/-1/max/999/mode/PRINT/show-venues/false/team-id/${teamId}`, baseUrl]
            : [baseUrl];
        for (const url of candidateUrls) {
            try {
                const html = await this.fetchHtml(url);
                const parsed = (0, parsers_1.parsePrintableMatches)(html);
                if (parsed.length === 0) {
                    continue;
                }
                return parsed.map((match) => ({
                    date: match.date,
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    competition: match.competition,
                    matchUrl: match.matchUrl,
                    source: 'print-view',
                }));
            }
            catch {
                continue;
            }
        }
        return [];
    }
    async getTabelle(input) {
        const result = await this.getTabelleWithDiagnostics(input);
        return result.standings;
    }
    async getTabelleWithDiagnostics(input) {
        const validated = sourceInputSchema.parse(input);
        const teamId = this.extractTeamId(validated.teamPageUrl);
        const attempts = [];
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
                const standings = (0, parsers_1.parseStandings)(html, url);
                attempts.push({
                    url,
                    ok: true,
                    rowCount: standings.length,
                });
                if (standings.length > 0) {
                    return { standings, attempts };
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                attempts.push({
                    url,
                    ok: false,
                    rowCount: 0,
                    error: message,
                });
            }
        }
        // Step 1: Use printable schedule to find match URLs, then extract the Staffel ID
        const printableUrl = teamId
            ? `https://www.fussball.de/vereinsspielplan.druck/-/datum-bis/${this.getCurrentDateIso()}/datum-von/2025-07-01/id/${this.extractCompetitionIdFromPrintableUrl(validated.teamPageUrl) || '00ES8GN9L800006MVV0AG08LVUPGND5I'}/match-type/-1/max/999/mode/PRINT/show-venues/false/team-id/${teamId}`
            : undefined;
        if (printableUrl) {
            try {
                const printableHtml = await this.fetchHtml(printableUrl);
                const printableMatches = (0, parsers_1.parsePrintableMatches)(printableHtml);
                attempts.push({
                    url: printableUrl,
                    ok: true,
                    rowCount: printableMatches.length,
                });
                // Step 2: From a league match URL, extract the Staffel hex ID
                // The Staffel ID can be found in spieltagsuebersicht links on a match page
                if (printableMatches.length > 0) {
                    const leagueMatches = printableMatches.filter((m) => {
                        const comp = String(m.competition || '').toLowerCase();
                        return /liga|klasse|oberliga|landesliga|verbandsliga|regionalliga|bundesliga|kreis/.test(comp)
                            && !/pokal|freundschaft|testspiel|privat|turnier|futsal/.test(comp);
                    });
                    const sampleMatchUrl = leagueMatches.find((m) => m.matchUrl)?.matchUrl
                        ?? printableMatches.find((m) => m.matchUrl)?.matchUrl;
                    if (sampleMatchUrl) {
                        try {
                            const matchHtml = await this.fetchHtml(sampleMatchUrl);
                            // spieltagsuebersicht URLs contain the Staffel hex ID
                            const staffelMatch = matchHtml.match(/spieltagsuebersicht\/[^'"]+staffel\/([A-Z0-9]{20,40})/i);
                            if (staffelMatch?.[1]) {
                                const staffelId = staffelMatch[1];
                                const staffelUrl = `https://www.fussball.de/spieltagsuebersicht/-/staffel/${staffelId}-G`;
                                attempts.push({ url: sampleMatchUrl, ok: true, rowCount: 1 });
                                try {
                                    const staffelHtml = await this.fetchHtml(staffelUrl);
                                    const standings = (0, parsers_1.parseStandings)(staffelHtml, staffelUrl);
                                    if (standings.length > 0) {
                                        attempts.push({ url: staffelUrl, ok: true, rowCount: standings.length });
                                        return { standings, attempts, printableMatches };
                                    }
                                }
                                catch (staffelError) {
                                    const msg = staffelError instanceof Error ? staffelError.message : String(staffelError);
                                    attempts.push({ url: staffelUrl, ok: false, rowCount: 0, error: msg });
                                }
                            }
                        }
                        catch (matchError) {
                            const msg = matchError instanceof Error ? matchError.message : String(matchError);
                            attempts.push({ url: sampleMatchUrl, ok: false, rowCount: 0, error: msg });
                        }
                    }
                    // Step 3: Fallback – reconstruct standings from individual match results
                    const standings = await this.buildStandingsFromPrintableMatches(printableMatches);
                    if (standings.length > 0) {
                        return { standings, attempts, printableMatches };
                    }
                }
            }
            catch (error) {
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
    async fetchHtml(url) {
        const client = (0, http_1.createHttpClient)(this.timeoutMs);
        const response = await client.get(url);
        if (typeof response.data === 'string') {
            return response.data;
        }
        try {
            return JSON.stringify(response.data);
        }
        catch {
            return String(response.data || '');
        }
    }
    extractHtmlFromAjaxPayload(raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.html === 'string' && parsed.html.trim().length > 0) {
                return parsed.html;
            }
        }
        catch {
            // Endpoint can return plain HTML in some modes.
        }
        return raw;
    }
    async resolveMatchResults(matches) {
        const resolved = await Promise.all(matches.map(async (match) => {
            if (match.result || !match.matchUrl) {
                return match;
            }
            try {
                const detailHtml = await this.fetchHtml(match.matchUrl);
                const scoreMatch = detailHtml.match(/\[(\d{1,2})\s*:\s*(\d{1,2})\]/)
                    || detailHtml.match(/(?:Endstand|Ergebnis|Spielstand)[^\d]{0,20}(\d{1,2})\s*:\s*(\d{1,2})/i);
                if (!scoreMatch) {
                    return match;
                }
                const homeScore = scoreMatch[1];
                const awayScore = scoreMatch[2];
                const parsedHome = Number.parseInt(String(homeScore), 10);
                const parsedAway = Number.parseInt(String(awayScore), 10);
                if (Number.isNaN(parsedHome) || Number.isNaN(parsedAway)) {
                    return match;
                }
                return {
                    ...match,
                    result: {
                        home: parsedHome,
                        away: parsedAway,
                    },
                };
            }
            catch {
                return match;
            }
        }));
        return resolved;
    }
    extractTeamId(teamPageUrl) {
        const match = teamPageUrl.match(/\/team-id\/([^/#!?]+)/i);
        return match?.[1];
    }
    extractCompetitionIdFromPrintableUrl(teamPageUrl) {
        const match = teamPageUrl.match(/\/id\/([^/#!?]+)/i);
        return match?.[1];
    }
    async resolvePrintableCompetitionId(teamPageUrl) {
        const fromUrl = this.extractCompetitionIdFromPrintableUrl(teamPageUrl);
        if (fromUrl) {
            return fromUrl;
        }
        try {
            const html = await this.fetchHtml(teamPageUrl);
            const fromPrintableLink = html.match(/vereinsspielplan\.druck\/[^"]*\/id\/([A-Z0-9]{16,40})/i)?.[1];
            if (fromPrintableLink) {
                return fromPrintableLink;
            }
        }
        catch {
            return undefined;
        }
        return undefined;
    }
    getCurrentDateIso() {
        return new Date().toISOString().slice(0, 10);
    }
    async buildStandingsFromPrintableMatches(matches) {
        const client = (0, http_1.createHttpClient)(this.timeoutMs);
        const isLeagueCompetition = (value) => {
            const normalized = String(value || '').toLowerCase();
            if (!normalized)
                return false;
            if (/pokal|freundschaft|testspiel|privat|turnier|futsal/i.test(normalized))
                return false;
            return /liga|klasse|oberliga|landesliga|verbandsliga|regionalliga|bundesliga|kreis/i.test(normalized);
        };
        const competitionCounts = new Map();
        for (const match of matches) {
            const competition = String(match.competition || '').trim();
            if (!competition)
                continue;
            competitionCounts.set(competition, (competitionCounts.get(competition) || 0) + 1);
        }
        const preferredCompetition = Array.from(competitionCounts.entries())
            .filter(([competition]) => isLeagueCompetition(competition))
            .sort((left, right) => right[1] - left[1])
            .map(([competition]) => competition)[0];
        const relevantMatches = matches.filter((match) => {
            if (preferredCompetition) {
                return String(match.competition || '').trim() === preferredCompetition;
            }
            return isLeagueCompetition(match.competition);
        });
        const targetMatches = relevantMatches.length > 0 ? relevantMatches : matches;
        const rowMap = new Map();
        const ensureRow = (teamName) => {
            const key = teamName.toLowerCase();
            if (!rowMap.has(key)) {
                rowMap.set(key, { team: teamName, source: 'print-view', gf: 0, ga: 0, games: 0, won: 0, draw: 0, lost: 0 });
            }
            return rowMap.get(key);
        };
        for (const match of targetMatches) {
            if (!match.matchUrl)
                continue;
            try {
                const detail = await client.get(match.matchUrl);
                const scoreMatch = detail.data.match(/\[(\d+)\s*:\s*(\d+)\]/);
                if (!scoreMatch)
                    continue;
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
                }
                else if (homeGoals < awayGoals) {
                    away.won += 1;
                    away.points = (away.points || 0) + 3;
                    home.lost += 1;
                }
                else {
                    home.draw += 1;
                    away.draw += 1;
                    home.points = (home.points || 0) + 1;
                    away.points = (away.points || 0) + 1;
                }
            }
            catch {
                continue;
            }
        }
        return Array.from(rowMap.values())
            .filter((row) => row.games > 0)
            .sort((a, b) => {
            if ((b.points || 0) !== (a.points || 0))
                return (b.points || 0) - (a.points || 0);
            const bDiff = b.gf - b.ga;
            const aDiff = a.gf - a.ga;
            if (bDiff !== aDiff)
                return bDiff - aDiff;
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
exports.FussballDeClient = FussballDeClient;
//# sourceMappingURL=client.js.map