"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const init_1 = __importDefault(require("../database/init"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public endpoint to get organization settings
router.get('/organization', (req, res) => {
    try {
        const org = init_1.default.prepare('SELECT * FROM organizations LIMIT 1').get();
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json(org);
    }
    catch (error) {
        console.error('Get organization error:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});
// Get all trainer's teams with custom names
router.get('/trainer-team-names', auth_1.authenticate, (req, res) => {
    try {
        const userId = req.user.id;
        const teams = init_1.default
            .prepare(`
      SELECT 
        t.id,
        t.name,
        tm.trainer_custom_team_name,
        tm.role
      FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ? AND tm.role IN ('trainer', 'staff')
      ORDER BY t.name ASC
      `)
            .all(userId);
        res.json(teams);
    }
    catch (error) {
        console.error('Get trainer team names error:', error);
        res.status(500).json({ error: 'Failed to fetch trainer team names' });
    }
});
// Update custom team name for a trainer
router.put('/trainer-team-names/:teamId', auth_1.authenticate, (req, res) => {
    try {
        const userId = req.user.id;
        const teamId = parseInt(req.params.teamId, 10);
        const { trainer_custom_team_name } = req.body;
        if (!Number.isFinite(teamId)) {
            return res.status(400).json({ error: 'Invalid team ID' });
        }
        // Verify user is a trainer for this team
        const membership = init_1.default
            .prepare(`
      SELECT id FROM team_members 
      WHERE team_id = ? AND user_id = ? AND role IN ('trainer', 'staff')
      `)
            .get(teamId, userId);
        if (!membership) {
            return res.status(403).json({ error: 'Not a trainer for this team' });
        }
        // Update the custom team name (allow null to reset)
        const trimmedName = trainer_custom_team_name?.trim() || null;
        init_1.default.prepare(`
      UPDATE team_members 
      SET trainer_custom_team_name = ? 
      WHERE team_id = ? AND user_id = ?
      `).run(trimmedName, teamId, userId);
        res.json({
            id: teamId,
            trainer_custom_team_name: trimmedName,
            message: 'Team name updated successfully',
        });
    }
    catch (error) {
        console.error('Update trainer team name error:', error);
        res.status(500).json({ error: 'Failed to update team name' });
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map