import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';
import { JWT_SECRET } from '../config';
import { getPublicFrontendBaseUrl } from '../utils/publicUrl';

const router = Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.has(file.mimetype) && allowedExts.has(ext)) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
});

// First-time setup endpoint (no auth required)
// This creates the first admin user and completes organization setup
router.post('/first-setup', async (req, res) => {
  try {
    const { organizationName, organizationShortName, adminUsername, adminEmail, adminPassword, timezone } = req.body;

    // Validate input
    if (!organizationName || !adminUsername || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'Organization name, username, email and password are required' });
    }

    const normalizedUsername = String(adminUsername).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({ error: 'Username must be 3-30 chars and can only contain letters, numbers and underscores' });
    }

    if (adminPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if setup has already been completed
    const org = db.prepare('SELECT setup_completed FROM organizations WHERE id = 1').get() as any;
    if (org?.setup_completed === 1) {
      return res.status(403).json({ error: 'Setup has already been completed' });
    }

    // Check if admin already exists
    const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    if (existingAdmin) {
      return res.status(403).json({ error: 'Admin already exists' });
    }

    // Check if username or email is already used
    const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(normalizedUsername);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    const userStmt = db.prepare(
      'INSERT INTO users (username, email, password, name, role) VALUES (?, ?, ?, ?, ?)'
    );
    const userResult = userStmt.run(normalizedUsername, adminEmail, hashedPassword, 'Admin', 'admin');

    // Update organization
    db.prepare(`
      UPDATE organizations 
      SET name = ?, short_name = ?, timezone = ?, setup_completed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      organizationName,
      typeof organizationShortName === 'string' && organizationShortName.trim().length > 0 ? organizationShortName.trim() : null,
      timezone || 'Europe/Berlin'
    );

    // Generate token
    const token = jwt.sign(
      { id: userResult.lastInsertRowid, username: normalizedUsername, email: adminEmail, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: userResult.lastInsertRowid,
        username: normalizedUsername,
        email: adminEmail,
        name: 'Admin',
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('First-time setup error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// All routes below require authentication
router.use(authenticate);

// Middleware to check admin role
const requireAdmin = (req: AuthRequest, res: any, next: any) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
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

const ensureAdminAuditSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER NOT NULL,
      actor_username TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_id ON admin_audit_logs(actor_id);
  `);
};

const cleanupDeprecatedAuditActions = () => {
  ensureAdminAuditSchema();
  db.prepare(`
    DELETE FROM admin_audit_logs
    WHERE action IN ('backup_created', 'backup_downloaded')
  `).run();
};

const logAdminAction = (
  req: AuthRequest,
  action: string,
  targetType?: string,
  targetId?: number,
  details?: Record<string, any>
) => {
  try {
    ensureAdminAuditSchema();
    db.prepare(`
      INSERT INTO admin_audit_logs (actor_id, actor_username, actor_role, action, target_type, target_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user!.id,
      req.user!.username || null,
      req.user!.role || null,
      action,
      targetType || null,
      typeof targetId === 'number' ? targetId : null,
      details ? JSON.stringify(details) : null
    );
  } catch (auditError) {
    console.error('Audit log write error:', auditError);
  }
};

ensureAdminAuditSchema();
cleanupDeprecatedAuditActions();

router.use(requireAdmin);

// Get recent admin audit logs
router.get('/audit-logs', (req: AuthRequest, res) => {
  try {
    ensureAdminAuditSchema();
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const logs = db.prepare(`
      SELECT
        l.id,
        l.actor_id,
        l.actor_username,
        l.actor_role,
        l.action,
        l.target_type,
        l.target_id,
        l.details_json,
        l.created_at,
        COALESCE(u.name, l.actor_username) as actor_name
      FROM admin_audit_logs l
      LEFT JOIN users u ON u.id = l.actor_id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ?
    `).all(limit) as Array<any>;

    res.json(
      logs.map((log) => ({
        ...log,
        details: log.details_json ? JSON.parse(log.details_json) : null,
      }))
    );
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get all teams (admin only)
router.get('/teams', (req: AuthRequest, res) => {
  try {
    const teams = db.prepare(`
      SELECT 
        t.*,
        u.name as created_by_name,
        COALESCE((
          SELECT GROUP_CONCAT(u2.name, ', ')
          FROM team_members tm
          INNER JOIN users u2 ON tm.user_id = u2.id
          WHERE tm.team_id = t.id AND tm.role = 'trainer'
        ), '') as trainer_names,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
      FROM teams t
      INNER JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `).all();

    res.json(teams);
  } catch (error) {
    console.error('Get all teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Update team (admin only)
router.put('/teams/:id', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const { name, description } = req.body as { name?: string; description?: string };

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const team = db.prepare('SELECT id, name, description FROM teams WHERE id = ?').get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const normalizedDescription = String(description || '').trim() || null;

    db.prepare(
      'UPDATE teams SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(normalizedName, normalizedDescription, teamId);

    logAdminAction(req, 'team_renamed', 'team', teamId, {
      old_team_name: team.name,
      new_team_name: normalizedName,
    });

    return res.json({
      id: teamId,
      name: normalizedName,
      description: normalizedDescription,
    });
  } catch (error) {
    console.error('Update team error:', error);
    return res.status(500).json({ error: 'Failed to update team' });
  }
});

// Get all users (admin only)
router.get('/users', (req: AuthRequest, res) => {
  try {
    const userColumns = db.pragma('table_info(users)') as Array<{ name: string }>;
    const hasIsRegistered = userColumns.some((col) => col.name === 'is_registered');

    const users = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.name,
        u.email,
        u.role,
        ${hasIsRegistered ? 'u.is_registered' : '1 as is_registered'},
        CASE
          WHEN u.role = 'trainer' AND COALESCE(${hasIsRegistered ? 'u.is_registered' : '1'}, 1) = 0 THEN 'pending'
          ELSE 'registered'
        END as registration_status,
        u.created_at,
        COALESCE((
          SELECT GROUP_CONCAT(t.name, ', ')
          FROM team_members tm
          INNER JOIN teams t ON tm.team_id = t.id
          WHERE tm.user_id = u.id
        ), '') as team_names,
        (SELECT COUNT(*) FROM team_members WHERE user_id = u.id) as team_count
      FROM users u
      ORDER BY u.created_at DESC
    `).all();

    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (req.user!.id === userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const targetUser = db.prepare('SELECT id, role, name, username, email FROM users WHERE id = ?').get(userId) as any;
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ error: 'Admin users cannot be deleted here' });
    }

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM team_invites WHERE created_by = ?').run(userId);
      db.prepare('DELETE FROM trainer_invites WHERE created_by = ?').run(userId);
      db.prepare('DELETE FROM trainer_invites WHERE invited_user_id = ?').run(userId);
      db.prepare('DELETE FROM events WHERE created_by = ?').run(userId);
      db.prepare('DELETE FROM teams WHERE created_by = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    transaction();

    logAdminAction(req, 'user_deleted', 'user', userId, {
      target_name: targetUser.name,
      target_username: targetUser.username,
      target_email: targetUser.email,
      target_role: targetUser.role,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset user password (admin only)
router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const generatePassword = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
      let password = '';
      for (let index = 0; index < 12; index += 1) {
        const randomIndex = crypto.randomInt(0, chars.length);
        password += chars[randomIndex];
      }
      return password;
    };

    const finalPassword = newPassword ? String(newPassword) : generatePassword();

    if (finalPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const targetUser = db.prepare('SELECT id, role, name, username, email FROM users WHERE id = ?').get(userId) as any;
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ error: 'Admin users cannot be reset here' });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(hashedPassword, userId);

    logAdminAction(req, 'user_password_reset', 'user', userId, {
      target_name: targetUser.name,
      target_username: targetUser.username,
      target_email: targetUser.email,
      target_role: targetUser.role,
      custom_password_provided: Boolean(newPassword),
    });

    res.json({ success: true, generatedPassword: finalPassword });
  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({ error: 'Failed to reset user password' });
  }
});

// Create trainer setup invite link (admin only)
router.post('/trainer-invites', (req: AuthRequest, res) => {
  try {
    ensureTrainerInviteSchema();

    const { name, teamIds, expiresInDays = 7 } = req.body;

    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return res.status(400).json({ error: 'Trainer name is required' });
    }

    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'At least one team must be selected' });
    }

    const normalizedTeamIds = [...new Set(teamIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0))];
    if (normalizedTeamIds.length === 0) {
      return res.status(400).json({ error: 'At least one valid team must be selected' });
    }

    const placeholders = normalizedTeamIds.map(() => '?').join(', ');
    const existingTeams = db.prepare(`SELECT id, name FROM teams WHERE id IN (${placeholders})`).all(...normalizedTeamIds) as Array<{ id: number; name: string }>;
    if (existingTeams.length !== normalizedTeamIds.length) {
      return res.status(400).json({ error: 'One or more selected teams do not exist' });
    }

    const token = crypto.randomBytes(24).toString('hex');

    let expiresAt = null;
    if (expiresInDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + Number(expiresInDays));
      expiresAt = expiry.toISOString();
    }

    const userColumns = db.pragma('table_info(users)') as Array<{ name: string }>;
    const hasIsRegistered = userColumns.some((col) => col.name === 'is_registered');

    const trainerInviteColumns = db.pragma('table_info(trainer_invites)') as Array<{ name: string }>;
    const hasInvitedUserId = trainerInviteColumns.some((col) => col.name === 'invited_user_id');

    const generatePendingUsername = (): string => {
      while (true) {
        const candidate = `pending_tr_${crypto.randomBytes(6).toString('hex')}`.slice(0, 30);
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(candidate);
        if (!existing) {
          return candidate;
        }
      }
    };

    const pendingUsername = generatePendingUsername();
    const pendingEmail = `${pendingUsername}@pending.local`;
    const pendingPasswordHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);

    let createdUserId = 0;

    const transaction = db.transaction(() => {
      const userResult = hasIsRegistered
        ? db.prepare(
            'INSERT INTO users (username, email, password, name, role, is_registered) VALUES (?, ?, ?, ?, ?, 0)'
          ).run(pendingUsername, pendingEmail, pendingPasswordHash, normalizedName, 'trainer')
        : db.prepare(
            'INSERT INTO users (username, email, password, name, role) VALUES (?, ?, ?, ?, ?)'
          ).run(pendingUsername, pendingEmail, pendingPasswordHash, normalizedName, 'trainer');

      createdUserId = Number(userResult.lastInsertRowid);

      const addMemberStmt = db.prepare(
        'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)' 
      );

      const responseStmt = db.prepare(
        'INSERT OR IGNORE INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)' 
      );

      for (const teamId of normalizedTeamIds) {
        addMemberStmt.run(teamId, createdUserId, 'trainer');

        const upcomingEvents = db.prepare(
          "SELECT id FROM events WHERE team_id = ? AND start_time >= datetime('now')"
        ).all(teamId) as Array<{ id: number }>;

        for (const event of upcomingEvents) {
          responseStmt.run(event.id, createdUserId, 'pending');
        }
      }

      if (hasInvitedUserId) {
        db.prepare(
          'INSERT INTO trainer_invites (token, invited_name, invited_user_id, team_ids, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(token, normalizedName, createdUserId, JSON.stringify(normalizedTeamIds), req.user!.id, expiresAt);
      } else {
        db.prepare(
          'INSERT INTO trainer_invites (token, invited_name, team_ids, created_by, expires_at) VALUES (?, ?, ?, ?, ?)'
        ).run(token, normalizedName, JSON.stringify(normalizedTeamIds), req.user!.id, expiresAt);
      }
    });

    transaction();

    res.status(201).json({
      id: createdUserId,
      user_id: createdUserId,
      token,
      invited_name: normalizedName,
      team_ids: normalizedTeamIds,
      team_names: existingTeams.map((team) => team.name),
      expires_at: expiresAt,
      registration_status: 'pending',
      invite_url: `${getPublicFrontendBaseUrl(req)}/invite/${token}`
    });
  } catch (error) {
    console.error('Create trainer invite error:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to create trainer invite' });
  }
});

// Regenerate trainer setup invite link for existing trainer (admin only)
router.post('/users/:id/trainer-invite-resend', (req: AuthRequest, res) => {
  try {
    ensureTrainerInviteSchema();

    const userId = parseInt(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const trainer = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(userId) as any;
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(404).json({ error: 'Trainer not found' });
    }

    const memberships = db.prepare(
      'SELECT team_id FROM team_members WHERE user_id = ? AND role = ? ORDER BY team_id ASC'
    ).all(userId, 'trainer') as Array<{ team_id: number }>;

    const teamIds = memberships.map((membership) => membership.team_id);
    if (teamIds.length === 0) {
      return res.status(400).json({ error: 'Trainer has no assigned teams' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    const expiresAt = expiry.toISOString();

    const trainerInviteColumns = db.pragma('table_info(trainer_invites)') as Array<{ name: string }>;
    const hasInvitedUserId = trainerInviteColumns.some((col) => col.name === 'invited_user_id');

    if (hasInvitedUserId) {
      db.prepare('DELETE FROM trainer_invites WHERE used_count < 1 AND invited_user_id = ?').run(trainer.id);
    } else {
      db.prepare('DELETE FROM trainer_invites WHERE used_count < 1 AND invited_name = ?').run(trainer.name);
    }

    if (hasInvitedUserId) {
      db.prepare(
        'INSERT INTO trainer_invites (token, invited_name, invited_user_id, team_ids, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(token, trainer.name, trainer.id, JSON.stringify(teamIds), req.user!.id, expiresAt);
    } else {
      db.prepare(
        'INSERT INTO trainer_invites (token, invited_name, team_ids, created_by, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).run(token, trainer.name, JSON.stringify(teamIds), req.user!.id, expiresAt);
    }

    res.status(201).json({
      user_id: trainer.id,
      token,
      expires_at: expiresAt,
      invite_url: `${getPublicFrontendBaseUrl(req)}/invite/${token}`
    });
  } catch (error) {
    console.error('Resend trainer invite error:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to resend trainer invite' });
  }
});

// Create trainer user (admin only)
router.post('/users/trainer', async (req: AuthRequest, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ error: 'Name, username, email and password are required' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();

    if (!normalizedName) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({ error: 'Username must be 3-30 chars and can only contain letters, numbers and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(normalizedUsername);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(
      'INSERT INTO users (username, email, password, name, role) VALUES (?, ?, ?, ?, ?)' 
    ).run(normalizedUsername, normalizedEmail, hashedPassword, normalizedName, 'trainer');

    res.status(201).json({
      id: result.lastInsertRowid,
      username: normalizedUsername,
      email: normalizedEmail,
      name: normalizedName,
      role: 'trainer'
    });
  } catch (error) {
    console.error('Create trainer error:', error);
    res.status(500).json({ error: 'Failed to create trainer' });
  }
});

// Create admin user (admin only)
router.post('/users/admin', async (req: AuthRequest, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ error: 'Name, username, email and password are required' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();

    if (!normalizedName) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({ error: 'Username must be 3-30 chars and can only contain letters, numbers and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(normalizedUsername);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(
      'INSERT INTO users (username, email, password, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(normalizedUsername, normalizedEmail, hashedPassword, normalizedName, 'admin');

    const createdUserId = Number(result.lastInsertRowid);

    logAdminAction(req, 'admin_created', 'user', createdUserId, {
      target_name: normalizedName,
      target_username: normalizedUsername,
      target_email: normalizedEmail,
      target_role: 'admin',
    });

    res.status(201).json({
      id: createdUserId,
      username: normalizedUsername,
      email: normalizedEmail,
      name: normalizedName,
      role: 'admin'
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// Add user to team (admin only)
router.post('/teams/:teamId/members', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { user_id, role } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (role !== 'trainer') {
      return res.status(400).json({ error: 'Admins can only assign trainers to teams' });
    }

    // Check if team exists
    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check if user exists
    const user = db.prepare('SELECT id, role, name, username, email FROM users WHERE id = ?').get(user_id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'trainer') {
      return res.status(400).json({ error: 'Only trainer users can be assigned by admin' });
    }

    // Add member
    const stmt = db.prepare(
      'INSERT INTO team_members (team_id, user_id, role, jersey_number, position) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(teamId, user_id, 'trainer', null, null);

    // Create pending responses for all upcoming events
    const upcomingEvents = db.prepare(
      "SELECT id FROM events WHERE team_id = ? AND start_time >= datetime('now')"
    ).all(teamId) as any[];

    const responseStmt = db.prepare(
      'INSERT INTO event_responses (event_id, user_id, status) VALUES (?, ?, ?)'
    );

    for (const event of upcomingEvents) {
      responseStmt.run(event.id, user_id, 'pending');
    }

    logAdminAction(req, 'trainer_assigned_to_team', 'team', teamId, {
      team_name: team.name,
      trainer_id: user.id,
      trainer_name: user.name,
      trainer_username: user.username,
      trainer_email: user.email,
    });

    res.status(201).json({
      id: result.lastInsertRowid,
      team_id: teamId,
      user_id,
      role: 'trainer',
      jersey_number: null,
      position: null
    });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'User is already a team member' });
    }
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// Get trainers of a team (admin only)
router.get('/teams/:teamId/trainers', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId);

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const trainers = db.prepare(`
      SELECT u.id, u.name, u.username, u.email
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.role = 'trainer'
      ORDER BY u.name ASC
    `).all(teamId);

    res.json(trainers);
  } catch (error) {
    console.error('Get team trainers error:', error);
    res.status(500).json({ error: 'Failed to fetch team trainers' });
  }
});

// Delete team (admin only)
router.delete('/teams/:id', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.id);

    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(teamId) as any;
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const result = db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    logAdminAction(req, 'team_deleted', 'team', teamId, {
      team_name: team.name,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Remove user from team (admin only)
router.delete('/teams/:teamId/members/:userId', (req: AuthRequest, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const userId = parseInt(req.params.userId);

    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(teamId) as any;
    const user = db.prepare('SELECT id, name, username, email FROM users WHERE id = ?').get(userId) as any;

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, userId) as any;

    if (!membership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    if (membership.role !== 'trainer') {
      return res.status(400).json({ error: 'Admins can only remove trainers from teams' });
    }

    const result = db.prepare(
      'DELETE FROM team_members WHERE team_id = ? AND user_id = ?'
    ).run(teamId, userId);

    if (result.changes > 0) {
      logAdminAction(req, 'trainer_removed_from_team', 'team', teamId, {
        team_name: team.name,
        trainer_id: user.id,
        trainer_name: user.name,
        trainer_username: user.username,
        trainer_email: user.email,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// Get organization settings
router.get('/settings', (req: AuthRequest, res) => {
  try {
    const org = db.prepare('SELECT * FROM organizations LIMIT 1').get();
    res.json(org);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Complete setup wizard
router.post('/settings/setup', (req: AuthRequest, res) => {
  try {
    const { organizationName, organizationShortName, timezone } = req.body;

    if (!organizationName) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    db.prepare(`
      UPDATE organizations 
      SET name = ?, short_name = ?, timezone = ?, setup_completed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      organizationName,
      typeof organizationShortName === 'string' && organizationShortName.trim().length > 0 ? organizationShortName.trim() : null,
      timezone || 'Europe/Berlin'
    );

    const org = db.prepare('SELECT * FROM organizations WHERE id = 1').get();
    res.json(org);
  } catch (error) {
    console.error('Setup wizard error:', error);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

// Delete organization and all related data (admin only)
router.delete('/organization', (req: AuthRequest, res) => {
  try {
    const currentOrg = db.prepare('SELECT name FROM organizations WHERE id = 1').get() as any;

    db.prepare('DELETE FROM team_members').run();
    db.prepare('DELETE FROM event_responses').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM team_invites').run();
    db.prepare('DELETE FROM trainer_invites').run();
    db.prepare('DELETE FROM teams').run();
    db.prepare('DELETE FROM users').run();

    db.prepare(`
      UPDATE organizations
      SET name = ?, short_name = NULL, logo = NULL, timezone = 'Europe/Berlin', setup_completed = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run('Neuer Verein');

    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        try {
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          console.warn('Failed to remove upload file during organization reset:', filePath, cleanupError);
        }
      }
    }

    res.json({
      success: true,
      message: `Organization "${currentOrg?.name || 'Unbekannt'}" and all related data deleted. Setup reset required.`
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// Upload organization logo (special handling for file upload with explicit middleware order)
router.post('/settings/logo', 
  authenticate,
  (req: AuthRequest, res, next) => {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  },
  upload.single('logo') as any,
  (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const logoPath = `/uploads/${req.file.filename}`;
    
    // Delete old logo file if exists
    const oldOrg = db.prepare('SELECT logo FROM organizations WHERE id = 1').get() as any;
    if (oldOrg?.logo) {
      const oldFilePath = path.join(uploadsDir, path.basename(oldOrg.logo));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    
    db.prepare(`
      UPDATE organizations 
      SET logo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(logoPath);

    const org = db.prepare('SELECT * FROM organizations WHERE id = 1').get();
    res.json(org);
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

export default router;
