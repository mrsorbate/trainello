import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPublicFrontendBaseUrl } from '../utils/publicUrl';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SHORT_TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createShortJoinToken = (length = 8): string => {
  const bytes = crypto.randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i += 1) {
    token += SHORT_TOKEN_CHARS[bytes[i] % SHORT_TOKEN_CHARS.length];
  }
  return token;
};

const ensureTrainerInviteSchema = () => {
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_trainer_invites_token ON trainer_invites(token);
  `);

  const trainerInviteColumns = db.pragma('table_info(trainer_invites)') as Array<{ name: string }>;
  const hasInvitedUserId = trainerInviteColumns.some((col) => col.name === 'invited_user_id');
  if (!hasInvitedUserId) {
    db.exec('ALTER TABLE trainer_invites ADD COLUMN invited_user_id INTEGER');
  }
};

// Create team invite
router.post('/teams/:teamId/invites', authenticate, (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { role, expiresInDays = 7, maxUses = 1, inviteeName } = req.body;

    const normalizedInviteeName = String(inviteeName || '').trim();
    if (!normalizedInviteeName) {
      return res.status(400).json({ error: 'Invitee name is required' });
    }

    // Check if user is trainer of this team
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    let inviteRole: 'trainer' | 'player';

    if (req.user!.role === 'admin') {
      inviteRole = 'trainer';
      if (role && role !== 'trainer') {
        return res.status(403).json({ error: 'Admins can only invite trainers' });
      }
    } else if (membership?.role === 'trainer') {
      inviteRole = 'player';
      if (role && role !== 'player') {
        return res.status(403).json({ error: 'Trainers can only invite players' });
      }
    } else {
      return res.status(403).json({ error: 'Only admins or team trainers can create invites' });
    }

    // Generate unique token
    const token = crypto.randomBytes(16).toString('hex');
    
    // Calculate expiry date
    let expiresAt = null;
    if (expiresInDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + expiresInDays);
      expiresAt = expiry.toISOString();
    }

    // Create invite
    const stmt = db.prepare(
      'INSERT INTO team_invites (team_id, token, role, created_by, expires_at, max_uses, player_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(teamId, token, inviteRole, req.user!.id, expiresAt, maxUses, normalizedInviteeName);

    // Get team name for response
    const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId) as any;

    res.status(201).json({
      id: result.lastInsertRowid,
      token,
      team_id: teamId,
      team_name: team.name,
      role: inviteRole,
      invitee_name: normalizedInviteeName,
      expires_at: expiresAt,
      max_uses: maxUses,
      invite_url: `${getPublicFrontendBaseUrl(req)}/invite/${token}`
    });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Create or rotate a reusable team join link (trainer/admin)
router.post('/teams/:teamId/join-link', authenticate, (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId, 10);

    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (req.user!.role !== 'admin' && (!membership || membership.role !== 'trainer')) {
      return res.status(403).json({ error: 'Only admins or trainers can create team join links' });
    }

    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    let token = '';
    const tokenExistsStmt = db.prepare('SELECT 1 FROM team_invites WHERE token = ? LIMIT 1');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = createShortJoinToken(8);
      const exists = tokenExistsStmt.get(candidate);
      if (!exists) {
        token = candidate;
        break;
      }
    }

    if (!token) {
      return res.status(500).json({ error: 'Could not generate unique join link token' });
    }

    const stmt = db.prepare(
      'INSERT INTO team_invites (team_id, token, role, created_by, expires_at, max_uses, player_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(teamId, token, 'player', req.user!.id, null, 1000, null);

    const frontendUrl = getPublicFrontendBaseUrl(req);

    return res.status(201).json({
      id: result.lastInsertRowid,
      token,
      team_id: teamId,
      team_name: team.name,
      role: 'player',
      join_link_type: 'team_join',
      join_url: `${frontendUrl}/join/${token}`,
      max_uses: 1000,
      used_count: 0,
      expires_at: null,
    });
  } catch (error) {
    console.error('Create team join link error:', error);
    return res.status(500).json({ error: 'Failed to create team join link' });
  }
});

// Get active reusable team join link (trainer/admin)
router.get('/teams/:teamId/join-link', authenticate, (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId, 10);

    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (req.user!.role !== 'admin' && (!membership || membership.role !== 'trainer')) {
      return res.status(403).json({ error: 'Only admins or trainers can view team join links' });
    }

    const invite = db.prepare(`
      SELECT
        ti.id,
        ti.token,
        ti.team_id,
        ti.role,
        ti.max_uses,
        ti.used_count,
        ti.expires_at,
        ti.created_at,
        t.name as team_name
      FROM team_invites ti
      INNER JOIN teams t ON t.id = ti.team_id
      WHERE ti.team_id = ?
        AND ti.player_name IS NULL
        AND COALESCE(ti.max_uses, 0) >= 1000
        AND (ti.expires_at IS NULL OR datetime(ti.expires_at) > datetime('now'))
        AND COALESCE(ti.max_uses, 1000) > COALESCE(ti.used_count, 0)
      ORDER BY datetime(ti.created_at) DESC
      LIMIT 1
    `).get(teamId) as any;

    if (!invite) {
      return res.status(404).json({ error: 'No active team join link found' });
    }

    const frontendUrl = getPublicFrontendBaseUrl(req);

    return res.json({
      ...invite,
      join_link_type: 'team_join',
      join_url: `${frontendUrl}/join/${invite.token}`,
    });
  } catch (error) {
    console.error('Get team join link error:', error);
    return res.status(500).json({ error: 'Failed to fetch team join link' });
  }
});

// Get team invites
router.get('/teams/:teamId/invites', authenticate, (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId);

    // Check if user is trainer of this team
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user!.id) as any;

    if (req.user!.role !== 'admin' && (!membership || membership.role !== 'trainer')) {
      return res.status(403).json({ error: 'Only admins or trainers can view invites' });
    }

    const invites = db.prepare(`
      SELECT 
        ti.*,
        u.name as created_by_name,
        t.name as team_name
      FROM team_invites ti
      INNER JOIN users u ON ti.created_by = u.id
      INNER JOIN teams t ON ti.team_id = t.id
      WHERE ti.team_id = ?
        AND ti.player_name IS NOT NULL
        AND (ti.expires_at IS NULL OR datetime(ti.expires_at) > datetime('now'))
        AND COALESCE(ti.max_uses, 1) > COALESCE(ti.used_count, 0)
      ORDER BY ti.created_at DESC
    `).all(teamId);

    res.json(invites);
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// Get invite details by token (public)
router.get('/invites/:token', (req, res) => {
  try {
    ensureTrainerInviteSchema();

    const { token } = req.params;

    const trainerInvite = db.prepare(`
      SELECT 
        ti.id,
        ti.invited_name,
        ti.team_ids,
        ti.expires_at,
        ti.used_count,
        u.name as invited_by_name
      FROM trainer_invites ti
      INNER JOIN users u ON ti.created_by = u.id
      WHERE ti.token = ?
    `).get(token) as any;

    if (trainerInvite) {
      if (trainerInvite.expires_at && new Date(trainerInvite.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invite has expired' });
      }

      if ((trainerInvite.used_count || 0) >= 1) {
        return res.status(410).json({ error: 'Invite has already been used' });
      }

      let teamIds: number[] = [];
      try {
        const parsed = JSON.parse(trainerInvite.team_ids || '[]');
        if (Array.isArray(parsed)) {
          teamIds = parsed.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
        }
      } catch {
        teamIds = [];
      }

      const teamNames = teamIds.length
        ? (db.prepare(`SELECT id, name FROM teams WHERE id IN (${teamIds.map(() => '?').join(', ')})`).all(...teamIds) as Array<{ id: number; name: string }>).map((t) => t.name)
        : [];

      return res.json({
        id: trainerInvite.id,
        invite_type: 'trainer_setup',
        role: 'trainer',
        player_name: trainerInvite.invited_name,
        team_id: null,
        team_name: teamNames.join(', '),
        team_names: teamNames,
        team_description: null,
        invited_by_name: trainerInvite.invited_by_name,
        expires_at: trainerInvite.expires_at,
        max_uses: 1,
        used_count: trainerInvite.used_count || 0,
      });
    }

    const invite = db.prepare(`
      SELECT 
        ti.id,
        ti.team_id,
        ti.role,
        ti.expires_at,
        ti.max_uses,
        ti.used_count,
        ti.player_name,
        ti.player_birth_date,
        ti.player_jersey_number,
        t.name as team_name,
        t.description as team_description,
        u.name as invited_by_name
      FROM team_invites ti
      INNER JOIN teams t ON ti.team_id = t.id
      INNER JOIN users u ON ti.created_by = u.id
      WHERE ti.token = ?
    `).get(token) as any;

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite has expired' });
    }

    const effectiveMaxUses = invite.max_uses ?? 1;

    // Check if max uses reached
    if (invite.used_count >= effectiveMaxUses) {
      return res.status(410).json({ error: 'Invite has reached maximum uses' });
    }

    const inviteType = !invite.player_name && (invite.max_uses ?? 1) >= 1000
      ? 'team_join_link'
      : 'player_invite';

    res.json({
      ...invite,
      invite_type: inviteType,
    });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({ error: 'Failed to fetch invite' });
  }
});

// Accept invite (for logged-in users)
router.post('/invites/:token/accept', authenticate, (req: AuthRequest, res) => {
  try {
    const { token } = req.params;

    const invite = db.prepare(`
      SELECT id, team_id, role, expires_at, max_uses, used_count, player_name
      FROM team_invites
      WHERE token = ?
    `).get(token) as any;

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite has expired' });
    }

    const effectiveMaxUses = invite.max_uses ?? 1;

    // Check if max uses reached
    if (invite.used_count >= effectiveMaxUses) {
      return res.status(410).json({ error: 'Invite has reached maximum uses' });
    }

    // Check if already a member
    const existingMember = db.prepare(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(invite.team_id, req.user!.id);

    if (existingMember) {
      return res.status(409).json({ error: 'You are already a member of this team' });
    }

    // Add user to team
    const addMemberStmt = db.prepare(
      'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)'
    );
    addMemberStmt.run(invite.team_id, req.user!.id, invite.role);

    // Increment used count
    db.prepare('UPDATE team_invites SET used_count = used_count + 1 WHERE id = ?').run(invite.id);

    // Create pending responses for all upcoming events
    const upcomingEvents = db.prepare(
      "SELECT id FROM events WHERE team_id = ? AND start_time >= datetime('now')"
    ).all(invite.team_id) as any[];

    const responseStmt = db.prepare(
      'INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)'
    );

    for (const event of upcomingEvents) {
      responseStmt.run(event.id, req.user!.id, 'pending');
    }

    const inviteType = !invite.player_name && (invite.max_uses ?? 1) >= 1000
      ? 'team_join_link'
      : 'player_invite';

    res.json({ 
      success: true, 
      message: 'Successfully joined the team',
      team_id: invite.team_id,
      invite_type: inviteType,
    });
  } catch (error: any) {
    console.error('Accept invite error:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'You are already a member of this team' });
    }
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// Delete invite
router.delete('/invites/:id', authenticate, (req: AuthRequest, res) => {
  try {
    const inviteId = parseInt(req.params.id);

    // Get invite to check permissions
    const invite = db.prepare(
      'SELECT team_id FROM team_invites WHERE id = ?'
    ).get(inviteId) as any;

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Check if user is trainer of this team
    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(invite.team_id, req.user!.id) as any;

    if (req.user!.role !== 'admin' && (!membership || membership.role !== 'trainer')) {
      return res.status(403).json({ error: 'Only admins or trainers can delete invites' });
    }

    db.prepare('DELETE FROM team_invites WHERE id = ?').run(inviteId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({ error: 'Failed to delete invite' });
  }
});

// Register with player invite (create account and accept invite in one step)
router.post('/invites/:token/register', async (req, res) => {
  try {
    ensureTrainerInviteSchema();

    const { token } = req.params;
    const { name, username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({ error: 'Username must be 3-30 chars and can only contain letters, numbers and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const trainerInviteColumns = db.pragma('table_info(trainer_invites)') as Array<{ name: string }>;
    const hasInvitedUserId = trainerInviteColumns.some((col) => col.name === 'invited_user_id');

    const trainerInvite = db.prepare(`
      SELECT id, invited_name, ${hasInvitedUserId ? 'invited_user_id' : 'NULL as invited_user_id'}, team_ids, expires_at, used_count
      FROM trainer_invites
      WHERE token = ?
    `).get(token) as any;

    if (trainerInvite) {
      if (trainerInvite.expires_at && new Date(trainerInvite.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invite has expired' });
      }

      if ((trainerInvite.used_count || 0) >= 1) {
        return res.status(410).json({ error: 'Invite has already been used' });
      }

      const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(normalizedUsername) as any;
      if (existingUsername) {
        if (!trainerInvite.invited_user_id || existingUsername.id !== trainerInvite.invited_user_id) {
          return res.status(409).json({ error: 'Username already exists' });
        }
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(normalizedEmail) as any;
      if (existingUser) {
        if (!trainerInvite.invited_user_id || existingUser.id !== trainerInvite.invited_user_id) {
          return res.status(409).json({ error: 'User with this email already exists' });
        }
      }

      let teamIds: number[] = [];
      try {
        const parsed = JSON.parse(trainerInvite.team_ids || '[]');
        if (Array.isArray(parsed)) {
          teamIds = parsed.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
        }
      } catch {
        teamIds = [];
      }

      if (teamIds.length === 0) {
        return res.status(400).json({ error: 'This trainer invite has no teams assigned' });
      }

      const existingTeams = db.prepare(`SELECT id FROM teams WHERE id IN (${teamIds.map(() => '?').join(', ')})`).all(...teamIds) as Array<{ id: number }>;
      const validTeamIds = existingTeams.map((team) => team.id);
      if (validTeamIds.length === 0) {
        return res.status(400).json({ error: 'Assigned teams no longer exist' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      let trainerUserId = Number(trainerInvite.invited_user_id || 0);

      const userColumns = db.pragma('table_info(users)') as Array<{ name: string }>;
      const hasIsRegistered = userColumns.some((col) => col.name === 'is_registered');

      const transaction = db.transaction(() => {
        if (trainerUserId > 0) {
          const existingTrainer = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(trainerUserId, 'trainer');
          if (!existingTrainer) {
            throw new Error('Linked trainer account not found');
          }

          if (hasIsRegistered) {
            db.prepare(
              'UPDATE users SET username = ?, email = ?, password = ?, is_registered = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(normalizedUsername, normalizedEmail, hashedPassword, trainerUserId);
          } else {
            db.prepare(
              'UPDATE users SET username = ?, email = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(normalizedUsername, normalizedEmail, hashedPassword, trainerUserId);
          }
        } else {
          const userStmt = hasIsRegistered
            ? db.prepare(
                'INSERT INTO users (username, email, password, name, role, is_registered) VALUES (?, ?, ?, ?, ?, 1)'
              )
            : db.prepare(
                'INSERT INTO users (username, email, password, name, role) VALUES (?, ?, ?, ?, ?)'
              );
          const userResult = userStmt.run(normalizedUsername, normalizedEmail, hashedPassword, trainerInvite.invited_name, 'trainer');
          trainerUserId = Number(userResult.lastInsertRowid);

          const addMemberStmt = db.prepare(
            'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)'
          );

          const responseStmt = db.prepare(
            'INSERT OR IGNORE INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)' 
          );

          for (const teamId of validTeamIds) {
            addMemberStmt.run(teamId, trainerUserId, 'trainer');

            const upcomingEvents = db.prepare(
              "SELECT id FROM events WHERE team_id = ? AND start_time >= datetime('now')"
            ).all(teamId) as Array<{ id: number }>;

            for (const event of upcomingEvents) {
              responseStmt.run(event.id, trainerUserId, 'pending');
            }
          }

          if (hasInvitedUserId) {
            db.prepare('UPDATE trainer_invites SET invited_user_id = ? WHERE id = ?').run(trainerUserId, trainerInvite.id);
          }
        }

        db.prepare('UPDATE trainer_invites SET used_count = used_count + 1 WHERE id = ?').run(trainerInvite.id);
      });

      transaction();

      const authToken = jwt.sign(
        { id: trainerUserId, username: normalizedUsername, email: normalizedEmail, role: 'trainer' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        token: authToken,
        user: {
          id: trainerUserId,
          username: normalizedUsername,
          email: normalizedEmail,
          name: trainerInvite.invited_name,
          role: 'trainer'
        },
        team_id: validTeamIds[0]
      });
    }

    const invite = db.prepare(`
      SELECT id, team_id, role, expires_at, max_uses, used_count, player_name, player_birth_date, player_jersey_number
      FROM team_invites
      WHERE token = ?
    `).get(token) as any;

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite has expired' });
    }

    const effectiveMaxUses = invite.max_uses ?? 1;

    // Check if max uses reached
    if (invite.used_count >= effectiveMaxUses) {
      return res.status(410).json({ error: 'Invite has reached maximum uses' });
    }

    const isTeamJoinLink = !invite.player_name && (invite.max_uses ?? 1) >= 1000;
    const providedName = String(name || '').trim();

    if (!invite.player_name && !isTeamJoinLink) {
      return res.status(400).json({ error: 'This invite is not eligible for registration.' });
    }

    if (isTeamJoinLink && !providedName) {
      return res.status(400).json({ error: 'Name is required for team join registration' });
    }

    // Check if user with this username or email already exists
    const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(normalizedUsername);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const targetName = invite.player_name || providedName;

    // Create user with data from invite
    const userStmt = db.prepare(
      'INSERT INTO users (username, email, password, name, role, birth_date) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const userResult = userStmt.run(normalizedUsername, normalizedEmail, hashedPassword, targetName, invite.role, invite.player_birth_date || null);

    // Add user to team
    const memberStmt = db.prepare(
      'INSERT INTO team_members (team_id, user_id, role, jersey_number) VALUES (?, ?, ?, ?)'
    );
    memberStmt.run(invite.team_id, userResult.lastInsertRowid, invite.role, invite.player_jersey_number);

    // Increment used count
    db.prepare('UPDATE team_invites SET used_count = used_count + 1 WHERE id = ?').run(invite.id);

    // Create pending responses for all upcoming events
    const upcomingEvents = db.prepare(
      "SELECT id FROM events WHERE team_id = ? AND start_time >= datetime('now')"
    ).all(invite.team_id) as any[];

    const responseStmt = db.prepare(
      'INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)'
    );

    for (const event of upcomingEvents) {
      responseStmt.run(event.id, userResult.lastInsertRowid, 'pending');
    }

    // Generate token
    const authToken = jwt.sign(
      { id: userResult.lastInsertRowid, username: normalizedUsername, email: normalizedEmail, role: invite.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token: authToken,
      user: {
        id: userResult.lastInsertRowid,
        username: normalizedUsername,
        email: normalizedEmail,
        name: targetName,
        role: invite.role,
        birth_date: invite.player_birth_date
      }
    });
  } catch (error: any) {
    console.error('Register with invite error:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }
    res.status(500).json({ error: 'Failed to register' });
  }
});

export default router;
