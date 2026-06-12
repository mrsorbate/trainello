import Database from 'better-sqlite3';
import path from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { randomBytes } from 'crypto';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');
const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Organization settings table
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Dein Verein',
    short_name TEXT,
    logo TEXT,
    timezone TEXT DEFAULT 'Europe/Berlin',
    setup_completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT,
    height_cm INTEGER,
    weight_kg INTEGER,
    clothing_size TEXT,
    shoe_size TEXT,
    jersey_number INTEGER,
    footedness TEXT,
    position TEXT,
    role TEXT NOT NULL CHECK(role IN ('admin', 'trainer', 'player')),
    is_registered INTEGER NOT NULL DEFAULT 1,
    profile_picture TEXT,
    birth_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Teams table
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    calendar_token TEXT UNIQUE,
    fussballde_id TEXT,
    default_response TEXT DEFAULT 'pending',
    default_rsvp_deadline_hours INTEGER,
    default_rsvp_deadline_hours_training INTEGER,
    default_rsvp_deadline_hours_match INTEGER,
    default_rsvp_deadline_hours_other INTEGER,
    default_arrival_minutes INTEGER,
    default_arrival_minutes_training INTEGER,
    default_arrival_minutes_match INTEGER,
    default_arrival_minutes_other INTEGER,
    home_venues TEXT,
    default_home_venue_name TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Team members table
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('trainer', 'player', 'staff')),
    jersey_number INTEGER,
    position TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(team_id, user_id)
  );

  -- Events table (trainings and matches)
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('training', 'match', 'other')),
    description TEXT,
    location TEXT,
    location_venue TEXT,
    location_street TEXT,
    location_zip_city TEXT,
    pitch_type TEXT,
    meeting_point TEXT,
    arrival_minutes INTEGER,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    rsvp_deadline DATETIME,
    duration_minutes INTEGER,
    visibility_all INTEGER DEFAULT 1,
    invite_all INTEGER DEFAULT 1,
    created_by INTEGER NOT NULL,
    series_id TEXT,
    external_game_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS event_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    UNIQUE(event_id, team_id)
  );

  -- Event responses table (Zu-/Absagen)
  CREATE TABLE IF NOT EXISTS event_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('accepted', 'declined', 'tentative', 'pending')),
    comment TEXT,
    responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(event_id, user_id)
  );

  -- Deleted events tombstones for calendar cancellation sync
  CREATE TABLE IF NOT EXISTS deleted_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL UNIQUE,
    team_id INTEGER NOT NULL,
    title TEXT,
    start_time DATETIME,
    end_time DATETIME,
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Match squad + tactic board per event
  CREATE TABLE IF NOT EXISTS event_match_squads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL UNIQUE,
    squad_user_ids TEXT NOT NULL DEFAULT '[]',
    lineup_slots TEXT NOT NULL DEFAULT '[]',
    is_released INTEGER NOT NULL DEFAULT 0,
    released_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  -- Team invitations table
  CREATE TABLE IF NOT EXISTS team_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('trainer', 'player', 'staff')),
    created_by INTEGER NOT NULL,
    expires_at DATETIME,
    max_uses INTEGER DEFAULT NULL,
    used_count INTEGER DEFAULT 0,
    player_name TEXT,
    player_birth_date DATE,
    player_jersey_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Trainer onboarding invites (one link can assign multiple teams)
  CREATE TABLE IF NOT EXISTS trainer_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    invited_name TEXT NOT NULL,
    invited_user_id INTEGER,
    team_ids TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    expires_at DATETIME,
    used_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Push subscriptions for PWA notifications
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Team posts (announcements + polls)
  CREATE TABLE IF NOT EXISTS team_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('announcement', 'poll')),
    title TEXT NOT NULL,
    content TEXT,
    poll_options TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Per-user post state: seen for announcements, answer for polls
  CREATE TABLE IF NOT EXISTS team_post_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    seen_at DATETIME,
    answer_option INTEGER,
    answered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES team_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(post_id, user_id)
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
  CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id);
  CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
  CREATE INDEX IF NOT EXISTS idx_event_responses_event ON event_responses(event_id);
  CREATE INDEX IF NOT EXISTS idx_event_responses_user ON event_responses(user_id);
  CREATE INDEX IF NOT EXISTS idx_event_teams_event ON event_teams(event_id);
  CREATE INDEX IF NOT EXISTS idx_event_teams_team ON event_teams(team_id);
  CREATE INDEX IF NOT EXISTS idx_deleted_events_team_deleted_at ON deleted_events(team_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_event_match_squads_event ON event_match_squads(event_id);
  CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
  CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id);
  CREATE INDEX IF NOT EXISTS idx_trainer_invites_token ON trainer_invites(token);
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_team_posts_team_created ON team_posts(team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_team_posts_active ON team_posts(is_active);
  CREATE INDEX IF NOT EXISTS idx_team_post_reads_post_user ON team_post_reads(post_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_team_post_reads_user ON team_post_reads(user_id);
`);

// Migration: Add profile_picture column if it doesn't exist
try {
  const columns = db.pragma('table_info(users)') as Array<{ name: string }>;
  const hasUsername = columns.some((col) => col.name === 'username');
  if (!hasUsername) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
    console.log('✅ Added username column to users table');

    const usersWithoutUsername = db.prepare(
      "SELECT id, name, email FROM users WHERE username IS NULL OR TRIM(username) = '' ORDER BY id ASC"
    ).all() as Array<{ id: number; name: string; email: string }>;

    const existingUsernames = new Set(
      (db.prepare('SELECT LOWER(username) as username FROM users WHERE username IS NOT NULL').all() as Array<{ username: string | null }>)
        .map((row) => (row.username || '').trim())
        .filter((value) => value.length > 0)
    );

    const normalizeUsername = (value: string): string =>
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30);

    const createUniqueUsername = (preferredBase: string): string => {
      const fallbackBase = preferredBase || 'user';
      let candidate = fallbackBase;
      let suffix = 1;

      while (existingUsernames.has(candidate)) {
        candidate = `${fallbackBase}${suffix}`;
        suffix += 1;
      }

      existingUsernames.add(candidate);
      return candidate;
    };

    const updateUsernameStmt = db.prepare('UPDATE users SET username = ? WHERE id = ?');

    for (const user of usersWithoutUsername) {
      const baseFromName = normalizeUsername(user.name);
      const baseFromEmail = normalizeUsername((user.email || '').split('@')[0] || '');
      const base = baseFromName || baseFromEmail || `user${user.id}`;
      const username = createUniqueUsername(base);
      updateUsernameStmt.run(username, user.id);
    }
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

  const hasProfilePicture = columns.some((col) => col.name === 'profile_picture');
  if (!hasProfilePicture) {
    db.exec('ALTER TABLE users ADD COLUMN profile_picture TEXT');
    console.log('✅ Added profile_picture column to users table');
  }
  
  const hasBirthDate = columns.some((col) => col.name === 'birth_date');
  if (!hasBirthDate) {
    db.exec('ALTER TABLE users ADD COLUMN birth_date DATE');
    console.log('✅ Added birth_date column to users table');
  }

  const hasPhoneNumber = columns.some((col) => col.name === 'phone_number');
  if (!hasPhoneNumber) {
    db.exec('ALTER TABLE users ADD COLUMN phone_number TEXT');
    console.log('✅ Added phone_number column to users table');
  }

  const hasNickname = columns.some((col) => col.name === 'nickname');
  if (!hasNickname) {
    db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
    console.log('✅ Added nickname column to users table');
  }

  const addUserColumn = (name: string, sqlType: string) => {
    const exists = columns.some((col) => col.name === name);
    if (!exists) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${sqlType}`);
      console.log(`✅ Added ${name} column to users table`);
    }
  };

  addUserColumn('height_cm', 'INTEGER');
  addUserColumn('weight_kg', 'INTEGER');
  addUserColumn('clothing_size', 'TEXT');
  addUserColumn('shoe_size', 'TEXT');
  addUserColumn('jersey_number', 'INTEGER');
  addUserColumn('footedness', 'TEXT');
  addUserColumn('position', 'TEXT');

  const hasIsRegistered = columns.some((col) => col.name === 'is_registered');
  if (!hasIsRegistered) {
    db.exec('ALTER TABLE users ADD COLUMN is_registered INTEGER NOT NULL DEFAULT 1');
    console.log('✅ Added is_registered column to users table');
  }
  
  // Add player info columns to team_invites
  const inviteColumns = db.pragma('table_info(team_invites)') as Array<{ name: string }>;
  const hasPlayerName = inviteColumns.some((col) => col.name === 'player_name');
  if (!hasPlayerName) {
    db.exec('ALTER TABLE team_invites ADD COLUMN player_name TEXT');
    db.exec('ALTER TABLE team_invites ADD COLUMN player_birth_date DATE');
    db.exec('ALTER TABLE team_invites ADD COLUMN player_jersey_number INTEGER');
    console.log('✅ Added player info columns to team_invites table');
  }
  
  // Add series_id to events for recurring events
  const eventColumns = db.pragma('table_info(events)') as Array<{ name: string }>;
  const hasSeriesId = eventColumns.some((col) => col.name === 'series_id');
  if (!hasSeriesId) {
    db.exec('ALTER TABLE events ADD COLUMN series_id TEXT');
    console.log('✅ Added series_id column to events table');
  }


  db.exec(`
    INSERT OR IGNORE INTO event_teams (event_id, team_id)
    SELECT id, team_id
    FROM events
    WHERE team_id IS NOT NULL
  `);
  db.exec('DROP TRIGGER IF EXISTS trg_event_responses_declined_comment_insert');
  db.exec('DROP TRIGGER IF EXISTS trg_event_responses_declined_comment_update');
  
  // Add rsvp_deadline to events
  const hasRsvpDeadline = eventColumns.some((col) => col.name === 'rsvp_deadline');
  if (!hasRsvpDeadline) {
    db.exec('ALTER TABLE events ADD COLUMN rsvp_deadline DATETIME');
    console.log('✅ Added rsvp_deadline column to events table');
  }

  const addEventColumn = (name: string, sqlType: string) => {
    const exists = eventColumns.some((col) => col.name === name);
    if (!exists) {
      db.exec(`ALTER TABLE events ADD COLUMN ${name} ${sqlType}`);
      console.log(`✅ Added ${name} column to events table`);
    }
  };

  addEventColumn('location_venue', 'TEXT');
  addEventColumn('location_street', 'TEXT');
  addEventColumn('location_zip_city', 'TEXT');
  addEventColumn('pitch_type', 'TEXT');
  addEventColumn('meeting_point', 'TEXT');
  addEventColumn('arrival_minutes', 'INTEGER');
  addEventColumn('duration_minutes', 'INTEGER');
  addEventColumn('visibility_all', 'INTEGER DEFAULT 1');
  addEventColumn('invite_all', 'INTEGER DEFAULT 1');
  addEventColumn('is_home_match', 'INTEGER DEFAULT 1');
  addEventColumn('external_game_id', 'TEXT');
  addEventColumn('opponent_crest_url', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_game_id ON events(external_game_id)');

  // Add team_picture to teams
  const teamColumns = db.pragma('table_info(teams)') as Array<{ name: string }>;
  const hasTeamPicture = teamColumns.some((col) => col.name === 'team_picture');
  if (!hasTeamPicture) {
    db.exec('ALTER TABLE teams ADD COLUMN team_picture TEXT');
    console.log('✅ Added team_picture column to teams table');
  }

  const hasCalendarToken = teamColumns.some((col) => col.name === 'calendar_token');
  if (!hasCalendarToken) {
    db.exec('ALTER TABLE teams ADD COLUMN calendar_token TEXT');
    console.log('✅ Added calendar_token column to teams table');
  }

  const refreshedTeamColumns = db.pragma('table_info(teams)') as Array<{ name: string }>;
  const hasCalendarTokenAfterMigration = refreshedTeamColumns.some((col) => col.name === 'calendar_token');

  if (hasCalendarTokenAfterMigration) {
    try {
      const teamsWithToken = db
        .prepare('SELECT id, calendar_token FROM teams ORDER BY id ASC')
        .all() as Array<{ id: number; calendar_token: string | null }>;

      const seenTokens = new Set<string>();
      const updateCalendarTokenStmt = db.prepare('UPDATE teams SET calendar_token = ? WHERE id = ?');

      for (const teamRow of teamsWithToken) {
        const currentToken = String(teamRow.calendar_token || '').trim();
        let nextToken = currentToken;

        if (!nextToken || seenTokens.has(nextToken)) {
          do {
            nextToken = randomBytes(24).toString('hex');
          } while (seenTokens.has(nextToken));

          updateCalendarTokenStmt.run(nextToken, teamRow.id);
        }

        seenTokens.add(nextToken);
      }

      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_calendar_token ON teams(calendar_token)');
    } catch (calendarTokenMigrationError) {
      console.warn('⚠️ Calendar token migration warning:', calendarTokenMigrationError);
    }
  }

  const hasFussballDeId = teamColumns.some((col) => col.name === 'fussballde_id');
  if (!hasFussballDeId) {
    db.exec('ALTER TABLE teams ADD COLUMN fussballde_id TEXT');
    console.log('✅ Added fussballde_id column to teams table');
  }

  const hasDefaultResponse = teamColumns.some((col) => col.name === 'default_response');
  if (!hasDefaultResponse) {
    db.exec("ALTER TABLE teams ADD COLUMN default_response TEXT DEFAULT 'pending'");
    console.log('✅ Added default_response column to teams table');
  }

  const hasDefaultRsvpDeadlineHours = teamColumns.some((col) => col.name === 'default_rsvp_deadline_hours');
  if (!hasDefaultRsvpDeadlineHours) {
    db.exec('ALTER TABLE teams ADD COLUMN default_rsvp_deadline_hours INTEGER');
    console.log('✅ Added default_rsvp_deadline_hours column to teams table');
  }

  const hasDefaultRsvpDeadlineHoursTraining = teamColumns.some((col) => col.name === 'default_rsvp_deadline_hours_training');
  if (!hasDefaultRsvpDeadlineHoursTraining) {
    db.exec('ALTER TABLE teams ADD COLUMN default_rsvp_deadline_hours_training INTEGER');
    db.exec('UPDATE teams SET default_rsvp_deadline_hours_training = default_rsvp_deadline_hours WHERE default_rsvp_deadline_hours_training IS NULL');
    console.log('✅ Added default_rsvp_deadline_hours_training column to teams table');
  }

  const hasDefaultRsvpDeadlineHoursMatch = teamColumns.some((col) => col.name === 'default_rsvp_deadline_hours_match');
  if (!hasDefaultRsvpDeadlineHoursMatch) {
    db.exec('ALTER TABLE teams ADD COLUMN default_rsvp_deadline_hours_match INTEGER');
    db.exec('UPDATE teams SET default_rsvp_deadline_hours_match = default_rsvp_deadline_hours WHERE default_rsvp_deadline_hours_match IS NULL');
    console.log('✅ Added default_rsvp_deadline_hours_match column to teams table');
  }

  const hasDefaultRsvpDeadlineHoursOther = teamColumns.some((col) => col.name === 'default_rsvp_deadline_hours_other');
  if (!hasDefaultRsvpDeadlineHoursOther) {
    db.exec('ALTER TABLE teams ADD COLUMN default_rsvp_deadline_hours_other INTEGER');
    db.exec('UPDATE teams SET default_rsvp_deadline_hours_other = default_rsvp_deadline_hours WHERE default_rsvp_deadline_hours_other IS NULL');
    console.log('✅ Added default_rsvp_deadline_hours_other column to teams table');
  }

  const hasDefaultArrivalMinutes = teamColumns.some((col) => col.name === 'default_arrival_minutes');
  if (!hasDefaultArrivalMinutes) {
    db.exec('ALTER TABLE teams ADD COLUMN default_arrival_minutes INTEGER');
    console.log('✅ Added default_arrival_minutes column to teams table');
  }

  const hasDefaultArrivalMinutesTraining = teamColumns.some((col) => col.name === 'default_arrival_minutes_training');
  if (!hasDefaultArrivalMinutesTraining) {
    db.exec('ALTER TABLE teams ADD COLUMN default_arrival_minutes_training INTEGER');
    db.exec('UPDATE teams SET default_arrival_minutes_training = default_arrival_minutes WHERE default_arrival_minutes_training IS NULL');
    console.log('✅ Added default_arrival_minutes_training column to teams table');
  }

  const hasDefaultArrivalMinutesMatch = teamColumns.some((col) => col.name === 'default_arrival_minutes_match');
  if (!hasDefaultArrivalMinutesMatch) {
    db.exec('ALTER TABLE teams ADD COLUMN default_arrival_minutes_match INTEGER');
    db.exec('UPDATE teams SET default_arrival_minutes_match = default_arrival_minutes WHERE default_arrival_minutes_match IS NULL');
    console.log('✅ Added default_arrival_minutes_match column to teams table');
  }

  const hasDefaultArrivalMinutesOther = teamColumns.some((col) => col.name === 'default_arrival_minutes_other');
  if (!hasDefaultArrivalMinutesOther) {
    db.exec('ALTER TABLE teams ADD COLUMN default_arrival_minutes_other INTEGER');
    db.exec('UPDATE teams SET default_arrival_minutes_other = default_arrival_minutes WHERE default_arrival_minutes_other IS NULL');
    console.log('✅ Added default_arrival_minutes_other column to teams table');
  }

  const hasHomeVenues = teamColumns.some((col) => col.name === 'home_venues');
  if (!hasHomeVenues) {
    db.exec('ALTER TABLE teams ADD COLUMN home_venues TEXT');
    db.exec("UPDATE teams SET home_venues = '[]' WHERE home_venues IS NULL");
    console.log('✅ Added home_venues column to teams table');
  }

  const hasDefaultHomeVenueName = teamColumns.some((col) => col.name === 'default_home_venue_name');
  if (!hasDefaultHomeVenueName) {
    db.exec('ALTER TABLE teams ADD COLUMN default_home_venue_name TEXT');
    console.log('✅ Added default_home_venue_name column to teams table');
  }

  const hasFussballdeTeamName = teamColumns.some((col) => col.name === 'fussballde_team_name');
  if (!hasFussballdeTeamName) {
    db.exec('ALTER TABLE teams ADD COLUMN fussballde_team_name TEXT');
    console.log('✅ Added fussballde_team_name column to teams table');
  }

  const trainerInviteColumns = db.pragma('table_info(trainer_invites)') as Array<{ name: string }>;
  const hasInvitedUserId = trainerInviteColumns.some((col) => col.name === 'invited_user_id');
  if (!hasInvitedUserId) {
    db.exec('ALTER TABLE trainer_invites ADD COLUMN invited_user_id INTEGER');
    console.log('✅ Added invited_user_id column to trainer_invites table');
  }

  const organizationColumns = db.pragma('table_info(organizations)') as Array<{ name: string }>;
  const hasOrganizationShortName = organizationColumns.some((col) => col.name === 'short_name');
  if (!hasOrganizationShortName) {
    db.exec('ALTER TABLE organizations ADD COLUMN short_name TEXT');
    console.log('✅ Added short_name column to organizations table');
  }

  // Add trainer_custom_team_name to team_members for personalized team names
  const teamMembersColumns = db.pragma('table_info(team_members)') as Array<{ name: string }>;
  const hasCustomTeamName = teamMembersColumns.some((col) => col.name === 'trainer_custom_team_name');
  if (!hasCustomTeamName) {
    db.exec('ALTER TABLE team_members ADD COLUMN trainer_custom_team_name TEXT');
    console.log('✅ Added trainer_custom_team_name column to team_members table');
  }

  // Ensure at least one organization exists
  const orgCount = db.prepare('SELECT COUNT(*) as count FROM organizations').get() as { count: number };
  if (orgCount.count === 0) {
    db.prepare(`
      INSERT INTO organizations (name, timezone, setup_completed) 
      VALUES (?, ?, ?)
    `).run('Dein Verein', 'Europe/Berlin', 0);
    console.log('✅ Created default organization');
  }
} catch (error) {
  console.error('Migration error:', error);
}

console.log('✅ Database initialized successfully');
console.log(`📦 Database path: ${dbPath}`);

export default db;
