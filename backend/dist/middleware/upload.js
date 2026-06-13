"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    },
});
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
exports.upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (ALLOWED_MIMES.has(file.mimetype) && ALLOWED_EXTS.has(ext)) {
            return cb(null, true);
        }
        cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    },
});
//# sourceMappingURL=upload.js.map