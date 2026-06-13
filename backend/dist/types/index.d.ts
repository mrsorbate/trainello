export interface User {
    id: number;
    username: string;
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'trainer' | 'player';
    phone_number?: string;
    created_at: string;
    updated_at: string;
}
export interface Organization {
    id: number;
    name: string;
    logo?: string;
    timezone: string;
    setup_completed: number;
    created_at: string;
    updated_at: string;
}
export interface Team {
    id: number;
    name: string;
    description?: string;
    team_picture?: string;
    created_by: number;
    created_at: string;
    updated_at: string;
}
export interface TeamMember {
    id: number;
    team_id: number;
    user_id: number;
    role: 'trainer' | 'player' | 'staff';
    jersey_number?: number;
    position?: string;
    joined_at: string;
}
export interface Event {
    id: number;
    team_id: number;
    title: string;
    type: 'training' | 'match' | 'other';
    description?: string;
    location?: string;
    location_venue?: string;
    location_street?: string;
    location_zip_city?: string;
    pitch_type?: string;
    meeting_point?: string;
    arrival_minutes?: number;
    start_time: string;
    end_time: string;
    rsvp_deadline?: string;
    duration_minutes?: number;
    visibility_all?: number;
    invite_all?: number;
    created_by: number;
    series_id?: string;
    created_at: string;
    updated_at: string;
}
export interface EventResponse {
    id: number;
    event_id: number;
    user_id: number;
    status: 'accepted' | 'declined' | 'tentative' | 'pending';
    comment?: string;
    responded_at: string;
}
export interface PlayerStats {
    id: number;
    user_id: number;
    team_id: number;
    event_id: number;
    minutes_played: number;
    goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    rating?: number;
    notes?: string;
    created_at: string;
}
export interface CreateUserDTO {
    username: string;
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'trainer' | 'player';
}
export interface CreateTeamDTO {
    name: string;
    description?: string;
}
export interface CreateEventDTO {
    team_id: number;
    team_ids?: number[];
    title: string;
    type: 'training' | 'match' | 'other';
    description?: string;
    location?: string;
    location_venue?: string;
    location_street?: string;
    location_zip_city?: string;
    pitch_type?: string;
    meeting_point?: string;
    arrival_minutes?: number;
    start_time: string;
    end_time: string;
    rsvp_deadline?: string;
    duration_minutes?: number;
    visibility_all?: boolean;
    invite_all?: boolean;
    invited_user_ids?: number[];
    repeat_type?: 'none' | 'weekly' | 'custom';
    repeat_until?: string;
    repeat_days?: number[];
}
export interface UpdateEventResponseDTO {
    status: 'accepted' | 'declined' | 'tentative';
    comment?: string;
}
export interface CreatePlayerStatsDTO {
    event_id: number;
    minutes_played?: number;
    goals?: number;
    assists?: number;
    yellow_cards?: number;
    red_cards?: number;
    rating?: number;
    notes?: string;
}
//# sourceMappingURL=index.d.ts.map