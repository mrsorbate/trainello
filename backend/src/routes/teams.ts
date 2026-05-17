import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CreateTeamDTO } from '../types';

const router = Router();
const HARDCODED_FUSSBALL_API_TOKEN = 'w1G797J1N7u8a0e1R0C8A1Z2e5TYQm1Sezgk0lBUik';
const hasTeamsCalendarTokenColumn = (() => {
  try {
    const columns = db.prepare("PRAGMA table_info('teams')").all() as Array<{ name: string }>;
    return columns.some((column) => column.name === 'calendar_token');
  } catch {
    return false;
  }
})();

const calendarTokenSelectExpression = hasTeamsCalendarTokenColumn
  ? 'calendar_token'
  : 'NULL AS calendar_token';

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

const buildInternalTableRows = (team: any, matches: any[]) => {
  const rows = new Map<string, { team: string; games: number; won: number; draw: number; lost: number; gf: number; ga: number; points: number }>();

  const ensureRow = (teamName: string) => {
    const key = normalizeTeamNameInternal(teamName);
    if (!rows.has(key)) {
      rows.set(key, { team: teamName, games: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    }
    return rows.get(key)!;
  };

  for (const match of matches) {
    const participants = parseInternalParticipants(match.title);
    const score = parseInternalScore(match.title, match.description);
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

  const ownTeamName = String(team?.fussballde_team_name || team?.name || '').trim();
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

  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = String(req.get('host') || '').trim();
  if (!host) {
    return { calendar_feed_url: null, calendar_webcal_url: null };
  }

  const calendarFeedUrl = `${protocol}://${host}/api/teams/${teamId}/calendar.ics?token=${encodeURIComponent(normalizedToken)}`;
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
    if (!team || String(team.calendar_token || '') !== token) {
      return res.status(403).json({ error: 'Invalid calendar token' });
    }

    const events = db.prepare(
      `SELECT id, title, description, start_time, end_time, location_venue, location_street, location_zip_city, location, updated_at
       FROM events
       WHERE team_id = ?
       ORDER BY start_time ASC`
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
      'PRODID:-//sqadX.app//Team Calendar//DE',
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
      lines.push(`UID:sqadx-team${teamId}-event${event.id}@sqadx.app`);
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
      lines.push(`UID:sqadx-team${teamId}-event${deletedEvent.event_id}@sqadx.app`);
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
      SELECT t.*, tm.role as my_role
      FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ?
      ORDER BY t.name
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

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    
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
              home_venues, default_home_venue_name, ${calendarTokenSelectExpression}
       FROM teams WHERE id = ?`
    ).get(teamId) as any;

    const calendarUrls = getCalendarUrls(req, teamId, settings?.calendar_token);

    if (!settings) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.json({
      ...settings,
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
    const hasFussballTeamName = Object.prototype.hasOwnProperty.call(req.body, 'fussballde_team_name');
    const hasDefaultResponse = Object.prototype.hasOwnProperty.call(req.body, 'default_response');
    const hasDefaultRsvpDeadlineHours = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours');
    const hasDefaultRsvpDeadlineHoursTraining = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours_training');
    const hasDefaultRsvpDeadlineHoursMatch = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours_match');
    const hasDefaultRsvpDeadlineHoursOther = Object.prototype.hasOwnProperty.call(req.body, 'default_rsvp_deadline_hours_other');
    const hasDefaultArrivalMinutes = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes');
    const hasDefaultArrivalMinutesTraining = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes_training');
    const hasDefaultArrivalMinutesMatch = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes_match');
    const hasDefaultArrivalMinutesOther = Object.prototype.hasOwnProperty.call(req.body, 'default_arrival_minutes_other');
    const hasHomeVenues = Object.prototype.hasOwnProperty.call(req.body, 'home_venues');
    const hasDefaultHomeVenueName = Object.prototype.hasOwnProperty.call(req.body, 'default_home_venue_name');

    const {
      fussballde_id,
      fussballde_team_name,
      default_response,
      default_rsvp_deadline_hours,
      default_rsvp_deadline_hours_training,
      default_rsvp_deadline_hours_match,
      default_rsvp_deadline_hours_other,
      default_arrival_minutes,
      default_arrival_minutes_training,
      default_arrival_minutes_match,
      default_arrival_minutes_other,
      home_venues,
      default_home_venue_name,
    } = req.body as {
      fussballde_id?: string;
      fussballde_team_name?: string;
      default_response?: string;
      default_rsvp_deadline_hours?: number | string | null;
      default_rsvp_deadline_hours_training?: number | string | null;
      default_rsvp_deadline_hours_match?: number | string | null;
      default_rsvp_deadline_hours_other?: number | string | null;
      default_arrival_minutes?: number | string | null;
      default_arrival_minutes_training?: number | string | null;
      default_arrival_minutes_match?: number | string | null;
      default_arrival_minutes_other?: number | string | null;
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
              home_venues, default_home_venue_name
       FROM teams WHERE id = ?`
    ).get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    let nextFussballId = team.fussballde_id as string | null;
    if (hasFussballId) {
      const normalizedFussballId = String(fussballde_id || '').trim().toUpperCase();
      if (normalizedFussballId && !/^[A-Z0-9]{16,40}$/.test(normalizedFussballId)) {
        return res.status(400).json({ error: 'Ungültiges fussball.de ID-Format' });
      }
      nextFussballId = normalizedFussballId || null;
    }

    let nextFussballTeamName = team.fussballde_team_name as string | null;
    if (hasFussballTeamName) {
      const normalizedTeamName = String(fussballde_team_name || '').trim();
      nextFussballTeamName = normalizedTeamName || null;
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
      JSON.stringify(nextHomeVenues),
      nextDefaultHomeVenueName,
      teamId
    );

    const updatedSettings = db.prepare(
      `SELECT id, fussballde_id, fussballde_team_name, default_response, default_rsvp_deadline_hours,
              default_rsvp_deadline_hours_training, default_rsvp_deadline_hours_match, default_rsvp_deadline_hours_other,
              default_arrival_minutes, default_arrival_minutes_training, default_arrival_minutes_match, default_arrival_minutes_other,
              home_venues, default_home_venue_name, ${calendarTokenSelectExpression}
       FROM teams WHERE id = ?`
    ).get(teamId) as any;

    const calendarUrls = getCalendarUrls(req, teamId, updatedSettings?.calendar_token);

    return res.json({
      ...updatedSettings,
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

// Update fussball.de team id (trainers only)
export const runTeamGameImport = async (teamId: number, createdByUserId: number) => {
  void createdByUserId;
  const teamExists = db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId) as any;
  if (!teamExists) {
    throw new Error('TEAM_NOT_FOUND');
  }

  return {
    success: true,
    imported: 0,
    updated: 0,
    skipped: 0,
    created: [],
    updatedItems: [],
    skippedDetails: [],
    mode: 'internal',
    message: 'Externer Import ist deaktiviert. Spiele werden intern verwaltet.',
  };

  const importDebugEnabled = process.env.FUSSBALL_IMPORT_DEBUG === '1';
  const importDebugLog = (message: string, payload?: unknown) => {
    if (!importDebugEnabled) return;
    if (payload === undefined) {
      console.log(`[fussball-import-debug] ${message}`);
      return;
    }
    console.log(`[fussball-import-debug] ${message}`, payload);
  };

  const team = db.prepare(
      `SELECT id, name, fussballde_id, fussballde_team_name, default_response, default_rsvp_deadline_hours, default_rsvp_deadline_hours_match,
        default_arrival_minutes, default_arrival_minutes_match, home_venues, default_home_venue_name
     FROM teams WHERE id = ?`
  ).get(teamId) as any;

  if (!team || !team.fussballde_id) {
    throw new Error('TEAM_NOT_FOUND');
  }

  if (!team.fussballde_id) {
    throw new Error('TEAM_NO_FUSSBALL_ID');
  }

  const envToken = HARDCODED_FUSSBALL_API_TOKEN;
  const apiBaseUrl = process.env.FUSSBALL_API_BASE_URL || 'https://api-fussball.de/api';

  if (!envToken) {
    throw new Error('MISSING_API_TOKEN');
  }

  const response = await fetch(`${apiBaseUrl}/team/${encodeURIComponent(team.fussballde_id)}`, {
    method: 'GET',
    headers: {
      'x-auth-token': envToken,
    },
  });

  if (!response.ok) {
    throw new Error(`EXTERNAL_API_${response.status}`);
  }

  const payload = await response.json() as any;

  const pickFirstString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  };

  const parseRsvpHours = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }
    const parsed = parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 168) {
      return null;
    }
    return parsed;
  };

  const parseArrivalMinutes = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }
    const parsed = parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 240) {
      return null;
    }
    return parsed;
  };

  const normalizeTeamName = (value: unknown): string => {
    return String(value || '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const ownTeamCandidates = [team.fussballde_team_name, team.name]
    .map((name) => normalizeTeamName(name))
    .filter(Boolean);

  const namesMatch = (leftRaw: unknown, rightRaw: unknown): boolean => {
    const left = normalizeTeamName(leftRaw);
    const right = normalizeTeamName(rightRaw);
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.length >= 6 && right.includes(left)) return true;
    if (right.length >= 6 && left.includes(right)) return true;
    return false;
  };

  const defaultRsvpHours = parseRsvpHours(team.default_rsvp_deadline_hours_match) ?? parseRsvpHours(team.default_rsvp_deadline_hours);
  const defaultArrivalMinutes = parseArrivalMinutes(team.default_arrival_minutes_match) ?? parseArrivalMinutes(team.default_arrival_minutes);
  const defaultHomeVenue = resolveDefaultHomeVenue(
    parseHomeVenuesFromDb(team.home_venues),
    team.default_home_venue_name
  );

  const parseGameDate = (game: any): Date | null => {
    const parseDateWithOptionalTime = (dateValue: string, timeValue?: string): Date | null => {
      const dateText = String(dateValue || '').trim();
      const timeText = String(timeValue || '').trim();

      const normalizedTime = (() => {
        if (!timeText) return '19:00';
        const clean = timeText.replace(/[^0-9:]/g, '');
        const [hour, minute] = clean.split(':');
        const hh = String(Math.min(23, Math.max(0, parseInt(hour || '0', 10) || 0))).padStart(2, '0');
        const mm = String(Math.min(59, Math.max(0, parseInt(minute || '0', 10) || 0))).padStart(2, '0');
        return `${hh}:${mm}`;
      })();

      const germanMatch = dateText.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
      if (germanMatch) {
        const day = germanMatch[1].padStart(2, '0');
        const month = germanMatch[2].padStart(2, '0');
        const yearRaw = germanMatch[3];
        const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
        const parsed = new Date(`${year}-${month}-${day}T${normalizedTime}`);
        return isNaN(parsed.getTime()) ? null : parsed;
      }

      const isoLike = dateText.includes('T')
        ? dateText
        : `${dateText}T${normalizedTime}`;
      const parsed = new Date(isoLike);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const timestampValue = game?.timestamp ?? game?.kickoff_timestamp ?? game?.match_timestamp;
    if (timestampValue !== undefined && timestampValue !== null && String(timestampValue).trim() !== '') {
      const numeric = Number(timestampValue);
      if (Number.isFinite(numeric)) {
        const date = new Date(numeric > 1e12 ? numeric : numeric * 1000);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    const dateTimeRaw = pickFirstString(
      game?.datetime,
      game?.date_time,
      game?.kickoff_datetime,
      game?.matchDateTime,
      game?.start_time,
      game?.spielbeginn,
    );
    if (dateTimeRaw) {
      const parsed = parseDateWithOptionalTime(dateTimeRaw);
      if (parsed) {
        return parsed;
      }
    }

    const dateRaw = pickFirstString(
      game?.date,
      game?.match_date,
      game?.game_date,
      game?.matchDate,
      game?.datum,
    );
    const timeRaw = pickFirstString(
      game?.time,
      game?.match_time,
      game?.kickoff,
      game?.kickoff_time,
      game?.uhrzeit,
    );

    if (dateRaw && timeRaw) {
      const parsed = parseDateWithOptionalTime(dateRaw, timeRaw);
      if (parsed) {
        return parsed;
      }
    }

    if (dateRaw) {
      const parsed = parseDateWithOptionalTime(dateRaw);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  };

  const getSeasonBounds = (referenceDate: Date): { start: Date; end: Date } => {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const seasonStartYear = month >= 6 ? year : year - 1;
    const start = new Date(seasonStartYear, 6, 1, 0, 0, 0, 0);
    const end = new Date(seasonStartYear + 1, 5, 30, 23, 59, 59, 999);
    return { start, end };
  };

  const payloadData = payload?.data;
  const rawCollections: any[][] = [
    Array.isArray(payloadData) ? payloadData : [],
    Array.isArray(payloadData?.nextGames) ? payloadData.nextGames : [],
    Array.isArray(payloadData?.prevGames) ? payloadData.prevGames : [],
    Array.isArray(payloadData?.games) ? payloadData.games : [],
    Array.isArray(payloadData?.allGames) ? payloadData.allGames : [],
    Array.isArray(payloadData?.matches) ? payloadData.matches : [],
    Array.isArray(payloadData?.fixtures) ? payloadData.fixtures : [],
  ];

  const allCandidateGames = rawCollections.flat();
  const seenGames = new Set<string>();
  const uniqueGames = allCandidateGames.filter((game) => {
    const uniqueKey = [
      pickFirstString(game?.id, game?.match_id, game?.game_id, game?.fixture_id, game?.event_id),
      pickFirstString(game?.datetime, game?.date_time, game?.kickoff_datetime, game?.date, game?.match_date, game?.game_date),
      pickFirstString(game?.homeTeam, game?.home_team, game?.home, game?.hometeam, game?.heim, game?.team_home),
      pickFirstString(game?.awayTeam, game?.away_team, game?.away, game?.awayteam, game?.gast, game?.team_away),
      pickFirstString(game?.title, game?.match_title),
    ].join('|');

    if (seenGames.has(uniqueKey)) {
      return false;
    }
    seenGames.add(uniqueKey);
    return true;
  });

  const seasonBounds = getSeasonBounds(new Date());
  const seasonGames = uniqueGames.filter((game) => {
    const gameDate = parseGameDate(game);
    if (!gameDate) return false;
    return gameDate >= seasonBounds.start && gameDate <= seasonBounds.end;
  });

  importDebugLog('Imported payload game collections', {
    teamId,
    teamFussballDeId: team.fussballde_id,
    candidateGames: allCandidateGames.length,
    uniqueGames: uniqueGames.length,
    seasonGames: seasonGames.length,
  });

  if (seasonGames.length > 0) {
    importDebugLog(
      'Sample payload keys (first 3 games)',
      seasonGames.slice(0, 3).map((game, index) => ({
        index,
        keys: Object.keys((game || {}) as Record<string, unknown>).slice(0, 120),
      }))
    );
  }

  const members = db.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all(teamId) as Array<{ user_id: number }>;
  const memberIds = members.map((member) => member.user_id);
  const allowedStatuses = new Set(['pending', 'accepted', 'tentative', 'declined']);
  const defaultResponseStatus = allowedStatuses.has(String(team.default_response || 'pending'))
    ? String(team.default_response || 'pending')
    : 'pending';

  const insertEventStmt = db.prepare(
    `INSERT INTO events (
      team_id, title, type, description, location, location_venue, location_street, location_zip_city,
      pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes,
      visibility_all, invite_all, created_by, external_game_id, is_home_match, opponent_crest_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertResponseStmt = db.prepare('INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)');
  const existingEventByExternalIdStmt = db.prepare(
    'SELECT id, location, location_venue, location_street, location_zip_city FROM events WHERE external_game_id = ? LIMIT 1'
  );
  const existingLegacyMatchStmt = db.prepare(
    `SELECT id, location, location_venue, location_street, location_zip_city
     FROM events
     WHERE team_id = ?
       AND type = 'match'
       AND external_game_id IS NULL
       AND start_time = ?
     LIMIT 1`
  );
  const updateImportedEventStmt = db.prepare(
    `UPDATE events
     SET title = ?,
       description = ?,
       location = ?,
       location_venue = ?,
       location_street = ?,
       location_zip_city = ?,
       arrival_minutes = ?,
       start_time = ?,
       end_time = ?,
       rsvp_deadline = ?,
       duration_minutes = ?,
       is_home_match = ?,
       opponent_crest_url = ?,
       external_game_id = COALESCE(external_game_id, ?),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  const created: Array<{ id: number; title: string; start_time: string }> = [];
  const updated: Array<{ id: number; title: string; start_time: string }> = [];
  const skipped: Array<{ reason: string; game: string }> = [];

  for (const game of seasonGames) {
    const gameDate = parseGameDate(game);
    if (!gameDate) {
      skipped.push({ reason: 'invalid_date', game: pickFirstString(game?.id, game?.match_id, game?.game_id, game?.title) || 'unknown' });
      continue;
    }
    const gameDateSafe = gameDate as Date;

    let homeTeam = pickFirstString(game?.homeTeam, game?.home_team, game?.home, game?.hometeam, game?.heim, game?.team_home);
    let awayTeam = pickFirstString(game?.awayTeam, game?.away_team, game?.away, game?.awayteam, game?.gast, game?.team_away);

    const rawTitle = pickFirstString(game?.title, game?.match_title);

    if (!homeTeam && !awayTeam && rawTitle && rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ');
      homeTeam = parts[0]?.trim() || '';
      awayTeam = parts[1]?.trim() || '';
    }

    let homeMatched = false;
    let awayMatched = false;
    for (const ownName of ownTeamCandidates) {
      if (!homeMatched && namesMatch(ownName, homeTeam)) {
        homeMatched = true;
      }
      if (!awayMatched && namesMatch(ownName, awayTeam)) {
        awayMatched = true;
      }
    }

    const isHomeMatch = homeMatched && !awayMatched ? 1 : 0;

    const isOwnTeamName = (value: unknown): boolean => {
      return ownTeamCandidates.some((ownName) => namesMatch(ownName, value));
    };

    const opponentName = (() => {
      if (homeMatched && !awayMatched) {
        return awayTeam;
      }
      if (awayMatched && !homeMatched) {
        return homeTeam;
      }

      const candidates = [homeTeam, awayTeam]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      const nonOwn = candidates.find((value) => !isOwnTeamName(value));
      return nonOwn || '';
    })();

    const title = opponentName
      ? `Spiel gegen ${opponentName}`
      : pickFirstString(rawTitle, 'Spiel');

    const homeCrest = pickFirstString(
      game?.homeImg,
      game?.home_img,
      game?.homeLogo,
      game?.home_logo,
      game?.homeBadge,
      game?.home_badge,
      game?.heimWappen,
      game?.heim_wappen,
    );
    const awayCrest = pickFirstString(
      game?.awayImg,
      game?.away_img,
      game?.awayLogo,
      game?.away_logo,
      game?.awayBadge,
      game?.away_badge,
      game?.gastWappen,
      game?.gast_wappen,
    );

    const opponentCrestUrl = (() => {
      if (homeMatched && !awayMatched) {
        return awayCrest || null;
      }
      if (awayMatched && !homeMatched) {
        return homeCrest || null;
      }

      if (opponentName) {
        if (namesMatch(opponentName, homeTeam)) {
          return homeCrest || null;
        }
        if (namesMatch(opponentName, awayTeam)) {
          return awayCrest || null;
        }
      }

      return awayCrest || homeCrest || null;
    })();

    const gameIdRaw = pickFirstString(
      game?.id,
      game?.match_id,
      game?.game_id,
      game?.fixture_id,
      game?.event_id,
    );

    const syntheticId = `${team.fussballde_id}:${gameDateSafe.toISOString()}:${homeTeam}:${awayTeam}`;
    const externalGameId = gameIdRaw || syntheticId;

    const endDate = new Date(gameDateSafe.getTime() + 120 * 60 * 1000);
    const rsvpHours = defaultRsvpHours;
    let rsvpDeadline: string | null = null;
    if (rsvpHours != null) {
      rsvpDeadline = new Date(gameDateSafe.getTime() - rsvpHours! * 60 * 60 * 1000).toISOString();
    }

    const locationObjects = [
      game?.location,
      game?.venue,
      game?.address,
      game?.adresse,
      game?.place,
      game?.sportfield,
      game?.match_location,
      game?.matchLocation,
      game?.locationDetails,
      game?.location_details,
      game?.sportstaette,
      game?.spielstaette,
      game?.spielstätte,
    ]
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object');

    const pickFromLocationObjects = (...keys: string[]): string | null => {
      const values: unknown[] = [];
      for (const obj of locationObjects) {
        for (const key of keys) {
          values.push(obj[key]);
        }
      }
      return pickFirstString(...values);
    };

    const venue = pickFirstString(
      game?.location_venue,
      game?.venue_name,
      game?.venueName,
      game?.location_name,
      game?.locationName,
      game?.location,
      game?.venue,
      game?.stadium,
      game?.place,
      game?.sportfield,
      game?.sportstaette,
      game?.spielstaette,
      game?.spielstätte,
      game?.facility,
      game?.field,
      game?.ground,
      pickFromLocationObjects('name', 'title', 'venue', 'venue_name', 'stadium', 'place', 'sportfield', 'sportstaette', 'spielstaette', 'spielstätte', 'facility', 'field', 'ground'),
    );

    const streetBase = pickFirstString(
      game?.street,
      game?.strasse,
      game?.address,
      game?.adresse,
      game?.location_street,
      game?.street_name,
      game?.streetName,
      pickFromLocationObjects('street', 'strasse', 'address', 'adresse', 'address1', 'line1', 'street_name', 'streetName'),
    );
    const houseNumber = pickFirstString(
      game?.house_number,
      game?.houseNumber,
      game?.hausnummer,
      pickFromLocationObjects('house_number', 'houseNumber', 'number', 'nr', 'hausnummer'),
    );
    const street = streetBase
      ? (houseNumber && !streetBase.includes(houseNumber) ? `${streetBase} ${houseNumber}` : streetBase)
      : null;

    const zip = pickFirstString(
      game?.zip,
      game?.postal_code,
      game?.postalCode,
      game?.plz,
      game?.postcode,
      pickFromLocationObjects('zip', 'postal_code', 'postalCode', 'plz', 'postcode'),
    );
    const city = pickFirstString(
      game?.city,
      game?.ort,
      game?.town,
      game?.municipality,
      pickFromLocationObjects('city', 'ort', 'town', 'municipality'),
    );
    const zipCity = pickFirstString(
      game?.zip_city,
      game?.zipCity,
      game?.location_zip_city,
      game?.postleitzahl_stadt,
      game?.plz_ort,
      pickFromLocationObjects('zip_city', 'zipCity', 'postleitzahl_stadt', 'plz_ort', 'plzOrt'),
    ) || (zip || city ? `${zip ? `${zip} ` : ''}${city || ''}`.trim() : null);

    const resolvedVenue = venue || (isHomeMatch ? defaultHomeVenue?.name ?? null : null);
    const resolvedStreet = street || (isHomeMatch ? defaultHomeVenue?.street ?? null : null);
    const resolvedZipCity = zipCity || (isHomeMatch ? defaultHomeVenue?.zip_city ?? null : null);
    const description = pickFirstString(game?.competition, game?.competition_short, game?.league, game?.staffel) || null;

    importDebugLog('Resolved game address fields', {
      externalGameId,
      title,
      extracted: {
        venue: venue || null,
        street: street || null,
        zipCity: zipCity || null,
      },
      raw: {
        location: game?.location ?? null,
        venue: game?.venue ?? null,
        address: game?.address ?? null,
        adresse: game?.adresse ?? null,
        street: game?.street ?? null,
        city: game?.city ?? null,
        zip: game?.zip ?? null,
        plz: game?.plz ?? null,
        location_street: game?.location_street ?? null,
        location_zip_city: game?.location_zip_city ?? null,
      },
    });

    const exists = existingEventByExternalIdStmt.get(externalGameId) as {
      id: number;
      location: string | null;
      location_venue: string | null;
      location_street: string | null;
      location_zip_city: string | null;
    } | undefined;
    const legacyMatch = !exists
      ? (existingLegacyMatchStmt.get(teamId, gameDateSafe.toISOString()) as {
          id: number;
          location: string | null;
          location_venue: string | null;
          location_street: string | null;
          location_zip_city: string | null;
        } | undefined)
      : undefined;
    const eventToUpdate = exists || legacyMatch;
    if (eventToUpdate) {
      const eventToUpdateSafe = eventToUpdate as {
        id: number;
        location: string | null;
        location_venue: string | null;
        location_street: string | null;
        location_zip_city: string | null;
      };
      const fallbackFromDefaultHomeVenue = Boolean(isHomeMatch && !venue && defaultHomeVenue?.name);
      const locationForUpdate =
        fallbackFromDefaultHomeVenue && eventToUpdateSafe.location
          ? eventToUpdateSafe.location
          : resolvedVenue;
      const locationVenueForUpdate =
        fallbackFromDefaultHomeVenue && eventToUpdateSafe.location_venue
          ? eventToUpdateSafe.location_venue
          : resolvedVenue;
      const locationStreetForUpdate =
        fallbackFromDefaultHomeVenue && eventToUpdateSafe.location_street
          ? eventToUpdateSafe.location_street
          : resolvedStreet;
      const locationZipCityForUpdate =
        fallbackFromDefaultHomeVenue && eventToUpdateSafe.location_zip_city
          ? eventToUpdateSafe.location_zip_city
          : resolvedZipCity;

      updateImportedEventStmt.run(
        title,
        description,
        locationForUpdate,
        locationVenueForUpdate,
        locationStreetForUpdate,
        locationZipCityForUpdate,
        defaultArrivalMinutes,
        gameDateSafe.toISOString(),
        endDate.toISOString(),
        rsvpDeadline,
        120,
        isHomeMatch,
        opponentCrestUrl,
        externalGameId,
        eventToUpdateSafe.id,
      );

      updated.push({
        id: Number(eventToUpdateSafe.id),
        title,
        start_time: gameDateSafe.toISOString(),
      });
      continue;
    }

    const result = insertEventStmt.run(
      teamId,
      title,
      'match',
      description,
      resolvedVenue,
      resolvedVenue,
      resolvedStreet,
      resolvedZipCity,
      null,
      null,
      defaultArrivalMinutes,
      gameDateSafe.toISOString(),
      endDate.toISOString(),
      rsvpDeadline,
      120,
      1,
      1,
      createdByUserId,
      externalGameId,
      isHomeMatch,
      opponentCrestUrl,
    );

    for (const userId of memberIds) {
      insertResponseStmt.run(result.lastInsertRowid, userId, defaultResponseStatus);
    }

    created.push({
      id: Number(result.lastInsertRowid),
      title,
      start_time: gameDateSafe.toISOString(),
    });
  }

  return {
    success: true,
    imported: created.length,
    updated: updated.length,
    skipped: skipped.length,
    created,
    updatedItems: updated,
    skippedDetails: skipped,
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

    const normalizedId = String(fussballde_id || '').trim().toUpperCase();
    if (!normalizedId) {
      return res.status(400).json({ error: 'fussball.de ID ist erforderlich' });
    }

    const isValidFormat = /^[A-Z0-9]{16,40}$/.test(normalizedId);
    if (!isValidFormat) {
      return res.status(400).json({ error: 'Ungültiges fussball.de ID-Format' });
    }

    db.prepare('UPDATE teams SET fussballde_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(normalizedId, teamId);

    return res.json({ id: teamId, fussballde_id: normalizedId });
  } catch (error) {
    console.error('Update fussball.de id error:', error);
    return res.status(500).json({ error: 'Failed to update fussball.de ID' });
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

    const team = db.prepare('SELECT id, name, fussballde_id FROM teams WHERE id = ?').get(teamId) as any;

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const internalMatches = db.prepare(
      `SELECT title, description, end_time
       FROM events
       WHERE team_id = ?
         AND type = 'match'
         AND end_time IS NOT NULL
         AND datetime(end_time) <= datetime('now')`
    ).all(teamId) as any[];

    const table = buildInternalTableRows(team, internalMatches);

    return res.json({
      table,
      leagueName: null,
      source: 'internal',
    });

    if (!team.fussballde_id) {
      return res.status(400).json({ error: 'Für dieses Team ist keine fussball.de ID hinterlegt' });
    }

    const envToken = HARDCODED_FUSSBALL_API_TOKEN;
    const apiBaseUrl = process.env.FUSSBALL_API_BASE_URL || 'https://api-fussball.de/api';

    if (!envToken) {
      return res.status(500).json({ error: 'FUSSBALL_API_TOKEN ist nicht konfiguriert' });
    }

    const response = await fetch(`${apiBaseUrl}/team/table/${encodeURIComponent(team.fussballde_id)}`, {
      method: 'GET',
      headers: {
        'x-auth-token': envToken,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(502).json({
          error: 'api-fussball.de Fehler (401): API-Token ungültig oder abgelaufen.',
        });
      }
      return res.status(502).json({ error: `api-fussball.de Fehler (${response.status})` });
    }

    const payload = await response.json() as any;

    if (!payload?.success || !Array.isArray(payload?.data)) {
      return res.status(502).json({ error: 'Ungültige Antwort von api-fussball.de' });
    }

    const pickFirstString = (...values: unknown[]): string | null => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return null;
    };

    const isFriendlyCompetition = (value: string | null): boolean => {
      if (!value) {
        return false;
      }
      return /(freundschaft|friendly|testspiel)/i.test(value);
    };

    let leagueName: string | null = pickFirstString(
      payload?.leagueName,
      payload?.league_name,
      payload?.league,
      payload?.leagueTitle,
      payload?.league_title,
      payload?.competition,
      payload?.competitionName,
      payload?.competition_name,
      payload?.division,
      payload?.group,
      payload?.staffel,
      payload?.klasse,
      payload?.liga,
      payload?.title,
      payload?.name,
      payload?.meta?.leagueName,
      payload?.meta?.league_name,
      payload?.meta?.competition,
      payload?.meta?.competition_name,
      payload?.meta?.staffel,
      payload?.meta?.klasse,
      payload?.meta?.liga,
      payload?.data?.leagueName,
      payload?.data?.league_name,
      payload?.data?.league,
      payload?.data?.leagueTitle,
      payload?.data?.league_title,
      payload?.data?.competition,
      payload?.data?.competitionName,
      payload?.data?.competition_name,
      payload?.data?.division,
      payload?.data?.group,
      payload?.data?.staffel,
      payload?.data?.klasse,
      payload?.data?.liga,
      Array.isArray(payload?.data) ? payload.data[0]?.leagueName : null,
      Array.isArray(payload?.data) ? payload.data[0]?.league_name : null,
      Array.isArray(payload?.data) ? payload.data[0]?.league : null,
      Array.isArray(payload?.data) ? payload.data[0]?.leagueTitle : null,
      Array.isArray(payload?.data) ? payload.data[0]?.league_title : null,
      Array.isArray(payload?.data) ? payload.data[0]?.competition : null,
      Array.isArray(payload?.data) ? payload.data[0]?.competitionName : null,
      Array.isArray(payload?.data) ? payload.data[0]?.competition_name : null,
      Array.isArray(payload?.data) ? payload.data[0]?.division : null,
      Array.isArray(payload?.data) ? payload.data[0]?.group : null,
      Array.isArray(payload?.data) ? payload.data[0]?.staffel : null,
      Array.isArray(payload?.data) ? payload.data[0]?.klasse : null,
      Array.isArray(payload?.data) ? payload.data[0]?.liga : null,
      Array.isArray(payload?.data) ? payload.data[0]?.title : null,
      Array.isArray(payload?.data) ? payload.data[0]?.name : null,
    );

    try {
      const teamInfoResponse = await fetch(`${apiBaseUrl}/team/${encodeURIComponent(team.fussballde_id)}`, {
        method: 'GET',
        headers: {
          'x-auth-token': envToken,
        },
      });

      if (teamInfoResponse.ok) {
        const teamInfoPayload = await teamInfoResponse.json() as any;
        const nextGames = Array.isArray(teamInfoPayload?.data?.nextGames) ? teamInfoPayload.data.nextGames : [];
        const prevGames = Array.isArray(teamInfoPayload?.data?.prevGames) ? teamInfoPayload.data.prevGames : [];
        const extractCompetition = (games: any[]) => {
          const game = games.find((entry) => entry && typeof entry === 'object');
          if (!game) {
            return null;
          }
          return pickFirstString(
            game.competition_short,
            game.competitionShort,
            game.competition_short_name,
            game.competitionShortName,
            game.competition_abbreviation,
            game.competitionAbbreviation,
            game.league_short,
            game.leagueShort,
            game.league_code,
            game.leagueCode,
            game.competition,
            game.league,
          );
        };

        const shortCompetition = extractCompetition(nextGames) || extractCompetition(prevGames) || null;
        if (!leagueName && shortCompetition && !isFriendlyCompetition(shortCompetition)) {
          leagueName = shortCompetition;
        }
      }
    } catch (teamInfoError) {
      console.warn('Get external team league name warning:', teamInfoError);
    }

    return res.json({
      table: payload.data,
      leagueName,
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

export default router;

