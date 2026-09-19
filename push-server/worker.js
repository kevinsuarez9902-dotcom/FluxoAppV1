import { sendPushNotification, WebPushError } from '@mmmike/web-push/send';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

function json(data, status=200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json', ...cors } }); }
function nowIso() { return new Date().toISOString(); }
function safeEndpoint(sub) {
  try { const u = new URL(sub?.endpoint || ''); return u.protocol === 'https:' ? u.toString() : null; } catch (_) { return null; }
}

async function sync(req, env) {
  const body = await req.json();
  const { deviceId, deviceSecret, subscription, events } = body || {};
  const endpoint = safeEndpoint(subscription);
  if (!deviceId || !deviceSecret || !endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth || !Array.isArray(events)) return json({ok:false,error:'Datos de suscripción incompletos'},400);
  const existing = await env.DB.prepare('SELECT device_secret FROM devices WHERE device_id = ?').bind(String(deviceId)).first();
  if (existing && existing.device_secret !== String(deviceSecret)) return json({ok:false,error:'Dispositivo no autorizado'},403);
  // Cap the schedule payload to keep the DB small and predictable.
  const cleanEvents = events.filter(e => e && e.id && e.sendAt && e.title && e.body).slice(0, 500);
  await env.DB.prepare(`INSERT INTO devices(device_id,device_secret,endpoint,subscription_json,events_json,updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET device_secret=excluded.device_secret, endpoint=excluded.endpoint, subscription_json=excluded.subscription_json, events_json=excluded.events_json, updated_at=excluded.updated_at`)
    .bind(String(deviceId),String(deviceSecret),endpoint,JSON.stringify(subscription),JSON.stringify(cleanEvents),nowIso()).run();
  return json({ok:true,events:cleanEvents.length});
}

async function unsubscribe(req, env) {
  const body = await req.json();
  const { deviceId, deviceSecret, endpoint } = body || {};
  if (!deviceId || !deviceSecret) return json({ok:false},400);
  const row = await env.DB.prepare('SELECT device_secret FROM devices WHERE device_id=?').bind(String(deviceId)).first();
  if (!row || row.device_secret !== String(deviceSecret)) return json({ok:false},403);
  await env.DB.prepare('DELETE FROM devices WHERE device_id=?').bind(String(deviceId)).run();
  return json({ok:true});
}

async function sendDue(env) {
  const now = Date.now();
  const rows = await env.DB.prepare('SELECT device_id,subscription_json,events_json FROM devices').all();
  let delivered=0, removed=0;
  for (const row of rows.results || []) {
    let sub, events;
    try { sub=JSON.parse(row.subscription_json); events=JSON.parse(row.events_json); } catch (_) { continue; }
    const due = events.filter(e => { const t=Date.parse(e.sendAt); return Number.isFinite(t) && t <= now + 60_000 && t >= now - 6*60*60*1000; });
    const future = events.filter(e => { const t=Date.parse(e.sendAt); return Number.isFinite(t) && t > now - 60*60*1000; });
    if (!due.length) {
      if (future.length !== events.length) await env.DB.prepare('UPDATE devices SET events_json=?, updated_at=? WHERE device_id=?').bind(JSON.stringify(future),nowIso(),row.device_id).run();
      continue;
    }
    const remaining = events.filter(e => !due.some(d => d.id === e.id));
    let gone=false;
    for (const e of due.slice(0,8)) {
      try {
        const ok = await sendPushNotification(sub,{title:e.title,body:e.body,url:e.data?.url || './',tag:e.tag || e.id,data:e.data || {}},{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},{ttl:86400,urgency:'normal'});
        if (ok) delivered++; else gone=true;
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode===404 || err.statusCode===410)) gone=true;
        else console.error('push send failed', row.device_id, err?.statusCode || err);
      }
    }
    if (gone) { await env.DB.prepare('DELETE FROM devices WHERE device_id=?').bind(row.device_id).run(); removed++; }
    else { await env.DB.prepare('UPDATE devices SET events_json=?, updated_at=? WHERE device_id=?').bind(JSON.stringify(remaining),nowIso(),row.device_id).run(); }
  }
  return {delivered,removed};
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null,{headers:cors});
    const url = new URL(req.url);
    if (url.pathname === '/api/health' && req.method === 'GET') return json({ok:true,service:'fluxoapp-push'});
    if (url.pathname === '/api/sync' && req.method === 'POST') return sync(req,env);
    if (url.pathname === '/api/unsubscribe' && req.method === 'POST') return unsubscribe(req,env);
    return json({ok:false,error:'Not found'},404);
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(sendDue(env)); }
};
