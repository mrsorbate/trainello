"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoredSubscriptionsForUsers = void 0;
exports.sendPushToSubscriptions = sendPushToSubscriptions;
exports.sendPushToUsers = sendPushToUsers;
const web_push_1 = __importDefault(require("web-push"));
const init_1 = __importDefault(require("../database/init"));
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
const getStoredSubscriptionsForUsers = (userIds) => {
    const normalizedUserIds = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (normalizedUserIds.length === 0) {
        return [];
    }
    const placeholders = normalizedUserIds.map(() => '?').join(', ');
    return init_1.default.prepare(`SELECT id, user_id, endpoint, p256dh, auth, expiration_time
     FROM push_subscriptions
     WHERE user_id IN (${placeholders})`).all(...normalizedUserIds);
};
exports.getStoredSubscriptionsForUsers = getStoredSubscriptionsForUsers;
async function sendPushToSubscriptions(subscriptions, payload) {
    if (!isPushConfigured) {
        console.error('Push delivery skipped: VAPID keys are not configured on server.');
        return 0;
    }
    if (subscriptions.length === 0) {
        return 0;
    }
    const serializedPayload = JSON.stringify(payload);
    let sent = 0;
    for (const subscription of subscriptions) {
        try {
            await web_push_1.default.sendNotification(toWebPushSubscription(subscription), serializedPayload);
            sent += 1;
            console.log(`Push sent to ${subscription.endpoint.substring(0, 50)}...`);
        }
        catch (error) {
            const statusCode = Number(error?.statusCode || 0);
            const errorMessage = error?.message || String(error);
            if (statusCode === 404 || statusCode === 410) {
                // Subscription expired or invalid
                removeSubscriptionByEndpoint.run(subscription.endpoint);
                console.warn(`Push: subscription removed (${statusCode}) for endpoint ${subscription.endpoint.substring(0, 50)}...`);
            }
            else {
                console.error(`Push send error (status ${statusCode}): ${errorMessage}`, { endpoint: subscription.endpoint.substring(0, 50) });
            }
        }
    }
    return sent;
}
async function sendPushToUsers(userIds, payload) {
    const subscriptions = (0, exports.getStoredSubscriptionsForUsers)(userIds);
    return sendPushToSubscriptions(subscriptions, payload);
}
//# sourceMappingURL=pushNotifications.js.map