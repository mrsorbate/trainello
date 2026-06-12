import webpush from 'web-push';
import db from '../database/init';

type StoredPushSubscription = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@teamvoteplus.app').trim();
const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isPushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const toWebPushSubscription = (entry: StoredPushSubscription): webpush.PushSubscription => ({
  endpoint: entry.endpoint,
  expirationTime: entry.expiration_time,
  keys: {
    p256dh: entry.p256dh,
    auth: entry.auth,
  },
});

const removeSubscriptionByEndpoint = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

export const getStoredSubscriptionsForUsers = (userIds: number[]): StoredPushSubscription[] => {
  const normalizedUserIds = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (normalizedUserIds.length === 0) {
    return [];
  }

  const placeholders = normalizedUserIds.map(() => '?').join(', ');
  return db.prepare(
    `SELECT id, user_id, endpoint, p256dh, auth, expiration_time
     FROM push_subscriptions
     WHERE user_id IN (${placeholders})`
  ).all(...normalizedUserIds) as StoredPushSubscription[];
};

export async function sendPushToSubscriptions(subscriptions: StoredPushSubscription[], payload: PushPayload): Promise<number> {
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
      await webpush.sendNotification(toWebPushSubscription(subscription), serializedPayload);
      sent += 1;
      console.log(`Push sent to ${subscription.endpoint.substring(0, 50)}...`);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      const errorMessage = error?.message || String(error);
      
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired or invalid
        removeSubscriptionByEndpoint.run(subscription.endpoint);
        console.warn(`Push: subscription removed (${statusCode}) for endpoint ${subscription.endpoint.substring(0, 50)}...`);
      } else {
        console.error(`Push send error (status ${statusCode}): ${errorMessage}`, { endpoint: subscription.endpoint.substring(0, 50) });
      }
    }
  }

  return sent;
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<number> {
  const subscriptions = getStoredSubscriptionsForUsers(userIds);
  return sendPushToSubscriptions(subscriptions, payload);
}
