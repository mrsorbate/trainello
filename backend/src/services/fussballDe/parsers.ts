import { load } from 'cheerio';
import type { TeamMatch, TeamStanding } from './types';

export type PrintableMatch = {
  date?: string;
  competition?: string;
  homeTeam: string;
  awayTeam: string;
  matchUrl?: string;
};

type EventLike = {
  startDate?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  competitor?: Array<{ name?: string }>;
  superEvent?: { name?: string };
  eventStatus?: string;
  location?: { name?: string };
};

const toNumber = (input: string): number | undefined => {
  const value = Number.parseInt(input.replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(value) ? undefined : value;
};

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const parseMatches = (html: string, source: string): TeamMatch[] => {
  const $ = load(html);
  const matches: TeamMatch[] = [];

  // Dedicated team matchplan endpoint uses row-competition + match rows.
  let currentDate: string | undefined;
  let currentCompetition: string | undefined;
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
      const clubs = rowNode
        .find('td.column-club .club-name')
        .map((_i, club) => clean($(club).text()))
        .get()
        .filter(Boolean);

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
    if (!content) return;

    try {
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      items.forEach((item) => {
        const events = item?.itemListElement ?? item?.event ?? [];
        const normalized = Array.isArray(events) ? events : [events];

        normalized.forEach((event) => {
          const parsedEvent = event as EventLike;
          const homeTeam = clean(
            parsedEvent.homeTeam?.name ?? parsedEvent.competitor?.[0]?.name ?? '',
          );
          const awayTeam = clean(
            parsedEvent.awayTeam?.name ?? parsedEvent.competitor?.[1]?.name ?? '',
          );
          if (!homeTeam || !awayTeam) return;

          matches.push({
            date: parsedEvent.startDate,
            homeTeam,
            awayTeam,
            competition:
              clean(parsedEvent.superEvent?.name ?? parsedEvent.eventStatus ?? '') || undefined,
            statusText: clean(parsedEvent.eventStatus ?? '') || undefined,
            venue: clean(parsedEvent.location?.name ?? '') || undefined,
            source,
          });
        });
      });
    } catch {
      // Ignore non-JSON content.
    }
  });

  if (matches.length > 0) {
    return matches;
  }

  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((_i, cell) => clean($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;

    const pairing = cells.find((cell) => /\s+-\s+/.test(cell));
    if (!pairing) return;

    const [homeTeam, awayTeam] = pairing.split(/\s+-\s+/, 2).map(clean);
    matches.push({
      date: cells[0],
      homeTeam,
      awayTeam,
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

export const parseStandings = (html: string, source: string): TeamStanding[] => {
  const $ = load(html);
  const standings: TeamStanding[] = [];

  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((_i, cell) => clean($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;

    const rankCandidate = toNumber(cells[0]);
    const pointsCandidate = toNumber(cells[cells.length - 1]);
    const hasLikelyRank = rankCandidate !== undefined;
    const hasLikelyPoints = pointsCandidate !== undefined;
    if (!hasLikelyRank || !hasLikelyPoints) return;

    const teamCell = cells[1] || '';
    if (!teamCell || /^platz|rang$/i.test(teamCell)) return;

    standings.push({
      rank: rankCandidate,
      team: teamCell,
      played: toNumber(cells[2]),
      goalDiff: toNumber(cells[cells.length - 2]),
      points: pointsCandidate,
      source,
    });
  });

  return standings;
};

export const parsePrintableMatches = (html: string): PrintableMatch[] => {
  const $ = load(html);
  const matches: PrintableMatch[] = [];

  let currentCompetition: string | undefined;
  let currentDate: string | undefined;

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
