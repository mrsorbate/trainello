const PUSH_SW_URL = '/push-sw.js';
const PUSH_SW_SCOPE = '/';

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const uint8ArrayToArrayBuffer = (value: Uint8Array): ArrayBuffer => {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
};

export const isPushSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

export const getNotificationPermission = (): NotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
};

export const registerPushServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
  if (!isPushSupported()) {
    throw new Error('Push wird von diesem Browser nicht unterstützt.');
  }

  const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE });
  await navigator.serviceWorker.ready;
  return registration;
};

export const subscribeBrowserPush = async (publicKey: string): Promise<PushSubscription> => {
  const registration = await registerPushServiceWorker();

  let permission = getNotificationPermission();
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    return existingSubscription;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: uint8ArrayToArrayBuffer(urlBase64ToUint8Array(publicKey)),
  });
};

export const getBrowserPushSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null;
  const registration = await registerPushServiceWorker();
  return registration.pushManager.getSubscription();
};

export const unsubscribeBrowserPush = async (): Promise<string | null> => {
  const subscription = await getBrowserPushSubscription();
  if (!subscription) return null;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
};
