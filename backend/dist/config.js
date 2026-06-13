"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_EXPIRES_IN = exports.JWT_SECRET = void 0;
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
}
exports.JWT_SECRET = process.env.JWT_SECRET;
exports.JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '30d').trim() || '30d';
//# sourceMappingURL=config.js.map