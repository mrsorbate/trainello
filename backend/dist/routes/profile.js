"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const init_1 = __importDefault(require("../database/init"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const ensureProfileUserColumns = () => {
    const columns = init_1.default.pragma('table_info(users)');
    const existing = new Set(columns.map((column) => column.name));
    const requiredColumns = [
        { name: 'phone_number', sqlType: 'TEXT' },
        { name: 'nickname', sqlType: 'TEXT' },
        { name: 'height_cm', sqlType: 'INTEGER' },
        { name: 'weight_kg', sqlType: 'INTEGER' },
        { name: 'clothing_size', sqlType: 'TEXT' },
        { name: 'shoe_size', sqlType: 'TEXT' },
        { name: 'jersey_number', sqlType: 'INTEGER' },
        { name: 'footedness', sqlType: 'TEXT' },
        { name: 'position', sqlType: 'TEXT' },
    ];
    for (const column of requiredColumns) {
        if (!existing.has(column.name)) {
            init_1.default.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.sqlType}`);
        }
    }
};
// Create uploads directory if it doesn't exist
const uploadsDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// Configure multer for profile picture uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
});
// All routes require authentication
router.use(auth_1.authenticate);
// Get current user profile
router.get('/me', (req, res) => {
    try {
        ensureProfileUserColumns();
        const user = init_1.default.prepare(`SELECT id, username, email, name, nickname, role, profile_picture, phone_number, created_at,
              height_cm, weight_kg, clothing_size, shoe_size, jersey_number, footedness, position
       FROM users WHERE id = ?`).get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
router.put('/me', (req, res) => {
    try {
        ensureProfileUserColumns();
        const { phone_number, nickname, height_cm, weight_kg, clothing_size, shoe_size, jersey_number, footedness, position, } = req.body;
        const user = init_1.default.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const hasPhoneUpdate = Object.prototype.hasOwnProperty.call(req.body, 'phone_number');
        const hasNicknameUpdate = Object.prototype.hasOwnProperty.call(req.body, 'nickname');
        const hasHeightUpdate = Object.prototype.hasOwnProperty.call(req.body, 'height_cm');
        const hasWeightUpdate = Object.prototype.hasOwnProperty.call(req.body, 'weight_kg');
        const hasClothingSizeUpdate = Object.prototype.hasOwnProperty.call(req.body, 'clothing_size');
        const hasShoeSizeUpdate = Object.prototype.hasOwnProperty.call(req.body, 'shoe_size');
        const hasJerseyNumberUpdate = Object.prototype.hasOwnProperty.call(req.body, 'jersey_number');
        const hasFootednessUpdate = Object.prototype.hasOwnProperty.call(req.body, 'footedness');
        const hasPositionUpdate = Object.prototype.hasOwnProperty.call(req.body, 'position');
        if (hasPhoneUpdate && user.role !== 'trainer') {
            return res.status(403).json({ error: 'Only trainers can update phone number' });
        }
        const updates = [];
        const params = [];
        if (hasPhoneUpdate) {
            const normalizedPhone = typeof phone_number === 'string' ? phone_number.trim() : '';
            if (normalizedPhone.length > 30) {
                return res.status(400).json({ error: 'Phone number is too long' });
            }
            updates.push('phone_number = ?');
            params.push(normalizedPhone.length > 0 ? normalizedPhone : null);
        }
        if (hasNicknameUpdate) {
            const normalizedNickname = typeof nickname === 'string' ? nickname.trim() : '';
            if (normalizedNickname.length > 40) {
                return res.status(400).json({ error: 'Nickname is too long' });
            }
            updates.push('nickname = ?');
            params.push(normalizedNickname.length > 0 ? normalizedNickname : null);
        }
        const parseIntOrNull = (value) => {
            if (value === null || value === undefined || String(value).trim() === '') {
                return null;
            }
            const parsed = parseInt(String(value), 10);
            return Number.isFinite(parsed) ? parsed : null;
        };
        if (hasHeightUpdate) {
            const parsedHeight = parseIntOrNull(height_cm);
            if (parsedHeight !== null && (parsedHeight < 100 || parsedHeight > 250)) {
                return res.status(400).json({ error: 'Größe muss zwischen 100 und 250 cm liegen' });
            }
            updates.push('height_cm = ?');
            params.push(parsedHeight);
        }
        if (hasWeightUpdate) {
            const parsedWeight = parseIntOrNull(weight_kg);
            if (parsedWeight !== null && (parsedWeight < 30 || parsedWeight > 250)) {
                return res.status(400).json({ error: 'Gewicht muss zwischen 30 und 250 kg liegen' });
            }
            updates.push('weight_kg = ?');
            params.push(parsedWeight);
        }
        if (hasClothingSizeUpdate) {
            const normalizedClothingSize = typeof clothing_size === 'string' ? clothing_size.trim() : '';
            if (normalizedClothingSize.length > 20) {
                return res.status(400).json({ error: 'Kleidergröße ist zu lang' });
            }
            updates.push('clothing_size = ?');
            params.push(normalizedClothingSize.length > 0 ? normalizedClothingSize : null);
        }
        if (hasShoeSizeUpdate) {
            const normalizedShoeSize = typeof shoe_size === 'string' ? shoe_size.trim() : '';
            if (normalizedShoeSize.length > 20) {
                return res.status(400).json({ error: 'Schuhgröße ist zu lang' });
            }
            updates.push('shoe_size = ?');
            params.push(normalizedShoeSize.length > 0 ? normalizedShoeSize : null);
        }
        if (hasJerseyNumberUpdate) {
            const parsedJerseyNumber = parseIntOrNull(jersey_number);
            if (parsedJerseyNumber !== null && (parsedJerseyNumber < 0 || parsedJerseyNumber > 99)) {
                return res.status(400).json({ error: 'Trikotnummer muss zwischen 0 und 99 liegen' });
            }
            updates.push('jersey_number = ?');
            params.push(parsedJerseyNumber);
        }
        if (hasFootednessUpdate) {
            const normalizedFootedness = typeof footedness === 'string' ? footedness.trim().toLowerCase() : '';
            const allowedFootedness = new Set(['links', 'rechts', 'beidfüßig', 'beidfuessig']);
            if (normalizedFootedness && !allowedFootedness.has(normalizedFootedness)) {
                return res.status(400).json({ error: 'Füßigkeit ist ungültig' });
            }
            updates.push('footedness = ?');
            params.push(normalizedFootedness.length > 0 ? normalizedFootedness : null);
        }
        if (hasPositionUpdate) {
            const normalizedPosition = typeof position === 'string' ? position.trim() : '';
            if (normalizedPosition.length > 40) {
                return res.status(400).json({ error: 'Position ist zu lang' });
            }
            updates.push('position = ?');
            params.push(normalizedPosition.length > 0 ? normalizedPosition : null);
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No profile fields to update' });
        }
        params.push(req.user.id);
        init_1.default.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params);
        const hasPlayerMembership = init_1.default.prepare('SELECT 1 FROM team_members WHERE user_id = ? AND role = ? LIMIT 1').get(req.user.id, 'player');
        if (hasPlayerMembership && (hasJerseyNumberUpdate || hasPositionUpdate)) {
            const parsedJerseyNumber = hasJerseyNumberUpdate ? parseIntOrNull(jersey_number) : undefined;
            const normalizedPosition = hasPositionUpdate
                ? ((typeof position === 'string' ? position.trim() : '') || null)
                : undefined;
            if (hasJerseyNumberUpdate && hasPositionUpdate) {
                init_1.default.prepare('UPDATE team_members SET jersey_number = ?, position = ? WHERE user_id = ? AND role = ?')
                    .run(parsedJerseyNumber ?? null, normalizedPosition ?? null, req.user.id, 'player');
            }
            else if (hasJerseyNumberUpdate) {
                init_1.default.prepare('UPDATE team_members SET jersey_number = ? WHERE user_id = ? AND role = ?')
                    .run(parsedJerseyNumber ?? null, req.user.id, 'player');
            }
            else if (hasPositionUpdate) {
                init_1.default.prepare('UPDATE team_members SET position = ? WHERE user_id = ? AND role = ?')
                    .run(normalizedPosition ?? null, req.user.id, 'player');
            }
        }
        const updatedUser = init_1.default.prepare(`SELECT id, username, email, name, nickname, role, profile_picture, phone_number, created_at,
              height_cm, weight_kg, clothing_size, shoe_size, jersey_number, footedness, position
       FROM users WHERE id = ?`).get(req.user.id);
        res.json({ message: 'Profile updated successfully', user: updatedUser });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});
// Update password
router.put('/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        // Get current user with password
        const user = init_1.default.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Verify current password
        const isValidPassword = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        // Hash new password
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        // Update password
        init_1.default.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, req.user.id);
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});
// Upload profile picture
router.post('/picture', upload.single('picture'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Get old profile picture
        const dbUser = init_1.default.prepare('SELECT profile_picture FROM users WHERE id = ?').get(req.user.id);
        // Delete old profile picture if it exists
        if (dbUser?.profile_picture) {
            const oldPath = path_1.default.join(__dirname, '../..', dbUser.profile_picture);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        // Save new profile picture path
        const picturePath = '/uploads/' + req.file.filename;
        init_1.default.prepare('UPDATE users SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(picturePath, req.user.id);
        res.json({
            message: 'Profile picture uploaded successfully',
            profile_picture: picturePath
        });
    }
    catch (error) {
        console.error('Upload profile picture error:', error);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});
// Delete profile picture
router.delete('/picture', (req, res) => {
    try {
        const user = init_1.default.prepare('SELECT profile_picture FROM users WHERE id = ?').get(req.user.id);
        if (user?.profile_picture) {
            // Delete file
            const filePath = path_1.default.join(__dirname, '../..', user.profile_picture);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
            // Remove from database
            init_1.default.prepare('UPDATE users SET profile_picture = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.id);
            res.json({ message: 'Profile picture deleted successfully' });
        }
        else {
            res.status(404).json({ error: 'No profile picture to delete' });
        }
    }
    catch (error) {
        console.error('Delete profile picture error:', error);
        res.status(500).json({ error: 'Failed to delete profile picture' });
    }
});
exports.default = router;
//# sourceMappingURL=profile.js.map