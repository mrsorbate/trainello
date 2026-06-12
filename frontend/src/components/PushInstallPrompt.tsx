import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { notificationsAPI } from '../lib/api';
import { getBrowserPushSubscription, getNotificationPermission, isPushSupported, subscribeBrowserPush } from '../lib/pushNotifications';
import { useToast } from '../lib/useToast';

type PushInstallPromptProps = {
  userId?: number;
};

const PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const isStandalonePwa = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const displayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayStandalone;
};

export default function PushInstallPrompt({ userId }: PushInstallPromptProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [dismissed, setDismissed] = useState(false);
  const [hasTriedAutoSync, setHasTriedAutoSync] = useState(false);

  const dismissKey = useMemo(() => {
    if (!userId) {
      return null;
    }
    return `push-install-prompt-dismissed-v1-${userId}`;
  }, [userId]);

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false);
      return;
    }

    const dismissedAtRaw = Number(localStorage.getItem(dismissKey) || '0');
    const isStillDismissed = Number.isFinite(dismissedAtRaw)
      && dismissedAtRaw > 0
      && (Date.now() - dismissedAtRaw) < PUSH_PROMPT_SNOOZE_MS;

    setDismissed(isStillDismissed);

    if (!isStillDismissed && dismissedAtRaw > 0) {
      localStorage.removeItem(dismissKey);
    }
  }, [dismissKey]);

  useEffect(() => {
    setHasTriedAutoSync(false);
  }, [userId]);

  useEffect(() => {
    const refreshInstallState = () => {
      setIsStandalone(isStandalonePwa());
      setPermission(getNotificationPermission());
    };

    refreshInstallState();
    window.addEventListener('visibilitychange', refreshInstallState);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const mediaListener = () => refreshInstallState();
    mediaQuery.addEventListener('change', mediaListener);

    return () => {
      window.removeEventListener('visibilitychange', refreshInstallState);
      mediaQuery.removeEventListener('change', mediaListener);
    };
  }, []);

  const { data: pushStatus } = useQuery({
    queryKey: ['push-status'],
    queryFn: async () => {
      const response = await notificationsAPI.getStatus();
      return response.data as { configured: boolean; subscribed: boolean };
    },
    enabled: Boolean(userId && isPushSupported()),
    refetchOnWindowFocus: true,
  });

  const enablePushMutation = useMutation({
    mutationFn: async () => {
      const keyResponse = await notificationsAPI.getPublicKey();
      const publicKey = String(keyResponse?.data?.publicKey || '').trim();
      if (!publicKey) {
        throw new Error('VAPID Public Key fehlt auf dem Server.');
      }

      const subscription = await subscribeBrowserPush(publicKey);
      const subscriptionJson = subscription.toJSON();
      const endpoint = String(subscriptionJson.endpoint || '').trim();
      const p256dh = String(subscriptionJson.keys?.p256dh || '').trim();
      const auth = String(subscriptionJson.keys?.auth || '').trim();

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Ungültige Push-Subscription vom Browser.');
      }

      await notificationsAPI.subscribe({
        endpoint,
        expirationTime: subscription.expirationTime,
        keys: { p256dh, auth },
      });
    },
    onSuccess: () => {
      setPermission(getNotificationPermission());
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
      showToast('Benachrichtigungen aktiviert', 'success');
    },
    onError: (error: any) => {
      setPermission(getNotificationPermission());
      const message = error?.response?.data?.error || error?.message || 'Push konnte nicht aktiviert werden';
      showToast(message, 'error');
    },
  });

  const autoSyncPushMutation = useMutation({
    mutationFn: async () => {
      const existingSubscription = await getBrowserPushSubscription();
      if (!existingSubscription) {
        return false;
      }

      const subscriptionJson = existingSubscription.toJSON();
      const endpoint = String(subscriptionJson.endpoint || '').trim();
      const p256dh = String(subscriptionJson.keys?.p256dh || '').trim();
      const auth = String(subscriptionJson.keys?.auth || '').trim();

      if (!endpoint || !p256dh || !auth) {
        return false;
      }

      await notificationsAPI.subscribe({
        endpoint,
        expirationTime: existingSubscription.expirationTime,
        keys: { p256dh, auth },
      });

      return true;
    },
    onSuccess: (synced) => {
      if (synced) {
        queryClient.invalidateQueries({ queryKey: ['push-status'] });
      }
    },
  });

  useEffect(() => {
    if (!userId || !isPushSupported()) {
      return;
    }

    if (!pushStatus?.configured || pushStatus?.subscribed) {
      return;
    }

    if (permission !== 'granted' || hasTriedAutoSync || autoSyncPushMutation.isPending) {
      return;
    }

    setHasTriedAutoSync(true);
    autoSyncPushMutation.mutate();
  }, [
    userId,
    permission,
    pushStatus?.configured,
    pushStatus?.subscribed,
    hasTriedAutoSync,
    autoSyncPushMutation,
  ]);

  const handleDismiss = () => {
    if (dismissKey) {
      localStorage.setItem(dismissKey, String(Date.now()));
    }
    setDismissed(true);
  };

  if (!userId || !isStandalone || !isPushSupported()) {
    return null;
  }

  if (!pushStatus?.configured || pushStatus?.subscribed || permission === 'denied' || dismissed || autoSyncPushMutation.isPending) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 sm:left-auto sm:right-6 sm:w-[30rem]">
      <div className="rounded-xl border border-primary-200 dark:border-primary-700 bg-white dark:bg-gray-800 shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary-100 dark:bg-primary-900/40 p-2">
            <Bell className="w-5 h-5 text-primary-700 dark:text-primary-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Push-Benachrichtigungen aktivieren</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Erhalte sofort eine Benachrichtigung bei neuen oder geänderten Terminen.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => enablePushMutation.mutate()}
                disabled={enablePushMutation.isPending}
                className="btn btn-primary text-sm"
              >
                {enablePushMutation.isPending ? 'Aktiviert...' : 'Jetzt aktivieren'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="btn btn-secondary text-sm"
              >
                Später
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Hinweis schließen"
            title="Hinweis schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}