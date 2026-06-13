"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const init_1 = __importDefault(require("../database/init"));
const auth_1 = require("../middleware/auth");
const pushNotifications_1 = require("../services/pushNotifications");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const parseOptions = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 8);
};
const getTeamMembership = (teamId, userId) => {
    const membership = init_1.default.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
    return membership || null;
};
const getPostWithTeam = (teamId, postId) => {
    return init_1.default.prepare('SELECT id, team_id, type, poll_options, title FROM team_posts WHERE id = ? AND team_id = ?').get(postId, teamId);
};
const getTeamMemberIds = (teamId) => {
    const rows = init_1.default.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all(teamId);
    return rows.map((row) => Number(row.user_id)).filter((id) => Number.isInteger(id) && id > 0);
};
router.get('/posts/open', (req, res) => {
    try {
        const userId = req.user.id;
        const rows = init_1.default.prepare(`
      SELECT p.id,
             p.team_id,
             p.type,
             p.title,
             p.content,
             p.poll_options,
             p.created_at,
             t.name as team_name,
             u.name as created_by_name,
             pr.seen_at as my_seen_at,
             pr.answer_option as my_answer_option,
             pr.answered_at as my_answered_at
      FROM team_posts p
      INNER JOIN teams t ON t.id = p.team_id
      INNER JOIN users u ON u.id = p.created_by
      INNER JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = ?
      LEFT JOIN team_post_reads pr ON pr.post_id = p.id AND pr.user_id = ?
      WHERE p.is_active = 1
        AND (
          (p.type = 'announcement' AND pr.seen_at IS NULL)
          OR (p.type = 'poll' AND pr.answered_at IS NULL)
        )
      ORDER BY datetime(p.created_at) DESC
      LIMIT 50
    `).all(userId, userId);
        const payload = rows.map((row) => ({
            ...row,
            poll_options: row.poll_options ? JSON.parse(row.poll_options) : [],
        }));
        return res.json(payload);
    }
    catch (error) {
        console.error('Get open posts error:', error);
        return res.status(500).json({ error: 'Failed to fetch open posts' });
    }
});
router.get('/teams/:id/posts', (req, res) => {
    try {
        const teamId = parseInt(req.params.id, 10);
        const userId = req.user.id;
        const scope = String(req.query.scope || 'open');
        const membership = getTeamMembership(teamId, userId);
        if (!membership) {
            return res.status(403).json({ error: 'Not a team member' });
        }
        const rows = init_1.default.prepare(`
      SELECT p.id,
             p.team_id,
             p.type,
             p.title,
             p.content,
             p.poll_options,
             p.created_at,
             p.updated_at,
             p.created_by,
             u.name as created_by_name,
             pr.seen_at as my_seen_at,
             pr.answer_option as my_answer_option,
             pr.answered_at as my_answered_at
      FROM team_posts p
      INNER JOIN users u ON u.id = p.created_by
      LEFT JOIN team_post_reads pr ON pr.post_id = p.id AND pr.user_id = ?
      WHERE p.team_id = ?
        AND p.is_active = 1
      ORDER BY datetime(p.created_at) DESC
    `).all(userId, teamId);
        const payload = rows
            .map((row) => ({
            ...row,
            poll_options: row.poll_options ? JSON.parse(row.poll_options) : [],
        }))
            .filter((row) => {
            if (scope !== 'open')
                return true;
            if (row.type === 'announcement') {
                return !row.my_seen_at;
            }
            if (row.type === 'poll') {
                return !row.my_answered_at;
            }
            return false;
        });
        return res.json(payload);
    }
    catch (error) {
        console.error('Get team posts error:', error);
        return res.status(500).json({ error: 'Failed to fetch team posts' });
    }
});
router.post('/teams/:id/posts', async (req, res) => {
    try {
        const teamId = parseInt(req.params.id, 10);
        const userId = req.user.id;
        const type = String(req.body?.type || '').trim().toLowerCase();
        const title = String(req.body?.title || '').trim();
        const content = String(req.body?.content || '').trim();
        const options = parseOptions(req.body?.options);
        const membership = getTeamMembership(teamId, userId);
        if (!membership || membership.role !== 'trainer') {
            return res.status(403).json({ error: 'Only trainers can create posts' });
        }
        if (!['announcement', 'poll'].includes(type)) {
            return res.status(400).json({ error: 'Invalid post type' });
        }
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (type === 'announcement' && !content) {
            return res.status(400).json({ error: 'Content is required for announcements' });
        }
        if (type === 'poll' && options.length < 2) {
            return res.status(400).json({ error: 'Poll needs at least two options' });
        }
        const result = init_1.default.prepare('INSERT INTO team_posts (team_id, type, title, content, poll_options, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(teamId, type, title, content || null, type === 'poll' ? JSON.stringify(options) : null, userId);
        const createdPostId = Number(result.lastInsertRowid);
        const memberIds = getTeamMemberIds(teamId).filter((id) => id !== userId);
        const team = init_1.default.prepare('SELECT name FROM teams WHERE id = ?').get(teamId);
        if (memberIds.length > 0) {
            await (0, pushNotifications_1.sendPushToUsers)(memberIds, {
                title: type === 'poll' ? 'Neue Umfrage' : 'Neue Nachricht',
                body: `${team?.name ? `${team.name}: ` : ''}${title}`,
                url: `/teams/${teamId}/posts?scope=all`,
            });
        }
        const created = init_1.default.prepare(`SELECT p.id, p.team_id, p.type, p.title, p.content, p.poll_options, p.created_at, p.updated_at, p.created_by, u.name as created_by_name
       FROM team_posts p
       INNER JOIN users u ON u.id = p.created_by
       WHERE p.id = ?`).get(createdPostId);
        return res.status(201).json({
            ...created,
            poll_options: created?.poll_options ? JSON.parse(created.poll_options) : [],
        });
    }
    catch (error) {
        console.error('Create team post error:', error);
        return res.status(500).json({ error: 'Failed to create post' });
    }
});
router.post('/teams/:teamId/posts/:postId/seen', (req, res) => {
    try {
        const teamId = parseInt(req.params.teamId, 10);
        const postId = parseInt(req.params.postId, 10);
        const userId = req.user.id;
        const membership = getTeamMembership(teamId, userId);
        if (!membership) {
            return res.status(403).json({ error: 'Not a team member' });
        }
        const post = getPostWithTeam(teamId, postId);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        init_1.default.prepare(`
      INSERT INTO team_post_reads (post_id, user_id, seen_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(post_id, user_id)
      DO UPDATE SET seen_at = COALESCE(team_post_reads.seen_at, CURRENT_TIMESTAMP)
    `).run(postId, userId);
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Mark post seen error:', error);
        return res.status(500).json({ error: 'Failed to mark post as seen' });
    }
});
router.post('/teams/:teamId/posts/:postId/answer', (req, res) => {
    try {
        const teamId = parseInt(req.params.teamId, 10);
        const postId = parseInt(req.params.postId, 10);
        const userId = req.user.id;
        const optionIndex = Number(req.body?.optionIndex);
        const membership = getTeamMembership(teamId, userId);
        if (!membership) {
            return res.status(403).json({ error: 'Not a team member' });
        }
        const post = getPostWithTeam(teamId, postId);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.type !== 'poll') {
            return res.status(400).json({ error: 'Post is not a poll' });
        }
        const options = post.poll_options ? JSON.parse(post.poll_options) : [];
        if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
            return res.status(400).json({ error: 'Invalid poll option' });
        }
        init_1.default.prepare(`
      INSERT INTO team_post_reads (post_id, user_id, seen_at, answer_option, answered_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(post_id, user_id)
      DO UPDATE SET
        seen_at = COALESCE(team_post_reads.seen_at, CURRENT_TIMESTAMP),
        answer_option = excluded.answer_option,
        answered_at = CURRENT_TIMESTAMP
    `).run(postId, userId, optionIndex);
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Answer poll error:', error);
        return res.status(500).json({ error: 'Failed to answer poll' });
    }
});
exports.default = router;
//# sourceMappingURL=posts.js.map