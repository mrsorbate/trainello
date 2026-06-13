"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MATCH_LINEUP_SLOTS = void 0;
exports.parseIntClamp = parseIntClamp;
exports.generateRecurringDates = generateRecurringDates;
exports.parseRepeatUntilDate = parseRepeatUntilDate;
exports.normalizeTeamIds = normalizeTeamIds;
exports.getEventTeams = getEventTeams;
exports.getEventTeamIds = getEventTeamIds;
exports.getMemberIdsForTeams = getMemberIdsForTeams;
exports.isMemberOfAnyTeam = isMemberOfAnyTeam;
exports.isTrainerForAllTeams = isTrainerForAllTeams;
exports.canManageEvent = canManageEvent;
exports.addEventTeamLinks = addEventTeamLinks;
exports.attachTeamMetaToEvent = attachTeamMetaToEvent;
exports.attachTeamMetaToEvents = attachTeamMetaToEvents;
exports.getTeamNamesByIds = getTeamNamesByIds;
exports.formatTeamLabel = formatTeamLabel;
exports.formatEventDateTime = formatEventDateTime;
exports.hasMatchingPitchTypeInHomeVenues = hasMatchingPitchTypeInHomeVenues;
exports.normalizePercentCoordinate = normalizePercentCoordinate;
exports.normalizeSquadUserIds = normalizeSquadUserIds;
exports.normalizeLineupSlots = normalizeLineupSlots;
exports.parseStoredSquadUserIds = parseStoredSquadUserIds;
exports.parseStoredLineupSlots = parseStoredLineupSlots;
exports.createMatchSquadResponse = createMatchSquadResponse;
exports.getMatchSquadPlayers = getMatchSquadPlayers;
const init_1 = __importDefault(require("../database/init"));
// ─── Constants ───────────────────────────────────────────────────────────────
exports.MATCH_LINEUP_SLOTS = ['TW', 'LV', 'IV1', 'IV2', 'RV', 'DM', 'ZM', 'OM', 'LF', 'ST', 'RF'];
// ─── Generic Utilities ───────────────────────────────────────────────────────
function parseIntClamp(value, min, max) {
    if (value === null || value === undefined || String(value).trim() === '')
        return null;
    const parsed = parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max)
        return null;
    return parsed;
}
// ─── Recurring Events ────────────────────────────────────────────────────────
function generateRecurringDates(startTime, endTime, repeatType, repeatUntil, repeatDays) {
    const dates = [];
    const duration = endTime.getTime() - startTime.getTime();
    if (repeatType === 'weekly' && repeatDays && repeatDays.length > 0) {
        const seen = new Set();
        let currentDate = new Date(startTime);
        currentDate.setUTCHours(0, 0, 0, 0);
        for (let week = 0; week < 260; week++) {
            if (currentDate > repeatUntil)
                break;
            for (const dayOfWeek of [...repeatDays].sort((a, b) => a - b)) {
                const diff = (dayOfWeek - currentDate.getUTCDay() + 7) % 7;
                const eventDate = new Date(currentDate.getTime() + diff * 86400000);
                eventDate.setUTCHours(startTime.getUTCHours(), startTime.getUTCMinutes(), startTime.getUTCSeconds(), 0);
                if (eventDate < startTime || eventDate > repeatUntil)
                    continue;
                const key = eventDate.getTime();
                if (seen.has(key))
                    continue;
                seen.add(key);
                dates.push({ start: new Date(eventDate), end: new Date(eventDate.getTime() + duration) });
            }
            currentDate.setUTCDate(currentDate.getUTCDate() + 7);
        }
    }
    else if (repeatDays && repeatDays.length > 0) {
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
function parseRepeatUntilDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
        date.setUTCHours(23, 59, 59, 999);
    }
    return date;
}
// ─── Team Helpers ────────────────────────────────────────────────────────────
function normalizeTeamIds(primaryTeamId, rawTeamIds) {
    const extra = Array.isArray(rawTeamIds) ? rawTeamIds : [];
    return [...new Set([primaryTeamId, ...extra].map(Number).filter((v) => Number.isInteger(v) && v > 0))];
}
function getEventTeams(eventId) {
    return init_1.default.prepare(`SELECT t.id, t.name
     FROM event_teams et
     INNER JOIN teams t ON t.id = et.team_id
     WHERE et.event_id = ?
     ORDER BY t.name COLLATE NOCASE ASC`).all(eventId);
}
function getEventTeamIds(eventId) {
    return getEventTeams(eventId)
        .map((t) => Number(t.id))
        .filter((v) => Number.isInteger(v) && v > 0);
}
function getMemberIdsForTeams(teamIds) {
    const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
    if (ids.length === 0)
        return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = init_1.default.prepare(`SELECT DISTINCT user_id FROM team_members WHERE team_id IN (${placeholders})`).all(...ids);
    return rows.map((r) => Number(r.user_id)).filter((v) => Number.isInteger(v) && v > 0);
}
function isMemberOfAnyTeam(userId, teamIds) {
    if (!Number.isInteger(userId) || userId <= 0 || teamIds.length === 0)
        return false;
    const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
    const placeholders = ids.map(() => '?').join(',');
    const row = init_1.default.prepare(`SELECT 1 AS match FROM team_members WHERE user_id = ? AND team_id IN (${placeholders}) LIMIT 1`).get(userId, ...ids);
    return Boolean(row?.match);
}
function isTrainerForAllTeams(userId, teamIds) {
    if (!Number.isInteger(userId) || userId <= 0 || teamIds.length === 0)
        return false;
    const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
    const placeholders = ids.map(() => '?').join(',');
    const rows = init_1.default.prepare(`SELECT team_id FROM team_members WHERE user_id = ? AND role = 'trainer' AND team_id IN (${placeholders})`).all(userId, ...ids);
    return new Set(rows.map((r) => Number(r.team_id))).size === ids.length;
}
function canManageEvent(userId, eventId, createdBy) {
    if (Number(userId) === Number(createdBy))
        return true;
    return isTrainerForAllTeams(userId, getEventTeamIds(eventId));
}
function addEventTeamLinks(eventId, teamIds) {
    const stmt = init_1.default.prepare('INSERT OR IGNORE INTO event_teams (event_id, team_id) VALUES (?, ?)');
    for (const teamId of teamIds) {
        stmt.run(eventId, teamId);
    }
}
function attachTeamMetaToEvent(event) {
    const teams = getEventTeams(Number(event.id));
    return {
        ...event,
        team_ids: teams.map((t) => Number(t.id)),
        team_names: teams.map((t) => String(t.name ?? '')),
        team_name: teams.map((t) => String(t.name ?? '')).join(' / ') || String(event.team_name ?? ''),
    };
}
function attachTeamMetaToEvents(events) {
    return events.map(attachTeamMetaToEvent);
}
function getTeamNamesByIds(teamIds) {
    const ids = [...new Set(teamIds.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
    if (ids.length === 0)
        return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = init_1.default.prepare(`SELECT id, name FROM teams WHERE id IN (${placeholders})`).all(...ids);
    const byId = new Map(rows.map((r) => [Number(r.id), String(r.name ?? '').trim()]));
    return ids.map((id) => byId.get(id) ?? '').filter(Boolean);
}
function formatTeamLabel(teamNames) {
    const unique = [...new Set(teamNames.map((n) => String(n ?? '').trim()).filter(Boolean))];
    return unique.join(' / ');
}
function formatEventDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return 'bald';
    return new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
function hasMatchingPitchTypeInHomeVenues(homeVenuesRaw, selectedPitchTypeRaw) {
    const selectedPitchType = String(selectedPitchTypeRaw ?? '').trim().toLowerCase();
    if (!selectedPitchType)
        return true;
    let venues = [];
    if (Array.isArray(homeVenuesRaw)) {
        venues = homeVenuesRaw;
    }
    else if (typeof homeVenuesRaw === 'string' && homeVenuesRaw.trim()) {
        try {
            const parsed = JSON.parse(homeVenuesRaw);
            if (Array.isArray(parsed))
                venues = parsed;
        }
        catch {
            venues = [];
        }
    }
    return venues.some((v) => String(v?.pitch_type ?? '').trim().toLowerCase() === selectedPitchType);
}
// ─── Match Squad ─────────────────────────────────────────────────────────────
function normalizePercentCoordinate(value) {
    if (value === null || value === undefined || String(value).trim() === '')
        return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100)
        return null;
    return Math.round(n * 10) / 10;
}
function normalizeSquadUserIds(rawValue, allowedMemberIds) {
    if (!Array.isArray(rawValue))
        return [];
    return [...new Set(rawValue
            .map(Number)
            .filter((v) => Number.isInteger(v) && allowedMemberIds.has(v)))].slice(0, 40);
}
function normalizeLineupSlots(rawValue, squadUserIds) {
    if (!Array.isArray(rawValue))
        return [];
    const seenSlots = new Set();
    const result = [];
    for (const entry of rawValue) {
        if (!entry || typeof entry !== 'object')
            continue;
        const src = entry;
        const slot = String(src.slot ?? '').trim().toUpperCase();
        if (!exports.MATCH_LINEUP_SLOTS.includes(slot) || seenSlots.has(slot))
            continue;
        const rawUserId = src.user_id;
        const parsedUserId = rawUserId === null || rawUserId === undefined || String(rawUserId).trim() === ''
            ? null
            : Number(rawUserId);
        if (parsedUserId !== null && (!Number.isInteger(parsedUserId) || !squadUserIds.has(parsedUserId)))
            continue;
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
function parseStoredSquadUserIds(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim())
        return [];
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed))
            return [];
        return [...new Set(parsed.map(Number).filter(Number.isInteger))];
    }
    catch {
        return [];
    }
}
function parseStoredLineupSlots(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim())
        return [];
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map((entry) => {
            if (!entry || typeof entry !== 'object')
                return null;
            const src = entry;
            const slot = String(src.slot ?? '').trim().toUpperCase();
            if (!exports.MATCH_LINEUP_SLOTS.includes(slot))
                return null;
            const parsedUserId = src.user_id === null || src.user_id === undefined || String(src.user_id).trim() === ''
                ? null
                : Number(src.user_id);
            if (parsedUserId !== null && !Number.isInteger(parsedUserId))
                return null;
            return {
                slot,
                user_id: parsedUserId,
                x_pct: normalizePercentCoordinate(src.x_pct),
                y_pct: normalizePercentCoordinate(src.y_pct),
            };
        })
            .filter(Boolean);
    }
    catch {
        return [];
    }
}
function createMatchSquadResponse(row) {
    if (!row) {
        return {
            event_id: null,
            squad_user_ids: [],
            lineup_slots: [],
            is_released: 0,
            released_at: null,
            updated_at: null,
            lineup_slot_order: exports.MATCH_LINEUP_SLOTS,
        };
    }
    return {
        event_id: row.event_id,
        squad_user_ids: parseStoredSquadUserIds(row.squad_user_ids),
        lineup_slots: parseStoredLineupSlots(row.lineup_slots),
        is_released: row.is_released ? 1 : 0,
        released_at: row.released_at ?? null,
        updated_at: row.updated_at ?? null,
        lineup_slot_order: exports.MATCH_LINEUP_SLOTS,
    };
}
function getMatchSquadPlayers(teamId, squadUserIds) {
    if (!Number.isInteger(teamId) || teamId <= 0 || squadUserIds.length === 0)
        return [];
    const placeholders = squadUserIds.map(() => '?').join(',');
    const rows = init_1.default.prepare(`SELECT u.id, u.name, u.profile_picture, tm.jersey_number
     FROM users u
     INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
     WHERE u.id IN (${placeholders})`).all(teamId, ...squadUserIds);
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    return squadUserIds
        .map((id) => byId.get(id))
        .filter((r) => Boolean(r))
        .map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        profile_picture: r.profile_picture ?? null,
        jersey_number: r.jersey_number ?? null,
    }));
}
//# sourceMappingURL=eventHelpers.js.map