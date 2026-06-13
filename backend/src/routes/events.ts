import { Router } from 'express';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CreateEventDTO } from '../types';
import { randomBytes } from 'crypto';
import { sendPushToUsers } from '../services/pushNotifications';
import { updateEventResponseSchema } from '../utils/validation';
import {
  generateRecurringDates,
  parseRepeatUntilDate,
  normalizeTeamIds,
  getEventTeams,
  getEventTeamIds,
  getMemberIdsForTeams,
  isMemberOfAnyTeam,
  isTrainerForAllTeams,
  canManageEvent,
  addEventTeamLinks,
  attachTeamMetaToEvent,
  attachTeamMetaToEvents,
  getTeamNamesByIds,
  formatTeamLabel,
  formatEventDateTime,
  hasMatchingPitchTypeInHomeVenues,
  normalizeSquadUserIds,
  normalizeLineupSlots,
  parseStoredSquadUserIds,
  createMatchSquadResponse,
  getMatchSquadPlayers,
  parseIntClamp,
  type MatchSquadRow,
  MATCH_LINEUP_SLOTS,
} from '../services/eventHelpers';

const router = Router();

router.use(authenticate);

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
    const eventId = parseInt(req.params.id, 10);

    const event = db.prepare(`
      SELECT e.*, u.name as created_by_name,
        CASE WHEN e.series_id IS NOT NULL THEN (SELECT COUNT(*) FROM events WHERE series_id = e.series_id) ELSE NULL END as series_count
      FROM events e
      INNER JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(eventId) as any;

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const eventTeamIds = getEventTeamIds(eventId);
    if (!isMemberOfAnyTeam(req.user!.id, eventTeamIds)) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    const isTrainer = eventTeamIds.some((teamId) => {
      const m = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user!.id) as any;
      return m?.role === 'trainer';
    });

    let responses = db.prepare(`
      SELECT er.*, u.name as user_name, u.profile_picture as user_profile_picture
      FROM event_responses er
      INNER JOIN users u ON er.user_id = u.id
      WHERE er.event_id = ?
      ORDER BY er.responded_at DESC
    `).all(eventId);

    const canViewResponses = isTrainer || event.visibility_all === 1 || event.visibility_all === true;
    if (!canViewResponses) {
      responses = responses.filter((r: any) => r.user_id === req.user!.id);
    }

    const eventWithSeriesMeta = attachTeamMetaToEvent({ ...event }) as any;
    if (event.series_id) {
      const seriesEvents = db.prepare(
        'SELECT start_time FROM events WHERE series_id = ? ORDER BY start_time ASC'
      ).all(event.series_id) as Array<{ start_time: string }>;

      const repeatDaysSet = new Set<number>();
      for (const se of seriesEvents) {
        const d = new Date(se.start_time);
        if (!Number.isNaN(d.getTime())) repeatDaysSet.add(d.getDay());
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
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.type !== 'match') return res.status(400).json({ error: 'Squad is only available for match events' });
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
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.type !== 'match') return res.status(400).json({ error: 'Squad is only available for match events' });
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can edit match squad' });
    }

    const allowedMemberIds = new Set(getMemberIdsForTeams(getEventTeamIds(eventId)));
    const squadUserIds = normalizeSquadUserIds(req.body?.squad_user_ids, allowedMemberIds);
    const lineupSlots = normalizeLineupSlots(req.body?.lineup_slots, new Set(squadUserIds));

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
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.type !== 'match') return res.status(400).json({ error: 'Squad is only available for match events' });
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can release match squad' });
    }

    const existingSquad = db.prepare(
      'SELECT event_id, squad_user_ids, lineup_slots, is_released, released_at, updated_at FROM event_match_squads WHERE event_id = ?'
    ).get(eventId) as MatchSquadRow | undefined;

    if (!existingSquad) return res.status(400).json({ error: 'Bitte zuerst einen Kader speichern' });

    const squadUserIds = parseStoredSquadUserIds(existingSquad.squad_user_ids);
    if (squadUserIds.length === 0) {
      return res.status(400).json({ error: 'Bitte mindestens einen Spieler im Kader auswählen' });
    }

    db.prepare(
      `UPDATE event_match_squads
       SET is_released = 1, released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
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
      `SELECT default_response,
              default_rsvp_deadline_hours,
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

    const eventType = (type as 'training' | 'match' | 'other') || 'other';

    const defaultArrivalByType: Record<'training' | 'match' | 'other', number | null> = {
      training: parseIntClamp(teamSettings?.default_arrival_minutes_training, 0, 240),
      match: parseIntClamp(teamSettings?.default_arrival_minutes_match, 0, 240),
      other: parseIntClamp(teamSettings?.default_arrival_minutes_other, 0, 240),
    };
    const legacyArrival = parseIntClamp(teamSettings?.default_arrival_minutes, 0, 240);
    const selectedArrival = defaultArrivalByType[eventType] ?? legacyArrival;
    const resolvedArrivalMinutes = arrival_minutes ?? selectedArrival ?? null;

    const defaultDurationByType: Record<'training' | 'match' | 'other', number | null> = {
      training: parseIntClamp(teamSettings?.default_duration_minutes_training, 5, 480),
      match: parseIntClamp(teamSettings?.default_duration_minutes_match, 5, 480),
      other: parseIntClamp(teamSettings?.default_duration_minutes_other, 5, 480),
    };
    const legacyDuration = parseIntClamp(teamSettings?.default_duration_minutes, 5, 480);
    const selectedDuration = defaultDurationByType[eventType] ?? legacyDuration;
    const resolvedDurationMinutes = parseIntClamp(duration_minutes, 5, 480) ?? selectedDuration;

    if (resolvedDurationMinutes && start_time) {
      const startDate = new Date(start_time);
      resolvedEndTime = new Date(startDate.getTime() + resolvedDurationMinutes * 60000).toISOString();
    }

    if (!resolvedEndTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const defaultRsvpByType: Record<'training' | 'match' | 'other', number | null> = {
      training: parseIntClamp(teamSettings?.default_rsvp_deadline_hours_training, 0, 168),
      match: parseIntClamp(teamSettings?.default_rsvp_deadline_hours_match, 0, 168),
      other: parseIntClamp(teamSettings?.default_rsvp_deadline_hours_other, 0, 168),
    };
    const legacyRsvp = parseIntClamp(teamSettings?.default_rsvp_deadline_hours, 0, 168);
    const selectedRsvpHours = defaultRsvpByType[eventType] ?? legacyRsvp;

    const getDefaultRsvpDeadline = (eventStart: string): string | null => {
      if (rsvp_deadline) return rsvp_deadline;
      if (selectedRsvpHours === null) return null;
      const startDate = new Date(eventStart);
      if (isNaN(startDate.getTime())) return null;
      return new Date(startDate.getTime() - selectedRsvpHours * 60 * 60 * 1000).toISOString();
    };

    const memberIds = getMemberIdsForTeams(targetTeamIds);
    let invitedUserIds = invited_user_ids?.length ? invited_user_ids : (invite_all ? memberIds : []);
    invitedUserIds = invitedUserIds.filter((id) => memberIds.includes(id));

    if (invitedUserIds.length === 0) {
      return res.status(400).json({ error: 'At least one invited user is required' });
    }

    const normalizedRepeatDays = Array.isArray(repeat_days)
      ? [...new Set(repeat_days.map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6))]
      : [];

    const startDateForSeries = new Date(start_time);
    const weeklyFallbackDays = Number.isNaN(startDateForSeries.getTime()) ? [] : [startDateForSeries.getDay()];
    const effectiveRepeatDays = repeat_type === 'weekly'
      ? (normalizedRepeatDays.length > 0 ? normalizedRepeatDays : weeklyFallbackDays)
      : normalizedRepeatDays;

    const repeatUntilValue = typeof repeat_until === 'string' ? repeat_until : '';
    const isRecurring = Boolean(repeat_type && repeat_type !== 'none' && repeatUntilValue && effectiveRepeatDays.length > 0);

    if (isRecurring) {
      const seriesId = randomBytes(16).toString('hex');
      const startDate = new Date(start_time);
      const endDate = new Date(resolvedEndTime);
      const untilDate = parseRepeatUntilDate(repeatUntilValue);
      const eventDates = generateRecurringDates(startDate, endDate, repeat_type!, untilDate, effectiveRepeatDays);

      if (eventDates.length === 0) {
        return res.status(400).json({ error: 'No valid dates generated for recurring event' });
      }

      const insertStmt = db.prepare(
        'INSERT INTO events (team_id, title, type, description, location, location_venue, location_street, location_zip_city, pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes, visibility_all, invite_all, created_by, series_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const responseStmt = db.prepare('INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)');
      const createdEvents = [];

      for (const { start, end } of eventDates) {
        const result = insertStmt.run(
          team_id, title, type, description, resolvedLocation,
          location_venue || null, location_street || null, location_zip_city || null,
          pitch_type || null, resolvedMeetingPoint, resolvedArrivalMinutes,
          start.toISOString(), end.toISOString(), getDefaultRsvpDeadline(start.toISOString()),
          resolvedDurationMinutes, visibility_all ? 1 : 0, invite_all ? 1 : 0, req.user!.id, seriesId
        );
        addEventTeamLinks(Number(result.lastInsertRowid), targetTeamIds);
        for (const userId of invitedUserIds) responseStmt.run(result.lastInsertRowid, userId, defaultResponseStatus);
        createdEvents.push({ id: result.lastInsertRowid, start_time: start.toISOString(), end_time: end.toISOString() });
      }

      if (invitedUserIds.length > 0) {
        const first = createdEvents[0];
        const additionalCount = Math.max(createdEvents.length - 1, 0);
        const seriesSuffix = additionalCount > 0 ? ` (+${additionalCount} weitere Termine)` : '';
        await sendPushToUsers(invitedUserIds, {
          title: 'Neuer Termin',
          body: `${targetTeamLabel ? `${targetTeamLabel}: ` : ''}${title} am ${formatEventDateTime(String(first?.start_time || start_time))}${seriesSuffix}`,
          url: first?.id ? `/events/${first.id}` : `/teams/${team_id}/events`,
        });
      }

      return res.status(201).json({
        message: `Created ${createdEvents.length} events in series`,
        series_id: seriesId,
        events: createdEvents,
      });
    } else {
      const insertStmt = db.prepare(
        'INSERT INTO events (team_id, title, type, description, location, location_venue, location_street, location_zip_city, pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes, visibility_all, invite_all, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const result = insertStmt.run(
        team_id, title, type, description, resolvedLocation,
        location_venue || null, location_street || null, location_zip_city || null,
        pitch_type || null, resolvedMeetingPoint, resolvedArrivalMinutes,
        start_time, resolvedEndTime, getDefaultRsvpDeadline(start_time),
        resolvedDurationMinutes, visibility_all ? 1 : 0, invite_all ? 1 : 0, req.user!.id
      );
      addEventTeamLinks(Number(result.lastInsertRowid), targetTeamIds);

      const responseStmt = db.prepare('INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)');
      for (const userId of invitedUserIds) responseStmt.run(result.lastInsertRowid, userId, defaultResponseStatus);

      if (invitedUserIds.length > 0) {
        await sendPushToUsers(invitedUserIds, {
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
        rsvp_deadline: getDefaultRsvpDeadline(start_time),
        duration_minutes: duration_minutes ?? null,
        visibility_all: visibility_all ? 1 : 0,
        invite_all: invite_all ? 1 : 0,
        created_by: req.user!.id,
      });
    }
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/:id', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
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
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const eventTeamIds = getEventTeamIds(eventId);
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can edit events' });
    }

    const resolvedLocation = location_venue || location || null;
    const teamMemberIds = getMemberIdsForTeams(eventTeamIds);
    const normalizedInvitedUserIds = Array.isArray(invited_user_ids)
      ? [...new Set(invited_user_ids.map(Number).filter((v) => Number.isFinite(v) && teamMemberIds.includes(v)))]
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
      ? [...new Set(repeat_days.map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6))]
      : [];
    const repeatUntilValue = typeof repeat_until === 'string' ? repeat_until.trim() : '';
    const shouldReshapeSeries = Boolean(updateSeries && event.series_id && (repeatUntilValue || normalizedRepeatDays.length > 0));

    if (shouldReshapeSeries && (!repeatUntilValue || normalizedRepeatDays.length === 0)) {
      return res.status(400).json({ error: 'Für Serien-Änderungen sind Wochentage und Enddatum erforderlich' });
    }

    const teamSettings = db.prepare('SELECT default_response, home_venues FROM teams WHERE id = ?').get(event.team_id) as { default_response?: string; home_venues?: unknown } | undefined;

    if (!hasMatchingPitchTypeInHomeVenues(teamSettings?.home_venues, pitch_type)) {
      return res.status(400).json({ error: `Für die Platzart "${String(pitch_type || '').trim()}" ist kein Heimspiel-Platz hinterlegt` });
    }

    const validStatuses = new Set(['pending', 'accepted', 'tentative', 'declined']);
    const defaultResponseStatus = validStatuses.has(String(teamSettings?.default_response || 'pending'))
      ? String(teamSettings?.default_response || 'pending')
      : 'pending';

    const updateStmt = db.prepare(
      `UPDATE events
       SET title = ?, type = ?, description = ?, location = ?,
           location_venue = ?, location_street = ?, location_zip_city = ?,
           pitch_type = ?, meeting_point = ?, arrival_minutes = ?,
           start_time = ?, end_time = ?, rsvp_deadline = ?, duration_minutes = ?,
           visibility_all = ?, invite_all = ?, series_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    const arrivalVal = (v: number | null | undefined) =>
      v === null || v === undefined || Number.isNaN(v as number) ? null : v;
    const durationVal = (v: number | null | undefined) =>
      v === null || v === undefined || Number.isNaN(v as number) ? null : v;
    const visibilityVal = (v: boolean | number | undefined) =>
      v === false || v === 0 ? 0 : 1;

    const syncInvitesForEvent = (targetEventId: number) => {
      const existing = db.prepare('SELECT user_id FROM event_responses WHERE event_id = ?').all(targetEventId) as Array<{ user_id: number }>;
      const existingSet = new Set(existing.map((r) => Number(r.user_id)));
      const invitedSet = new Set(resolvedInvitedUserIds);

      const toRemove = [...existingSet].filter((uid) => !invitedSet.has(uid));
      const toAdd = resolvedInvitedUserIds.filter((uid) => !existingSet.has(uid));

      if (toRemove.length > 0) {
        const ph = toRemove.map(() => '?').join(',');
        db.prepare(`DELETE FROM event_responses WHERE event_id = ? AND user_id IN (${ph})`).run(targetEventId, ...toRemove);
      }
      if (toAdd.length > 0) {
        const stmt = db.prepare('INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)');
        for (const uid of toAdd) stmt.run(targetEventId, uid, defaultResponseStatus);
      }
    };

    if (shouldReshapeSeries) {
      const untilDate = parseRepeatUntilDate(repeatUntilValue);
      if (Number.isNaN(untilDate.getTime())) {
        return res.status(400).json({ error: 'Ungültiges Enddatum für die Serie' });
      }

      const seriesEvents = db.prepare('SELECT id, start_time FROM events WHERE series_id = ? ORDER BY start_time ASC').all(event.series_id) as Array<{ id: number; start_time: string }>;
      if (seriesEvents.length === 0) return res.status(400).json({ error: 'Keine Serientermine gefunden' });

      const firstSeriesStart = new Date(seriesEvents[0].start_time);
      if (Number.isNaN(firstSeriesStart.getTime())) return res.status(400).json({ error: 'Ungültiger Serienstart' });

      const generationStart = new Date(firstSeriesStart);
      generationStart.setUTCHours(
        targetStartDate.getUTCHours(), targetStartDate.getUTCMinutes(),
        targetStartDate.getUTCSeconds(), targetStartDate.getUTCMilliseconds()
      );
      const generationEnd = new Date(generationStart.getTime() + targetDurationMs);

      const generatedDates = generateRecurringDates(generationStart, generationEnd, 'custom', untilDate, normalizedRepeatDays);
      if (generatedDates.length === 0) return res.status(400).json({ error: 'Keine gültigen Termine für die Serie erzeugt' });

      const remainingExisting = [...seriesEvents];
      const createStmt = db.prepare(
        'INSERT INTO events (team_id, title, type, description, location, location_venue, location_street, location_zip_city, pitch_type, meeting_point, arrival_minutes, start_time, end_time, rsvp_deadline, duration_minutes, visibility_all, invite_all, created_by, series_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );

      db.transaction(() => {
        for (const gd of generatedDates) {
          const nextRsvpDeadline = targetRsvpOffsetMs === null
            ? null
            : new Date(gd.start.getTime() - targetRsvpOffsetMs).toISOString();

          const existingIdx = remainingExisting.findIndex((item) => {
            const v = new Date(item.start_time).getTime();
            return Number.isFinite(v) && v === gd.start.getTime();
          });

          if (existingIdx >= 0) {
            const existingEvent = remainingExisting[existingIdx];
            remainingExisting.splice(existingIdx, 1);
            updateStmt.run(
              title, type, description || null, resolvedLocation,
              location_venue || null, location_street || null, location_zip_city || null,
              pitch_type || null, meeting_point || null, arrivalVal(arrival_minutes),
              gd.start.toISOString(), gd.end.toISOString(), nextRsvpDeadline, durationVal(duration_minutes),
              visibilityVal(visibility_all), resolvedInviteAll ? 1 : 0, event.series_id, existingEvent.id
            );
            syncInvitesForEvent(existingEvent.id);
          } else {
            const inserted = createStmt.run(
              event.team_id, title, type, description || null, resolvedLocation,
              location_venue || null, location_street || null, location_zip_city || null,
              pitch_type || null, meeting_point || null, arrivalVal(arrival_minutes),
              gd.start.toISOString(), gd.end.toISOString(), nextRsvpDeadline, durationVal(duration_minutes),
              visibilityVal(visibility_all), resolvedInviteAll ? 1 : 0, event.created_by, event.series_id
            );
            addEventTeamLinks(Number(inserted.lastInsertRowid), eventTeamIds);
            syncInvitesForEvent(Number(inserted.lastInsertRowid));
          }
        }

        if (remainingExisting.length > 0) {
          const idsToDelete = remainingExisting.map((item) => Number(item.id)).filter(Number.isFinite);
          if (idsToDelete.length > 0) {
            const ph = idsToDelete.map(() => '?').join(',');
            db.prepare(`DELETE FROM event_responses WHERE event_id IN (${ph})`).run(...idsToDelete);
            db.prepare(`DELETE FROM events WHERE id IN (${ph})`).run(...idsToDelete);
          }
        }
      })();

      return res.json({ success: true });
    }

    const eventsToUpdate = updateSeries && event.series_id
      ? db.prepare('SELECT id, start_time FROM events WHERE series_id = ?').all(event.series_id) as Array<{ id: number; start_time: string }>
      : [{ id: eventId, start_time: event.start_time }];

    for (const targetEvent of eventsToUpdate) {
      const currentStart = new Date(targetEvent.start_time);
      const nextStart = Number.isNaN(currentStart.getTime())
        ? targetStartDate
        : new Date(currentStart.getTime() + startShiftMs);
      const nextEnd = new Date(nextStart.getTime() + targetDurationMs);
      const nextRsvp = targetRsvpOffsetMs === null
        ? null
        : new Date(nextStart.getTime() - targetRsvpOffsetMs).toISOString();

      updateStmt.run(
        title, type, description || null, resolvedLocation,
        location_venue || null, location_street || null, location_zip_city || null,
        pitch_type || null, meeting_point || null, arrivalVal(arrival_minutes),
        nextStart.toISOString(), nextEnd.toISOString(), nextRsvp, durationVal(duration_minutes),
        visibilityVal(visibility_all), resolvedInviteAll ? 1 : 0,
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

// Update event response (own)
router.post('/:id/response', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const schemaResult = updateEventResponseSchema.safeParse(req.body);
    if (!schemaResult.success) {
      return res.status(400).json({ error: schemaResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { status, comment } = schemaResult.data;
    const normalizedComment = comment?.trim() ?? '';

    const event = db.prepare('SELECT id, team_id, rsvp_deadline FROM events WHERE id = ?').get(eventId) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (status === 'tentative' && event.rsvp_deadline) {
      const deadlineDate = new Date(event.rsvp_deadline);
      if (!Number.isNaN(deadlineDate.getTime())) {
        const cutoff = new Date(deadlineDate.getTime() - 60 * 60 * 1000);
        if (new Date() >= cutoff) {
          return res.status(400).json({ error: 'Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich' });
        }
      }
    }

    const eventTeamIds = getEventTeamIds(eventId);
    const membership = eventTeamIds
      .map((teamId) => db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user!.id) as { role: string } | undefined)
      .find(Boolean);

    if (!membership) return res.status(403).json({ error: 'Not a team member' });

    if (status === 'declined' && membership.role !== 'trainer' && !normalizedComment) {
      return res.status(400).json({ error: 'Bitte gib einen Grund für die Absage an' });
    }

    db.prepare(`
      INSERT INTO event_responses (event_id, user_id, status, comment)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id, user_id)
      DO UPDATE SET status = ?, comment = ?, responded_at = CURRENT_TIMESTAMP
    `).run(eventId, req.user!.id, status, normalizedComment || null, status, normalizedComment || null);

    res.json({ success: true, status, comment: normalizedComment || null });
  } catch (error) {
    console.error('Update response error:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Update event response for a specific user (trainer only)
router.post('/:id/response/:userId', (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    const schemaResult = updateEventResponseSchema.safeParse(req.body);
    if (!schemaResult.success) {
      return res.status(400).json({ error: schemaResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { status, comment } = schemaResult.data;
    const normalizedComment = comment?.trim() ?? '';

    const event = db.prepare('SELECT id, team_id, rsvp_deadline, created_by FROM events WHERE id = ?').get(eventId) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (status === 'tentative' && event.rsvp_deadline) {
      const deadlineDate = new Date(event.rsvp_deadline);
      if (!Number.isNaN(deadlineDate.getTime())) {
        const cutoff = new Date(deadlineDate.getTime() - 60 * 60 * 1000);
        if (new Date() >= cutoff) {
          return res.status(400).json({ error: 'Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich' });
        }
      }
    }

    const eventTeamIds = getEventTeamIds(eventId);
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can update player responses' });
    }
    if (!isMemberOfAnyTeam(userId, eventTeamIds)) {
      return res.status(404).json({ error: 'User is not a team member' });
    }

    db.prepare(`
      INSERT INTO event_responses (event_id, user_id, status, comment)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id, user_id)
      DO UPDATE SET status = ?, comment = ?, responded_at = CURRENT_TIMESTAMP
    `).run(eventId, userId, status, normalizedComment || null, status, normalizedComment || null);

    res.json({ success: true, status, comment: normalizedComment || null, user_id: userId });
  } catch (error) {
    console.error('Update response for user error:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Delete event (or series)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const deleteSeries = req.query.delete_series === 'true';
    const deleteNote = typeof req.body?.delete_note === 'string' ? req.body.delete_note.trim() : '';

    const event = db.prepare('SELECT id, team_id, series_id, title, start_time, created_by FROM events WHERE id = ?').get(eventId) as any;
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (!canManageEvent(req.user!.id, eventId, event.created_by)) {
      return res.status(403).json({ error: 'Only trainers can delete events' });
    }

    const upsertDeleted = db.prepare(
      `INSERT INTO deleted_events (event_id, team_id, title, start_time, end_time, deleted_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(event_id) DO UPDATE SET
         team_id = excluded.team_id, title = excluded.title,
         start_time = excluded.start_time, end_time = excluded.end_time,
         deleted_at = CURRENT_TIMESTAMP`
    );

    if (deleteSeries && event.series_id) {
      const eventsInSeries = db.prepare(
        'SELECT id, team_id, title, start_time, end_time FROM events WHERE series_id = ?'
      ).all(event.series_id) as Array<{ id: number; team_id: number; title: string; start_time: string; end_time: string }>;

      const seriesTeamLabel = formatTeamLabel(getEventTeams(eventId).map((t) => t.name));
      const teamIds = [...new Set(eventsInSeries.map((e) => e.team_id))];
      const allTeamMembers = getMemberIdsForTeams(Array.from(teamIds));
      const notifyUserIds = allTeamMembers.filter((uid) => uid !== req.user!.id);

      const result = db.transaction(() => {
        for (const er of eventsInSeries) {
          upsertDeleted.run(er.id, er.team_id, er.title || null, er.start_time || null, er.end_time || null);
        }
        return db.prepare('DELETE FROM events WHERE series_id = ?').run(event.series_id);
      })();

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

      if (!eventToDelete) return res.status(404).json({ error: 'Event not found' });

      const singleTeamLabel = formatTeamLabel(getEventTeams(eventId).map((t) => t.name));
      const teamIds = getEventTeamIds(eventId);
      const allTeamMembers = getMemberIdsForTeams(teamIds);
      const notifyUserIds = allTeamMembers.filter((uid) => uid !== req.user!.id);

      db.transaction(() => {
        upsertDeleted.run(
          eventToDelete.id, eventToDelete.team_id,
          eventToDelete.title || null, eventToDelete.start_time || null, eventToDelete.end_time || null
        );
        db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
      })();

      if (notifyUserIds.length > 0) {
        const noteSuffix = deleteNote ? ` Hinweis: ${deleteNote}` : '';
        await sendPushToUsers(notifyUserIds, {
          title: 'Termin abgesagt',
          body: `${singleTeamLabel ? `${singleTeamLabel}: ` : ''}${eventToDelete.title || 'Ein Termin'} am ${formatEventDateTime(eventToDelete.start_time)} wurde abgesagt.${noteSuffix}`,
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
