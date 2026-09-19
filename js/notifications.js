// ═══════════════════════════════════════════════════════
// FLUXOAPP — Web Push / Notifications
// ═══════════════════════════════════════════════════════
// Public VAPID key. The private key stays only on the push server.
const FLUXO_VAPID_PUBLIC_KEY = 'BMLKAqidtrYGM24go6Ekp9tK44dwhdNQhxvQyhbb-msZiOSlT9eBhyhk_n9zzVghy1U7wh0MltDMTIfHeiSAPuc';

// After deploying the Cloudflare Worker, put its public API URL here.
// Example: https://fluxoapp-push.your-subdomain.workers.dev/api
const FLUXO_PUSH_API_URL = '';
const FLUXO_PUSH_SUB_KEY = 'fluxo_push_subscription';
const FLUXO_PUSH_DEVICE_ID_KEY = 'fluxo_push_device_id';
const FLUXO_PUSH_DEVICE_SECRET_KEY = 'fluxo_push_device_secret';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function getDeviceId() {
  let id = localStorage.getItem(FLUXO_PUSH_DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(FLUXO_PUSH_DEVICE_ID_KEY, id);
  }
  return id;
}

function getDeviceSecret() {
  let secret = localStorage.getItem(FLUXO_PUSH_DEVICE_SECRET_KEY);
  if (!secret) {
    secret = randomSecret();
    localStorage.setItem(FLUXO_PUSH_DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

async function getSubscription() {
  try {
    const reg = await getRegistration();
    return await reg?.pushManager?.getSubscription?.();
  } catch (_) { return null; }
}

async function isSubscribed() { return !!(await getSubscription()); }

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
  const endpoint = (await getSubscription())?.endpoint || null;
  try {
    const reg = await getRegistration();
    const subscription = await reg?.pushManager?.getSubscription?.();
    if (subscription) await subscription.unsubscribe();
  } catch (_) {}
  localStorage.removeItem(FLUXO_PUSH_SUB_KEY);

  if (FLUXO_PUSH_API_URL && endpoint) {
    try {
      await fetch(`${FLUXO_PUSH_API_URL}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), deviceSecret: getDeviceSecret(), endpoint })
      });
    } catch (_) {}
  }
}

async function showTest() {
  const reg = await getRegistration();
  if (!reg) return false;
  await reg.showNotification('🔔 FluxoApp', {
    body: 'Las notificaciones están activadas. Te avisaremos sobre tus turnos y movimientos programados.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'fluxo-test-notification',
    data: { url: './' }
  });
  return true;
}

function localDateTimeISO(date) {
  const pad = n => String(n).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${oh}:${om}`;
}

function dateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function notificationDate(y,m,d,h,min=0) {
  return new Date(y,m,d,h,min,0,0);
}

function pushEvent(events, id, at, title, body, tag, data={}) {
  if (!at || Number.isNaN(at.getTime())) return;
  events.push({ id, sendAt: localDateTimeISO(at), title, body, tag, data });
}

function movementDue(record, y, m, day, slot) {
  if (!record || record.scheduleVersion !== 1) return false;
  if (typeof isScheduledRecordActive === 'function' && !isScheduledRecordActive(record,y,m,day)) return false;
  if (typeof getScheduledOccurrence === 'function' && getScheduledOccurrence(record,y,m,slot)) return false;
  return true;
}

function addScheduledMovementEvents(events, record, source, kind, icon, sign, y, m, day, slot, amount) {
  if (!movementDue(record,y,m,day,slot)) return;
  const due = notificationDate(y,m,day,8,0);
  const prev = new Date(due); prev.setDate(prev.getDate()-1); prev.setHours(20,0,0,0);
  const same = new Date(due); same.setHours(20,0,0,0);
  const name = record.name || kind;
  const amt = Math.round(Number(amount)||0).toLocaleString('es-CO');
  const signText = sign === '+' ? 'Ingreso' : 'Pago';
  const base = { source, recordId: record.id, slot, scheduledDate: dateOnly(due) };
  pushEvent(events, `movement-before:${source}:${record.id}:${slot}:${dateOnly(due)}`, prev, `🔔 ${name}`, `Mañana tienes programado ${signText.toLowerCase()} por $${amt}.`, `movement-before:${source}:${record.id}:${slot}:${dateOnly(due)}`, base);
  pushEvent(events, `movement-day:${source}:${record.id}:${slot}:${dateOnly(due)}`, due, `🔔 ${name}`, `Hoy tienes programado ${signText.toLowerCase()} por $${amt}.`, `movement-day:${source}:${record.id}:${slot}:${dateOnly(due)}`, base);
  pushEvent(events, `movement-pending:${source}:${record.id}:${slot}:${dateOnly(due)}`, same, `⚠️ ${name}`, `El movimiento de $${amt} sigue pendiente.`, `movement-pending:${source}:${record.id}:${slot}:${dateOnly(due)}`, { ...base, pending: true });
}

function buildNotificationEvents(horizonDays=90) {
  const events = [];
  const start = new Date(); start.setHours(0,0,0,0);
  for (let i=0; i<horizonDays; i++) {
    const dt = new Date(start); dt.setDate(start.getDate()+i);
    const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate(), mk = `${y}-${String(m+1).padStart(2,'0')}`;

    // TURNOS — conserva la lógica anterior: todos los días a las 20:00 se avisa el turno de mañana.
    const tomorrow = new Date(dt); tomorrow.setDate(dt.getDate()+1);
    const ty=tomorrow.getFullYear(), tm=tomorrow.getMonth(), td=tomorrow.getDate();
    const eff = typeof effShift === 'function' ? effShift(ty,tm,td) : 'DESCANSO';
    const st = typeof getShiftStyle === 'function' ? getShiftStyle(eff) : {icon:'😴',label:'Descanso'};
    const shiftAt = new Date(dt); shiftAt.setHours(20,0,0,0);
    pushEvent(events, `shift:${dateOnly(tomorrow)}`, shiftAt, '📅 Mis Turnos — Mañana', eff !== 'DESCANSO' ? `Tu turno de mañana es ${st.icon} ${st.label}` : '😴 Mañana es día de descanso', `shift:${dateOnly(tomorrow)}`, { type:'shift', date:dateOnly(tomorrow) });

    (incomes || []).forEach(r => {
      if (r.type === 'quincenal') { addScheduledMovementEvents(events,r,'global','Ingreso programado','💰','+',y,m,Number(r.day),'q1',r.amount); addScheduledMovementEvents(events,r,'global','Ingreso programado','💰','+',y,m,Number(r.day2),'q2',r.amount); }
      else addScheduledMovementEvents(events,r,'global','Ingreso programado','💰','+',y,m,Number(r.day),r.type==='daily'?`d${Number(r.day)}`:'monthly',r.amount);
    });
    (monthIncomes?.[mk] || []).forEach(r => {
      if (r.type === 'quincenal') { addScheduledMovementEvents(events,r,'month','Ingreso programado','💰','+',y,m,Number(r.day),'q1',r.amount); addScheduledMovementEvents(events,r,'month','Ingreso programado','💰','+',y,m,Number(r.day2),'q2',r.amount); }
      else addScheduledMovementEvents(events,r,'month','Ingreso programado','💰','+',y,m,Number(r.day),r.type==='daily'?`d${Number(r.day)}`:'monthly',r.amount);
    });
    (expenses || []).forEach(r => {
      if (r.type === 'quincenal') { addScheduledMovementEvents(events,r,'global','Gasto programado','💸','-',y,m,Number(r.day),'q1',r.amount); addScheduledMovementEvents(events,r,'global','Gasto programado','💸','-',y,m,Number(r.day2),'q2',r.amount); }
      else addScheduledMovementEvents(events,r,'global','Gasto programado','💸','-',y,m,Number(r.day),r.type==='daily'?`d${Number(r.day)}`:'monthly',r.amount);
    });
    (monthExpenses?.[mk] || []).forEach(r => {
      if (r.type === 'quincenal') { addScheduledMovementEvents(events,r,'month','Gasto programado','💸','-',y,m,Number(r.day),'q1',r.amount); addScheduledMovementEvents(events,r,'month','Gasto programado','💸','-',y,m,Number(r.day2),'q2',r.amount); }
      else addScheduledMovementEvents(events,r,'month','Gasto programado','💸','-',y,m,Number(r.day),r.type==='daily'?`d${Number(r.day)}`:'monthly',r.amount);
    });

    (debts || []).filter(r => (Number(r.total)||0)-(Number(r.paid)||0)>0).forEach(r => {
      const startDate = r.registeredDate || r.startDate || null;
      const days = r.freq === 'quincenal' ? [r.day,r.day2] : [r.day];
      days.forEach((day,idx)=>{
        const scheduledDate = typeof fluxoMovementDate==='function' ? fluxoMovementDate(y,m,Number(day)) : null;
        if (startDate && scheduledDate && scheduledDate < String(startDate).slice(0,10)) return;
        const slot = r.freq==='quincenal' ? (idx===0?'q1':'q2') : 'monthly';
        const paid = (r.payments||[]).some(p => p.mk===mk && (r.freq==='quincenal' ? p.quincena===(idx===0?'Q1':'Q2') : true));
        if (!paid) addScheduledMovementEvents(events,r,'debt','Cuota de deuda','💳','-',y,m,Number(day),slot,r.cuota);
      });
    });
    (savings || []).filter(r => !r.completed).forEach(r => {
      const startDate = r.registeredDate || r.startDate || null;
      const days = r.freq==='quincenal' ? [r.day,r.day2] : [r.day];
      days.forEach((day,idx)=>{
        const scheduledDate = typeof fluxoMovementDate==='function' ? fluxoMovementDate(y,m,Number(day)) : null;
        if (startDate && scheduledDate && scheduledDate < String(startDate).slice(0,10)) return;
        const slot = r.freq==='quincenal' ? (idx===0?'q1':'q2') : 'monthly';
        const paid = (r.payments||[]).some(p => p.mk===mk && !p.initial && p.kind!=='withdrawal' && p.type!=='withdrawal' && (r.freq==='quincenal' ? p.label===(idx===0?'Q1':'Q2') : true));
        if (!paid) addScheduledMovementEvents(events,r,'saving','Aporte a ahorro','🏦','-',y,m,Number(day),slot,r.monthly);
      });
    });
  }
  return events;
}

let syncTimer = null;
async function syncSchedule() {
  if (!FLUXO_PUSH_API_URL || Notification.permission !== 'granted') return false;
  const subscription = await getSubscription();
  if (!subscription) return false;
  try {
    const events = buildNotificationEvents(90);
    const response = await fetch(`${FLUXO_PUSH_API_URL}/sync`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ deviceId:getDeviceId(), deviceSecret:getDeviceSecret(), subscription: subscription.toJSON(), events })
    });
    return response.ok;
  } catch (err) {
    console.warn('FluxoApp push sync:', err);
    return false;
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncSchedule(), 900);
}

window.FluxoNotifications = { subscribe, unsubscribe, isSubscribed, showTest, syncSchedule, scheduleSync, buildNotificationEvents };
