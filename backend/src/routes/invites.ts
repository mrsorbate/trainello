import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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

export default router;
