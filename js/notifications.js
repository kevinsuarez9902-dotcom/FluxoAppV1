// ═══════════════════════════════════════════════════════
// FLUXOAPP — Web Push / Notifications
// ═══════════════════════════════════════════════════════
// Public VAPID key. The private key stays only on the push server.
const FLUXO_VAPID_PUBLIC_KEY = 'BCXy_-xiXraTA5IAl-yEkmjFUeSdmHMODEjb4UB7ycBxrb6nqhJB9wi174LsXBcrv6hGN67gxiEUB53c80Hx5rw';
const FLUXO_PUSH_SUB_KEY = 'fluxo_push_subscription';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

async function isSubscribed() {
  try {
    const reg = await getRegistration();
    return !!(await reg?.pushManager?.getSubscription?.());
  } catch (_) { return false; }
}

async function subscribe() {
  const reg = await getRegistration();
  if (!reg || !('PushManager' in window)) return false;

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(FLUXO_VAPID_PUBLIC_KEY)
    });
  }

  localStorage.setItem(FLUXO_PUSH_SUB_KEY, JSON.stringify(subscription.toJSON()));
  return true;
}

async function unsubscribe() {
  try {
    const reg = await getRegistration();
    const subscription = await reg?.pushManager?.getSubscription?.();
    if (subscription) await subscription.unsubscribe();
  } catch (_) {}
  localStorage.removeItem(FLUXO_PUSH_SUB_KEY);
}

async function showTest() {
  const reg = await getRegistration();
  if (!reg) return false;
  await reg.showNotification('🔔 FluxoApp', {
    body: 'Las notificaciones están activadas. Te avisaremos sobre tus movimientos programados.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'fluxo-test-notification',
    data: { url: './' }
  });
  return true;
}

window.FluxoNotifications = { subscribe, unsubscribe, isSubscribed, showTest };
