"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const init_1 = __importDefault(require("../database/init"));
const rateLimit_1 = require("../middleware/rateLimit");
const config_1 = require("../config");
const router = (0, express_1.Router)();
const loginRateLimitWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const loginRateLimitMax = Number(process.env.LOGIN_RATE_LIMIT_MAX || 8);
const loginAttemptLimiter = (0, rateLimit_1.createRateLimiter)({
    windowMs: Number.isFinite(loginRateLimitWindowMs) && loginRateLimitWindowMs > 0
        ? loginRateLimitWindowMs
        : 15 * 60 * 1000,
    max: Number.isFinite(loginRateLimitMax) && loginRateLimitMax > 0 ? loginRateLimitMax : 8,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const username = typeof req.body?.username === 'string'
            ? req.body.username.trim().toLowerCase()
            : 'unknown';
        return `${req.ip}:${username || 'unknown'}`;
    },
    message: { error: 'Too many login attempts, please try again later.' },
});
// Register (invite-only)
router.post('/register', async (_req, res) => {
    return res.status(403).json({ error: 'Registration is invite-only. Please use your personal invite link.' });
});
// Login
router.post('/login', loginAttemptLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        const normalizedUsername = String(username).trim().toLowerCase();
        // Find user
        const user = init_1.default.prepare(`SELECT id, username, email, password, name, nickname, role, profile_picture, phone_number,
              height_cm, weight_kg, clothing_size, shoe_size, jersey_number, footedness, position
       FROM users WHERE LOWER(username) = ?`).get(normalizedUsername);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Verify password
        const validPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!validPassword) {
            console.error(`Invalid password for user: ${normalizedUsername}`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Generate token
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, config_1.JWT_SECRET, { expiresIn: config_1.JWT_EXPIRES_IN });
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                name: user.name,
                nickname: user.nickname,
                role: user.role,
                profile_picture: user.profile_picture,
                phone_number: user.phone_number,
                height_cm: user.height_cm,
                weight_kg: user.weight_kg,
                clothing_size: user.clothing_size,
                shoe_size: user.shoe_size,
                jersey_number: user.jersey_number,
                footedness: user.footedness,
                position: user.position,
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
// Get current user
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET);
        const user = init_1.default.prepare(`SELECT id, username, email, name, nickname, role, profile_picture, phone_number, created_at,
              height_cm, weight_kg, clothing_size, shoe_size, jersey_number, footedness, position
       FROM users WHERE id = ?`).get(decoded.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map