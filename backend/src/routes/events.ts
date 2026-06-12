import { Router } from 'express';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CreateEventDTO, UpdateEventResponseDTO } from '../types';
import { randomBytes } from 'crypto';
import { sendPushToUsers } from '../services/pushNotifications';

const router = Router();

router.use(authenticate);

router.use((_req, _res, next) => {
  try {
    db.prepare(`
      UPDATE event_responses
      SET status = 'declined',
          responded_at = CURRENT_TIMESTAMP
      WHERE status = 'tentative'
        AND event_id IN (
          SELECT id
          FROM events
          WHERE rsvp_deadline IS NOT NULL
            AND rsvp_deadline <= ?
        )
    `).run(new Date().toISOString());
  } catch (error) {
    console.error('Auto-convert tentative responses error:', error);
  }

  next();
});

// Helper function to generate recurring event dates
function generateRecurringDates(
  startTime: Date,
  endTime: Date,
  repeatType: string,
  repeatUntil: Date,
  repeatDays?: number[]
): Array<{ start: Date; end: Date }> {
  const dates: Array<{ start: Date; end: Date }> = [];
  const duration = endTime.getTime() - startTime.getTime();
  
  if (repeatType === 'weekly' && repeatDays && repeatDays.length > 0) {
    let currentDate = new Date(startTime);
    
    // Go through each week until repeat_until
    while (currentDate <= repeatUntil) {
      // Check each day of the week
      for (const dayOfWeek of repeatDays) {
        const eventDate = new Date(currentDate);
        const currentDay = eventDate.getDay();
        const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
        eventDate.setDate(eventDate.getDate() + daysToAdd);
        
        // Only add if within the date range and not before start
        if (eventDate >= startTime && eventDate <= repeatUntil) {
          const start = new Date(eventDate);
          const end = new Date(start.getTime() + duration);
          dates.push({ start, end });
        }
      }
      
      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);
    }
  } else if (repeatType === 'custom' && repeatDays && repeatDays.length > 0) {
    // Custom: specific days, but check all occurrences
    let currentDate = new Date(startTime);
    currentDate.setHours(0, 0, 0, 0); // Start from beginning of day
    
    while (currentDate <= repeatUntil) {
      if (repeatDays.includes(currentDate.getDay())) {
        const start = new Date(currentDate);
        start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
        
        if (start >= startTime && start <= repeatUntil) {
          const end = new Date(start.getTime() + duration);
          dates.push({ start, end });
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  // Sort by date
  dates.sort((a, b) => a.start.getTime() - b.start.getTime());
  
  return dates;
}

function parseRepeatUntilDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return date;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

type EventTeamRow = { id: number; name: string };

function normalizeTeamIds(primaryTeamId: number, rawTeamIds: unknown): number[] {
  const extraTeamIds = Array.isArray(rawTeamIds) ? rawTeamIds : [];
  return [...new Set([primaryTeamId, ...extraTeamIds].map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function getEventTeams(eventId: number): EventTeamRow[] {
  return db.prepare(
    `SELECT t.id, t.name
     FROM event_teams et
     INNER JOIN teams t ON t.id = et.team_id
     WHERE et.event_id = ?
     ORDER BY t.name COLLATE NOCASE ASC`
  ).all(eventId) as EventTeamRow[];
}

function getEventTeamIds(eventId: number): number[] {
  return getEventTeams(eventId).map((team) => Number(team.id)).filter((teamId) => Number.isInteger(teamId) && teamId > 0);
}

function getMemberIdsForTeams(teamIds: number[]): number[] {
  const normalizedTeamIds = [...new Set(teamIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  if (normalizedTeamIds.length === 0) {
    return [];
  }

  const placeholders = normalizedTeamIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT DISTINCT user_id
     FROM team_members
     WHERE team_id IN (${placeholders})`
  ).all(...normalizedTeamIds) as Array<{ user_id: number }>;

  return rows.map((row) => Number(row.user_id)).filter((userId) => Number.isInteger(userId) && userId > 0);
}

function isMemberOfAnyTeam(userId: number, teamIds: number[]): boolean {
  if (!Number.isInteger(userId) || userId <= 0 || teamIds.length === 0) {
    return false;
  }

  const normalizedTeamIds = [...new Set(teamIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  const placeholders = normalizedTeamIds.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT 1 as match
     FROM team_members
     WHERE user_id = ? AND team_id IN (${placeholders})
     LIMIT 1`
  ).get(userId, ...normalizedTeamIds) as { match?: number } | undefined;

  return Boolean(row?.match);
}

function isTrainerForAllTeams(userId: number, teamIds: number[]): boolean {
  if (!Number.isInteger(userId) || userId <= 0 || teamIds.length === 0) {
    return false;
  }

  const normalizedTeamIds = [...new Set(teamIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  const placeholders = normalizedTeamIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT team_id
     FROM team_members
     WHERE user_id = ? AND role = 'trainer' AND team_id IN (${placeholders})`
  ).all(userId, ...normalizedTeamIds) as Array<{ team_id: number }>;

  return new Set(rows.map((row) => Number(row.team_id))).size === normalizedTeamIds.length;
}

function canManageEvent(userId: number, eventId: number, createdBy: number): boolean {
  if (Number(userId) === Number(createdBy)) {
    return true;
  }

  return isTrainerForAllTeams(userId, getEventTeamIds(eventId));
}

function addEventTeamLinks(eventId: number, teamIds: number[]) {
  const insertStmt = db.prepare('INSERT OR IGNORE INTO event_teams (event_id, team_id) VALUES (?, ?)');
  for (const teamId of teamIds) {
    insertStmt.run(eventId, teamId);
  }
}

function attachTeamMetaToEvent<T extends Record<string, any>>(event: T): T & { team_ids: number[]; team_names: string[]; team_name: string } {
  const teams = getEventTeams(Number(event.id));
  return {
    ...event,
    team_ids: teams.map((team) => Number(team.id)),
    team_names: teams.map((team) => String(team.name || '')),
    team_name: teams.map((team) => String(team.name || '')).join(' / ') || String(event.team_name || ''),
  };
}

function attachTeamMetaToEvents<T extends Record<string, any>>(events: T[]): Array<T & { team_ids: number[]; team_names: string[]; team_name: string }> {
  return events.map((event) => attachTeamMetaToEvent(event));
}

function getTeamNamesByIds(teamIds: number[]): string[] {
  const normalizedTeamIds = [...new Set(teamIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  if (normalizedTeamIds.length === 0) {
    return [];
  }

  const placeholders = normalizedTeamIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, name
     FROM teams
     WHERE id IN (${placeholders})`
  ).all(...normalizedTeamIds) as Array<{ id: number; name: string }>;

  const nameById = new Map(rows.map((row) => [Number(row.id), String(row.name || '').trim()]));
  return normalizedTeamIds
    .map((teamId) => nameById.get(teamId) || '')
    .filter((name) => Boolean(name));
}

function formatTeamLabel(teamNames: string[]): string {
  const normalized = [...new Set(teamNames.map((name) => String(name || '').trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return '';
  }

  return normalized.join(' / ');
}

function formatEventDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'bald';
  }

  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getDistinctResponseUserIds(eventIds: number[]): number[] {
  const normalizedEventIds = [...new Set(eventIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (normalizedEventIds.length === 0) {
    return [];
  }

  const placeholders = normalizedEventIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT DISTINCT user_id
     FROM event_responses
     WHERE event_id IN (${placeholders})`
  ).all(...normalizedEventIds) as Array<{ user_id: number }>;

  return rows
    .map((row) => Number(row.user_id))
    .filter((userId) => Number.isInteger(userId) && userId > 0);
}

function hasMatchingPitchTypeInHomeVenues(homeVenuesRaw: unknown, selectedPitchTypeRaw: unknown): boolean {
  const selectedPitchType = String(selectedPitchTypeRaw || '').trim().toLowerCase();
  if (!selectedPitchType) {
    return true;
  }

  let parsedHomeVenues: any[] = [];

  if (Array.isArray(homeVenuesRaw)) {
    parsedHomeVenues = homeVenuesRaw;
  } else if (typeof homeVenuesRaw === 'string' && homeVenuesRaw.trim()) {
    try {
      const parsed = JSON.parse(homeVenuesRaw);
      if (Array.isArray(parsed)) {
        parsedHomeVenues = parsed;
      }
    } catch {
      parsedHomeVenues = [];
    }
  }

  return parsedHomeVenues.some((venue) => {
    const venuePitchType = String(venue?.pitch_type || '').trim().toLowerCase();
    return venuePitchType === selectedPitchType;
  });
}

type MatchLineupSlot = {
  slot: string;
  user_id: number | null;
  x_pct?: number | null;
  y_pct?: number | null;
};

type MatchSquadRow = {
  event_id: number;
  squad_user_ids: string;
  lineup_slots: string;
  is_released: number;
  released_at?: string | null;
  updated_at?: string | null;
};

const MATCH_LINEUP_SLOTS = ['TW', 'LV', 'IV1', 'IV2', 'RV', 'DM', 'ZM', 'OM', 'LF', 'ST', 'RF'];

function normalizePercentCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0 || parsed > 100) {
    return null;
  }

  return Math.round(parsed * 10) / 10;
}

function normalizeSquadUserIds(rawValue: unknown, allowedMemberIds: Set<number>): number[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return [...new Set(rawValue.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && allowedMemberIds.has(entry)))].slice(0, 40);
}

function normalizeLineupSlots(rawValue: unknown, squadUserIds: Set<number>): MatchLineupSlot[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const seenSlots = new Set<string>();
  const normalized: MatchLineupSlot[] = [];

  for (const entry of rawValue) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const source = entry as Record<string, unknown>;
    const slot = String(source.slot || '').trim().toUpperCase();
    if (!MATCH_LINEUP_SLOTS.includes(slot) || seenSlots.has(slot)) {
      continue;
    }

    const rawUserId = source.user_id;
    const parsedUserId = rawUserId === null || rawUserId === undefined || String(rawUserId).trim() === ''
      ? null
      : Number(rawUserId);

    if (parsedUserId !== null && (!Number.isInteger(parsedUserId) || !squadUserIds.has(parsedUserId))) {
      continue;
    }

    seenSlots.add(slot);
    normalized.push({
      slot,
      user_id: parsedUserId,
      x_pct: normalizePercentCoordinate(source.x_pct),
      y_pct: normalizePercentCoordinate(source.y_pct),
    });
  }

  return normalized;
}

function parseStoredSquadUserIds(rawValue: unknown): number[] {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry)))];
  } catch {
    return [];
  }
}

function parseStoredLineupSlots(rawValue: unknown): MatchLineupSlot[] {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const source = entry as Record<string, unknown>;
        const slot = String(source.slot || '').trim().toUpperCase();
        if (!MATCH_LINEUP_SLOTS.includes(slot)) return null;

        const parsedUserId = source.user_id === null || source.user_id === undefined || String(source.user_id).trim() === ''
          ? null
          : Number(source.user_id);

        if (parsedUserId !== null && !Number.isInteger(parsedUserId)) {
          return null;
        }

        return {
          slot,
          user_id: parsedUserId,
          x_pct: normalizePercentCoordinate(source.x_pct),
          y_pct: normalizePercentCoordinate(source.y_pct),
        };
      })
      .filter(Boolean) as MatchLineupSlot[];
  } catch {
    return [];
  }
}

function createMatchSquadResponse(row: MatchSquadRow | undefined | null) {
  if (!row) {
    return {
      event_id: null,
      squad_user_ids: [],
      lineup_slots: [],
      is_released: 0,
      released_at: null,
      updated_at: null,
      lineup_slot_order: MATCH_LINEUP_SLOTS,
    };
  }

  return {
    event_id: row.event_id,
    squad_user_ids: parseStoredSquadUserIds(row.squad_user_ids),
    lineup_slots: parseStoredLineupSlots(row.lineup_slots),
    is_released: row.is_released ? 1 : 0,
    released_at: row.released_at || null,
    updated_at: row.updated_at || null,
    lineup_slot_order: MATCH_LINEUP_SLOTS,
  };
}

function getMatchSquadPlayers(teamId: number, squadUserIds: number[]) {
  if (!Number.isInteger(teamId) || teamId <= 0 || squadUserIds.length === 0) {
    return [];
  }

  const placeholders = squadUserIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT u.id, u.name, u.profile_picture, tm.jersey_number
     FROM users u
     INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
     WHERE u.id IN (${placeholders})`
  ).all(teamId, ...squadUserIds) as Array<{ id: number; name: string; profile_picture?: string; jersey_number?: number | null }>;

  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return squadUserIds
    .map((userId) => byId.get(userId))
    .filter(Boolean)
    .map((row) => ({
      id: Number(row!.id),
      name: String(row!.name || ''),
      profile_picture: row!.profile_picture || null,
      jersey_number: row!.jersey_number ?? null,
    }));
}

// Get upcoming events for user (next 6 events)
router.get('/my-upcoming', (req: AuthRequest, res) => {
  try {
    const now = new Date().toISOString();

    const events = db.prepare(`
      SELECT e.*, 
             u.name as created_by_name,
             er.status as my_status,
             er.comment as my_comment,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'accepted') as accepted_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'declined') as declined_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'tentative') as tentative_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'pending') as pending_count
      FROM events e
      INNER JOIN users u ON e.created_by = u.id
      LEFT JOIN event_responses er ON er.event_id = e.id AND er.user_id = ?
      WHERE e.start_time >= ?
        AND EXISTS (
          SELECT 1
          FROM event_teams et
          INNER JOIN team_members tm ON tm.team_id = et.team_id
          WHERE et.event_id = e.id AND tm.user_id = ?
        )
      ORDER BY e.start_time ASC
      LIMIT 6
    `).all(req.user!.id, now, req.user!.id);

    res.json(attachTeamMetaToEvents(events as any[]));
  } catch (error) {
    console.error('Get my upcoming events error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming events' });
  }
});

// Get all future events for user across all teams
router.get('/my-all', (req: AuthRequest, res) => {
  try {
    const { view } = req.query;
    const now = new Date().toISOString();
    const isPastView = view === 'past';

    const comparator = isPastView ? '<=' : '>=';
    const orderDirection = isPastView ? 'DESC' : 'ASC';

    const events = db.prepare(`
      SELECT e.*, 
             u.name as created_by_name,
             er.status as my_status,
             er.comment as my_comment,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'accepted') as accepted_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'declined') as declined_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'tentative') as tentative_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'pending') as pending_count
      FROM events e
      INNER JOIN users u ON e.created_by = u.id
      LEFT JOIN event_responses er ON er.event_id = e.id AND er.user_id = ?
      WHERE e.start_time ${comparator} ?
        AND EXISTS (
          SELECT 1
          FROM event_teams et
          INNER JOIN team_members tm ON tm.team_id = et.team_id
          WHERE et.event_id = e.id AND tm.user_id = ?
        )
      ORDER BY e.start_time ${orderDirection}
    `).all(req.user!.id, now, req.user!.id);

    res.json(attachTeamMetaToEvents(events as any[]));
  } catch (error) {
    console.error('Get my all events error:', error);
    res.status(500).json({ error: 'Failed to fetch all events' });
  }
});

// Get events for a team
router.get('/', (req: AuthRequest, res) => {
  try {
    const { team_id, from, to, view } = req.query;
    const now = new Date().toISOString();
    const isPastView = view === 'past';

    if (!team_id) {
      return res.status(400).json({ error: 'team_id is required' });
    }

    // Check membership
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(team_id, req.user!.id);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    let query = `
            SELECT e.*, 
              t.name as team_name,
             u.name as created_by_name,
             er.status as my_status,
             er.comment as my_comment,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'accepted') as accepted_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'declined') as declined_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'tentative') as tentative_count,
             (SELECT COUNT(*) FROM event_responses WHERE event_id = e.id AND status = 'pending') as pending_count
      FROM events e
      INNER JOIN event_teams et_filter ON et_filter.event_id = e.id AND et_filter.team_id = ?
      INNER JOIN teams t ON et_filter.team_id = t.id
      INNER JOIN users u ON e.created_by = u.id
      LEFT JOIN event_responses er ON er.event_id = e.id AND er.user_id = ?
      WHERE 1 = 1
    `;

    const params: any[] = [team_id, req.user!.id];

    if (from) {
      query += ' AND e.start_time >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND e.start_time <= ?';
      params.push(to);
    }

    if (!from && !to) {
      query += isPastView ? ' AND e.start_time <= ?' : ' AND e.start_time >= ?';
      params.push(now);
    }

    query += ` ORDER BY e.start_time ${isPastView ? 'DESC' : 'ASC'}`;

    const events = db.prepare(query).all(...params);

    res.json(attachTeamMetaToEvents(events as any[]));
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get single event
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id);

    const event = db.prepare(`
      SELECT e.*, u.name as created_by_name
      FROM events e
      INNER JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(eventId) as any;

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check membership
    const eventTeamIds = getEventTeamIds(eventId);
    if (!isMemberOfAnyTeam(req.user!.id, eventTeamIds)) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const isTrainer = eventTeamIds.some((teamId) => {
      const membership = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user!.id) as any;
      return membership?.role === 'trainer';
    });

    // Get responses
    let responses = db.prepare(`
      SELECT er.*, u.name as user_name, u.profile_picture as user_profile_picture
      FROM event_responses er
      INNER JOIN users u ON er.user_id = u.id
      WHERE er.event_id = ?
      ORDER BY er.responded_at DESC
    `).all(eventId);

    const canViewResponses = isTrainer || event.visibility_all === 1 || event.visibility_all === true;
    if (!canViewResponses) {
      responses = responses.filter((response: any) => response.user_id === req.user!.id);
    }

    const eventWithSeriesMeta = attachTeamMetaToEvent({ ...event }) as any;
    if (event.series_id) {
      const seriesEvents = db.prepare(
        'SELECT start_time FROM events WHERE series_id = ? ORDER BY start_time ASC'
      ).all(event.series_id) as Array<{ start_time: string }>;

      const repeatDaysSet = new Set<number>();
      for (const seriesEvent of seriesEvents) {
        const date = new Date(seriesEvent.start_time);
        if (!Number.isNaN(date.getTime())) {
          repeatDaysSet.add(date.getDay());
        }
      }

      const lastSeriesEvent = seriesEvents[seriesEvents.length - 1];
      const repeatUntil = lastSeriesEvent?.start_time
        ? String(lastSeriesEvent.start_time).slice(0, 10)
        : null;

      eventWithSeriesMeta.repeat_type = 'custom';
      eventWithSeriesMeta.repeat_days = [...repeatDaysSet].sort((a, b) => a - b);
      eventWithSeriesMeta.repeat_until = repeatUntil;
    }

    res.json({ ...eventWithSeriesMeta, responses });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

router.get('/:id/squad', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const event = db.prepare('SELECT id, team_id, type, created_by FROM events WHERE id = ?').get(eventId) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.type !== 'match') {
      return res.status(400).json({ error: 'Squad is only available for match events' });
    }

    if (!isMemberOfAnyTeam(req.user!.id, getEventTeamIds(eventId))) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const squadRow = db.prepare(
      'SELECT event_id, squad_user_ids, lineup_slots, is_released, released_at, updated_at FROM event_match_squads WHERE event_id = ?'
    ).get(eventId) as MatchSquadRow | undefined;

    const payload = createMatchSquadResponse(squadRow);

    const canManage = canManageEvent(req.user!.id, eventId, event.created_by);
    if (!canManage && payload.is_released !== 1) {
      return res.json({
        event_id: eventId,
        squad_user_ids: [],
        lineup_slots: [],
        squad_players: [],
        is_released: 0,
        released_at: null,
        updated_at: payload.updated_at,
        lineup_slot_order: MATCH_LINEUP_SLOTS,
      });
    }

    return res.json({
      ...payload,
      event_id: eventId,
      squad_players: getMatchSquadPlayers(event.team_id, payload.squad_user_ids),
    });
  } catch (error) {
    console.error('Get match squad error:', error);
    return res.status(500).json({ error: 'Failed to fetch match squad' });
  }
});

router.put('/:id/squad', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const event = db.prepare('SELECT id, team_id, type, created_by FROM events WHERE id = ?').get(eventId) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.type !== 'match') {
      return res.status(400).json({ error: 'Squad is only available for match events' });
    }

    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can edit match squad' });
    }

    const allowedMemberIds = new Set(getMemberIdsForTeams(getEventTeamIds(eventId)));

    const squadUserIds = normalizeSquadUserIds(req.body?.squad_user_ids, allowedMemberIds);
    const squadSet = new Set(squadUserIds);
    const lineupSlots = normalizeLineupSlots(req.body?.lineup_slots, squadSet);

    db.prepare(
      `INSERT INTO event_match_squads (event_id, squad_user_ids, lineup_slots, is_released, released_at, updated_at)
       VALUES (?, ?, ?, 0, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(event_id) DO UPDATE SET
         squad_user_ids = excluded.squad_user_ids,
         lineup_slots = excluded.lineup_slots,
         is_released = 0,
         released_at = NULL,
         updated_at = CURRENT_TIMESTAMP`
    ).run(eventId, JSON.stringify(squadUserIds), JSON.stringify(lineupSlots));

    const updatedRow = db.prepare(
      'SELECT event_id, squad_user_ids, lineup_slots, is_released, released_at, updated_at FROM event_match_squads WHERE event_id = ?'
    ).get(eventId) as MatchSquadRow;

    const payload = createMatchSquadResponse(updatedRow);
    return res.json({
      ...payload,
      squad_players: getMatchSquadPlayers(event.team_id, payload.squad_user_ids),
    });
  } catch (error) {
    console.error('Update match squad error:', error);
    return res.status(500).json({ error: 'Failed to update match squad' });
  }
});

router.post('/:id/squad/release', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const event = db.prepare('SELECT id, team_id, type, created_by FROM events WHERE id = ?').get(eventId) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.type !== 'match') {
      return res.status(400).json({ error: 'Squad is only available for match events' });
    }

    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can release match squad' });
    }

    const existingSquad = db.prepare(
      'SELECT event_id, squad_user_ids, lineup_slots, is_released, released_at, updated_at FROM event_match_squads WHERE event_id = ?'
    ).get(eventId) as MatchSquadRow | undefined;

    if (!existingSquad) {
      return res.status(400).json({ error: 'Bitte zuerst einen Kader speichern' });
    }

    const squadUserIds = parseStoredSquadUserIds(existingSquad.squad_user_ids);
    if (squadUserIds.length === 0) {
      return res.status(400).json({ error: 'Bitte mindestens einen Spieler im Kader auswählen' });
    }

    db.prepare(
      `UPDATE event_match_squads
       SET is_released = 1,
           released_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = ?`
    ).run(eventId);

    const releasedRow = db.prepare(
      'SELECT event_id, squad_user_ids, lineup_slots, is_released, released_at, updated_at FROM event_match_squads WHERE event_id = ?'
    ).get(eventId) as MatchSquadRow;

    const payload = createMatchSquadResponse(releasedRow);
    return res.json({
      ...payload,
      squad_players: getMatchSquadPlayers(event.team_id, payload.squad_user_ids),
    });
  } catch (error) {
    console.error('Release match squad error:', error);
    return res.status(500).json({ error: 'Failed to release match squad' });
  }
});

// Create event (or series)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { 
      team_id,
      team_ids,
      title, 
      type, 
      description, 
      location,
      location_venue,
      location_street,
      location_zip_city,
      pitch_type,
      meeting_point,
      arrival_minutes,
      start_time, 
      end_time,
      rsvp_deadline,
      duration_minutes,
      visibility_all = true,
      invite_all = true,
      invited_user_ids = [],
      repeat_type,
      repeat_until,
      repeat_days
    }: CreateEventDTO = req.body;

    if (!team_id || !title || !type || !start_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let resolvedEndTime = end_time;

    const resolvedLocation = location_venue || location || null;

    const targetTeamIds = normalizeTeamIds(team_id, team_ids);
    if (!isTrainerForAllTeams(req.user!.id, targetTeamIds)) {
      return res.status(403).json({ error: 'Only trainers can create events' });
    }

    const targetTeamLabel = formatTeamLabel(getTeamNamesByIds(targetTeamIds));

    const teamSettings = db.prepare(
      `SELECT default_response, default_rsvp_deadline_hours,
              default_rsvp_deadline_hours_training, default_rsvp_deadline_hours_match, default_rsvp_deadline_hours_other,
              default_arrival_minutes, default_arrival_minutes_training, default_arrival_minutes_match, default_arrival_minutes_other,
              default_duration_minutes, default_duration_minutes_training, default_duration_minutes_match, default_duration_minutes_other,
              home_venues
       FROM teams WHERE id = ?`
    ).get(team_id) as any;

    if (!hasMatchingPitchTypeInHomeVenues(teamSettings?.home_venues, pitch_type)) {
      return res.status(400).json({ error: `Für die Platzart "${String(pitch_type || '').trim()}" ist kein Heimspiel-Platz hinterlegt` });
    }

    const validDefaultStatuses = new Set(['pending', 'accepted', 'tentative', 'declined']);
    const defaultResponseStatus = validDefaultStatuses.has(teamSettings?.default_response)
      ? teamSettings.default_response
      : 'pending';

    const resolvedMeetingPoint = meeting_point || null;

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

    const defaultArrivalMinutesByType: Record<'training' | 'match' | 'other', number | null> = {
      training: parseArrivalMinutes(teamSettings?.default_arrival_minutes_training),
      match: parseArrivalMinutes(teamSettings?.default_arrival_minutes_match),
      other: parseArrivalMinutes(teamSettings?.default_arrival_minutes_other),
    };

    const legacyDefaultArrivalMinutes = parseArrivalMinutes(teamSettings?.default_arrival_minutes);

    const selectedDefaultArrivalMinutes =
      defaultArrivalMinutesByType[(type as 'training' | 'match' | 'other') || 'other'] ?? legacyDefaultArrivalMinutes;

    const resolvedArrivalMinutes = arrival_minutes ?? selectedDefaultArrivalMinutes ?? null;

    const parseDurationMinutes = (value: unknown): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 5 || parsed > 480) {
        return null;
      }
      return parsed;
    };

    const defaultDurationMinutesByType: Record<'training' | 'match' | 'other', number | null> = {
      training: parseDurationMinutes(teamSettings?.default_duration_minutes_training),
      match: parseDurationMinutes(teamSettings?.default_duration_minutes_match),
      other: parseDurationMinutes(teamSettings?.default_duration_minutes_other),
    };

    const legacyDefaultDurationMinutes = parseDurationMinutes(teamSettings?.default_duration_minutes);

    const selectedDefaultDurationMinutes =
      defaultDurationMinutesByType[(type as 'training' | 'match' | 'other') || 'other'] ?? legacyDefaultDurationMinutes;

    const resolvedDurationMinutes = parseDurationMinutes(duration_minutes) ?? selectedDefaultDurationMinutes;

    if (resolvedDurationMinutes && start_time) {
      const startDate = new Date(start_time);
      const computedEnd = new Date(startDate.getTime() + resolvedDurationMinutes * 60000);
      resolvedEndTime = computedEnd.toISOString();
    }

    if (!resolvedEndTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    const defaultRsvpDeadlineHoursByType: Record<'training' | 'match' | 'other', number | null> = {
      training: parseRsvpHours(teamSettings?.default_rsvp_deadline_hours_training),
      match: parseRsvpHours(teamSettings?.default_rsvp_deadline_hours_match),
      other: parseRsvpHours(teamSettings?.default_rsvp_deadline_hours_other),
    };

    const legacyDefaultRsvpDeadlineHours = parseRsvpHours(teamSettings?.default_rsvp_deadline_hours);

    const selectedDefaultRsvpDeadlineHours =
      defaultRsvpDeadlineHoursByType[(type as 'training' | 'match' | 'other') || 'other'] ?? legacyDefaultRsvpDeadlineHours;

    const getDefaultRsvpDeadline = (eventStart: string): string | null => {
      if (rsvp_deadline) {
        return rsvp_deadline;
      }
      if (selectedDefaultRsvpDeadlineHours === null) {
        return null;
      }

      const startDate = new Date(eventStart);
      if (isNaN(startDate.getTime())) {
        return null;
      }

      const deadlineDate = new Date(startDate.getTime() - selectedDefaultRsvpDeadlineHours * 60 * 60 * 1000);
      return deadlineDate.toISOString();
    };

    // Get all team members for responses
    const memberIds = getMemberIdsForTeams(targetTeamIds);

    let invitedUserIds = invited_user_ids?.length ? invited_user_ids : (invite_all ? memberIds : []);
    invitedUserIds = invitedUserIds.filter((id) => memberIds.includes(id));

    if (invitedUserIds.length === 0) {
      return res.status(400).json({ error: 'At least one invited user is required' });
    }
    
    const normalizedRepeatDays = Array.isArray(repeat_days)
      ? [...new Set(repeat_days.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
      : [];

    const startDateForSeries = new Date(start_time);
    const weeklyFallbackDays = Number.isNaN(startDateForSeries.getTime()) ? [] : [startDateForSeries.getDay()];
    const effectiveRepeatDays =
      repeat_type === 'weekly'
        ? (normalizedRepeatDays.length > 0 ? normalizedRepeatDays : weeklyFallbackDays)
        : normalizedRepeatDays;

    const repeatUntilValue = typeof repeat_until === 'string' ? repeat_until : '';

    // Check if this is a recurring event
    const isRecurring = Boolean(
      repeat_type
      && repeat_type !== 'none'
      && repeatUntilValue
      && effectiveRepeatDays.length > 0
    );
    
    if (isRecurring) {
      // Generate series ID
      const seriesId = randomBytes(16).toString('hex');
      
      // Generate all event dates
      const startDate = new Date(start_time);
      const endDate = new Date(resolvedEndTime);
      const untilDate = parseRepeatUntilDate(repeatUntilValue);
      
      const eventDates = generateRecurringDates(startDate, endDate, repeat_type!, untilDate, effectiveRepeatDays);
      
      if (eventDates.length === 0) {
        return res.status(400).json({ error: 'No valid dates generated for recurring event' });
      }
      
      // Create all events in the series
      const stmt = db.prepare(
        'INSERT INTO events (team_id, title, type, description, location, location_venue, location_street, location_zip_city, pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes, visibility_all, invite_all, created_by, series_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      
      const responseStmt = db.prepare(
        'INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)'
      );
      
      const createdEvents = [];
      
      for (const { start, end } of eventDates) {
        const result = stmt.run(
          team_id, 
          title, 
          type, 
          description, 
          resolvedLocation,
          location_venue || null,
          location_street || null,
          location_zip_city || null,
          pitch_type || null,
          resolvedMeetingPoint,
          resolvedArrivalMinutes,
          start.toISOString(), 
          end.toISOString(), 
          getDefaultRsvpDeadline(start.toISOString()),
          resolvedDurationMinutes,
          visibility_all ? 1 : 0,
          invite_all ? 1 : 0,
          req.user!.id,
          seriesId
        );
        
        addEventTeamLinks(Number(result.lastInsertRowid), targetTeamIds);

        // Create pending responses for all team members
        for (const userId of invitedUserIds) {
          responseStmt.run(result.lastInsertRowid, userId, defaultResponseStatus);
        }
        
        createdEvents.push({
          id: result.lastInsertRowid,
          start_time: start.toISOString(),
          end_time: end.toISOString()
        });
      }

      const notifyUserIds = invitedUserIds;
      if (notifyUserIds.length > 0) {
        await sendPushToUsers(notifyUserIds, {
          title: 'Neue Terminserie',
          body: `${targetTeamLabel ? `${targetTeamLabel}: ` : ''}${title}: ${createdEvents.length} Termine wurden erstellt.`,
          url: `/teams/${team_id}/events`,
        });
      }
      
      return res.status(201).json({
        message: `Created ${createdEvents.length} events in series`,
        series_id: seriesId,
        events: createdEvents
      });
    } else {
      // Create single event
      const stmt = db.prepare(
        'INSERT INTO events (team_id, title, type, description, location, location_venue, location_street, location_zip_city, pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes, visibility_all, invite_all, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const result = stmt.run(
        team_id,
        title,
        type,
        description,
        resolvedLocation,
        location_venue || null,
        location_street || null,
        location_zip_city || null,
        pitch_type || null,
        resolvedMeetingPoint,
        resolvedArrivalMinutes,
        start_time,
        resolvedEndTime,
        getDefaultRsvpDeadline(start_time),
        resolvedDurationMinutes,
        visibility_all ? 1 : 0,
        invite_all ? 1 : 0,
        req.user!.id
      );

      addEventTeamLinks(Number(result.lastInsertRowid), targetTeamIds);

      const resolvedSingleRsvpDeadline = getDefaultRsvpDeadline(start_time);

      // Create pending responses for all team members
      const responseStmt = db.prepare(
        'INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)'
      );

      for (const userId of invitedUserIds) {
        responseStmt.run(result.lastInsertRowid, userId, defaultResponseStatus);
      }

      const notifyUserIds = invitedUserIds;
      if (notifyUserIds.length > 0) {
        await sendPushToUsers(notifyUserIds, {
          title: 'Neuer Termin',
          body: `${targetTeamLabel ? `${targetTeamLabel}: ` : ''}${title} am ${formatEventDateTime(start_time)}`,
          url: `/events/${result.lastInsertRowid}`,
        });
      }

      return res.status(201).json({
        id: result.lastInsertRowid,
        team_id,
        team_ids: targetTeamIds,
        title,
        type,
        description,
        location,
        start_time,
        end_time: resolvedEndTime,
        rsvp_deadline: resolvedSingleRsvpDeadline,
        duration_minutes: duration_minutes ?? null,
        visibility_all: visibility_all ? 1 : 0,
        invite_all: invite_all ? 1 : 0,
        created_by: req.user!.id
      });
    }
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event response
router.put('/:id', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const updateSeries = req.query.update_series === 'true';
    const {
      title,
      type,
      description,
      location,
      location_venue,
      location_street,
      location_zip_city,
      pitch_type,
      meeting_point,
      arrival_minutes,
      start_time,
      end_time,
      rsvp_deadline,
      duration_minutes,
      visibility_all,
      invite_all,
      invited_user_ids,
      repeat_until,
      repeat_days,
    } = req.body as {
      title?: string;
      type?: 'training' | 'match' | 'other';
      description?: string;
      location?: string;
      location_venue?: string;
      location_street?: string;
      location_zip_city?: string;
      pitch_type?: string;
      meeting_point?: string;
      arrival_minutes?: number | null;
      start_time?: string;
      end_time?: string;
      rsvp_deadline?: string;
      duration_minutes?: number | null;
      visibility_all?: boolean | number;
      invite_all?: boolean | number;
      invited_user_ids?: number[];
      repeat_until?: string;
      repeat_days?: number[];
    };

    if (!title || !type || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const event = db.prepare('SELECT id, team_id, series_id, start_time, end_time, created_by FROM events WHERE id = ?').get(eventId) as any;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const eventTeamIds = getEventTeamIds(eventId);
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can edit events' });
    }

    const resolvedLocation = location_venue || location || null;

    const teamMemberIds = getMemberIdsForTeams(eventTeamIds);
    const normalizedInvitedUserIds = Array.isArray(invited_user_ids)
      ? [...new Set(invited_user_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && teamMemberIds.includes(value)))]
      : [];

    const resolvedInviteAll = !(invite_all === false || invite_all === 0);
    const resolvedInvitedUserIds = resolvedInviteAll ? teamMemberIds : normalizedInvitedUserIds;

    if (!resolvedInviteAll && resolvedInvitedUserIds.length === 0) {
      return res.status(400).json({ error: 'Bitte mindestens einen Teilnehmer einladen' });
    }

    const sourceStartDate = new Date(event.start_time);
    const targetStartDate = new Date(start_time);
    const targetEndDate = new Date(end_time);

    if (Number.isNaN(sourceStartDate.getTime()) || Number.isNaN(targetStartDate.getTime()) || Number.isNaN(targetEndDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumswerte' });
    }

    const startShiftMs = targetStartDate.getTime() - sourceStartDate.getTime();
    const targetDurationMs = targetEndDate.getTime() - targetStartDate.getTime();

    if (!Number.isFinite(targetDurationMs) || targetDurationMs < 0) {
      return res.status(400).json({ error: 'Ungültige Endzeit' });
    }

    const targetRsvpDate = rsvp_deadline ? new Date(rsvp_deadline) : null;
    if (targetRsvpDate && Number.isNaN(targetRsvpDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Rückmeldefrist' });
    }
    const targetRsvpOffsetMs = targetRsvpDate
      ? targetStartDate.getTime() - targetRsvpDate.getTime()
      : null;

    const normalizedRepeatDays = Array.isArray(repeat_days)
      ? [...new Set(repeat_days.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
      : [];
    const repeatUntilValue = typeof repeat_until === 'string' ? repeat_until.trim() : '';
    const shouldReshapeSeries = Boolean(updateSeries && event.series_id && (repeatUntilValue || normalizedRepeatDays.length > 0));

    if (shouldReshapeSeries && (!repeatUntilValue || normalizedRepeatDays.length === 0)) {
      return res.status(400).json({ error: 'Für Serien-Änderungen sind Wochentage und Enddatum erforderlich' });
    }

    const updateStmt = db.prepare(
      `UPDATE events
       SET title = ?,
           type = ?,
           description = ?,
           location = ?,
           location_venue = ?,
           location_street = ?,
           location_zip_city = ?,
           pitch_type = ?,
           meeting_point = ?,
           arrival_minutes = ?,
           start_time = ?,
           end_time = ?,
           rsvp_deadline = ?,
           duration_minutes = ?,
           visibility_all = ?,
           invite_all = ?,
             series_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    const teamSettings = db.prepare('SELECT default_response, home_venues FROM teams WHERE id = ?').get(event.team_id) as { default_response?: string; home_venues?: unknown } | undefined;

    if (!hasMatchingPitchTypeInHomeVenues(teamSettings?.home_venues, pitch_type)) {
      return res.status(400).json({ error: `Für die Platzart "${String(pitch_type || '').trim()}" ist kein Heimspiel-Platz hinterlegt` });
    }

    const validStatuses = new Set(['pending', 'accepted', 'tentative', 'declined']);
    const defaultResponseStatus = validStatuses.has(String(teamSettings?.default_response || 'pending'))
      ? String(teamSettings?.default_response || 'pending')
      : 'pending';

    const syncInvitesForEvent = (targetEventId: number) => {
      const existingResponses = db.prepare('SELECT user_id FROM event_responses WHERE event_id = ?').all(targetEventId) as Array<{ user_id: number }>;
      const existingUserIdSet = new Set(existingResponses.map((row) => Number(row.user_id)));
      const invitedUserIdSet = new Set(resolvedInvitedUserIds);

      const usersToAdd = resolvedInvitedUserIds.filter((userId) => !existingUserIdSet.has(userId));
      const usersToRemove = [...existingUserIdSet].filter((userId) => !invitedUserIdSet.has(userId));

      if (usersToRemove.length > 0) {
        const placeholders = usersToRemove.map(() => '?').join(',');
        db.prepare(`DELETE FROM event_responses WHERE event_id = ? AND user_id IN (${placeholders})`).run(targetEventId, ...usersToRemove);
      }

      if (usersToAdd.length > 0) {
        const insertStmt = db.prepare('INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)');
        for (const userId of usersToAdd) {
          insertStmt.run(targetEventId, userId, defaultResponseStatus);
        }
      }
    };

    const createSeriesEventStmt = db.prepare(
      'INSERT INTO events (team_id, title, type, description, location, location_venue, location_street, location_zip_city, pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes, visibility_all, invite_all, created_by, series_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    if (shouldReshapeSeries) {
      const untilDate = parseRepeatUntilDate(repeatUntilValue);
      if (Number.isNaN(untilDate.getTime())) {
        return res.status(400).json({ error: 'Ungültiges Enddatum für die Serie' });
      }

      const seriesEvents = db.prepare('SELECT id, start_time FROM events WHERE series_id = ? ORDER BY start_time ASC').all(event.series_id) as Array<{ id: number; start_time: string }>;
      if (seriesEvents.length === 0) {
        return res.status(400).json({ error: 'Keine Serientermine gefunden' });
      }

      const firstSeriesStart = new Date(seriesEvents[0].start_time);
      if (Number.isNaN(firstSeriesStart.getTime())) {
        return res.status(400).json({ error: 'Ungültiger Serienstart' });
      }

      const generationStart = new Date(firstSeriesStart);
      generationStart.setUTCHours(
        targetStartDate.getUTCHours(),
        targetStartDate.getUTCMinutes(),
        targetStartDate.getUTCSeconds(),
        targetStartDate.getUTCMilliseconds()
      );
      const generationEnd = new Date(generationStart.getTime() + targetDurationMs);

      const generatedDates = generateRecurringDates(
        generationStart,
        generationEnd,
        'custom',
        untilDate,
        normalizedRepeatDays
      );

      if (generatedDates.length === 0) {
        return res.status(400).json({ error: 'Keine gültigen Termine für die Serie erzeugt' });
      }

      const remainingExisting = [...seriesEvents];

      for (const generatedDate of generatedDates) {
        const desiredStartMs = generatedDate.start.getTime();
        const existingIndex = remainingExisting.findIndex((item) => {
          const value = new Date(item.start_time).getTime();
          return Number.isFinite(value) && value === desiredStartMs;
        });

        const nextRsvpDeadline = targetRsvpOffsetMs === null
          ? null
          : new Date(generatedDate.start.getTime() - targetRsvpOffsetMs).toISOString();

        if (existingIndex >= 0) {
          const existingEvent = remainingExisting[existingIndex];
          remainingExisting.splice(existingIndex, 1);

          updateStmt.run(
            title,
            type,
            description || null,
            resolvedLocation,
            location_venue || null,
            location_street || null,
            location_zip_city || null,
            pitch_type || null,
            meeting_point || null,
            arrival_minutes === null || arrival_minutes === undefined || Number.isNaN(arrival_minutes) ? null : arrival_minutes,
            generatedDate.start.toISOString(),
            generatedDate.end.toISOString(),
            nextRsvpDeadline,
            duration_minutes === null || duration_minutes === undefined || Number.isNaN(duration_minutes) ? null : duration_minutes,
            visibility_all === false || visibility_all === 0 ? 0 : 1,
            resolvedInviteAll ? 1 : 0,
            event.series_id,
            existingEvent.id
          );

          syncInvitesForEvent(existingEvent.id);
          continue;
        }

        const inserted = createSeriesEventStmt.run(
          event.team_id,
          title,
          type,
          description || null,
          resolvedLocation,
          location_venue || null,
          location_street || null,
          location_zip_city || null,
          pitch_type || null,
          meeting_point || null,
          arrival_minutes === null || arrival_minutes === undefined || Number.isNaN(arrival_minutes) ? null : arrival_minutes,
          generatedDate.start.toISOString(),
          generatedDate.end.toISOString(),
          nextRsvpDeadline,
          duration_minutes === null || duration_minutes === undefined || Number.isNaN(duration_minutes) ? null : duration_minutes,
          visibility_all === false || visibility_all === 0 ? 0 : 1,
          resolvedInviteAll ? 1 : 0,
          event.created_by,
          event.series_id
        );

        addEventTeamLinks(Number(inserted.lastInsertRowid), eventTeamIds);

        syncInvitesForEvent(Number(inserted.lastInsertRowid));
      }

      if (remainingExisting.length > 0) {
        const idsToDelete = remainingExisting.map((item) => Number(item.id)).filter((value) => Number.isFinite(value));
        if (idsToDelete.length > 0) {
          const placeholders = idsToDelete.map(() => '?').join(',');
          db.prepare(`DELETE FROM event_responses WHERE event_id IN (${placeholders})`).run(...idsToDelete);
          db.prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(...idsToDelete);
        }
      }

      return res.json({ success: true });
    }

    const eventsToUpdate = updateSeries && event.series_id
      ? db.prepare('SELECT id, start_time FROM events WHERE series_id = ?').all(event.series_id) as Array<{ id: number; start_time: string }>
      : [{ id: eventId, start_time: event.start_time }];

    for (const targetEvent of eventsToUpdate) {
      const currentStart = new Date(targetEvent.start_time);
      const nextStartDate = Number.isNaN(currentStart.getTime())
        ? targetStartDate
        : new Date(currentStart.getTime() + startShiftMs);
      const nextEndDate = new Date(nextStartDate.getTime() + targetDurationMs);
      const nextRsvpDeadline = targetRsvpOffsetMs === null
        ? null
        : new Date(nextStartDate.getTime() - targetRsvpOffsetMs).toISOString();

      updateStmt.run(
        title,
        type,
        description || null,
        resolvedLocation,
        location_venue || null,
        location_street || null,
        location_zip_city || null,
        pitch_type || null,
        meeting_point || null,
        arrival_minutes === null || arrival_minutes === undefined || Number.isNaN(arrival_minutes) ? null : arrival_minutes,
        nextStartDate.toISOString(),
        nextEndDate.toISOString(),
        nextRsvpDeadline,
        duration_minutes === null || duration_minutes === undefined || Number.isNaN(duration_minutes) ? null : duration_minutes,
        visibility_all === false || visibility_all === 0 ? 0 : 1,
        resolvedInviteAll ? 1 : 0,
        updateSeries && event.series_id ? event.series_id : null,
        targetEvent.id
      );

      syncInvitesForEvent(targetEvent.id);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Update event error:', error);
    return res.status(500).json({ error: 'Failed to update event' });
  }
});

// Update event response
router.post('/:id/response', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { status, comment }: UpdateEventResponseDTO = req.body;
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const allowedStatuses = new Set(['accepted', 'declined', 'tentative', 'pending']);
    const normalizedComment = typeof comment === 'string' ? comment.trim() : '';

    if (!normalizedStatus) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if (!allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Check if event exists and user is member
    const event = db.prepare('SELECT id, team_id, rsvp_deadline FROM events WHERE id = ?').get(eventId) as any;
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (normalizedStatus === 'tentative' && event.rsvp_deadline) {
      const deadlineDate = new Date(event.rsvp_deadline);
      if (!Number.isNaN(deadlineDate.getTime())) {
        const tentativeCutoff = new Date(deadlineDate.getTime() - 60 * 60 * 1000);
        if (new Date() >= tentativeCutoff) {
          return res.status(400).json({ error: 'Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich' });
        }
      }
    }

    const eventTeamIds = getEventTeamIds(eventId);
    const membership = eventTeamIds
      .map((teamId) => db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user!.id) as { role: string } | undefined)
      .find(Boolean);

    if (!membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    if (normalizedStatus === 'declined' && membership.role !== 'trainer' && !normalizedComment) {
      return res.status(400).json({ error: 'Bitte gib einen Grund für die Absage an' });
    }

    // Update or create response
    const stmt = db.prepare(`
      INSERT INTO event_responses (event_id, user_id, status, comment)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id, user_id) 
      DO UPDATE SET status = ?, comment = ?, responded_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      eventId,
      req.user!.id,
      normalizedStatus,
      normalizedComment || null,
      normalizedStatus,
      normalizedComment || null
    );

    res.json({ success: true, status: normalizedStatus, comment: normalizedComment || null });
  } catch (error) {
    console.error('Update response error:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Update event response for a specific user (trainer only)
router.post('/:id/response/:userId', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const { status, comment }: UpdateEventResponseDTO = req.body;
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const allowedStatuses = new Set(['accepted', 'declined', 'tentative', 'pending']);
    const normalizedComment = typeof comment === 'string' ? comment.trim() : '';

    if (!normalizedStatus) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if (!allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Check if event exists
    const event = db.prepare('SELECT id, team_id, rsvp_deadline, created_by FROM events WHERE id = ?').get(eventId) as any;
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (normalizedStatus === 'tentative' && event.rsvp_deadline) {
      const deadlineDate = new Date(event.rsvp_deadline);
      if (!Number.isNaN(deadlineDate.getTime())) {
        const tentativeCutoff = new Date(deadlineDate.getTime() - 60 * 60 * 1000);
        if (new Date() >= tentativeCutoff) {
          return res.status(400).json({ error: 'Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich' });
        }
      }
    }

    // Check if user is trainer in this team
    const eventTeamIds = getEventTeamIds(eventId);
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can update player responses' });
    }

    if (!isMemberOfAnyTeam(userId, eventTeamIds)) {
      return res.status(404).json({ error: 'User is not a team member' });
    }

    // Update or create response
    const stmt = db.prepare(`
      INSERT INTO event_responses (event_id, user_id, status, comment)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id, user_id) 
      DO UPDATE SET status = ?, comment = ?, responded_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      eventId,
      userId,
      normalizedStatus,
      normalizedComment || null,
      normalizedStatus,
      normalizedComment || null
    );

    res.json({ success: true, status: normalizedStatus, comment: normalizedComment || null, user_id: userId });
  } catch (error) {
    console.error('Update response for user error:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Delete event (or series)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const deleteSeries = req.query.delete_series === 'true';
    const deleteNote = typeof req.body?.delete_note === 'string' ? req.body.delete_note.trim() : '';

    // Check if event exists
    const event = db.prepare('SELECT id, team_id, series_id, title, start_time, created_by FROM events WHERE id = ?').get(eventId) as any;
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is trainer
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can delete events' });
    }

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

    // Delete event or entire series
    if (deleteSeries && event.series_id) {
      const eventsInSeries = db.prepare(
        'SELECT id, team_id, title, start_time, end_time FROM events WHERE series_id = ?'
      ).all(event.series_id) as Array<{ id: number; team_id: number; title: string; start_time: string; end_time: string }>;
      const seriesTeamLabel = formatTeamLabel(getEventTeams(eventId).map((team) => team.name));
      const notifyUserIds = getDistinctResponseUserIds(eventsInSeries.map((seriesEvent) => seriesEvent.id))
        .filter((userId) => userId !== req.user!.id);

      const deleteSeriesTx = db.transaction(() => {
        for (const eventRow of eventsInSeries) {
          upsertDeletedEventStmt.run(
            eventRow.id,
            eventRow.team_id,
            eventRow.title || null,
            eventRow.start_time || null,
            eventRow.end_time || null
          );
        }

        return db.prepare('DELETE FROM events WHERE series_id = ?').run(event.series_id);
      });

      const result = deleteSeriesTx();

      if (notifyUserIds.length > 0) {
        const noteSuffix = deleteNote ? ` Hinweis: ${deleteNote}` : '';
        await sendPushToUsers(notifyUserIds, {
          title: 'Terminserie abgesagt',
          body: `${seriesTeamLabel ? `${seriesTeamLabel}: ` : ''}${event.title || 'Eine Terminserie'} wurde abgesagt.${noteSuffix}`,
          url: `/teams/${event.team_id}/events`,
        });
      }

      res.json({ success: true, deleted_count: result.changes });
    } else {
      const eventToDelete = db.prepare(
        'SELECT id, team_id, title, start_time, end_time FROM events WHERE id = ?'
      ).get(eventId) as { id: number; team_id: number; title: string; start_time: string; end_time: string } | undefined;

      if (!eventToDelete) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const singleEventTeamLabel = formatTeamLabel(getEventTeams(eventId).map((team) => team.name));

      const notifyUserIds = getDistinctResponseUserIds([eventId]).filter((userId) => userId !== req.user!.id);

      const deleteSingleTx = db.transaction(() => {
        upsertDeletedEventStmt.run(
          eventToDelete.id,
          eventToDelete.team_id,
          eventToDelete.title || null,
          eventToDelete.start_time || null,
          eventToDelete.end_time || null
        );

        db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
      });

      deleteSingleTx();

      if (notifyUserIds.length > 0) {
        const noteSuffix = deleteNote ? ` Hinweis: ${deleteNote}` : '';
        await sendPushToUsers(notifyUserIds, {
          title: 'Termin abgesagt',
          body: `${singleEventTeamLabel ? `${singleEventTeamLabel}: ` : ''}${eventToDelete.title || 'Ein Termin'} am ${formatEventDateTime(eventToDelete.start_time)} wurde abgesagt.${noteSuffix}`,
          url: `/teams/${eventToDelete.team_id}/events`,
        });
      }

      res.json({ success: true, deleted_count: 1 });
    }
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
