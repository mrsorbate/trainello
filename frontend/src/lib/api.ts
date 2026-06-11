import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const hasToken = Boolean(localStorage.getItem('auth-token'));

    if (status === 401 && hasToken && !requestUrl.includes('/auth/login')) {
      localStorage.removeItem('auth-token');
      localStorage.removeItem('auth-user');
      localStorage.setItem('session-expired-notice', '1');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login?reason=session-expired';
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (username: string, password: string) => 
    api.post('/auth/login', { username, password }),
  
  register: (data: { username: string; email: string; password: string; name: string; role?: string }) =>
    api.post('/auth/register', data),
  
  getCurrentUser: () => api.get('/auth/me'),
};

// Teams API
export const teamsAPI = {
  getAll: () => api.get('/teams'),
  
  getById: (id: number) => api.get(`/teams/${id}`),
  
  create: (data: { name: string; description?: string }) =>
    api.post('/teams', data),
  
  getMembers: (id: number) => api.get(`/teams/${id}/members`),

  getSettings: (id: number) => api.get(`/teams/${id}/settings`),

  getExternalTable: (id: number) => api.get(`/teams/${id}/external-table`),

  updateFussballDeId: (id: number, fussballde_id: string) =>
    api.put(`/teams/${id}/fussballde-id`, { fussballde_id }),

  importNextGames: (id: number, limit: number = 8) =>
    api.post(`/teams/${id}/import-next-games`, { limit }),

  deleteImportedGames: (id: number) =>
    api.delete(`/teams/${id}/imported-games`),

  updateSettings: (id: number, data: {
    fussballde_id?: string;
    fussballde_team_name?: string;
    default_response?: 'pending' | 'accepted' | 'tentative' | 'declined';
    default_rsvp_deadline_hours?: number | null;
    default_rsvp_deadline_hours_training?: number | null;
    default_rsvp_deadline_hours_match?: number | null;
    default_rsvp_deadline_hours_other?: number | null;
    default_arrival_minutes?: number | null;
    default_arrival_minutes_training?: number | null;
    default_arrival_minutes_match?: number | null;
    default_arrival_minutes_other?: number | null;
    home_venues?: Array<{ name: string; street?: string; zip_city?: string; pitch_type?: string }>;
    default_home_venue_name?: string | null;
  }) => api.put(`/teams/${id}/settings`, data),
  
  addMember: (id: number, data: { user_id: number; role: string; jersey_number?: number; position?: string }) =>
    api.post(`/teams/${id}/members`, data),
  
  createPlayer: (id: number, data: { name: string; birth_date?: string; jersey_number?: number }) =>
    api.post(`/teams/${id}/players`, data),

  uploadTeamPicture: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('picture', file);
    return api.post(`/teams/${id}/picture`, formData);
  },

  deleteTeamPicture: (id: number) => api.delete(`/teams/${id}/picture`),
};

// Events API
export const eventsAPI = {
  getMyUpcoming: () => api.get('/events/my-upcoming'),

  getMyAll: (view: 'upcoming' | 'past' = 'upcoming') => api.get(`/events/my-all?view=${view}`),
  
  getAll: (teamId: number, from?: string, to?: string, view: 'upcoming' | 'past' = 'upcoming') => {
    const params = new URLSearchParams({ team_id: teamId.toString() });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    params.append('view', view);
    return api.get(`/events?${params}`);
  },
  
  getById: (id: number) => api.get(`/events/${id}`),
  
  create: (data: {
    team_id: number;
    team_ids?: number[];
    title: string;
    type: string;
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
  }) => api.post('/events', data),

  update: (id: number, data: {
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
    repeat_until?: string;
    repeat_days?: number[];
  }, updateSeries: boolean = false) =>
    api.put(`/events/${id}${updateSeries ? '?update_series=true' : ''}`, data),
  
  updateResponse: (id: number, data: { status: string; comment?: string }) =>
    api.post(`/events/${id}/response`, data),

  updatePlayerResponse: (id: number, userId: number, data: { status: string; comment?: string }) =>
    api.post(`/events/${id}/response/${userId}`, data),

  getMatchSquad: (id: number) => api.get(`/events/${id}/squad`),

  updateMatchSquad: (
    id: number,
    data: {
      squad_user_ids: number[];
      lineup_slots: Array<{ slot: string; user_id: number | null }>;
    }
  ) => api.put(`/events/${id}/squad`, data),

  releaseMatchSquad: (id: number) => api.post(`/events/${id}/squad/release`),
  
  delete: (id: number, deleteSeries: boolean = false, deleteNote?: string) =>
    api.delete(`/events/${id}${deleteSeries ? '?delete_series=true' : ''}`, {
      data: deleteNote && deleteNote.trim().length > 0
        ? { delete_note: deleteNote.trim() }
        : undefined,
    }),
};

// Stats API
export const statsAPI = {
  getTeamStats: (teamId: number) => api.get(`/stats/team/${teamId}`),
  
  getPlayerStats: (userId: number, teamId: number) =>
    api.get(`/stats/player/${userId}?team_id=${teamId}`),
};

// Invites API
export const invitesAPI = {
  createInvite: (teamId: number, data: { role?: string; inviteeName: string; expiresInDays?: number; maxUses?: number }) =>
    api.post(`/teams/${teamId}/invites`, data),

  createTeamJoinLink: (teamId: number) =>
    api.post(`/teams/${teamId}/join-link`),

  getTeamJoinLink: (teamId: number) =>
    api.get(`/teams/${teamId}/join-link`),
  
  getTeamInvites: (teamId: number) => api.get(`/teams/${teamId}/invites`),
  
  getInviteByToken: (token: string) => api.get(`/invites/${token}`),
  
  acceptInvite: (token: string) => api.post(`/invites/${token}/accept`),
  
  registerWithInvite: (token: string, data: { name?: string; username: string; email: string; password: string }) =>
    api.post(`/invites/${token}/register`, data),
  
  deleteInvite: (inviteId: number) => api.delete(`/invites/${inviteId}`),
};

// Admin API
export const adminAPI = {
  getAllTeams: () => api.get('/admin/teams'),

  getAuditLogs: (limit = 50) => api.get(`/admin/audit-logs?limit=${limit}`),
  
  getAllUsers: () => api.get('/admin/users'),

  deleteUser: (userId: number) => api.delete(`/admin/users/${userId}`),

  resetUserPassword: (userId: number, data?: { newPassword: string }) =>
    api.post(`/admin/users/${userId}/reset-password`, data || {}),

  createTrainer: (data: { name: string; username: string; email: string; password: string }) =>
    api.post('/admin/users/trainer', data),

  createAdmin: (data: { name: string; username: string; email: string; password: string }) =>
    api.post('/admin/users/admin', data),

  createTrainerInvite: (data: { name: string; teamIds: number[]; expiresInDays?: number }) =>
    api.post('/admin/trainer-invites', data),

  resendTrainerInvite: (userId: number) =>
    api.post(`/admin/users/${userId}/trainer-invite-resend`),
  
  getSettings: () => api.get('/admin/settings'),
  
  updateSettings: (data: { organizationName: string; organizationShortName?: string | null; timezone: string }) =>
    api.post('/admin/settings/setup', data),

  deleteOrganization: () => api.delete('/admin/organization'),
  
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post('/admin/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  createTeam: (data: { name: string; description?: string }) =>
    api.post('/teams', data),
  
  deleteTeam: (teamId: number) => api.delete(`/admin/teams/${teamId}`),
  
  addUserToTeam: (teamId: number, data: { user_id: number; role?: string; jersey_number?: number; position?: string }) =>
    api.post(`/admin/teams/${teamId}/members`, data),

  getTeamTrainers: (teamId: number) => api.get(`/admin/teams/${teamId}/trainers`),
  
  removeUserFromTeam: (teamId: number, userId: number) =>
    api.delete(`/admin/teams/${teamId}/members/${userId}`),
};

// Profile API
export const profileAPI = {
  getProfile: () => api.get('/profile/me'),

  updateProfile: (data: {
    phone_number?: string;
    nickname?: string;
    height_cm?: number | null;
    weight_kg?: number | null;
    clothing_size?: string | null;
    shoe_size?: string | null;
    jersey_number?: number | null;
    footedness?: string | null;
    position?: string | null;
  }) =>
    api.put('/profile/me', data),
  
  updatePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/profile/password', data),
  
  uploadPicture: (file: File) => {
    const formData = new FormData();
    formData.append('picture', file);
    return api.post('/profile/picture', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  deletePicture: () => api.delete('/profile/picture'),
};

// Settings API
export const settingsAPI = {
  getOrganization: () => api.get('/settings/organization'),
  
  getTrainerTeamNames: () => api.get('/settings/trainer-team-names'),
  
  updateTrainerTeamName: (teamId: number, customName: string | null) =>
    api.put(`/settings/trainer-team-names/${teamId}`, { trainer_custom_team_name: customName }),
};

export const notificationsAPI = {
  getPublicKey: () => api.get('/notifications/public-key'),

  getStatus: () => api.get('/notifications/status'),

  subscribe: (subscription: {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  }) => api.post('/notifications/subscribe', subscription),

  unsubscribe: (endpoint: string) => api.post('/notifications/unsubscribe', { endpoint }),

  sendTest: (data?: { title?: string; body?: string; url?: string }) =>
    api.post('/notifications/test', data || {}),
};

export default api;
