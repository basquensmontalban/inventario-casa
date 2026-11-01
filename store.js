// Estado de la app, cambios, fusión entre móviles y cálculos derivados.
import { kvGet, kvSet } from './db.js';

export const GENERAL = 'general';
export const UNITS = { ud: 'ud.', kg: 'kg', g: 'g', l: 'l', ml: 'ml' };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();

function emptyState() {
  return {
    v: 1,
    products: {},
    lists: { [GENERAL]: { id: GENERAL, name: 'General', u: 1 } },
    items: {},
    settings: {
      u: 0,
      alertsMode: 'all',   // all | critical | off
      expiryDays: 7,
      alertHour: 9,
      stockAlerts: true,
      calendarId: null,
    },
  };
}

export let S = null;      // estado sincronizado (va a Drive)
export let meta = {};     // datos solo de este móvil
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);

export async function load() {
  S = (await kvGet('state')) || emptyState();
  meta = (await kvGet('meta')) || {};
  ensure();
  refreshAuto();
}

function ensure() {
  for (const k of ['products', 'lists', 'items']) S[k] = S[k] || {};
  if (!S.lists[GENERAL] || S.lists[GENERAL].del) S.lists[GENERAL] = { id: GENERAL, name: 'General', u: 1 };
  S.settings = { ...emptyState().settings, ...(S.settings || {}) };
}

export const saveMeta = () => kvSet('meta', meta);

// Guarda y avisa a la interfaz. local=true marca que hay cambios por subir.
export function commit({ local = true } = {}) {
  if (local) meta.dirty = true;
  refreshAuto();
  kvSet('state', S);
  saveMeta();
  listeners.forEach((f) => f({ local }));
}

export function replaceAll(data) {
  S = data;
  ensure();
  const t = now();
  for (const k of ['products', 'lists', 'items']) for (const r of Object.values(S[k])) r.u = t;
  S.settings.u = t;
  commit();
}

// ── Lecturas ───────────────────────────────────────────────
export const alive = (o) => Object.values(o).filter((x) => !x.del);
export const products = () => alive(S.products).sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const lists = () =>
  alive(S.lists).sort((a, b) => (a.id === GENERAL ? -1 : b.id === GENERAL ? 1 : a.name.localeCompare(b.name, 'es')));

export const round = (n) => Math.round((+n || 0) * 100) / 100;
export const total = (p) => round((p.lots || []).reduce((s, l) => s + (+l.qty || 0), 0));
export const fav = (p) => (p.variants || []).find((v) => v.fav) || (p.variants || [])[0] || null;
export const variant = (p, id) => (p.variants || []).find((v) => v.id === id) || null;
export const needs = (p) => p.restock !== false && +p.min > 0 && total(p) < +p.min;
export const suggest = (p) => {
  const target = +p.target > 0 ? +p.target : +p.min;
  return round(Math.max(target - total(p), p.unit === 'ud' || !p.unit ? 1 : 0.1));
};
export const loc = (p) => [p.room, p.furniture, p.shelf].filter(Boolean).join(' › ');
export const validList = (id) => (id && S.lists[id] && !S.lists[id].del ? id : GENERAL);
export const expiryDaysOf = (p) =>
  p.expiryDays !== undefined && p.expiryDays !== null && p.expiryDays !== '' ? +p.expiryDays : +S.settings.expiryDays;

export function ymd(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
export function atHour(ymdStr, h) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(y, m - 1, d, +h || 0, 0, 0);
}
export const today = () => ymd(new Date());

// Estado de caducidad de un lote: 'expired' | 'soon' | null
export function expiryState(p, lot) {
  if (!lot.expiry) return null;
  const t = today();
  if (lot.expiry < t) return 'expired';
  if (lot.expiry <= addDays(t, expiryDaysOf(p))) return 'soon';
  return null;
}
export function productExpiry(p) {
  const st = (p.lots || []).filter((l) => +l.qty > 0).map((l) => expiryState(p, l));
  return st.includes('expired') ? 'expired' : st.includes('soon') ? 'soon' : null;
}
export function findByBarcode(code) {
  code = String(code).trim();
  for (const p of products()) for (const v of p.variants || []) if (v.barcode && v.barcode === code) return { product: p, variant: v };
  return null;
}

// ── Cambios ────────────────────────────────────────────────
export function putProduct(p) {
  p.u = now();
  S.products[p.id] = p;
  commit();
}
export function deleteProduct(id) {
  S.products[id] = { id, del: true, u: now() };
  commit();
}
export function putList(l) {
  l.u = now();
  S.lists[l.id] = l;
  commit();
}
export function deleteList(id) {
  if (id === GENERAL) return;
  const t = now();
  for (const it of alive(S.items)) if (it.listId === id) { it.listId = GENERAL; it.u = t; }
  for (const p of alive(S.products)) if (p.listId === id) { p.listId = null; p.u = t; }
  S.lists[id] = { id, del: true, u: t };
  commit();
}
export function putItem(it) {
  it.u = now();
  S.items[it.id] = it;
  commit();
}
export function deleteItem(id) {
  S.items[id] = { id, del: true, u: now() };
  commit();
}
export function putSettings(patch) {
  Object.assign(S.settings, patch, { u: now() });
  commit();
}

// Añade existencias; junta con un lote igual (misma marca y caducidad).
export function addStock(p, { variantId = null, qty = 1, expiry = null }) {
  p.lots = p.lots || [];
  const same = p.lots.find((l) => (l.variantId || null) === (variantId || null) && (l.expiry || null) === (expiry || null));
  if (same) same.qty = round(+same.qty + +qty);
  else p.lots.push({ id: uid(), variantId: variantId || null, qty: round(qty), expiry: expiry || null });
  putProduct(p);
}

// Gasta empezando por lo que caduca antes.
export function consume(p, amount) {
  let left = +amount;
  const lots = [...(p.lots || [])].sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(+l.qty, left);
    l.qty = round(+l.qty - take);
    left = round(left - take);
  }
  p.lots = (p.lots || []).filter((l) => +l.qty > 0);
  putProduct(p);
}

// ── Lista de la compra automática ──────────────────────────
// Cada artículo bajo mínimo tiene un elemento con id fijo 'auto-<id>' para
// que los dos móviles no lo dupliquen.
export function refreshAuto() {
  const t = now();
  for (const p of alive(S.products)) {
    const id = 'auto-' + p.id;
    const it = S.items[id];
    if (needs(p)) {
      if (!it || it.del) {
        S.items[id] = { id, auto: true, productId: p.id, listId: validList(p.listId), qty: suggest(p), since: t, u: t };
        meta.dirty = true;
      } else if (!it.qtyEdited && !it.dismissed && it.qty !== suggest(p)) {
        it.qty = suggest(p);
        it.u = t;
        meta.dirty = true;
      }
    } else if (it && !it.del) {
      S.items[id] = { id, del: true, u: t };
      meta.dirty = true;
    }
  }
  for (const it of alive(S.items)) {
    if (it.auto && (!S.products[it.productId] || S.products[it.productId].del)) {
      S.items[it.id] = { id: it.id, del: true, u: t };
      meta.dirty = true;
    } else if (!S.lists[it.listId] || S.lists[it.listId].del) {
      it.listId = GENERAL;
      it.u = t;
      meta.dirty = true;
    }
  }
}

// ── Fusión con la copia de Drive (gana el cambio más reciente de cada registro) ──
export function merge(remote) {
  if (!remote) return false;
  let changed = false;
  for (const k of ['products', 'lists', 'items']) {
    for (const [id, rv] of Object.entries(remote[k] || {})) {
      const lv = S[k][id];
      if (!lv || (rv.u || 0) > (lv.u || 0)) { S[k][id] = rv; changed = true; }
    }
  }
  if ((remote.settings?.u || 0) > (S.settings.u || 0)) {
    S.settings = { ...S.settings, ...remote.settings };
    changed = true;
  }
  ensure();
  return changed;
}

export function newerThan(remote) {
  if (!remote) return true;
  for (const k of ['products', 'lists', 'items']) {
    for (const [id, lv] of Object.entries(S[k])) {
      const rv = remote[k]?.[id];
      if (!rv || (lv.u || 0) > (rv.u || 0)) return true;
    }
  }
  return (S.settings.u || 0) > (remote.settings?.u || 0);
}

// ── Avisos que deberían existir en Google Calendar ─────────
export const fmtNum = (n) => String(round(n)).replace('.', ',');
export const fmtQty = (n, unit) => `${fmtNum(n)} ${UNITS[unit || 'ud'] || unit}`;
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export function desiredAlerts() {
  const st = S.settings;
  if (st.alertsMode === 'off') return [];
  const out = [];
  const nowD = new Date();
  const t = today();
  for (const p of products()) {
    const include = st.alertsMode === 'all' ? p.alerts !== false : !!p.critical;
    if (!include) continue;
    const days = expiryDaysOf(p);
    for (const l of p.lots || []) {
      if (!l.expiry || l.expiry < t || !(+l.qty > 0)) continue;
      const v = variant(p, l.variantId);
      let start = atHour(addDays(l.expiry, -days), st.alertHour);
      let flexible = false;
      if (start < nowD) { start = new Date(nowD.getTime() + 10 * 60000); flexible = true; }
      out.push({
        key: `exp-${l.id}-${l.expiry}-${days}`,
        summary: `⏳ Caduca ${p.name}${v?.brand ? ' (' + v.brand + ')' : ''} · ${fmtDate(l.expiry)}`,
        description: `${fmtQty(l.qty, p.unit)} en ${loc(p) || 'sin ubicación'}`,
        start,
        flexible,
      });
    }
    const it = S.items['auto-' + p.id];
    if (st.stockAlerts && needs(p) && it && !it.del && !it.dismissed) {
      let start = atHour(t, st.alertHour);
      if (start < nowD) start = atHour(addDays(t, 1), st.alertHour);
      out.push({
        key: `stock-${p.id}-${it.since}`,
        summary: `🛒 Queda poco: ${p.name}`,
        description: `Hay ${fmtQty(total(p), p.unit)} (mínimo ${fmtNum(p.min)}). Lista: ${S.lists[it.listId]?.name || 'General'}`,
        start,
        flexible: true,
      });
    }
  }
  return out;
}
