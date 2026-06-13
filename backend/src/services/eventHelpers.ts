import db from '../database/init';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventTeamRow = { id: number; name: string };

export type MatchLineupSlot = {
  slot: string;
  user_id: number | null;
  x_pct?: number | null;
  y_pct?: number | null;
};

export type MatchSquadRow = {
  event_id: number;
  squad_user_ids: string;
  lineup_slots: string;
  is_released: number;
  released_at?: string | null;
  updated_at?: string | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const MATCH_LINEUP_SLOTS = ['TW', 'LV', 'IV1', 'IV2', 'RV', 'DM', 'ZM', 'OM', 'LF', 'ST', 'RF'];

// ─── Generic Utilities ───────────────────────────────────────────────────────

export function parseIntClamp(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

// ─── Recurring Events ────────────────────────────────────────────────────────

export function generateRecurringDates(
  startTime: Date,
  endTime: Date,
  repeatType: string,
  repeatUntil: Date,
  repeatDays?: number[]
): Array<{ start: Date; end: Date }> {
  const dates: Array<{ start: Date; end: Date }> = [];
  const duration = endTime.getTime() - startTime.getTime();

  if (repeatType === 'weekly' && repeatDays && repeatDays.length > 0) {
    const seen = new Set<number>();
    let currentDate = new Date(startTime);
    currentDate.setUTCHours(0, 0, 0, 0);

    for (let week = 0; week < 260; week++) {
      if (currentDate > repeatUntil) break;

      for (const dayOfWeek of [...repeatDays].sort((a, b) => a - b)) {
        const diff = (dayOfWeek - currentDate.getUTCDay() + 7) % 7;
        const eventDate = new Date(currentDate.getTime() + diff * 86400000);
        eventDate.setUTCHours(
          startTime.getUTCHours(),
          startTime.getUTCMinutes(),
          startTime.getUTCSeconds(),
          0
        );

        if (eventDate < startTime || eventDate > repeatUntil) continue;

        const key = eventDate.getTime();
        if (seen.has(key)) continue;
        seen.add(key);
        dates.push({ start: new Date(eventDate), end: new Date(eventDate.getTime() + duration) });
      }

      currentDate.setUTCDate(currentDate.getUTCDate() + 7);
    }
  } else if (repeatDays && repeatDays.length > 0) {
    const repeatDaySet = new Set(repeatDays);
    let currentDate = new Date(startTime);
    currentDate.setUTCHours(0, 0, 0, 0);

    while (currentDate <= repeatUntil) {
      if (repeatDaySet.has(currentDate.getUTCDay())) {
        const start = new Date(currentDate);
        start.setUTCHours(startTime.getUTCHours(), startTime.getUTCMinutes(), startTime.getUTCSeconds(), 0);

        if (start >= startTime && start <= repeatUntil) {
          dates.push({ start, end: new Date(start.getTime() + duration) });
        }
      }
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
  }

  return dates.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function parseRepeatUntilDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

// ─── Team Helpers ────────────────────────────────────────────────────────────

export function normalizeTeamIds(primaryTeamId: number, rawTeamIds: unknown): number[] {
  const extra = Array.isArray(rawTeamIds) ? rawTeamIds : [];
  return [...new Set([primaryTeamId, ...extra].map(Number).filter((v) => Number.isInteger(v) && v > 0))];
}

export function getEventTeams(eventId: number): EventTeamRow[] {
  return db.prepare(
    `SELECT t.id, t.name
     FROM event_teams et
     INNER JOIN teams t ON t.id = et.team_id
     WHERE et.event_id = ?
     ORDER BY t.name COLLATE NOCASE ASC`
  ).all(eventId) as EventTeamRow[];
}

export function getEventTeamIds(eventId: number): number[] {
  return getEventTeams(eventId)
    .map((t) => Number(t.id))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export function getMemberIdsForTeams(teamIds: number[]): number[] {
  const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT DISTINCT user_id FROM team_members WHERE team_id IN (${placeholders})`
  ).all(...ids) as Array<{ user_id: number }>;

  return rows.map((r) => Number(r.user_id)).filter((v) => Number.isInteger(v) && v > 0);
}

export function isMemberOfAnyTeam(userId: number, teamIds: number[]): boolean {
  if (!Number.isInteger(userId) || userId <= 0 || teamIds.length === 0) return false;

  const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
  const placeholders = ids.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT 1 AS match FROM team_members WHERE user_id = ? AND team_id IN (${placeholders}) LIMIT 1`
  ).get(userId, ...ids) as { match?: number } | undefined;

  return Boolean(row?.match);
}

export function isTrainerForAllTeams(userId: number, teamIds: number[]): boolean {
  if (!Number.isInteger(userId) || userId <= 0 || teamIds.length === 0) return false;

  const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT team_id FROM team_members WHERE user_id = ? AND role = 'trainer' AND team_id IN (${placeholders})`
  ).all(userId, ...ids) as Array<{ team_id: number }>;

  return new Set(rows.map((r) => Number(r.team_id))).size === ids.length;
}

export function canManageEvent(userId: number, eventId: number, createdBy: number): boolean {
  if (Number(userId) === Number(createdBy)) return true;
  return isTrainerForAllTeams(userId, getEventTeamIds(eventId));
}

export function addEventTeamLinks(eventId: number, teamIds: number[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO event_teams (event_id, team_id) VALUES (?, ?)');
  for (const teamId of teamIds) {
    stmt.run(eventId, teamId);
  }
}

export function attachTeamMetaToEvent<T extends Record<string, unknown>>(
  event: T
): T & { team_ids: number[]; team_names: string[]; team_name: string } {
  const teams = getEventTeams(Number(event.id));
  return {
    ...event,
    team_ids: teams.map((t) => Number(t.id)),
    team_names: teams.map((t) => String(t.name ?? '')),
    team_name: teams.map((t) => String(t.name ?? '')).join(' / ') || String(event.team_name ?? ''),
  };
}

export function attachTeamMetaToEvents<T extends Record<string, unknown>>(
  events: T[]
): Array<T & { team_ids: number[]; team_names: string[]; team_name: string }> {
  return events.map(attachTeamMetaToEvent);
}

export function getTeamNamesByIds(teamIds: number[]): string[] {
  const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, name FROM teams WHERE id IN (${placeholders})`
  ).all(...ids) as Array<{ id: number; name: string }>;

  const byId = new Map(rows.map((r) => [Number(r.id), String(r.name ?? '').trim()]));
  return ids.map((id) => byId.get(id) ?? '').filter(Boolean);
}

export function formatTeamLabel(teamNames: string[]): string {
  const unique = [...new Set(teamNames.map((n) => String(n ?? '').trim()).filter(Boolean))];
  return unique.join(' / ');
}

export function formatEventDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'bald';

  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function hasMatchingPitchTypeInHomeVenues(homeVenuesRaw: unknown, selectedPitchTypeRaw: unknown): boolean {
  const selectedPitchType = String(selectedPitchTypeRaw ?? '').trim().toLowerCase();
  if (!selectedPitchType) return true;

  let venues: Array<{ pitch_type?: string }> = [];

  if (Array.isArray(homeVenuesRaw)) {
    venues = homeVenuesRaw as Array<{ pitch_type?: string }>;
  } else if (typeof homeVenuesRaw === 'string' && homeVenuesRaw.trim()) {
    try {
      const parsed = JSON.parse(homeVenuesRaw);
      if (Array.isArray(parsed)) venues = parsed;
    } catch {
      venues = [];
    }
  }

  return venues.some((v) => String(v?.pitch_type ?? '').trim().toLowerCase() === selectedPitchType);
}

// ─── Match Squad ─────────────────────────────────────────────────────────────

export function normalizePercentCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

export function normalizeSquadUserIds(rawValue: unknown, allowedMemberIds: Set<number>): number[] {
  if (!Array.isArray(rawValue)) return [];
  return [...new Set(
    rawValue
      .map(Number)
      .filter((v) => Number.isInteger(v) && allowedMemberIds.has(v))
  )].slice(0, 40);
}

export function normalizeLineupSlots(rawValue: unknown, squadUserIds: Set<number>): MatchLineupSlot[] {
  if (!Array.isArray(rawValue)) return [];

  const seenSlots = new Set<string>();
  const result: MatchLineupSlot[] = [];

  for (const entry of rawValue) {
    if (!entry || typeof entry !== 'object') continue;
    const src = entry as Record<string, unknown>;
    const slot = String(src.slot ?? '').trim().toUpperCase();
    if (!MATCH_LINEUP_SLOTS.includes(slot) || seenSlots.has(slot)) continue;

    const rawUserId = src.user_id;
    const parsedUserId =
      rawUserId === null || rawUserId === undefined || String(rawUserId).trim() === ''
        ? null
        : Number(rawUserId);

    if (parsedUserId !== null && (!Number.isInteger(parsedUserId) || !squadUserIds.has(parsedUserId))) continue;

    seenSlots.add(slot);
    result.push({
      slot,
      user_id: parsedUserId,
      x_pct: normalizePercentCoordinate(src.x_pct),
      y_pct: normalizePercentCoordinate(src.y_pct),
    });
  }

  return result;
}

export function parseStoredSquadUserIds(rawValue: unknown): number[] {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(Number).filter(Number.isInteger))];
  } catch {
    return [];
  }
}

export function parseStoredLineupSlots(rawValue: unknown): MatchLineupSlot[] {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const src = entry as Record<string, unknown>;
        const slot = String(src.slot ?? '').trim().toUpperCase();
        if (!MATCH_LINEUP_SLOTS.includes(slot)) return null;

        const parsedUserId =
          src.user_id === null || src.user_id === undefined || String(src.user_id).trim() === ''
            ? null
            : Number(src.user_id);

        if (parsedUserId !== null && !Number.isInteger(parsedUserId)) return null;

        return {
          slot,
          user_id: parsedUserId,
          x_pct: normalizePercentCoordinate(src.x_pct),
          y_pct: normalizePercentCoordinate(src.y_pct),
        };
      })
      .filter(Boolean) as MatchLineupSlot[];
  } catch {
    return [];
  }
}

export function createMatchSquadResponse(row: MatchSquadRow | undefined | null) {
  if (!row) {
    return {
      event_id: null as number | null,
      squad_user_ids: [] as number[],
      lineup_slots: [] as MatchLineupSlot[],
      is_released: 0,
      released_at: null as string | null,
      updated_at: null as string | null,
      lineup_slot_order: MATCH_LINEUP_SLOTS,
    };
  }

  return {
    event_id: row.event_id,
    squad_user_ids: parseStoredSquadUserIds(row.squad_user_ids),
    lineup_slots: parseStoredLineupSlots(row.lineup_slots),
    is_released: row.is_released ? 1 : 0,
    released_at: row.released_at ?? null,
    updated_at: row.updated_at ?? null,
    lineup_slot_order: MATCH_LINEUP_SLOTS,
  };
}

export function getMatchSquadPlayers(
  teamId: number,
  squadUserIds: number[]
): Array<{ id: number; name: string; profile_picture: string | null; jersey_number: number | null }> {
  if (!Number.isInteger(teamId) || teamId <= 0 || squadUserIds.length === 0) return [];

  const placeholders = squadUserIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT u.id, u.name, u.profile_picture, tm.jersey_number
     FROM users u
     INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
     WHERE u.id IN (${placeholders})`
  ).all(teamId, ...squadUserIds) as Array<{
    id: number;
    name: string;
    profile_picture?: string;
    jersey_number?: number | null;
  }>;

  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return squadUserIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      profile_picture: r.profile_picture ?? null,
      jersey_number: r.jersey_number ?? null,
    }));
}
