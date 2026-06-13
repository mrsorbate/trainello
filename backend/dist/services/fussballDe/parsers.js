"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePrintableMatches = exports.parseStandings = exports.parseMatches = void 0;
const cheerio_1 = require("cheerio");
const toNumber = (input) => {
    const value = Number.parseInt(input.replace(/[^\d-]/g, ''), 10);
    return Number.isNaN(value) ? undefined : value;
};
const clean = (value) => value.replace(/\s+/g, ' ').trim();
const parseMatches = (html, source) => {
    const $ = (0, cheerio_1.load)(html);
    const matches = [];
    // Dedicated team matchplan endpoint uses row-competition + match rows.
    let currentDate;
    let currentCompetition;
    $('#id-team-matchplan-table table tbody tr').each((_, row) => {
        const rowNode = $(row);
        if (rowNode.hasClass('row-competition')) {
            const dateText = clean(rowNode.find('td.column-date').text());
            currentDate = dateText || undefined;
            const competitionText = clean(rowNode.find('td.column-team').text());
            currentCompetition = competitionText || undefined;
            return;
        }
        if (rowNode.find('td.column-club').length >= 2) {
            const clubCells = rowNode.find('td.column-club');
            const scoreLink = rowNode.find('td.column-score a[href*="/spiel/"]').attr('href') || undefined;
            const clubs = clubCells
                .find('.club-name')
                .map((_i, club) => clean($(club).text()))
                .get()
                .filter(Boolean);
            const badges = clubCells
                .map((_i, club) => {
                const imgSpan = $(club).find('[data-responsive-image]');
                return imgSpan.attr('data-responsive-image') || undefined;
            })
                .get()
                .filter((badge) => Boolean(badge));
            if (clubs.length >= 2) {
                const scoreText = clean(rowNode.find('td.column-score').text());
                const [leftRaw, rightRaw] = scoreText.includes(':') ? scoreText.split(':', 2) : ['', ''];
                const parsedHome = toNumber(leftRaw);
                const parsedAway = toNumber(rightRaw);
                const normalizedStatusText = !scoreText.includes(':') && scoreText ? scoreText : undefined;
                matches.push({
                    date: currentDate,
                    homeTeam: clubs[0],
                    awayTeam: clubs[1],
                    homeBadge: badges[0],
                    awayBadge: badges[1],
                    matchUrl: scoreLink
                        ? (scoreLink.startsWith('http') ? scoreLink : `https://www.fussball.de${scoreLink}`)
                        : undefined,
                    competition: currentCompetition,
                    statusText: normalizedStatusText,
                    result: scoreText.includes(':')
                        ? parsedHome !== undefined || parsedAway !== undefined
                            ? { home: parsedHome, away: parsedAway }
                            : undefined
                        : undefined,
                    source,
                });
            }
        }
    });
    if (matches.length > 0) {
        return matches;
    }
    // JSON-LD is often present and more stable than visual markup.
    $("script[type='application/ld+json']").each((_, script) => {
        const content = $(script).text().trim();
        if (!content)
            return;
        try {
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            items.forEach((item) => {
                const events = item?.itemListElement ?? item?.event ?? [];
                const normalized = Array.isArray(events) ? events : [events];
                normalized.forEach((event) => {
                    const parsedEvent = event;
                    const homeTeam = clean(parsedEvent.homeTeam?.name ?? parsedEvent.competitor?.[0]?.name ?? '');
                    const awayTeam = clean(parsedEvent.awayTeam?.name ?? parsedEvent.competitor?.[1]?.name ?? '');
                    if (!homeTeam || !awayTeam)
                        return;
                    matches.push({
                        date: parsedEvent.startDate,
                        homeTeam,
                        awayTeam,
                        competition: clean(parsedEvent.superEvent?.name ?? parsedEvent.eventStatus ?? '') || undefined,
                        statusText: clean(parsedEvent.eventStatus ?? '') || undefined,
                        venue: clean(parsedEvent.location?.name ?? '') || undefined,
                        source,
                    });
                });
            });
        }
        catch {
            // Ignore non-JSON content.
        }
    });
    if (matches.length > 0) {
        return matches;
    }
    $('table tr').each((_, row) => {
        const rowNode = $(row);
        const cells = $(row)
            .find('td')
            .map((_i, cell) => clean($(cell).text()))
            .get()
            .filter(Boolean);
        if (cells.length < 3)
            return;
        const pairing = cells.find((cell) => /\s+-\s+/.test(cell));
        if (!pairing)
            return;
        const [homeTeam, awayTeam] = pairing.split(/\s+-\s+/, 2).map(clean);
        const rowMatchUrl = rowNode.find('a[href*="/spiel/"]').attr('href');
        matches.push({
            date: cells[0],
            homeTeam,
            awayTeam,
            matchUrl: rowMatchUrl
                ? (rowMatchUrl.startsWith('http') ? rowMatchUrl : `https://www.fussball.de${rowMatchUrl}`)
                : undefined,
            competition: cells[1],
            statusText: cells[cells.length - 1].includes(':') ? undefined : cells[cells.length - 1],
            result: cells[cells.length - 1].includes(':')
                ? {
                    home: toNumber(cells[cells.length - 1].split(':')[0]),
                    away: toNumber(cells[cells.length - 1].split(':')[1]),
                }
                : undefined,
            source,
        });
    });
    return matches;
};
exports.parseMatches = parseMatches;
const parseStandings = (html, source) => {
    const $ = (0, cheerio_1.load)(html);
    const standings = [];
    $('table tr').each((_, row) => {
        const rowNode = $(row);
        const tds = rowNode.find('td');
        const cells = tds
            .map((_i, cell) => clean($(cell).text()))
            .get()
            .filter(Boolean);
        if (cells.length < 3)
            return;
        const rankCandidate = toNumber(cells[0]);
        const pointsCandidate = toNumber(cells[cells.length - 1]);
        const hasLikelyRank = rankCandidate !== undefined;
        const hasLikelyPoints = pointsCandidate !== undefined;
        if (!hasLikelyRank || !hasLikelyPoints)
            return;
        const teamCell = cells[1] || '';
        if (!teamCell || /^platz|rang$/i.test(teamCell))
            return;
        // Extract team badge URL from data-responsive-image or img[src*=getLogo]
        let badge;
        tds.each((_i, td) => {
            if (badge)
                return;
            const img = $(td).find('[data-responsive-image]');
            if (img.length) {
                badge = img.attr('data-responsive-image') || undefined;
                return;
            }
            const imgSrc = $(td).find('img[src*="getLogo"]');
            if (imgSrc.length) {
                badge = imgSrc.attr('src') || undefined;
            }
        });
        standings.push({
            rank: rankCandidate,
            team: teamCell,
            badge,
            played: toNumber(cells[2]),
            goalDiff: toNumber(cells[cells.length - 2]),
            points: pointsCandidate,
            source,
        });
    });
    return standings;
};
exports.parseStandings = parseStandings;
const parsePrintableMatches = (html) => {
    const $ = (0, cheerio_1.load)(html);
    const matches = [];
    let currentCompetition;
    let currentDate;
    $('table tr').each((_, row) => {
        const rowNode = $(row);
        if (rowNode.hasClass('row-competition')) {
            const dateText = clean(rowNode.find('td.column-date').text());
            currentDate = dateText || currentDate;
            const competitionText = clean(rowNode.find('td.column-team').text());
            currentCompetition = competitionText || currentCompetition;
            return;
        }
        const clubs = rowNode
            .find('td.column-club .club-name')
            .map((_i, club) => clean($(club).text()))
            .get()
            .filter(Boolean);
        const matchLink = rowNode.find('td.column-score a[href*="/spiel/"]').attr('href');
        if (clubs.length < 2 || !matchLink) {
            return;
        }
        const absoluteMatchUrl = matchLink.startsWith('http')
            ? matchLink
            : `https://www.fussball.de${matchLink}`;
        matches.push({
            date: clean(rowNode.find('td.column-score .info-text').text()) || currentDate,
            competition: currentCompetition,
            homeTeam: clubs[0],
            awayTeam: clubs[1],
            matchUrl: absoluteMatchUrl,
        });
    });
    return matches;
};
exports.parsePrintableMatches = parsePrintableMatches;
//# sourceMappingURL=parsers.js.map