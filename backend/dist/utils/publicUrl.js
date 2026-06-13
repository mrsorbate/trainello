"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicFrontendBaseUrl = void 0;
const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');
const getPublicFrontendBaseUrl = (req) => {
    const envFrontendUrl = String(process.env.FRONTEND_URL || '').trim();
    if (envFrontendUrl) {
        return normalizeBaseUrl(envFrontendUrl);
    }
    const originHeader = String(req.headers.origin || '').trim();
    if (originHeader) {
        return normalizeBaseUrl(originHeader);
    }
    const refererHeader = String(req.headers.referer || '').trim();
    if (refererHeader) {
        try {
            const refererUrl = new URL(refererHeader);
            return normalizeBaseUrl(`${refererUrl.protocol}//${refererUrl.host}`);
        }
        catch (_error) {
            // Continue with proxy/request fallbacks.
        }
    }
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    if (forwardedProto && forwardedHost) {
        return normalizeBaseUrl(`${forwardedProto}://${forwardedHost}`);
    }
    return normalizeBaseUrl(`${req.protocol}://${req.get('host') || 'localhost:5174'}`);
};
exports.getPublicFrontendBaseUrl = getPublicFrontendBaseUrl;
//# sourceMappingURL=publicUrl.js.map