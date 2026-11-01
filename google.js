// Conexión con Google: inicio de sesión, Drive (datos y fotos) y Calendar (avisos).
import { CONFIG } from './config.js';
import {
  S, meta, merge, newerThan, refreshAuto, commit, saveMeta, putSettings,
  desiredAlerts, alive, uid,
} from './store.js';
import { photoGet, photoSet } from './db.js';

const D = 'https://www.googleapis.com/drive/v3';
const DU = 'https://www.googleapis.com/upload/drive/v3';
const C = 'https://www.googleapis.com/calendar/v3';
const STATE_FILE = 'inventario.json';

export const configured = () => !/PEGA_AQUI/.test(CONFIG.GOOGLE_CLIENT_ID);

// ── Inicio de sesión (por redirección: funciona en apps instaladas) ──
export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

export function login({ silent = false } = {}) {
  const state = uid();
  localStorage.setItem('oauth_state', state);
  const p = new URLSearchParams({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: CONFIG.SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  if (silent) p.set('prompt', 'none');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}

// Lee el resultado al volver de Google. Devuelve null si no venimos de allí.
export function handleRedirect() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const h = new URLSearchParams(hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (h.get('state') !== localStorage.getItem('oauth_state')) return { error: 'state' };
  localStorage.removeItem('oauth_state');
  if (h.get('error')) return { error: h.get('error') };
  const tok = { t: h.get('access_token'), exp: Date.now() + ((+h.get('expires_in') || 3600) - 60) * 1000 };
  localStorage.setItem('gtoken', JSON.stringify(tok));
  localStorage.setItem('ever_connected', '1');
  return { ok: true };
}

export function token() {
  try {
    const t = JSON.parse(localStorage.getItem('gtoken'));
    if (t && t.exp > Date.now()) return t.t;
  } catch {}
  return null;
}
export const everConnected = () => localStorage.getItem('ever_connected') === '1';

export function logout() {
  const t = token();
  localStorage.removeItem('gtoken');
  localStorage.removeItem('ever_connected');
  if (t) {
    fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {});
  }
  setStatus('auth');
}

export class AuthError extends Error {}

async function api(url, opts = {}, { raw = false } = {}) {
  const t = token();
  if (!t) throw new AuthError('sin sesión');
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  if (r.status === 401) {
    localStorage.removeItem('gtoken');
    throw new AuthError('sesión caducada');
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    let msg = txt;
    try { msg = JSON.parse(txt).error.message; } catch {}
    const e = new Error(`Google ${r.status}: ${String(msg).slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  if (raw) return r;
  if (r.status === 204) return null;
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const jsonPost = (url, body, method = 'POST') =>
  api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ── Estado de sincronización (lo muestra la cabecera) ──
export const sync = { status: 'idle', error: null };
const statusListeners = new Set();
export const onStatus = (fn) => statusListeners.add(fn);
function setStatus(s, error = null) {
  sync.status = s;
  sync.error = error;
  statusListeners.forEach((f) => f(sync));
}

// ── Drive ──
async function findOne(q) {
  const r = await api(`${D}/files?` + new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive', pageSize: '10' }));
  return r.files?.[0]?.id || null;
}

async function ensureFolder() {
  if (meta.folderId) {
    try {
      const f = await api(`${D}/files/${meta.folderId}?fields=id,trashed`);
      if (!f.trashed) return meta.folderId;
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }
  const name = CONFIG.DRIVE_FOLDER_NAME.replace(/'/g, "\\'");
  let id = await findOne(`mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`);
  if (!id) id = (await jsonPost(`${D}/files?fields=id`, { name: CONFIG.DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })).id;
  if (meta.folderId !== id) meta.fileId = null;
  meta.folderId = id;
  return id;
}

function multipartCreate(metadata, blob) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  fd.append('file', blob);
  return api(`${DU}/files?uploadType=multipart&fields=id`, { method: 'POST', body: fd });
}

async function uploadPhotos(folder) {
  for (const p of alive(S.products)) {
    if (!p.photo || p.photo.driveId) continue;
    const blob = await photoGet(p.photo.id);
    if (!blob) continue;
    const f = await multipartCreate({ name: `foto-${p.photo.id}.jpg`, parents: [folder] }, blob);
    p.photo.driveId = f.id;
    p.u = Date.now();
  }
}

// Foto local o, si falta, descargada de Drive.
const urlCache = new Map();
export async function photoURL(photo) {
  if (!photo) return null;
  if (urlCache.has(photo.id)) return urlCache.get(photo.id);
  let blob = await photoGet(photo.id);
  if (!blob && photo.driveId && token() && navigator.onLine) {
    try {
      const r = await api(`${D}/files/${photo.driveId}?alt=media`, {}, { raw: true });
      blob = await r.blob();
      await photoSet(photo.id, blob);
    } catch (e) { console.warn('foto', e); }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(photo.id, url);
  return url;
}

export async function deleteDrivePhoto(photo) {
  if (!photo?.driveId || !token()) return;
  try { await api(`${D}/files/${photo.driveId}`, { method: 'DELETE' }); } catch {}
}

// ── Sincronización completa ──
let running = null;
let again = false;
export function syncNow() {
  if (running) { again = true; return running; }
  running = doSync().finally(() => {
    running = null;
    if (again) { again = false; syncNow(); }
  });
  return running;
}

async function doSync() {
  if (!configured()) return setStatus('nocfg');
  if (!navigator.onLine) return setStatus('offline');
  if (!token()) return setStatus('auth');
  setStatus('syncing');
  try {
    const folder = await ensureFolder();
    await uploadPhotos(folder);

    if (!meta.fileId) meta.fileId = await findOne(`name='${STATE_FILE}' and '${folder}' in parents and trashed=false`);
    let remote = null;
    if (meta.fileId) {
      try {
        remote = await api(`${D}/files/${meta.fileId}?alt=media`);
        if (typeof remote === 'string') remote = JSON.parse(remote);
      } catch (e) {
        if (e.status === 404) meta.fileId = null;
        else throw e;
      }
    }
    merge(remote);
    refreshAuto();

    // El calendario se crea antes de subir los datos, para que el otro móvil lo reutilice.
    let calId = null;
    let calError = null;
    try {
      if (desiredAlerts().length || S.settings.calendarId) calId = await ensureCalendar();
    } catch (e) {
      if (e instanceof AuthError) throw e;
      calError = e.message;
    }

    if (newerThan(remote)) {
      meta.dirty = false;
      const body = JSON.stringify(S);
      if (meta.fileId) {
        await api(`${DU}/files/${meta.fileId}?uploadType=media`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
        });
      } else {
        const f = await multipartCreate(
          { name: STATE_FILE, parents: [folder], mimeType: 'application/json' },
          new Blob([body], { type: 'application/json' }),
        );
        meta.fileId = f.id;
      }
    } else {
      meta.dirty = false;
    }
    meta.lastSync = Date.now();
    commit({ local: false });

    try {
      if (calId) await syncCalendar(calId);
      meta.calError = calError;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      meta.calError = e.message;
      console.warn('calendar', e);
    }
    await saveMeta();
    setStatus('ok');
  } catch (e) {
    console.warn('sync', e);
    await saveMeta();
    if (e instanceof AuthError) setStatus('auth');
    else setStatus(navigator.onLine ? 'error' : 'offline', e.message);
  }
}

// ── Calendar ──
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';

async function ensureCalendar() {
  const id = S.settings.calendarId;
  if (id) {
    try {
      await api(`${C}/calendars/${encodeURIComponent(id)}`);
      return id;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      if (e.status !== 404 && e.status !== 403) throw e;
    }
  }
  const c = await jsonPost(`${C}/calendars`, { summary: CONFIG.CALENDAR_NAME, timeZone: tz() });
  putSettings({ calendarId: c.id });
  return c.id;
}

function eventBody(w) {
  return {
    summary: w.summary,
    description: w.description,
    start: { dateTime: w.start.toISOString(), timeZone: tz() },
    end: { dateTime: new Date(w.start.getTime() + 15 * 60000).toISOString(), timeZone: tz() },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    extendedProperties: { private: { invcasa: w.key } },
  };
}

const evStart = (ev) => new Date(ev.start?.dateTime || ev.start?.date).getTime();

async function syncCalendar(calId) {
  const want = desiredAlerts();
  const cal = encodeURIComponent(calId);
  const timeMin = new Date(Date.now() - 45 * 864e5).toISOString();
  const events = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ timeMin, maxResults: '2500', singleEvents: 'true' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await api(`${C}/calendars/${cal}/events?` + q);
    events.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);

  const nowT = Date.now();
  const del = (ev) => api(`${C}/calendars/${cal}/events/${ev.id}`, { method: 'DELETE' }).catch((e) => {
    if (e instanceof AuthError) throw e;
  });
  const byKey = new Map();
  for (const ev of events) {
    const k = ev.extendedProperties?.private?.invcasa;
    if (!k) continue;
    if (byKey.has(k)) { if (evStart(ev) > nowT) await del(ev); continue; }
    byKey.set(k, ev);
  }
  const wanted = new Set(want.map((w) => w.key));
  for (const [k, ev] of byKey) if (!wanted.has(k) && evStart(ev) > nowT) await del(ev);

  for (const w of want) {
    const ev = byKey.get(w.key);
    if (!ev) await jsonPost(`${C}/calendars/${cal}/events`, eventBody(w));
    else if (!w.flexible && (ev.summary !== w.summary || evStart(ev) !== w.start.getTime()))
      await jsonPost(`${C}/calendars/${cal}/events/${ev.id}`, eventBody(w), 'PATCH');
    else if (w.flexible && ev.summary !== w.summary)
      await jsonPost(`${C}/calendars/${cal}/events/${ev.id}`, { summary: w.summary, description: w.description }, 'PATCH');
  }
}
