import { Router } from 'express';
import db from '../database/init';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public endpoint to get organization settings
router.get('/organization', (req, res) => {
  try {
    const org = db.prepare('SELECT * FROM organizations LIMIT 1').get();
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(org);
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// Get all trainer's teams with custom names
router.get('/trainer-team-names', authenticate, (req, res) => {
  try {
    const userId = (req as any).user.id;

    const teams = db
      .prepare(
        `
      SELECT 
        t.id,
        t.name,
        tm.trainer_custom_team_name,
        tm.role
      FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ? AND tm.role IN ('trainer', 'staff')
      ORDER BY t.name ASC
      `
      )
      .all(userId);

    res.json(teams);
  } catch (error) {
    console.error('Get trainer team names error:', error);
    res.status(500).json({ error: 'Failed to fetch trainer team names' });
  }
});

// Update custom team name for a trainer
router.put('/trainer-team-names/:teamId', authenticate, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const teamId = parseInt(req.params.teamId, 10);
    const { trainer_custom_team_name } = req.body;

    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    // Verify user is a trainer for this team
    const membership = db
      .prepare(
        `
      SELECT id FROM team_members 
      WHERE team_id = ? AND user_id = ? AND role IN ('trainer', 'staff')
      `
      )
      .get(teamId, userId);

    if (!membership) {
      return res.status(403).json({ error: 'Not a trainer for this team' });
    }

    // Update the custom team name (allow null to reset)
    const trimmedName = trainer_custom_team_name?.trim() || null;

    db.prepare(
      `
      UPDATE team_members 
      SET trainer_custom_team_name = ? 
      WHERE team_id = ? AND user_id = ?
      `
    ).run(trimmedName, teamId, userId);

    res.json({
      id: teamId,
      trainer_custom_team_name: trimmedName,
      message: 'Team name updated successfully',
    });
  } catch (error) {
    console.error('Update trainer team name error:', error);
    res.status(500).json({ error: 'Failed to update team name' });
  }
});

export default router;
