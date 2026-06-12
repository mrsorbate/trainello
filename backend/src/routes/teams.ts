import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CreateTeamDTO } from '../types';
import { FussballDeClient, buildTeamPageUrl } from '../services/fussballDe/client';
import { sendPushToUsers } from '../services/pushNotifications';

const router = Router();
const hasTeamsCalendarTokenColumn = (() => {
  try {
    const columns = db.prepare("PRAGMA table_info('teams')").all() as Array<{ name: string }>;
    return columns.some((column) => column.name === 'calendar_token');
  } catch {
    return false;
  }
})();

const hasEventScoreColumns = (() => {
  try {
    const columns = db.prepare("PRAGMA table_info('events')").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    return names.has('home_goals') && names.has('away_goals');
  } catch {
    return false;
  }
})();

const calendarTokenSelectExpression = hasTeamsCalendarTokenColumn
  ? 'calendar_token'
  : 'NULL AS calendar_token';

const LEGACY_CALENDAR_TOKEN_HEX_REGEX = /^[0-9a-f]{48}$/i;
const COMPACT_CALENDAR_TOKEN_BASE64URL_REGEX = /^[A-Za-z0-9_-]{32}$/;
const FUSSBALL_DE_ID_REGEX = /^[A-Z0-9]{16,40}$/;
const FUSSBALL_DE_URL_REGEX = /^https?:\/\/(?:www\.)?fussball\.de\//i;

const extractFussballDeTeamId = (source: string): string | null => {
  const fromPath = source.match(/\/team-id\/([^/#!?]+)/i)?.[1];
  if (fromPath && FUSSBALL_DE_ID_REGEX.test(fromPath.toUpperCase())) {
    return fromPath.toUpperCase();
  }

  const uppercase = source.toUpperCase();
  return FUSSBALL_DE_ID_REGEX.test(uppercase) ? uppercase : null;
};

const buildFussballDeTeamPageUrl = (source: string): string => {
  return FUSSBALL_DE_URL_REGEX.test(source.trim())
    ? source.trim()
    : buildTeamPageUrl(source.trim().toUpperCase());
};

const parseFussballDeSources = (value: unknown): string[] => {
  const raw = String(value || '');
  const parts = raw
    .split(/[\n,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const sources: string[] = [];
  for (const part of parts) {
    if (FUSSBALL_DE_URL_REGEX.test(part)) {
      sources.push(part);
      continue;
    }

    const ids = (part.toUpperCase().match(/[A-Z0-9]{16,40}/g) || [])
      .filter((entry) => FUSSBALL_DE_ID_REGEX.test(entry));
    sources.push(...ids);
  }

  return [...new Set(sources)];
};

const parseFussballDeIds = (value: unknown): string[] => {
  const sources = parseFussballDeSources(value);
  return [...new Set(sources.map((source) => extractFussballDeTeamId(source)).filter(Boolean) as string[])];
};

const parseFussballDeTeamNames = (value: unknown): string[] => {
  return [...new Set(
    String(value || '')
      .split(/[\n,;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  )];
};

const hexTokenToBase64Url = (token: string): string | null => {
  if (!LEGACY_CALENDAR_TOKEN_HEX_REGEX.test(token)) {
    return null;
  }

  return Buffer.from(token, 'hex')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const base64UrlTokenToHex = (token: string): string | null => {
  if (!COMPACT_CALENDAR_TOKEN_BASE64URL_REGEX.test(token)) {
    return null;
  }

  const padded = token + '='.repeat((4 - (token.length % 4)) % 4);
  const rawBase64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(rawBase64, 'base64');
  if (decoded.length !== 24) {
    return null;
  }
  return decoded.toString('hex');
};

const getCalendarTokenVariants = (token: string | null | undefined): Set<string> => {
  const normalized = String(token || '').trim();
  const variants = new Set<string>();
  if (!normalized) {
    return variants;
  }

  variants.add(normalized);

  const asBase64Url = hexTokenToBase64Url(normalized);
  if (asBase64Url) {
    variants.add(asBase64Url);
  }

  const asHex = base64UrlTokenToHex(normalized);
  if (asHex) {
    variants.add(asHex);
  }

  return variants;
};

const normalizeTeamNameInternal = (value: unknown): string => {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const parseInternalParticipants = (title: unknown): { homeTeam: string; awayTeam: string } | null => {
  const text = String(title || '').trim();
  const separator = ' - ';
  const separatorIndex = text.indexOf(separator);
  if (separatorIndex <= 0) return null;

  const homeTeam = text.slice(0, separatorIndex).trim();
  const awayTeam = text.slice(separatorIndex + separator.length).trim();
  if (!homeTeam || !awayTeam) return null;

  return { homeTeam, awayTeam };
};

const parseInternalScore = (title: unknown, description: unknown): { home: number; away: number } | null => {
  const scorePattern = /(\d{1,2})\s*[:\-]\s*(\d{1,2})/;
  const titleMatch = String(title || '').match(scorePattern);
  if (titleMatch) {
    return { home: parseInt(titleMatch[1], 10), away: parseInt(titleMatch[2], 10) };
  }

  const descriptionMatch = String(description || '').match(scorePattern);
  if (descriptionMatch) {
    return { home: parseInt(descriptionMatch[1], 10), away: parseInt(descriptionMatch[2], 10) };
  }

  return null;
};

const parseInternalLeagueName = (matches: any[]): string | null => {
  const normalize = (value: unknown): string => String(value || '').trim();

  for (const match of matches) {
    const description = normalize(match?.description);
    if (description) {
      const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        const competitionMatch = line.match(/^Wettbewerb:\s*(.+)$/i);
        if (competitionMatch?.[1]) {
          return competitionMatch[1].trim();
        }
      }
    }

    const fallbackCandidates = [
      match?.competition,
      match?.competition_short,
      match?.league,
      match?.staffel,
    ];
    for (const candidate of fallbackCandidates) {
      const value = normalize(candidate);
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const parseExternalLeagueNameFromPrintableMatches = (
  printableMatches: Array<{ competition?: string }> | undefined,
): string | null => {
  if (!Array.isArray(printableMatches) || printableMatches.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const match of printableMatches) {
    const competition = String(match?.competition || '').trim();
    if (!competition) continue;

    const normalized = competition.toLowerCase();
    if (/pokal|freundschaft|testspiel|privat|turnier|futsal/.test(normalized)) {
      continue;
    }

    counts.set(competition, (counts.get(competition) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([competition]) => competition)[0] || null;
};

const calculateRowMatchScore = (rowName: string, configuredName: string): number => {
  const normalizedRowName = normalizeTeamNameInternal(rowName);
  const normalizedConfiguredName = normalizeTeamNameInternal(configuredName);

  if (!normalizedRowName || !normalizedConfiguredName) {
    return 0;
  }

  if (normalizedRowName === normalizedConfiguredName) {
    return 100 + normalizedConfiguredName.length;
  }

  if (normalizedRowName.includes(normalizedConfiguredName)) {
    return 60 + normalizedConfiguredName.length;
  }

  return 0;
};

const parseExternalLeagueNameFromMatches = (
  matches: Array<{ competition?: string }>,
): string | null => {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const match of matches) {
    const competition = String(match?.competition || '').trim();
    if (!competition) continue;

    const normalized = competition.toLowerCase();
    if (/pokal|freundschaft|testspiel|privat|turnier|futsal/.test(normalized)) {
      continue;
    }

    counts.set(competition, (counts.get(competition) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([competition]) => competition)[0] || null;
};

const buildInternalTableRows = (team: any, matches: any[]) => {
  const rows = new Map<string, { team: string; games: number; won: number; draw: number; lost: number; gf: number; ga: number; points: number }>();

  const ensureRow = (teamName: string) => {
    const key = normalizeTeamNameInternal(teamName);
    if (!rows.has(key)) {
      rows.set(key, { team: teamName, games: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    }
    return rows.get(key)!;
  };

  const ownTeamName = String(team?.fussballde_team_name || team?.name || '').trim();

  const parseParticipantFallback = (match: any): { homeTeam: string; awayTeam: string } | null => {
    const parsedTitle = parseInternalParticipants(match?.title);
    if (parsedTitle) {
      return parsedTitle;
    }

    const opponent = String(match?.title || '')
      .replace(/^spiel\s+gegen\s+/i, '')
      .trim();
    if (!opponent || !ownTeamName) {
      return null;
    }

    const isHomeMatch = Number(match?.is_home_match) === 1;
    return isHomeMatch
      ? { homeTeam: ownTeamName, awayTeam: opponent }
      : { homeTeam: opponent, awayTeam: ownTeamName };
  };

  const parseStructuredScore = (match: any): { home: number; away: number } | null => {
    const home = Number(match?.home_goals);
    const away = Number(match?.away_goals);
    if (Number.isInteger(home) && Number.isInteger(away) && home >= 0 && away >= 0) {
      return { home, away };
    }
    return null;
  };

  for (const match of matches) {
    const participants = parseParticipantFallback(match);
    const score = parseStructuredScore(match) || parseInternalScore(match.title, match.description);
    if (!participants || !score) continue;

    const home = ensureRow(participants.homeTeam);
    const away = ensureRow(participants.awayTeam);

    home.games += 1;
    away.games += 1;
    home.gf += score.home;
    home.ga += score.away;
    away.gf += score.away;
    away.ga += score.home;

    if (score.home > score.away) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (score.home < score.away) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.draw += 1;
      away.draw += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  if (ownTeamName) ensureRow(ownTeamName);

  return Array.from(rows.values())
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const bDiff = b.gf - b.ga;
      const aDiff = a.gf - a.ga;
      if (bDiff !== aDiff) return bDiff - aDiff;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.localeCompare(b.team, 'de');
    })
    .map((row, index) => ({
      place: index + 1,
      team: row.team,
      games: row.games,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      goal: `${row.gf}:${row.ga}`,
      points: row.points,
      img: null,
    }));
};

type HomeVenue = {
  name: string;
  street?: string;
  zip_city?: string;
  pitch_type?: string;
};

const normalizeHomeVenues = (input: unknown): HomeVenue[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const cleaned = input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const source = entry as Record<string, unknown>;
      const name = String(source.name || '').trim();
      const street = String(source.street || '').trim();
      const zipCityRaw = source.zip_city ?? source.zipCity;
      const zip_city = String(zipCityRaw || '').trim();
      const pitchTypeRaw = source.pitch_type ?? source.pitchType;
      const pitch_type = String(pitchTypeRaw || '').trim();

      if (!name && !street && !zip_city && !pitch_type) {
        return null;
      }

      return {
        name,
        street: street || undefined,
        zip_city: zip_city || undefined,
        pitch_type: pitch_type || undefined,
      };
    })
    .filter(Boolean) as HomeVenue[];

  return cleaned
    .filter((venue) => venue.name.length > 0)
    .slice(0, 20)
    .map((venue) => ({
      name: venue.name.slice(0, 120),
      street: venue.street?.slice(0, 200),
      zip_city: venue.zip_city?.slice(0, 120),
      pitch_type: venue.pitch_type?.slice(0, 40),
    }));
};

const parseHomeVenuesFromDb = (rawValue: unknown): HomeVenue[] => {
  if (!rawValue || typeof rawValue !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return normalizeHomeVenues(parsed);
  } catch {
    return [];
  }
};

const resolveDefaultHomeVenue = (venues: HomeVenue[], defaultName: unknown): HomeVenue | null => {
  if (!venues.length) {
    return null;
  }

  const normalizedDefaultName = String(defaultName || '').trim();
  if (!normalizedDefaultName) {
    return venues[0] || null;
  }

  return venues.find((venue) => venue.name === normalizedDefaultName) || venues[0] || null;
};

const escapeICalText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const formatICalDate = (value: unknown): string | null => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const getCalendarUrls = (req: AuthRequest | any, teamId: number, token: string | null | undefined) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return { calendar_feed_url: null, calendar_webcal_url: null };
  }

  const compactToken = hexTokenToBase64Url(normalizedToken) || normalizedToken;

  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = String(req.get('host') || '').trim();
  if (!host) {
    return { calendar_feed_url: null, calendar_webcal_url: null };
  }

  const calendarFeedUrl = `${protocol}://${host}/api/teams/${teamId}/calendar.ics?token=${encodeURIComponent(compactToken)}`;
  const calendarWebcalUrl = calendarFeedUrl.replace(/^https?:\/\//i, 'webcal://');
  return {
    calendar_feed_url: calendarFeedUrl,
    calendar_webcal_url: calendarWebcalUrl,
  };
};

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for team picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'team-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

router.get('/:id/calendar.ics', (req, res) => {
  try {
    if (!hasTeamsCalendarTokenColumn) {
      return res.status(404).json({ error: 'Calendar export is not available' });
    }

    const teamId = parseInt(req.params.id, 10);
    const token = String(req.query.token || '').trim();

    if (!Number.isFinite(teamId) || teamId <= 0 || !token) {
      return res.status(400).json({ error: 'Invalid calendar request' });
    }

    const team = db.prepare(`SELECT id, name, ${calendarTokenSelectExpression} FROM teams WHERE id = ?`).get(teamId) as any;
    const requestedTokenVariants = getCalendarTokenVariants(token);
    const storedTokenVariants = getCalendarTokenVariants(String(team?.calendar_token || ''));
    const isTokenValid = Array.from(requestedTokenVariants).some((candidate) => storedTokenVariants.has(candidate));

    if (!team || !isTokenValid) {
      return res.status(403).json({ error: 'Invalid calendar token' });
    }

    const events = db.prepare(
      `SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.location_venue, e.location_street, e.location_zip_city, e.location, e.updated_at
       FROM events e
       INNER JOIN event_teams et ON et.event_id = e.id
       WHERE et.team_id = ?
       ORDER BY e.start_time ASC`
    ).all(teamId) as Array<any>;

    const deletedEvents = db.prepare(
      `SELECT event_id, title, start_time, end_time, deleted_at
       FROM deleted_events
       WHERE team_id = ?
       ORDER BY deleted_at ASC`
    ).all(teamId) as Array<any>;

    const nowStamp = formatICalDate(new Date().toISOString()) || '19700101T000000Z';
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//teamvoteplus//Team Calendar//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeICalText(team.name || `Team ${teamId}`)}`,
      'X-PUBLISHED-TTL:PT15M',
    ];

    for (const event of events) {
      const dtStart = formatICalDate(event.start_time);
      const dtEnd = formatICalDate(event.end_time);
      if (!dtStart || !dtEnd) {
        continue;
      }

      const dtStamp = formatICalDate(event.updated_at) || nowStamp;
      const location = [event.location_venue, event.location_street, event.location_zip_city]
        .filter((value) => String(value || '').trim().length > 0)
        .join(', ') || String(event.location || '').trim();

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:teamvoteplus-team${teamId}-event${event.id}@teamvoteplus.app`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
      lines.push(`SUMMARY:${escapeICalText(event.title || 'Termin')}`);
      if (event.description) {
        lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
      }
      if (location) {
        lines.push(`LOCATION:${escapeICalText(location)}`);
      }
      lines.push('END:VEVENT');
    }

    for (const deletedEvent of deletedEvents) {
      const dtStamp = formatICalDate(deletedEvent.deleted_at) || nowStamp;
      const dtStart = formatICalDate(deletedEvent.start_time);
      const dtEnd = formatICalDate(deletedEvent.end_time);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:teamvoteplus-team${teamId}-event${deletedEvent.event_id}@teamvoteplus.app`);
      lines.push(`DTSTAMP:${dtStamp}`);
      if (dtStart) {
        lines.push(`DTSTART:${dtStart}`);
      }
      if (dtEnd) {
        lines.push(`DTEND:${dtEnd}`);
      }
      lines.push(`SUMMARY:${escapeICalText(deletedEvent.title || 'Termin')}`);
      lines.push('STATUS:CANCELLED');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="team-${teamId}.ics"`);
    return res.status(200).send(lines.join('\r\n'));
  } catch (error) {
    console.error('Calendar export error:', error);
    return res.status(500).json({ error: 'Failed to generate calendar feed' });
  }
});

// All routes require authentication
router.use(authenticate);

// Get all teams for current user
router.get('/', (req: AuthRequest, res) => {
  try {
    const teams = db.prepare(`
      SELECT
        t.*,
        tm.role as my_role,
        tm.trainer_custom_team_name,
        COALESCE(NULLIF(TRIM(tm.trainer_custom_team_name), ''), t.name) as display_name,
        COALESCE(NULLIF(TRIM(tm.trainer_custom_team_name), ''), t.name) as name
      FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ?
      ORDER BY COALESCE(NULLIF(TRIM(tm.trainer_custom_team_name), ''), t.name)
    `).all(req.user!.id);

    res.json(teams);
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get team details
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);
    
    // Check if user is member
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const team = db.prepare(`
      SELECT
        t.*,
        tm.trainer_custom_team_name,
        COALESCE(NULLIF(TRIM(tm.trainer_custom_team_name), ''), t.name) as display_name,
        COALESCE(NULLIF(TRIM(tm.trainer_custom_team_name), ''), t.name) as name
      FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE t.id = ? AND tm.user_id = ?
      LIMIT 1
    `).get(teamId, req.user!.id);
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(team);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Get team settings
router.get('/:id/settings', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const settings = db.prepare(
      `SELECT id, fussballde_id, fussballde_team_name, default_response, default_rsvp_deadline_hours,
              default_rsvp_deadline_hours_training, default_rsvp_deadline_hours_match, default_rsvp_deadline_hours_other,
              default_arrival_minutes, default_arrival_minutes_training, default_arrival_minutes_match, default_arrival_minutes_other,
              default_duration_minutes, default_duration_minutes_training, default_duration_minutes_match, default_duration_minutes_other,
              home_venues, default_home_venue_name, ${calendarTokenSelectExpression}
       FROM teams WHERE id = ?`
    ).get(teamId) as any;

    const calendarUrls = getCalendarUrls(req, teamId, settings?.calendar_token);

    if (!settings) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.json({
      ...settings,
      fussballde_ids: parseFussballDeSources(settings.fussballde_id),
      fussballde_team_names: parseFussballDeTeamNames(settings.fussballde_team_name),
      home_venues: parseHomeVenuesFromDb(settings.home_venues),
      default_home_venue_name: settings.default_home_venue_name || null,
      calendar_token: undefined,
      ...calendarUrls,
    });
  } catch (error) {
    console.error('Get team settings error:', error);
    return res.status(500).json({ error: 'Failed to fetch team settings' });
  }
});

// Update team settings (trainers only)
router.put('/:id/settings', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const hasFussballId = Object.prototype.hasOwnProperty.call(req.body, 'fussballde_id');
    const hasFussballIds = Object.prototype.hasOwnProperty.call(req.body, 'fussballde_ids');
    const hasFussballTeamName = Object.prototype.hasOwnProperty.call(req.body, 'fussballde_team_name');
    const hasFussballTeamNames = Object.prototype.hasOwnProperty.call(req.body, 'fussballde_team_names');
    const hasDefaultResponse = Object.prototype.hasOwnProperty.call(req.body, 'default_response');
    const hasDefaultRsvpDeadlineHours = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours');
    const hasDefaultRsvpDeadlineHoursTraining = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours_training');
    const hasDefaultRsvpDeadlineHoursMatch = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours_match');
    const hasDefaultRsvpDeadlineHoursOther = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours_other');
    const hasDefaultArrivalMinutes = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes');
    const hasDefaultArrivalMinutesTraining = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes_training');
    const hasDefaultArrivalMinutesMatch = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes_match');
    const hasDefaultArrivalMinutesOther = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes_other');
    const hasDefaultDurationMinutes = Object.prototype.hasOwnProperty.call(req.body, 'default_duration_minutes');
    const hasDefaultDurationMinutesTraining = Object.prototype.hasOwnProperty.call(req.body, 'default_duration_minutes_training');
    const hasDefaultDurationMinutesMatch = Object.prototype.hasOwnProperty.call(req.body, 'default_duration_minutes_match');
    const hasDefaultDurationMinutesOther = Object.prototype.hasOwnProperty.call(req.body, 'default_duration_minutes_other');
    const hasHomeVenues = Object.prototype.hasOwnProperty.call(req.body, 'home_venues');
    const hasDefaultHomeVenueName = Object.prototype.hasOwnProperty.call(req.body, 'default_home_venue_name');

    const {
      fussballde_id,
      fussballde_ids,
      fussballde_team_name,
      fussballde_team_names,
      default_response,
      default_rsvp_deadline_hours,
      default_rsvp_deadline_hours_training,
      default_rsvp_deadline_hours_match,
      default_rsvp_deadline_hours_other,
      default_arrival_minutes,
      default_arrival_minutes_training,
      default_arrival_minutes_match,
      default_arrival_minutes_other,
      default_duration_minutes,
      default_duration_minutes_training,
      default_duration_minutes_match,
      default_duration_minutes_other,
      home_venues,
      default_home_venue_name,
    } = req.body as {
      fussballde_id?: string;
      fussballde_ids?: string[];
      fussballde_team_name?: string;
      fussballde_team_names?: string[];
      default_response?: string;
      default_rsvp_deadline_hours?: number | string | null;
      default_rsvp_deadline_hours_training?: number | string | null;
      default_rsvp_deadline_hours_match?: number | string | null;
      default_rsvp_deadline_hours_other?: number | string | null;
      default_arrival_minutes?: number | string | null;
      default_arrival_minutes_training?: number | string | null;
      default_arrival_minutes_match?: number | string | null;
      default_arrival_minutes_other?: number | string | null;
      default_duration_minutes?: number | string | null;
      default_duration_minutes_training?: number | string | null;
      default_duration_minutes_match?: number | string | null;
      default_duration_minutes_other?: number | string | null;
      home_venues?: Array<{ name: string; street?: string; zip_city?: string; pitch_type?: string }>;
      default_home_venue_name?: string | null;
    };

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can update team settings' });
    }

    const team = db.prepare(
            `SELECT id, fussballde_id, fussballde_team_name, default_response, default_rsvp_deadline_hours,
              default_rsvp_deadline_hours_training, default_rsvp_deadline_hours_match, default_rsvp_deadline_hours_other,
              default_arrival_minutes, default_arrival_minutes_training, default_arrival_minutes_match, default_arrival_minutes_other,
              default_duration_minutes, default_duration_minutes_training, default_duration_minutes_match, default_duration_minutes_other,
              home_venues, default_home_venue_name
       FROM teams WHERE id = ?`
    ).get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    let nextFussballId = team.fussballde_id as string | null;
    if (hasFussballId || hasFussballIds) {
      const rawFussballIdInput = hasFussballIds
        ? (Array.isArray(fussballde_ids) ? fussballde_ids.join(',') : String(fussballde_ids || ''))
        : String(fussballde_id || '').trim();
      const normalizedFussballIds = parseFussballDeSources(rawFussballIdInput);

      if (rawFussballIdInput && normalizedFussballIds.length === 0) {
        return res.status(400).json({ error: 'Ungültiges fussball.de Format (ID oder URL)' });
      }

      nextFussballId = normalizedFussballIds.length > 0 ? normalizedFussballIds.join(',') : null;
    }

    let nextFussballTeamName = team.fussballde_team_name as string | null;
    if (hasFussballTeamName || hasFussballTeamNames) {
      const rawTeamNameInput = hasFussballTeamNames
        ? (Array.isArray(fussballde_team_names) ? fussballde_team_names.join(',') : String(fussballde_team_names || ''))
        : String(fussballde_team_name || '');
      const normalizedTeamNames = parseFussballDeTeamNames(rawTeamNameInput);
      nextFussballTeamName = normalizedTeamNames.length > 0 ? normalizedTeamNames.join(',') : null;
    }

    const allowedDefaultResponses = new Set(['pending', 'accepted', 'tentative', 'declined']);
    let nextDefaultResponse = team.default_response as string | null;
    if (hasDefaultResponse) {
      const normalizedDefaultResponse = String(default_response || '').trim().toLowerCase() || 'pending';
      if (!allowedDefaultResponses.has(normalizedDefaultResponse)) {
        return res.status(400).json({ error: 'Ungültige Standard-Rückmeldung' });
      }
      nextDefaultResponse = normalizedDefaultResponse;
    }

    let nextDefaultRsvpDeadlineHours = team.default_rsvp_deadline_hours as number | null;
    if (hasDefaultRsvpDeadlineHours) {
      let normalizedRsvpDeadlineHours: number | null = null;
      if (default_rsvp_deadline_hours !== null && default_rsvp_deadline_hours !== undefined && String(default_rsvp_deadline_hours).trim() !== '') {
        normalizedRsvpDeadlineHours = parseInt(String(default_rsvp_deadline_hours), 10);
        if (!Number.isFinite(normalizedRsvpDeadlineHours) || normalizedRsvpDeadlineHours < 0 || normalizedRsvpDeadlineHours > 168) {
          return res.status(400).json({ error: 'Standard-Rückmeldefrist muss zwischen 0 und 168 Stunden liegen' });
        }
      }
      nextDefaultRsvpDeadlineHours = normalizedRsvpDeadlineHours;
    }

    const normalizeRsvpHours = (value: number | string | null | undefined): number | null | 'invalid' => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 168) {
        return 'invalid';
      }
      return parsed;
    };

    let nextDefaultRsvpDeadlineHoursTraining = team.default_rsvp_deadline_hours_training as number | null;
    if (hasDefaultRsvpDeadlineHoursTraining) {
      const normalized = normalizeRsvpHours(default_rsvp_deadline_hours_training);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Rückmeldefrist Training muss zwischen 0 und 168 Stunden liegen' });
      }
      nextDefaultRsvpDeadlineHoursTraining = normalized;
    }

    let nextDefaultRsvpDeadlineHoursMatch = team.default_rsvp_deadline_hours_match as number | null;
    if (hasDefaultRsvpDeadlineHoursMatch) {
      const normalized = normalizeRsvpHours(default_rsvp_deadline_hours_match);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Rückmeldefrist Spiel muss zwischen 0 und 168 Stunden liegen' });
      }
      nextDefaultRsvpDeadlineHoursMatch = normalized;
    }

    let nextDefaultRsvpDeadlineHoursOther = team.default_rsvp_deadline_hours_other as number | null;
    if (hasDefaultRsvpDeadlineHoursOther) {
      const normalized = normalizeRsvpHours(default_rsvp_deadline_hours_other);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Rückmeldefrist Sonstiges muss zwischen 0 und 168 Stunden liegen' });
      }
      nextDefaultRsvpDeadlineHoursOther = normalized;
    }

    let nextDefaultArrivalMinutes = team.default_arrival_minutes as number | null;
    if (hasDefaultArrivalMinutes) {
      let normalizedArrivalMinutes: number | null = null;
      if (default_arrival_minutes !== null && default_arrival_minutes !== undefined && String(default_arrival_minutes).trim() !== '') {
        normalizedArrivalMinutes = parseInt(String(default_arrival_minutes), 10);
        if (!Number.isFinite(normalizedArrivalMinutes) || normalizedArrivalMinutes < 0 || normalizedArrivalMinutes > 240) {
          return res.status(400).json({ error: 'Standard-Treffpunkt Minuten muss zwischen 0 und 240 liegen' });
        }
      }
      nextDefaultArrivalMinutes = normalizedArrivalMinutes;
    }

    const normalizeArrivalMinutes = (value: number | string | null | undefined): number | null | 'invalid' => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 240) {
        return 'invalid';
      }
      return parsed;
    };

    let nextDefaultArrivalMinutesTraining = team.default_arrival_minutes_training as number | null;
    if (hasDefaultArrivalMinutesTraining) {
      const normalized = normalizeArrivalMinutes(default_arrival_minutes_training);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Treffpunkt Minuten Training muss zwischen 0 und 240 liegen' });
      }
      nextDefaultArrivalMinutesTraining = normalized;
    }

    let nextDefaultArrivalMinutesMatch = team.default_arrival_minutes_match as number | null;
    if (hasDefaultArrivalMinutesMatch) {
      const normalized = normalizeArrivalMinutes(default_arrival_minutes_match);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Treffpunkt Minuten Spiel muss zwischen 0 und 240 liegen' });
      }
      nextDefaultArrivalMinutesMatch = normalized;
    }

    let nextDefaultArrivalMinutesOther = team.default_arrival_minutes_other as number | null;
    if (hasDefaultArrivalMinutesOther) {
      const normalized = normalizeArrivalMinutes(default_arrival_minutes_other);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Treffpunkt Minuten Sonstiges muss zwischen 0 und 240 liegen' });
      }
      nextDefaultArrivalMinutesOther = normalized;
    }

    let nextDefaultDurationMinutes = team.default_duration_minutes as number | null;
    if (hasDefaultDurationMinutes) {
      let normalizedDurationMinutes: number | null = null;
      if (default_duration_minutes !== null && default_duration_minutes !== undefined && String(default_duration_minutes).trim() !== '') {
        normalizedDurationMinutes = parseInt(String(default_duration_minutes), 10);
        if (!Number.isFinite(normalizedDurationMinutes) || normalizedDurationMinutes < 5 || normalizedDurationMinutes > 480) {
          return res.status(400).json({ error: 'Standard-Dauer muss zwischen 5 und 480 Minuten liegen' });
        }
      }
      nextDefaultDurationMinutes = normalizedDurationMinutes;
    }

    const normalizeDurationMinutes = (value: number | string | null | undefined): number | null | 'invalid' => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 5 || parsed > 480) {
        return 'invalid';
      }
      return parsed;
    };

    let nextDefaultDurationMinutesTraining = team.default_duration_minutes_training as number | null;
    if (hasDefaultDurationMinutesTraining) {
      const normalized = normalizeDurationMinutes(default_duration_minutes_training);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Dauer Training muss zwischen 5 und 480 Minuten liegen' });
      }
      nextDefaultDurationMinutesTraining = normalized;
    }

    let nextDefaultDurationMinutesMatch = team.default_duration_minutes_match as number | null;
    if (hasDefaultDurationMinutesMatch) {
      const normalized = normalizeDurationMinutes(default_duration_minutes_match);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Dauer Spiel muss zwischen 5 und 480 Minuten liegen' });
      }
      nextDefaultDurationMinutesMatch = normalized;
    }

    let nextDefaultDurationMinutesOther = team.default_duration_minutes_other as number | null;
    if (hasDefaultDurationMinutesOther) {
      const normalized = normalizeDurationMinutes(default_duration_minutes_other);
      if (normalized === 'invalid') {
        return res.status(400).json({ error: 'Standard-Dauer Sonstiges muss zwischen 5 und 480 Minuten liegen' });
      }
      nextDefaultDurationMinutesOther = normalized;
    }

    let nextHomeVenues = parseHomeVenuesFromDb(team.home_venues);
    if (hasHomeVenues) {
      nextHomeVenues = normalizeHomeVenues(home_venues);
    }

    let nextDefaultHomeVenueName = String(team.default_home_venue_name || '').trim() || null;
    if (hasDefaultHomeVenueName) {
      const normalizedDefaultHomeVenueName = String(default_home_venue_name || '').trim();
      nextDefaultHomeVenueName = normalizedDefaultHomeVenueName || null;
    }

    if (nextDefaultHomeVenueName && !nextHomeVenues.some((venue) => venue.name === nextDefaultHomeVenueName)) {
      return res.status(400).json({ error: 'Standardplatz muss in der Platzliste vorhanden sein' });
    }

    if (!nextDefaultHomeVenueName && nextHomeVenues.length > 0) {
      nextDefaultHomeVenueName = nextHomeVenues[0].name;
    }

    db.prepare(
      `UPDATE teams
       SET fussballde_id = ?,
           fussballde_team_name = ?,
           default_response = ?,
           default_rsvp_deadline_hours = ?,
           default_rsvp_deadline_hours_training = ?,
           default_rsvp_deadline_hours_match = ?,
           default_rsvp_deadline_hours_other = ?,
           default_arrival_minutes = ?,
             default_arrival_minutes_training = ?,
             default_arrival_minutes_match = ?,
             default_arrival_minutes_other = ?,
           default_duration_minutes = ?,
             default_duration_minutes_training = ?,
             default_duration_minutes_match = ?,
             default_duration_minutes_other = ?,
           home_venues = ?,
           default_home_venue_name = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      nextFussballId,
      nextFussballTeamName,
      nextDefaultResponse || 'pending',
      nextDefaultRsvpDeadlineHours,
      nextDefaultRsvpDeadlineHoursTraining,
      nextDefaultRsvpDeadlineHoursMatch,
      nextDefaultRsvpDeadlineHoursOther,
      nextDefaultArrivalMinutes,
      nextDefaultArrivalMinutesTraining,
      nextDefaultArrivalMinutesMatch,
      nextDefaultArrivalMinutesOther,
      nextDefaultDurationMinutes,
      nextDefaultDurationMinutesTraining,
      nextDefaultDurationMinutesMatch,
      nextDefaultDurationMinutesOther,
      JSON.stringify(nextHomeVenues),
      nextDefaultHomeVenueName,
      teamId
    );

    const updatedSettings = db.prepare(
      `SELECT id, fussballde_id, fussballde_team_name, default_response, default_rsvp_deadline_hours,
              default_rsvp_deadline_hours_training, default_rsvp_deadline_hours_match, default_rsvp_deadline_hours_other,
              default_arrival_minutes, default_arrival_minutes_training, default_arrival_minutes_match, default_arrival_minutes_other,
              default_duration_minutes, default_duration_minutes_training, default_duration_minutes_match, default_duration_minutes_other,
              home_venues, default_home_venue_name, ${calendarTokenSelectExpression}
       FROM teams WHERE id = ?`
    ).get(teamId) as any;

    const calendarUrls = getCalendarUrls(req, teamId, updatedSettings?.calendar_token);

    return res.json({
      ...updatedSettings,
      fussballde_ids: parseFussballDeSources(updatedSettings.fussballde_id),
      fussballde_team_names: parseFussballDeTeamNames(updatedSettings.fussballde_team_name),
      home_venues: parseHomeVenuesFromDb(updatedSettings.home_venues),
      default_home_venue_name: updatedSettings.default_home_venue_name || null,
      calendar_token: undefined,
      ...calendarUrls,
    });
  } catch (error) {
    console.error('Update team settings error:', error);
    return res.status(500).json({ error: 'Failed to update team settings' });
  }
});

// fussball.de game import using the local scraping client
export const runTeamGameImport = async (teamId: number, createdByUserId: number) => {
  const team = db.prepare(
    `SELECT id, name, fussballde_id, fussballde_team_name,
            default_response, default_rsvp_deadline_hours_match, default_rsvp_deadline_hours,
            default_arrival_minutes_match, default_arrival_minutes,
            home_venues, default_home_venue_name
     FROM teams WHERE id = ?`
  ).get(teamId) as any;

  if (!team) throw new Error('TEAM_NOT_FOUND');

  const fussballdeSources = parseFussballDeSources(team.fussballde_id);

  if (fussballdeSources.length === 0) {
    return {
      success: true, imported: 0, updated: 0, skipped: 0,
      created: [], updatedItems: [], skippedDetails: [],
      mode: 'internal',
      message: 'Für dieses Team ist keine fussball.de Quelle (ID/URL) hinterlegt. Spiele werden intern verwaltet.',
    };
  }

  const client = new FussballDeClient({ timeoutMs: 15000 });
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const printableRange = {
    from: `${seasonStartYear}-07-01`,
    to: `${seasonStartYear + 2}-06-30`,
  };

  const matchesBySource = await Promise.all(
    fussballdeSources.map(async (sourceEntry) => {
      const teamPageUrl = buildFussballDeTeamPageUrl(sourceEntry);
      try {
        const [nextMatchesResult, printableMatchesResult] = await Promise.allSettled([
          client.getSpielplanForRange({ teamPageUrl }, printableRange),
          client.getPrintableSeasonMatches({ teamPageUrl }, printableRange),
        ]);

        const nextMatches = nextMatchesResult.status === 'fulfilled' ? nextMatchesResult.value : [];
        const printableMatches = printableMatchesResult.status === 'fulfilled' ? printableMatchesResult.value : [];

        const sourceMatches = [...nextMatches, ...printableMatches];
        if (sourceMatches.length === 0) {
          console.warn(`fussball.de Import: keine Spiele für Quelle ${sourceEntry} gefunden`);
        }
        return sourceMatches.map((match) => ({ ...match, __sourceId: sourceEntry }));
      } catch (error) {
        console.warn(`fussball.de Import fehlgeschlagen für Quelle ${sourceEntry}:`, error);
        return [];
      }
    })
  );

  const seenMatchKeys = new Set<string>();
  const matches = matchesBySource
    .flat()
    .filter((match: any) => {
      const key = [
        String(match?.date || ''),
        String(match?.homeTeam || ''),
        String(match?.awayTeam || ''),
        String(match?.competition || ''),
      ].join('|');
      if (seenMatchKeys.has(key)) return false;
      seenMatchKeys.add(key);
      return true;
    });

  const parseFussballDeDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    const cleaned = dateStr.replace(/\s+/g, ' ').trim();

    // Supports: dd.mm.yyyy, dd.mm.yy and dd.mm. (year optional, time optional)
    const germanMatch = cleaned.match(/(\d{1,2})\.(\d{1,2})\.(\d{0,4})(?:[^0-9]*(\d{1,2}):(\d{2}))?/);
    if (germanMatch) {
      const d = parseInt(germanMatch[1], 10);
      const m = parseInt(germanMatch[2], 10) - 1;
      const yearRaw = String(germanMatch[3] || '').trim();
      const h = germanMatch[4] !== undefined ? parseInt(germanMatch[4], 10) : 19;
      const min = germanMatch[5] !== undefined ? parseInt(germanMatch[5], 10) : 0;

      const tryBuild = (year: number): Date | null => {
        const candidate = new Date(year, m, d, h, min, 0);
        return Number.isNaN(candidate.getTime()) ? null : candidate;
      };

      if (yearRaw.length === 4) {
        const explicitYear = parseInt(yearRaw, 10);
        const date = tryBuild(explicitYear);
        if (date) return date;
      }

      if (yearRaw.length === 2) {
        const shortYear = parseInt(yearRaw, 10);
        const explicitYear = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
        const date = tryBuild(explicitYear);
        if (date) return date;
      }

      // Missing or invalid year: infer from current+next season window.
      const candidateYears = [seasonStartYear, seasonStartYear + 1, seasonStartYear + 2];
      const seasonWindowStart = new Date(seasonStartYear, 6, 1, 0, 0, 0);
      const seasonWindowEnd = new Date(seasonStartYear + 2, 5, 30, 23, 59, 59);
      const candidates = candidateYears
        .map((year) => tryBuild(year))
        .filter((value): value is Date => Boolean(value))
        .filter((value) => value >= seasonWindowStart && value <= seasonWindowEnd)
        .sort((left, right) => {
          const leftFuturePenalty = left < now ? 1 : 0;
          const rightFuturePenalty = right < now ? 1 : 0;
          if (leftFuturePenalty !== rightFuturePenalty) {
            return leftFuturePenalty - rightFuturePenalty;
          }
          return Math.abs(left.getTime() - now.getTime()) - Math.abs(right.getTime() - now.getTime());
        });

      if (candidates.length > 0) {
        return candidates[0];
      }
    }

    const iso = new Date(cleaned);
    return isNaN(iso.getTime()) ? null : iso;
  };

  const parseRsvpHours = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 168 ? parsed : null;
  };

  const parseArrivalMinutes = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 240 ? parsed : null;
  };

  const normalizeTeamName = (v: unknown) =>
    String(v || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  const configuredTeamNames = parseFussballDeTeamNames(team.fussballde_team_name);
  if (configuredTeamNames.length === 0 && String(team.name || '').trim()) {
    configuredTeamNames.push(String(team.name || '').trim());
  }
  const ownTeamNorms = configuredTeamNames
    .map((teamName) => normalizeTeamName(teamName))
    .filter(Boolean);
  const enforceOwnTeamDetection = fussballdeSources.length === 1 && ownTeamNorms.length > 0;

  const defaultRsvpHours = parseRsvpHours(team.default_rsvp_deadline_hours_match) ?? parseRsvpHours(team.default_rsvp_deadline_hours);
  const defaultArrivalMinutes = parseArrivalMinutes(team.default_arrival_minutes_match) ?? parseArrivalMinutes(team.default_arrival_minutes);
  const defaultHomeVenue = resolveDefaultHomeVenue(parseHomeVenuesFromDb(team.home_venues), team.default_home_venue_name);

  const members = db.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all(teamId) as Array<{ user_id: number }>;
  const memberIds = members.map((m) => m.user_id);

  const allowedStatuses = new Set(['pending', 'accepted', 'tentative', 'declined']);
  const defaultResponseStatus = allowedStatuses.has(String(team.default_response || 'pending'))
    ? String(team.default_response || 'pending') : 'pending';

  const insertEventStmt = db.prepare(
    `INSERT INTO events (
      team_id, title, type, description, location, location_venue, location_street, location_zip_city,
      pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes,
      visibility_all, invite_all, created_by, external_game_id, is_home_match, opponent_crest_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertResponseStmt = db.prepare('INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)');
  const upsertDeletedEventStmt = db.prepare(
    `INSERT INTO deleted_events (event_id, team_id, title, start_time, end_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(event_id) DO UPDATE SET
       team_id = excluded.team_id,
       title = excluded.title,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       deleted_at = CURRENT_TIMESTAMP`
  );

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const cancelled: string[] = [];
  const rescheduled: string[] = [];

  const normalizeStatusText = (value: unknown): string => String(value || '').trim().toLowerCase();
  const hasAnyKeyword = (haystack: string, keywords: string[]): boolean => keywords.some((keyword) => haystack.includes(keyword));
  const cancelledKeywords = ['abgesagt', 'abgesetzt', 'faellt aus', 'fällt aus', 'annulliert', 'cancelled', 'canceled'];
  const postponedKeywords = ['verlegt', 'verschoben', 'neu angesetzt', 'postponed', 'rescheduled'];

  for (const match of matches) {
    const gameDate = parseFussballDeDate(match.date);
    if (!gameDate) {
      skipped.push(`${match.homeTeam} - ${match.awayTeam}: Kein Datum`);
      continue;
    }

    const homeNorm = normalizeTeamName(match.homeTeam);
    const awayNorm = normalizeTeamName(match.awayTeam);
    const isHome = ownTeamNorms.some((ownTeamNorm) => (
      ownTeamNorm.length >= 4
        ? homeNorm.includes(ownTeamNorm) || ownTeamNorm.includes(homeNorm)
        : homeNorm === ownTeamNorm
    ));
    const isAway = ownTeamNorms.some((ownTeamNorm) => (
      ownTeamNorm.length >= 4
        ? awayNorm.includes(ownTeamNorm) || ownTeamNorm.includes(awayNorm)
        : awayNorm === ownTeamNorm
    ));

    const hasIdentifiedOwnTeam = isHome || isAway;
    if (!hasIdentifiedOwnTeam && enforceOwnTeamDetection) {
      // Keep the match instead of dropping it completely when configured team names
      // do not exactly match fussball.de naming (e.g. suffixes/variants).
      skipped.push(`${match.homeTeam} - ${match.awayTeam}: Teamname nicht eindeutig, trotzdem importiert`);
    }

    const title = `${match.homeTeam} - ${match.awayTeam}`;
    const startTime = gameDate.toISOString();
    const statusSignals = `${String(match.statusText || '')} ${String(match.competition || '')}`.toLowerCase();
    const isCancelledMatch = hasAnyKeyword(normalizeStatusText(statusSignals), cancelledKeywords);
    const isPostponedMatch = hasAnyKeyword(normalizeStatusText(statusSignals), postponedKeywords);

    // Check if event already exists by date proximity + team names
    const existing = db.prepare(
      `SELECT id, title, start_time, end_time, home_goals, away_goals FROM events
       WHERE team_id = ? AND type = 'match'
         AND abs(strftime('%s', start_time) - strftime('%s', ?)) < 86400
         AND (title LIKE ? OR title LIKE ?)`
    ).get(teamId, startTime, `%${match.homeTeam}%`, `%${match.awayTeam}%`) as any;

    const titleCandidates = db.prepare(
      `SELECT id, title, start_time, end_time, home_goals, away_goals FROM events
       WHERE team_id = ?
         AND type = 'match'
         AND title = ?
       ORDER BY start_time ASC`
    ).all(teamId, title) as Array<{
      id: number;
      title: string;
      start_time: string;
      end_time: string;
      home_goals: number | null;
      away_goals: number | null;
    }>;

    const fallbackExisting = titleCandidates.find((candidate) => {
      const candidateTime = new Date(candidate.start_time);
      if (Number.isNaN(candidateTime.getTime())) {
        return false;
      }
      const diffHours = Math.abs(candidateTime.getTime() - gameDate.getTime()) / 3600000;
      return diffHours <= 336;
    });

    const existingOrFallback = existing || fallbackExisting;

    if (isCancelledMatch) {
      if (existingOrFallback) {
        upsertDeletedEventStmt.run(
          existingOrFallback.id,
          teamId,
          existingOrFallback.title || title,
          existingOrFallback.start_time || null,
          existingOrFallback.end_time || null
        );
        db.prepare('DELETE FROM events WHERE id = ?').run(existingOrFallback.id);
        cancelled.push(title);
      } else {
        skipped.push(`${title}: Als abgesagt markiert, aber kein Termin gefunden`);
      }
      continue;
    }

    if (existingOrFallback) {
      const existingStartDate = new Date(existingOrFallback.start_time);
      const hasValidExistingStart = !Number.isNaN(existingStartDate.getTime());
      const timeDiffMinutes = hasValidExistingStart
        ? Math.abs(existingStartDate.getTime() - gameDate.getTime()) / 60000
        : 0;

      if (match.result && (existingOrFallback.home_goals === null || existingOrFallback.away_goals === null)) {
        db.prepare('UPDATE events SET home_goals = ?, away_goals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(match.result.home ?? null, match.result.away ?? null, existingOrFallback.id);
        updated.push(title);
        continue;
      }

      if ((isPostponedMatch || timeDiffMinutes >= 30) && !match.result) {
        const endTime = new Date(gameDate.getTime() + 105 * 60 * 1000).toISOString();
        const rsvpDeadline = defaultRsvpHours !== null
          ? new Date(gameDate.getTime() - defaultRsvpHours * 3600000).toISOString()
          : null;

        db.prepare(
          `UPDATE events
           SET start_time = ?, end_time = ?, rsvp_deadline = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(startTime, endTime, rsvpDeadline, existingOrFallback.id);

        rescheduled.push(title);
      } else {
        skipped.push(title);
      }
      continue;
    }

    // Skip past games without a known result (nothing useful to import)
    if (gameDate < now && !match.result) {
      skipped.push(`${title}: Vergangenes Spiel ohne Ergebnis`);
      continue;
    }

    const competition = match.competition || '';
    const description = competition ? `Wettbewerb: ${competition}` : '';
    const endTime = new Date(gameDate.getTime() + 105 * 60 * 1000).toISOString();
    const rsvpDeadline = defaultRsvpHours !== null
      ? new Date(gameDate.getTime() - defaultRsvpHours * 3600000).toISOString()
      : null;

    const locationVenue = match.venue || (defaultHomeVenue ? defaultHomeVenue.name : null) || null;
    const locationStreet = defaultHomeVenue ? defaultHomeVenue.street || null : null;
    const locationZipCity = defaultHomeVenue ? defaultHomeVenue.zip_city || null : null;
    const pitchType = defaultHomeVenue ? defaultHomeVenue.pitch_type || null : null;
    const location = [locationVenue, locationStreet, locationZipCity].filter(Boolean).join(', ') || null;

    const insertResult = insertEventStmt.run(
      teamId,
      title,
      'match',
      description,
      location,
      locationVenue,
      locationStreet,
      locationZipCity,
      pitchType,
      null, // meeting_point
      defaultArrivalMinutes,
      startTime,
      endTime,
      rsvpDeadline,
      105, // duration_minutes
      1, // visibility_all
      1, // invite_all
      createdByUserId,
      null, // external_game_id
      hasIdentifiedOwnTeam ? (isHome ? 1 : 0) : null,
      null, // opponent_crest_url
    );

    const eventId = insertResult.lastInsertRowid as number;
    for (const memberId of memberIds) {
      try {
        insertResponseStmt.run(eventId, memberId, defaultResponseStatus);
      } catch {
        // ignore duplicate responses
      }
    }

    created.push(title);
  }

  const notifyUserIds = memberIds.filter((userId) => userId !== createdByUserId);
  if (notifyUserIds.length > 0) {
    if (cancelled.length > 0) {
      await sendPushToUsers(notifyUserIds, {
        title: 'Spiel abgesagt',
        body: cancelled.length === 1
          ? `${cancelled[0]} wurde abgesagt.`
          : `${cancelled.length} Spiele wurden abgesagt.`,
        url: `/teams/${teamId}/events`,
      });
    }

    if (rescheduled.length > 0) {
      await sendPushToUsers(notifyUserIds, {
        title: 'Spiel verlegt',
        body: rescheduled.length === 1
          ? `${rescheduled[0]} wurde verlegt.`
          : `${rescheduled.length} Spiele wurden verlegt.`,
        url: `/teams/${teamId}/events`,
      });
    }
  }

  return {
    success: true,
    imported: created.length,
    updated: updated.length,
    skipped: skipped.length,
    created,
    updatedItems: updated,
    skippedDetails: skipped,
    mode: 'fussball.de',
    source_ids: fussballdeSources,
  };
};
router.post('/:id/import-next-games', async (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can import games' });
    }

    const team = db.prepare('SELECT id, fussballde_id FROM teams WHERE id = ?').get(teamId) as any;

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const result = await runTeamGameImport(teamId, req.user!.id);
    return res.json(result);
  } catch (error) {
    console.error('Import next games error:', error);
    return res.status(500).json({ error: 'Failed to import next games' });
  }
});

// Update fussball.de team id (trainers only)
router.put('/:id/fussballde-id', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { fussballde_id } = req.body as { fussballde_id?: string };

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can update fussball.de ID' });
    }

    const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const normalizedSource = String(fussballde_id || '').trim();
    if (!normalizedSource) {
      return res.status(400).json({ error: 'fussball.de ID oder URL ist erforderlich' });
    }

    const normalizedSources = parseFussballDeSources(normalizedSource);
    if (normalizedSources.length === 0) {
      return res.status(400).json({ error: 'Ungültiges fussball.de Format (ID oder URL)' });
    }

    db.prepare('UPDATE teams SET fussballde_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(normalizedSources.join(','), teamId);

    return res.json({ id: teamId, fussballde_id: normalizedSources.join(',') });
  } catch (error) {
    console.error('Update fussball.de id error:', error);
    return res.status(500).json({ error: 'Failed to update fussball.de ID' });
  }
});

// Get external team table from api-fussball.de
router.get('/:id/external-schedule', async (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const team = db.prepare('SELECT id, name, fussballde_id, fussballde_team_name FROM teams WHERE id = ?').get(teamId) as any;

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configuredTeamNames = [...new Set([
      String(team.name || '').trim(),
      ...parseFussballDeTeamNames(team.fussballde_team_name),
    ].filter(Boolean))];

    const externalScheduleSources = parseFussballDeSources(team.fussballde_id);
    const attempts: Array<{
      requested_source: string;
      source_url: string;
      mode: 'next' | 'last' | 'season';
      ok: boolean;
      row_count: number;
      error?: string;
    }> = [];

    if (externalScheduleSources.length === 0) {
      return res.json({
        schedules: [],
        diagnostics: {
          configured_sources: externalScheduleSources,
          attempts,
          fallback_reason: 'no_fussballde_source_configured',
        },
      });
    }

    const client = new FussballDeClient({ timeoutMs: 15000 });
    const eventResultLookupStmt = hasEventScoreColumns
      ? db.prepare(
          `SELECT title, start_time, home_goals, away_goals
           FROM events
           WHERE team_id = ?
             AND type = 'match'
             AND home_goals IS NOT NULL
             AND away_goals IS NOT NULL
             AND abs(strftime('%s', start_time) - strftime('%s', ?)) < 172800
           ORDER BY abs(strftime('%s', start_time) - strftime('%s', ?)) ASC
           LIMIT 20`
        )
      : null;

    const resolveResultFromInternalEvents = (match: any, parsedDate: Date | null): { home: number; away: number } | null => {
      if (!eventResultLookupStmt) {
        return null;
      }

      if (!parsedDate) {
        return null;
      }

      const homeTeam = String(match?.homeTeam || '').trim();
      const awayTeam = String(match?.awayTeam || '').trim();
      if (!homeTeam || !awayTeam) {
        return null;
      }

      const candidates = eventResultLookupStmt.all(
        teamId,
        parsedDate.toISOString(),
        parsedDate.toISOString(),
      ) as Array<{ title?: string; start_time?: string; home_goals?: number; away_goals?: number }>;

      const normalizedMatchHome = normalizeTeamNameInternal(homeTeam);
      const normalizedMatchAway = normalizeTeamNameInternal(awayTeam);

      for (const candidate of candidates) {
        if (!Number.isFinite(candidate.home_goals) || !Number.isFinite(candidate.away_goals)) {
          continue;
        }

        const participants = parseInternalParticipants(candidate.title);
        if (!participants) {
          continue;
        }

        const eventHome = normalizeTeamNameInternal(participants.homeTeam);
        const eventAway = normalizeTeamNameInternal(participants.awayTeam);

        if (eventHome === normalizedMatchHome && eventAway === normalizedMatchAway) {
          return { home: Number(candidate.home_goals), away: Number(candidate.away_goals) };
        }

        if (eventHome === normalizedMatchAway && eventAway === normalizedMatchHome) {
          return { home: Number(candidate.away_goals), away: Number(candidate.home_goals) };
        }
      }

      return null;
    };

    const parseScheduleDate = (value: unknown): Date | null => {
      const raw = String(value || '').replace(/\s+/g, ' ').trim();
      if (!raw) return null;

      const germanMatch = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[^0-9]*(\d{1,2}):(\d{2}))?/);
      if (germanMatch) {
        const day = parseInt(germanMatch[1], 10);
        const month = parseInt(germanMatch[2], 10) - 1;
        const yearRaw = parseInt(germanMatch[3], 10);
        const year = germanMatch[3].length === 2
          ? (yearRaw >= 70 ? 1900 + yearRaw : 2000 + yearRaw)
          : yearRaw;
        const hour = germanMatch[4] ? parseInt(germanMatch[4], 10) : 19;
        const minute = germanMatch[5] ? parseInt(germanMatch[5], 10) : 0;
        const date = new Date(year, month, day, hour, minute, 0);
        return Number.isNaN(date.getTime()) ? null : date;
      }

      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const now = new Date();
    const seasonStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStartDate = new Date(seasonStartYear, 6, 1, 0, 0, 0, 0);
    const seasonEndDate = new Date(seasonStartYear + 1, 5, 30, 23, 59, 59, 999);
    const seasonRange = {
      from: `${seasonStartYear}-07-01`,
      to: `${seasonStartYear + 1}-06-30`,
    };

    const schedules = await Promise.all(externalScheduleSources.map(async (sourceEntry) => {
      const sourceId = extractFussballDeTeamId(sourceEntry) || sourceEntry;
      const sourceUrl = buildFussballDeTeamPageUrl(sourceEntry);

      try {
        const [nextGamesRaw, lastGamesRaw, seasonGamesRaw] = await Promise.all([
          client.getSpielplan({ teamPageUrl: sourceUrl }),
          client.getLastMatches({ teamPageUrl: sourceUrl }),
          client.getPrintableSeasonMatches({ teamPageUrl: sourceUrl }, seasonRange),
        ]);

        attempts.push(
          {
            requested_source: sourceEntry,
            source_url: sourceUrl,
            mode: 'next',
            ok: true,
            row_count: nextGamesRaw.length,
          },
          {
            requested_source: sourceEntry,
            source_url: sourceUrl,
            mode: 'last',
            ok: true,
            row_count: lastGamesRaw.length,
          },
          {
            requested_source: sourceEntry,
            source_url: sourceUrl,
            mode: 'season',
            ok: true,
            row_count: seasonGamesRaw.length,
          }
        );

        const dedupeMatches = (matches: any[]) => {
          const seen = new Set<string>();
          return matches.filter((match) => {
            const key = [
              String(match?.date || ''),
              String(match?.homeTeam || ''),
              String(match?.awayTeam || ''),
              String(match?.competition || ''),
            ].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        };

        const withOrigin = [
          ...nextGamesRaw.map((match) => ({ ...match, __origin: 'next' as const })),
          ...lastGamesRaw.map((match) => ({ ...match, __origin: 'last' as const })),
          ...seasonGamesRaw.map((match) => ({ ...match, __origin: 'season' as const })),
        ];

        const mergedRaw = dedupeMatches(withOrigin);
        const seasonMatches = mergedRaw.filter((match: any) => {
          const parsedDate = parseScheduleDate(match?.date);
          if (!parsedDate) {
            // Nicht geparste Saison-Print-Zeilen nicht blind einsortieren.
            return match?.__origin === 'next' || match?.__origin === 'last';
          }
          return parsedDate >= seasonStartDate && parsedDate <= seasonEndDate;
        });

        const nextGames = seasonMatches.filter((match: any) => {
          const parsedDate = parseScheduleDate(match?.date);
          if (!parsedDate) {
            return match?.__origin === 'next';
          }
          return parsedDate.getTime() > now.getTime();
        });
        const lastGames = seasonMatches.filter((match: any) => {
          const parsedDate = parseScheduleDate(match?.date);
          if (!parsedDate) {
            return match?.__origin === 'last';
          }
          return parsedDate.getTime() <= now.getTime();
        });
        const combinedGames = [...nextGames, ...lastGames];

        const leagueName = parseExternalLeagueNameFromMatches(combinedGames) || 'fussball.de Spielplan';

        const rowMatches = combinedGames
          .flatMap((match: any) => [String(match?.homeTeam || ''), String(match?.awayTeam || '')])
          .map((rowName) => {
            const bestScore = configuredTeamNames.reduce((score, configuredName) => {
              return Math.max(score, calculateRowMatchScore(rowName, configuredName));
            }, 0);
            return { rowName, score: bestScore };
          })
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score);

        const matchedTeamName = rowMatches[0]?.rowName || null;

        const toPayloadMatches = (matches: any[], mode: 'next' | 'last') => matches.map((match) => {
          const parsedDate = parseScheduleDate(match?.date);
          const isPastMatch = Boolean(parsedDate && parsedDate.getTime() <= Date.now());
          const fallbackResult = mode === 'last' && isPastMatch
            ? resolveResultFromInternalEvents(match, parsedDate)
            : null;

          return {
            date: String(match?.date || ''),
            homeTeam: String(match?.homeTeam || ''),
            awayTeam: String(match?.awayTeam || ''),
            homeBadge: match?.homeBadge
              ? (String(match.homeBadge).startsWith('//') ? `https:${String(match.homeBadge)}` : String(match.homeBadge))
              : null,
            awayBadge: match?.awayBadge
              ? (String(match.awayBadge).startsWith('//') ? `https:${String(match.awayBadge)}` : String(match.awayBadge))
              : null,
            competition: String(match?.competition || ''),
            venue: String(match?.venue || ''),
            statusText: String(match?.statusText || ''),
            result: mode === 'last'
              ? (fallbackResult || match?.result || null)
              : (match?.result || null),
          };
        });

        return {
          source_id: sourceId,
          source: 'fussball.de',
          league_name: leagueName,
          matched_team_name: matchedTeamName,
          next_games: toPayloadMatches(nextGames, 'next'),
          last_games: toPayloadMatches(lastGames, 'last'),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        attempts.push(
          {
            requested_source: sourceEntry,
            source_url: sourceUrl,
            mode: 'next',
            ok: false,
            row_count: 0,
            error: errorMessage,
          },
          {
            requested_source: sourceEntry,
            source_url: sourceUrl,
            mode: 'last',
            ok: false,
            row_count: 0,
            error: errorMessage,
          },
          {
            requested_source: sourceEntry,
            source_url: sourceUrl,
            mode: 'season',
            ok: false,
            row_count: 0,
            error: errorMessage,
          }
        );
        return null;
      }
    }));

    const filteredSchedules = schedules.filter(Boolean);

    return res.json({
      team_id: teamId,
      team_name: String(team.name || ''),
      schedules: filteredSchedules,
      diagnostics: {
        configured_sources: externalScheduleSources,
        attempts,
        fallback_reason: filteredSchedules.length > 0 ? null : 'no_external_rows_returned',
      },
    });
  } catch (error) {
    console.error('Get external team schedule error:', error);
    return res.status(500).json({ error: 'Failed to fetch external schedule' });
  }
});

// Get external team table from api-fussball.de
router.get('/:id/external-table', async (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const team = db.prepare('SELECT id, name, fussballde_id, fussballde_team_name FROM teams WHERE id = ?').get(teamId) as any;

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configuredTeamNames = [...new Set([
      String(team.name || '').trim(),
      ...parseFussballDeTeamNames(team.fussballde_team_name),
    ].filter(Boolean))];
    const normalizedConfiguredTeamNames = configuredTeamNames
      .map((name) => normalizeTeamNameInternal(name))
      .filter(Boolean);

    const candidateTables: Array<{
      sourceEntry: string;
      sourceId: string;
      table: Array<{
        place: number;
        team: string;
        games: number;
        won: null;
        draw: null;
        lost: null;
        goal: string;
        points: number;
        img: string | null;
      }>;
      leagueName: string;
      matchScore: number;
      matchedTeamName: string | null;
      rowCount: number;
    }> = [];

    // Try to fetch live standings from fussball.de if a team ID is configured
    const externalTableSources = parseFussballDeSources(team.fussballde_id);
    const externalAttempts: Array<{
      requested_source: string;
      source_url: string;
      ok: boolean;
      row_count: number;
      error?: string;
    }> = [];

    if (externalTableSources.length > 0) {
      const client = new FussballDeClient({ timeoutMs: 15000 });

      for (const sourceEntry of externalTableSources) {
        try {
          const teamPageUrl = buildFussballDeTeamPageUrl(sourceEntry);
          const externalResult = await client.getTabelleWithDiagnostics({ teamPageUrl });
          const standings = externalResult.standings;

          externalAttempts.push(
            ...externalResult.attempts.map((attempt) => ({
              requested_source: sourceEntry,
              source_url: attempt.url,
              ok: attempt.ok,
              row_count: attempt.rowCount,
              error: attempt.error,
            }))
          );

          if (standings.length === 0) {
            continue;
          }

          const table = standings.map((row, index) => ({
            place: row.rank ?? (index + 1),
            team: row.team,
            games: row.played ?? 0,
            won: null,
            draw: null,
            lost: null,
            goal: row.goalDiff !== undefined
              ? (row.goalDiff >= 0 ? `+${row.goalDiff}` : String(row.goalDiff))
              : '-',
            points: row.points ?? 0,
            img: row.badge
              ? (row.badge.startsWith('//') ? `https:${row.badge}` : row.badge)
              : null,
          }));

          // Prefer printable match competition (e.g. Kreisliga A/B) per configured source.
          const externalLeagueName = parseExternalLeagueNameFromPrintableMatches(externalResult.printableMatches);

          // Fallback to recently imported internal matches if available.
          const recentMatches = db.prepare(
            `SELECT description FROM events WHERE team_id = ? AND type = 'match' LIMIT 10`
          ).all(teamId) as any[];
          const leagueName = externalLeagueName || parseInternalLeagueName(recentMatches) || 'fussball.de Tabelle';

          const rowMatches = table
            .map((row) => {
              const bestScore = configuredTeamNames.reduce((score, configuredName) => {
                return Math.max(score, calculateRowMatchScore(row.team, configuredName));
              }, 0);

              return {
                rowName: String(row.team || '').trim(),
                score: bestScore,
              };
            })
            .filter((entry) => entry.score > 0)
            .sort((left, right) => right.score - left.score);

          const matchScore = rowMatches.length;
          const matchedTeamName = rowMatches[0]?.rowName || null;

          candidateTables.push({
            sourceEntry,
            sourceId: extractFussballDeTeamId(sourceEntry) || sourceEntry,
            table,
            leagueName,
            matchScore,
            matchedTeamName,
            rowCount: standings.length,
          });
        } catch (externalError) {
          const errorMessage = externalError instanceof Error ? externalError.message : String(externalError);
          externalAttempts.push({
            requested_source: sourceEntry,
            source_url: buildFussballDeTeamPageUrl(sourceEntry),
            ok: false,
            row_count: 0,
            error: errorMessage,
          });
          console.warn(`fussball.de table fetch failed for source ${sourceEntry}:`, externalError);
        }
      }

      if (candidateTables.length > 0) {
        const sortedCandidates = [...candidateTables]
          .sort((left, right) => {
            if (normalizedConfiguredTeamNames.length > 0 && left.matchScore !== right.matchScore) {
              return right.matchScore - left.matchScore;
            }

            if (right.rowCount !== left.rowCount) {
              return right.rowCount - left.rowCount;
            }

            return externalTableSources.indexOf(left.sourceEntry) - externalTableSources.indexOf(right.sourceEntry);
          });

        const selectedCandidate = sortedCandidates[0];
        const tables = sortedCandidates.map((candidate) => ({
          table: candidate.table,
          leagueName: candidate.leagueName,
          matched_team_name: candidate.matchedTeamName,
          source: 'fussball.de',
          source_id: candidate.sourceId,
        }));

        return res.json({
          table: selectedCandidate.table,
          leagueName: selectedCandidate.leagueName,
          source: 'fussball.de',
          source_id: selectedCandidate.sourceId,
          tables,
          diagnostics: {
            configured_ids: parseFussballDeIds(team.fussballde_id),
            configured_sources: externalTableSources,
            configured_team_names: configuredTeamNames,
            selected_source: 'fussball.de',
            selected_source_id: selectedCandidate.sourceId,
            attempts: externalAttempts,
            fallback_reason: null,
          },
        });
      }
    }

    // Fallback: calculate standings from internally tracked matches
    const internalMatches = db.prepare(
      `SELECT title, description, end_time, is_home_match, home_goals, away_goals
       FROM events
       WHERE team_id = ?
         AND type = 'match'
         AND end_time IS NOT NULL
         AND datetime(end_time) <= datetime('now')`
    ).all(teamId) as any[];

    const table = buildInternalTableRows(team, internalMatches);
    const internalLeagueName = parseInternalLeagueName(internalMatches) || 'Interne Tabelle';

    return res.json({
      table,
      leagueName: internalLeagueName,
      source: 'internal',
      tables: [
        {
          table,
          leagueName: internalLeagueName,
          matched_team_name: null,
          source: 'internal',
          source_id: null,
        },
      ],
      diagnostics: {
        configured_ids: parseFussballDeIds(team.fussballde_id),
        configured_sources: externalTableSources,
        selected_source: 'internal',
        selected_source_id: null,
        attempts: externalAttempts,
        fallback_reason: externalTableSources.length === 0
          ? 'no_fussballde_source_configured'
          : 'no_external_rows_returned',
      },
    });
  } catch (error) {
    console.error('Get external team table error:', error);
    return res.status(500).json({ error: 'Failed to fetch external team table' });
  }
});

// Create team (admin only)
router.post('/', (req: AuthRequest, res) => {
  try {
    const { name, description }: CreateTeamDTO = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    // Check if user is admin
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create teams' });
    }

    const result = hasTeamsCalendarTokenColumn
      ? db
          .prepare('INSERT INTO teams (name, description, calendar_token, created_by) VALUES (?, ?, ?, ?)')
          .run(name, description, randomBytes(24).toString('hex'), req.user!.id)
      : db
          .prepare('INSERT INTO teams (name, description, created_by) VALUES (?, ?, ?)')
          .run(name, description, req.user!.id);

    // Team is created without members - admin will assign trainers via admin panel

    res.status(201).json({
      id: result.lastInsertRowid,
      name,
      description,
      created_by: req.user!.id
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// Get team members
router.get('/:id/members', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    // Check membership
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const userTableColumns = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
    const availableUserColumns = new Set(userTableColumns.map((column) => column.name));

    const userColumnOrNull = (columnName: string, alias?: string) => {
      const targetAlias = alias || columnName;
      return availableUserColumns.has(columnName)
        ? `u.${columnName} AS ${targetAlias}`
        : `NULL AS ${targetAlias}`;
    };

    const members = db.prepare(`
      SELECT
        u.id AS id,
        u.name AS name,
        u.email AS email,
        ${userColumnOrNull('phone_number')},
        ${userColumnOrNull('birth_date')},
        ${userColumnOrNull('profile_picture')},
        ${userColumnOrNull('nickname')},
        ${userColumnOrNull('height_cm')},
        ${userColumnOrNull('weight_kg')},
        ${userColumnOrNull('clothing_size')},
        ${userColumnOrNull('shoe_size')},
        COALESCE(tm.jersey_number, ${availableUserColumns.has('jersey_number') ? 'u.jersey_number' : 'NULL'}) as jersey_number,
        ${userColumnOrNull('footedness')},
        COALESCE(tm.position, ${availableUserColumns.has('position') ? 'u.position' : 'NULL'}) as position,
        tm.role,
        tm.joined_at
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY tm.role, u.name
    `).all(teamId);

    res.json(members);
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Add team member
router.post('/:id/members', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { user_id, role = 'player', jersey_number, position } = req.body;

    // Check if user is trainer
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can add members' });
    }

    // Check if user exists
    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add member
    const stmt = db.prepare(
      'INSERT INTO team_members (team_id, user_id, role, jersey_number, position) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(teamId, user_id, role, jersey_number, position);

    res.status(201).json({
      id: result.lastInsertRowid,
      team_id: teamId,
      user_id,
      role,
      jersey_number,
      position
    });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'User is already a team member' });
    }
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// Remove team member (trainers can remove players)
router.delete('/:id/members/:userId', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);

    const trainerMembership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!trainerMembership || trainerMembership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can remove players' });
    }

    const targetMembership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, userId) as any;

    if (!targetMembership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    if (targetMembership.role === 'trainer') {
      return res.status(400).json({ error: 'Trainer können nur Spieler entfernen' });
    }

    const result = db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Remove player from team error:', error);
    return res.status(500).json({ error: 'Failed to remove player from team' });
  }
});

// Create new player (trainer only)
router.post('/:id/players', async (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { name, birth_date, jersey_number } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Check if user is trainer of this team
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can create players' });
    }

    // Generate unique token
    const crypto = require('crypto');
    const token = crypto.randomBytes(16).toString('hex');

    // Create invite with player info
    const stmt = db.prepare(
      'INSERT INTO team_invites (team_id, token, role, created_by, player_name, player_birth_date, player_jersey_number, max_uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(teamId, token, 'player', req.user!.id, name, birth_date || null, jersey_number || null, 1);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    const inviteUrl = `${frontendUrl}/invite/${token}`;

    res.status(201).json({
      id: result.lastInsertRowid,
      name,
      birth_date,
      jersey_number,
      token,
      invite_url: inviteUrl
    });
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// Upload team picture (trainers only)
router.post('/:id/picture', upload.single('picture') as any, (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    // Check if user is trainer of this team
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can upload team pictures' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Delete old picture if exists
    const oldTeam = db.prepare('SELECT team_picture FROM teams WHERE id = ?').get(teamId) as any;
    if (oldTeam?.team_picture) {
      const oldPath = path.join(uploadsDir, path.basename(oldTeam.team_picture));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update team with new picture path
    const picturePath = `/uploads/${req.file.filename}`;
    db.prepare('UPDATE teams SET team_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(picturePath, teamId);

    res.json({ team_picture: picturePath });
  } catch (error) {
    console.error('Upload team picture error:', error);
    res.status(500).json({ error: 'Failed to upload team picture' });
  }
});

// Delete team picture (trainers only)
router.delete('/:id/picture', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can delete team pictures' });
    }

    const team = db.prepare('SELECT team_picture FROM teams WHERE id = ?').get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (team.team_picture) {
      const picturePath = path.join(uploadsDir, path.basename(team.team_picture));
      if (fs.existsSync(picturePath)) {
        fs.unlinkSync(picturePath);
      }
    }

    db.prepare('UPDATE teams SET team_picture = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(teamId);

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete team picture error:', error);
    return res.status(500).json({ error: 'Failed to delete team picture' });
  }
});

// Delete imported games (from API)
router.delete('/:id/imported-games', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can delete imported games' });
    }

    // Delete all events for this team that have external_game_id (imported from API)
    const result = db.prepare(
      'DELETE FROM events WHERE team_id = ? AND external_game_id IS NOT NULL'
    ).run(teamId);

    // Also delete associated responses
    db.prepare(
      `DELETE FROM event_responses WHERE event_id IN (
        SELECT id FROM events WHERE team_id = ? AND external_game_id IS NULL
      )`
    ).run(teamId);

    return res.json({ success: true, deleted: result.changes });
  } catch (error) {
    console.error('Delete imported games error:', error);
    return res.status(500).json({ error: 'Failed to delete imported games' });
  }
});

// Delete team (trainers only)
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (!membership || membership.role !== 'trainer') {
      return res.status(403).json({ error: 'Only trainers can delete teams' });
    }

    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const result = db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.json({ success: true, id: teamId, name: team.name });
  } catch (error) {
    console.error('Delete team by trainer error:', error);
    return res.status(500).json({ error: 'Failed to delete team' });
  }
});

export default router;

