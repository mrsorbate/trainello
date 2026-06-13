"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web_push_1 = __importDefault(require("web-push"));
const init_1 = __importDefault(require("../database/init"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@teamvoteplus.app').trim();
const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (isPushConfigured) {
    web_push_1.default.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
const toWebPushSubscription = (entry) => ({
    endpoint: entry.endpoint,
    expirationTime: entry.expiration_time,
    keys: {
        p256dh: entry.p256dh,
        auth: entry.auth,
    },
});
const removeSubscriptionByEndpoint = init_1.default.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
async function sendPushToSubscriptions(subscriptions, payload) {
    if (!isPushConfigured || subscriptions.length === 0) {
        return 0;
    }
    const serializedPayload = JSON.stringify(payload);
    let sent = 0;
    for (const subscription of subscriptions) {
        try {
            await web_push_1.default.sendNotification(toWebPushSubscription(subscription), serializedPayload);
            sent += 1;
        }
        catch (error) {
            const statusCode = Number(error?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
                removeSubscriptionByEndpoint.run(subscription.endpoint);
            }
            else {
                console.error('Web push send error:', error);
            }
        }
    }
    return sent;
}
router.use(auth_1.authenticate);
router.get('/public-key', (_req, res) => {
    if (!isPushConfigured) {
        return res.status(503).json({ configured: false, error: 'Push is not configured on server' });
    }
    return res.json({ configured: true, publicKey: VAPID_PUBLIC_KEY });
});
router.get('/status', (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const row = init_1.default
        .prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?')
        .get(userId);
    const count = Number(row?.count || 0);
    return res.json({
        configured: isPushConfigured,
        subscribed: count > 0,
        subscriptionCount: count,
        vapidConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    });
});
router.post('/subscribe', (req, res) => {
    if (!isPushConfigured) {
        return res.status(503).json({ error: 'Push is not configured on server' });
    }
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const endpoint = String(req.body?.endpoint || '').trim();
    const p256dh = String(req.body?.keys?.p256dh || '').trim();
    const auth = String(req.body?.keys?.auth || '').trim();
    const expirationTimeRaw = req.body?.expirationTime;
    const expirationTime = Number.isFinite(Number(expirationTimeRaw)) ? Number(expirationTimeRaw) : null;
    if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: 'Invalid push subscription payload' });
    }
    init_1.default.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, expiration_time, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, endpoint, p256dh, auth, expirationTime);
    return res.json({ success: true });
});
router.post('/unsubscribe', (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const endpoint = String(req.body?.endpoint || '').trim();
    // Fallback cleanup: if no endpoint is provided, remove all subscriptions for this user.
    if (!endpoint) {
        init_1.default.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
        return res.json({ success: true, removedAll: true });
    }
    init_1.default.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
    return res.json({ success: true, removedAll: false });
});
router.post('/test', async (req, res) => {
    if (!isPushConfigured) {
        console.error('Push test failed: VAPID not configured');
        return res.status(503).json({ error: 'Push is not configured on server', vapidConfigured: false });
    }
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const title = String(req.body?.title || 'teamvote+').trim();
    const body = String(req.body?.body || 'Dies ist eine Test-Benachrichtigung.').trim();
    const url = String(req.body?.url || '/').trim();
    const subscriptions = init_1.default
        .prepare('SELECT id, user_id, endpoint, p256dh, auth, expiration_time FROM push_subscriptions WHERE user_id = ?')
        .all(userId);
    if (subscriptions.length === 0) {
        console.warn(`Push test: no subscriptions found for user ${userId}`);
        return res.json({ success: false, sent: 0, subscriptions: 0, error: 'No push subscriptions found' });
    }
    console.log(`Push test: sending to ${subscriptions.length} subscriptions for user ${userId}`);
    const sent = await sendPushToSubscriptions(subscriptions, {
        title: title || 'teamvote+',
        body: body || 'Dies ist eine Test-Benachrichtigung.',
        url: url || '/',
    });
    console.log(`Push test: ${sent}/${subscriptions.length} notifications sent`);
    return res.json({ success: sent > 0, sent, subscriptions: subscriptions.length, vapidConfigured: isPushConfigured });
});
exports.default = router;
//# sourceMappingURL=notifications.js.map