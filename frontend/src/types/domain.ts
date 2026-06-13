export interface Team {
  id: number;
  name: string;
  description?: string | null;
  team_picture?: string | null;
}

export type TeamRole = 'admin' | 'trainer' | 'player' | string;

export interface TeamMember {
  id: number;
  name: string;
  username?: string | null;
  email?: string | null;
  role: TeamRole;
  profile_picture?: string | null;
  jersey_number?: number | null;
  position?: string | null;
}

export interface Invite {
  id: number;
  token: string;
  role?: TeamRole;
  player_name?: string | null;
  invitee_name?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  used_count: number;
}

export interface CreateInviteResponse {
  token: string;
  invite_url?: string;
}
