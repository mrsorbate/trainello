import { Router } from 'express';
import webpush from 'web-push';
import db from '../database/init';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@teamvoteplus.app').trim();
const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isPushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

type StoredPushSubscription = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
};

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

const toWebPushSubscription = (entry: StoredPushSubscription): webpush.PushSubscription => ({
  endpoint: entry.endpoint,
  expirationTime: entry.expiration_time,
  keys: {
    p256dh: entry.p256dh,
    auth: entry.auth,
  },
});

const removeSubscriptionByEndpoint = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

async function sendPushToSubscriptions(subscriptions: StoredPushSubscription[], payload: PushPayload): Promise<void> {
  if (!isPushConfigured || subscriptions.length === 0) {
    return;
  }

  const serializedPayload = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(toWebPushSubscription(subscription), serializedPayload);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        removeSubscriptionByEndpoint.run(subscription.endpoint);
      } else {
        console.error('Web push send error:', error);
      }
    }
  }
}

router.use(authenticate);

router.get('/public-key', (_req, res) => {
  if (!isPushConfigured) {
    return res.status(503).json({ configured: false, error: 'Push is not configured on server' });
  }

  return res.json({ configured: true, publicKey: VAPID_PUBLIC_KEY });
});

router.get('/status', (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const row = db
    .prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?')
    .get(userId) as { count?: number };

  return res.json({
    configured: isPushConfigured,
    subscribed: Number(row?.count || 0) > 0,
  });
});

router.post('/subscribe', (req: AuthRequest, res) => {
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

  db.prepare(`
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

router.post('/unsubscribe', (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const endpoint = String(req.body?.endpoint || '').trim();
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);

  return res.json({ success: true });
});

router.post('/test', async (req: AuthRequest, res) => {
  if (!isPushConfigured) {
    return res.status(503).json({ error: 'Push is not configured on server' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const title = String(req.body?.title || 'teamvote+').trim();
  const body = String(req.body?.body || 'Dies ist eine Test-Benachrichtigung.').trim();
  const url = String(req.body?.url || '/').trim();

  const subscriptions = db
    .prepare('SELECT id, user_id, endpoint, p256dh, auth, expiration_time FROM push_subscriptions WHERE user_id = ?')
    .all(userId) as StoredPushSubscription[];

  await sendPushToSubscriptions(subscriptions, {
    title: title || 'teamvote+',
    body: body || 'Dies ist eine Test-Benachrichtigung.',
    url: url || '/',
  });

  return res.json({ success: true, sent: subscriptions.length });
});

export default router;
