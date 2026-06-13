export type EventTeamRow = {
    id: number;
    name: string;
};
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
export declare const MATCH_LINEUP_SLOTS: string[];
export declare function parseIntClamp(value: unknown, min: number, max: number): number | null;
export declare function generateRecurringDates(startTime: Date, endTime: Date, repeatType: string, repeatUntil: Date, repeatDays?: number[]): Array<{
    start: Date;
    end: Date;
}>;
export declare function parseRepeatUntilDate(value: string): Date;
export declare function normalizeTeamIds(primaryTeamId: number, rawTeamIds: unknown): number[];
export declare function getEventTeams(eventId: number): EventTeamRow[];
export declare function getEventTeamIds(eventId: number): number[];
export declare function getMemberIdsForTeams(teamIds: number[]): number[];
export declare function isMemberOfAnyTeam(userId: number, teamIds: number[]): boolean;
export declare function isTrainerForAllTeams(userId: number, teamIds: number[]): boolean;
export declare function canManageEvent(userId: number, eventId: number, createdBy: number): boolean;
export declare function addEventTeamLinks(eventId: number, teamIds: number[]): void;
export declare function attachTeamMetaToEvent<T extends Record<string, unknown>>(event: T): T & {
    team_ids: number[];
    team_names: string[];
    team_name: string;
};
export declare function attachTeamMetaToEvents<T extends Record<string, unknown>>(events: T[]): Array<T & {
    team_ids: number[];
    team_names: string[];
    team_name: string;
}>;
export declare function getTeamNamesByIds(teamIds: number[]): string[];
export declare function formatTeamLabel(teamNames: string[]): string;
export declare function formatEventDateTime(value: string): string;
export declare function hasMatchingPitchTypeInHomeVenues(homeVenuesRaw: unknown, selectedPitchTypeRaw: unknown): boolean;
export declare function normalizePercentCoordinate(value: unknown): number | null;
export declare function normalizeSquadUserIds(rawValue: unknown, allowedMemberIds: Set<number>): number[];
export declare function normalizeLineupSlots(rawValue: unknown, squadUserIds: Set<number>): MatchLineupSlot[];
export declare function parseStoredSquadUserIds(rawValue: unknown): number[];
export declare function parseStoredLineupSlots(rawValue: unknown): MatchLineupSlot[];
export declare function createMatchSquadResponse(row: MatchSquadRow | undefined | null): {
    event_id: number | null;
    squad_user_ids: number[];
    lineup_slots: MatchLineupSlot[];
    is_released: number;
    released_at: string | null;
    updated_at: string | null;
    lineup_slot_order: string[];
};
export declare function getMatchSquadPlayers(teamId: number, squadUserIds: number[]): Array<{
    id: number;
    name: string;
    profile_picture: string | null;
    jersey_number: number | null;
}>;
//# sourceMappingURL=eventHelpers.d.ts.map