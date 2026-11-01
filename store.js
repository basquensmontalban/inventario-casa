// Estado de la app, cambios, fusión entre móviles y cálculos derivados.
import { kvGet, kvSet } from './db.js';

export const GENERAL = 'general';
export const UNITS = { ud: 'ud.', kg: 'kg', g: 'g', l: 'l', ml: 'ml' };
export const SCHEMA = 4;
const COLLECTIONS = ['products', 'lists', 'items', 'locations', 'tags', 'stores', 'recipes', 'recipeGroups'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const DEFAULT_SETTINGS = {
  u: 0,
  alertsMode: 'all',   // all | critical | off
  expiryDays: 7,
  alertHour: 9,
  stockAlerts: true,
  calendarId: null,
  backupEveryDays: 1,  // copia automática en Drive cada X días
  backupKeep: 30,      // copias automáticas que se guardan (más la primera de cada mes)
};

function emptyState() {
  return {
    v: SCHEMA,
    products: {},
    lists: { [GENERAL]: { id: GENERAL, name: 'General', u: 1 } },
    items: {},
    locations: {},
    tags: {},
    stores: {},
    recipes: {},
    recipeGroups: {},
    settings: { ...DEFAULT_SETTINGS },
    backupInfo: { last: 0, by: '', u: 0 },
  };
}

export let S = null;      // estado común (va a Drive)
export let meta = {};     // datos técnicos solo de este móvil
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);

export async function load() {
  S = (await kvGet('state')) || emptyState();
  meta = (await kvGet('meta')) || {};
  if ((S.v || 1) < SCHEMA && Object.keys(S.products || {}).length) {
    // Guarda los datos tal como estaban antes de actualizar; se subirán también a Drive.
    await kvSet('state-before-v' + SCHEMA, clone(S));
    meta.pendingUpgradeBackup = true;
  }
  ensure();
  refreshAuto();
  await kvSet('state', S);
  await saveMeta();
  await localSnapshot();
}

function ensure() {
  for (const k of COLLECTIONS) S[k] = S[k] || {};
  if (!S.lists[GENERAL] || S.lists[GENERAL].del) S.lists[GENERAL] = { id: GENERAL, name: 'General', u: 1 };
  S.settings = { ...DEFAULT_SETTINGS, ...(S.settings || {}) };
  S.backupInfo = S.backupInfo || { last: 0, by: '', u: 0 };
  S.v = SCHEMA;
  normalize();
}

// Convierte datos de la versión anterior (habitación/mueble/estante en texto) y repara referencias.
// Es determinista: los dos móviles llegan al mismo resultado sin duplicar ubicaciones.
// Lo que se crea aquí lleva fecha 1 (muy antigua) para que cualquier cambio hecho en el otro móvil gane.
function normalize() {
  if (!Object.keys(S.tags).length) seedTags();
  if (!Object.keys(S.recipeGroups).length) seedRecipeGroups();
  for (const p of Object.values(S.products)) {
    if (p.del) continue;
    if ('room' in p || 'furniture' in p || 'shelf' in p) {
      const names = [p.room, p.furniture, p.shelf].map((x) => String(x || '').trim()).filter(Boolean);
      if (!p.locationId) p.locationId = names.length ? ensurePath(names, 1) : null;
      delete p.room; delete p.furniture; delete p.shelf;
    }
    if ('category' in p) {
      const c = String(p.category || '').trim();
      if (c) p.tags = [...new Set([...(p.tags || []), ensureTag(c.charAt(0).toUpperCase() + c.slice(1))])];
      delete p.category;
    }
    if (p.locationId && !locAlive(p.locationId)) p.locationId = null;
    for (const l of p.lots || []) {
      if (l.locationId === undefined || (l.locationId && !locAlive(l.locationId))) l.locationId = p.locationId || null;
    }
    if (p.tags) p.tags = p.tags.filter((id) => getTag(id));
    if (p.stores) p.stores = p.stores.filter((id) => getStore(id));
  }
  for (const it of Object.values(S.items)) if (it.storeId && !getStore(it.storeId)) it.storeId = null;
  for (const r of Object.values(S.recipes)) {
    if (r.del) continue;
    for (const ing of r.ingredients || []) if (ing.productId && !(S.products[ing.productId] && !S.products[ing.productId].del)) ing.productId = null;
  }
}

const RG_SEEDS = [
  ['rg-momento', 'Momento', true, ['Desayuno', 'Comida', 'Cena', 'Merienda', 'Picoteo']],
  ['rg-tipo', 'Tipo', false, ['Ligero', 'Pesado']],
];
function seedRecipeGroups() {
  RG_SEEDS.forEach(([id, name, multi, opts], i) => {
    S.recipeGroups[id] = { id, name, multi, order: i, options: opts.map((n) => ({ id: id + '-' + hash(norm(n)), name: n })), u: 1 };
  });
}

const TAG_SEEDS = [['Verdura', '🥬'], ['Fruta', '🍎'], ['Conservas', '🥫']];
function seedTags() {
  TAG_SEEDS.forEach(([name, symbol], i) => ensureTag(name, symbol, i));
}
function ensureTag(name, symbol = '🏷️', order) {
  const found = alive(S.tags).find((t) => norm(t.name) === norm(name));
  if (found) return found.id;
  const id = 'tag-' + hash(norm(name));
  if (S.tags[id]?.del) return null;
  S.tags[id] = { id, name, symbol, u: 1, ...(order !== undefined ? { order } : {}) };
  return id;
}

function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(36);
}

function ensurePath(names, t) {
  let parent = null;
  let key = '';
  for (const n of names) {
    key += '/' + norm(n);
    const found = alive(S.locations).find((l) => (l.parentId || null) === parent && norm(l.name) === norm(n));
    if (found) { parent = found.id; continue; }
    const id = 'loc-' + hash(key);
    S.locations[id] = { id, name: n, parentId: parent, reserve: false, u: t };
    parent = id;
  }
  return parent;
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

// Sustituye todo por una copia. Lo que no esté en la copia se marca como borrado
// para que no reaparezca al sincronizar con el otro móvil.
export function replaceAll(data) {
  const t = now();
  const fresh = { ...emptyState(), ...clone(data) };
  for (const k of COLLECTIONS) {
    fresh[k] = fresh[k] || {};
    for (const id of Object.keys(S[k] || {})) if (!fresh[k][id]) fresh[k][id] = { id, del: true };
    for (const r of Object.values(fresh[k])) r.u = t;
  }
  fresh.settings = { ...DEFAULT_SETTINGS, ...(fresh.settings || {}), calendarId: S.settings.calendarId, u: t };
  fresh.backupInfo = S.backupInfo;
  S = fresh;
  ensure();
  commit();
}

// Copias en el propio móvil (las 7 últimas, como mucho una al día).
export async function localSnapshot(force = false) {
  const arr = (await kvGet('localBackups')) || [];
  if (!force && arr[0] && Date.now() - arr[0].ts < 20 * 3600e3) return;
  arr.unshift({ ts: Date.now(), data: clone(S) });
  await kvSet('localBackups', arr.slice(0, 7));
}
export const localBackups = async () => (await kvGet('localBackups')) || [];

// ── Lecturas ───────────────────────────────────────────────
export const alive = (o) => Object.values(o || {}).filter((x) => !x.del);
export const products = () => alive(S.products).sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const lists = () =>
  alive(S.lists).sort((a, b) => (a.id === GENERAL ? -1 : b.id === GENERAL ? 1 : a.name.localeCompare(b.name, 'es')));

export const round = (n) => Math.round((+n || 0) * 100) / 100;
export const fav = (p) => (p.variants || []).find((v) => v.fav) || (p.variants || [])[0] || null;
export const variant = (p, id) => (p.variants || []).find((v) => v.id === id) || null;
export const validList = (id) => (id && S.lists[id] && !S.lists[id].del ? id : GENERAL);
export const expiryDaysOf = (p) =>
  p.expiryDays !== undefined && p.expiryDays !== null && p.expiryDays !== '' ? +p.expiryDays : +S.settings.expiryDays;

// ── Ubicaciones (estancia › mueble › estante) ──────────────
const locAlive = (id) => !!(id && S.locations[id] && !S.locations[id].del);
export const getLoc = (id) => (locAlive(id) ? S.locations[id] : null);
const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name, 'es');
const parentOf = (l) => (l.parentId && locAlive(l.parentId) ? l.parentId : null);
export const locChildren = (pid) => alive(S.locations).filter((l) => parentOf(l) === (pid || null)).sort(byOrder);

export function locTree() {
  const out = [];
  const walk = (pid, depth) => {
    for (const l of locChildren(pid)) {
      out.push({ loc: l, depth });
      if (depth < 5) walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
export function locPath(id) {
  const path = [];
  let l = getLoc(id);
  let guard = 0;
  while (l && guard++ < 10) { path.unshift(l); l = getLoc(parentOf(l)); }
  return path;
}
export const locName = (id) => locPath(id).map((l) => l.name).join(' › ');
export const locDepth = (id) => locPath(id).length - 1;
export const isReserve = (id) => locPath(id).some((l) => l.reserve);
export function locSubtree(id) {
  const set = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const l of alive(S.locations)) if (l.parentId && set.has(l.parentId) && !set.has(l.id)) { set.add(l.id); added = true; }
  }
  return set;
}
export function locHeight(id) {
  const kids = locChildren(id);
  return kids.length ? 1 + Math.max(...kids.map((k) => locHeight(k.id))) : 0;
}
export function locUsage(id) {
  let n = 0;
  for (const p of alive(S.products)) if (p.locationId === id || (p.lots || []).some((l) => l.locationId === id && +l.qty > 0)) n++;
  return n;
}
export function putLoc(l) {
  l.u = now();
  S.locations[l.id] = l;
  commit();
}
export function moveLocOrder(id, dir) {
  const l = getLoc(id);
  if (!l) return;
  const sib = locChildren(parentOf(l));
  const i = sib.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= sib.length) return;
  [sib[i], sib[j]] = [sib[j], sib[i]];
  const t = now();
  sib.forEach((x, k) => { if (x.order !== k) { x.order = k; x.u = t; } });
  commit();
}
// Borra una ubicación: lo de dentro sube un nivel y los artículos pasan a targetId.
export function deleteLoc(id, targetId) {
  const l = getLoc(id);
  if (!l) return;
  const t = now();
  for (const c of alive(S.locations)) if (c.parentId === id) { c.parentId = parentOf(l); c.u = t; }
  for (const p of alive(S.products)) {
    let ch = false;
    if (p.locationId === id) { p.locationId = targetId || null; ch = true; }
    for (const lot of p.lots || []) if (lot.locationId === id) { lot.locationId = targetId || null; ch = true; }
    if (ch) { mergeLots(p); p.u = t; }
  }
  S.locations[id] = { id, del: true, u: t };
  commit();
}
export const productInLoc = (p, set) =>
  set.has(p.locationId) || (p.lots || []).some((l) => +l.qty > 0 && set.has(l.locationId));

// ── Etiquetas y tiendas (mismo formato: nombre + símbolo) ──
export const getTag = (id) => (id && S.tags[id] && !S.tags[id].del ? S.tags[id] : null);
export const getStore = (id) => (id && S.stores[id] && !S.stores[id].del ? S.stores[id] : null);
export const tags = () => alive(S.tags).sort(byOrder);
export const stores = () => alive(S.stores).sort(byOrder);
export const productTags = (p) => (p.tags || []).map(getTag).filter(Boolean);
export const productStores = (p) => (p.stores || []).map(getStore).filter(Boolean);
export const catalog = (kind) => (kind === 'tags' ? tags() : stores());
export function putCatalog(kind, rec) {
  rec.u = now();
  S[kind][rec.id] = rec;
  commit();
}
export function deleteCatalog(kind, id) {
  const t = now();
  const field = kind === 'tags' ? 'tags' : 'stores';
  for (const p of alive(S.products)) if ((p[field] || []).includes(id)) { p[field] = p[field].filter((x) => x !== id); p.u = t; }
  if (kind === 'stores') for (const it of alive(S.items)) if (it.storeId === id) { it.storeId = null; it.u = t; }
  S[kind][id] = { id, del: true, u: t };
  commit();
}
export function moveCatalogOrder(kind, id, dir) {
  const arr = catalog(kind);
  const i = arr.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  const t = now();
  arr.forEach((x, k) => { if (x.order !== k) { x.order = k; x.u = t; } });
  commit();
}
// Tiendas donde se compra un elemento de la lista (las del artículo, o la suya si es suelto).
export const itemStoreIds = (it) => {
  const p = it.productId && S.products[it.productId] && !S.products[it.productId].del ? S.products[it.productId] : null;
  return p ? (p.stores || []).filter((id) => getStore(id)) : it.storeId && getStore(it.storeId) ? [it.storeId] : [];
};
export const onList = (p) => alive(S.items).some((it) => it.productId === p.id && !it.done && !it.dismissed);

// ── Existencias ────────────────────────────────────────────
const sum = (lots) => round(lots.reduce((s, l) => s + (+l.qty || 0), 0));
export const total = (p) => sum(p.lots || []);
export const atHand = (p) => sum((p.lots || []).filter((l) => !isReserve(l.locationId)));
export const inReserve = (p) => round(total(p) - atHand(p));
// Solo lo que está a mano cuenta para el mínimo; la reserva no.
export const needs = (p) => p.restock !== false && +p.min > 0 && atHand(p) < +p.min;
export const suggest = (p) => {
  const target = +p.target > 0 ? +p.target : +p.min;
  return round(Math.max(target - atHand(p), p.unit === 'ud' || !p.unit ? 1 : 0.1));
};
export const loc = (p) => locName(p.locationId);

function mergeLots(p) {
  const out = [];
  for (const l of p.lots || []) {
    if (!(+l.qty > 0)) continue;
    const same = out.find((o) => (o.variantId || null) === (l.variantId || null) && (o.expiry || null) === (l.expiry || null)
      && (o.locationId || null) === (l.locationId || null));
    if (same) same.qty = round(+same.qty + +l.qty);
    else out.push(l);
  }
  p.lots = out;
}

export function addStock(p, { variantId = null, qty = 1, expiry = null, locationId }) {
  p.lots = p.lots || [];
  p.lots.push({ id: uid(), variantId: variantId || null, qty: round(qty), expiry: expiry || null,
    locationId: locationId === undefined ? p.locationId || null : locationId || null });
  mergeLots(p);
  putProduct(p);
}

// Gasta primero lo que está a mano (lo que caduca antes) y después la reserva.
export function consume(p, amount) {
  let left = +amount;
  const lots = [...(p.lots || [])].sort((a, b) => (isReserve(a.locationId) - isReserve(b.locationId))
    || (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(+l.qty, left);
    l.qty = round(+l.qty - take);
    left = round(left - take);
  }
  p.lots = (p.lots || []).filter((l) => +l.qty > 0);
  putProduct(p);
}

export function moveStock(p, lotId, qty, toId) {
  const lot = (p.lots || []).find((l) => l.id === lotId);
  if (!lot) return;
  const q = round(Math.min(+qty, +lot.qty));
  if (!(q > 0)) return;
  lot.qty = round(+lot.qty - q);
  p.lots.push({ id: uid(), variantId: lot.variantId || null, expiry: lot.expiry || null, qty: q, locationId: toId || null });
  mergeLots(p);
  putProduct(p);
}

// Pasa existencias de la reserva a otra ubicación (por defecto, la habitual).
export function fromReserve(p, qty, toId) {
  let left = round(qty);
  const lots = (p.lots || []).filter((l) => isReserve(l.locationId))
    .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  for (const l of lots) {
    if (left <= 0) break;
    const take = round(Math.min(+l.qty, left));
    l.qty = round(+l.qty - take);
    p.lots.push({ id: uid(), variantId: l.variantId || null, expiry: l.expiry || null, qty: take, locationId: toId || null });
    left = round(left - take);
  }
  mergeLots(p);
  putProduct(p);
}

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
  for (const k of COLLECTIONS) {
    for (const [id, rv] of Object.entries(remote[k] || {})) {
      const lv = S[k][id];
      if (!lv || (rv.u || 0) > (lv.u || 0)) { S[k][id] = rv; changed = true; }
    }
  }
  if ((remote.settings?.u || 0) > (S.settings.u || 0)) {
    S.settings = { ...S.settings, ...remote.settings };
    changed = true;
  }
  if ((remote.backupInfo?.u || 0) > (S.backupInfo?.u || 0)) {
    S.backupInfo = remote.backupInfo;
    changed = true;
  }
  // Conserva datos de versiones más nuevas de la app que esta todavía no conoce.
  for (const [k, v] of Object.entries(remote)) if (!(k in S)) S[k] = v;
  ensure();
  return changed;
}

export function newerThan(remote) {
  if (!remote) return true;
  for (const k of COLLECTIONS) {
    for (const [id, lv] of Object.entries(S[k])) {
      const rv = remote[k]?.[id];
      if (!rv || (lv.u || 0) > (rv.u || 0)) return true;
    }
  }
  if ((S.backupInfo?.u || 0) > (remote.backupInfo?.u || 0)) return true;
  return (S.settings.u || 0) > (remote.settings?.u || 0) || (remote.v || 1) < SCHEMA;
}

// ── Formatos ───────────────────────────────────────────────
export const fmtNum = (n) => String(round(n)).replace('.', ',');
export const fmtQty = (n, unit) => `${fmtNum(n)} ${UNITS[unit || 'ud'] || unit}`;
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// ── Avisos que deberían existir en Google Calendar ─────────
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
        description: `${fmtQty(l.qty, p.unit)} en ${locName(l.locationId) || 'sin ubicación'}`,
        start,
        flexible,
      });
    }
    const it = S.items['auto-' + p.id];
    if (st.stockAlerts && needs(p) && it && !it.del && !it.dismissed) {
      let start = atHour(t, st.alertHour);
      if (start < nowD) start = atHour(addDays(t, 1), st.alertHour);
      const res = inReserve(p);
      out.push({
        key: `stock-${p.id}-${it.since}`,
        summary: `🛒 Queda poco: ${p.name}`,
        description: `A mano: ${fmtQty(atHand(p), p.unit)} (mínimo ${fmtNum(p.min)})${res > 0 ? `. En reserva: ${fmtQty(res, p.unit)}` : ''}. Lista: ${S.lists[it.listId]?.name || 'General'}`,
        start,
        flexible: true,
      });
    }
  }
  return out;
}

// ── Recetas ────────────────────────────────────────────────
export const recipes = () => alive(S.recipes).sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const recipeGroups = () => alive(S.recipeGroups).sort(byOrder);
export function putRecipe(r) {
  r.u = now();
  S.recipes[r.id] = r;
  commit();
}
export function deleteRecipe(id) {
  S.recipes[id] = { id, del: true, u: now() };
  commit();
}
export function putGroup(gr) {
  gr.u = now();
  S.recipeGroups[gr.id] = gr;
  commit();
}
export function deleteGroup(id) {
  const t = now();
  for (const r of alive(S.recipes)) if (r.cats && r.cats[id]) { delete r.cats[id]; r.u = t; }
  S.recipeGroups[id] = { id, del: true, u: t };
  commit();
}
export const recipeMinutes = (r) => (+r.prepMin || 0) + (+r.cookMin || 0);

// Conversión entre unidades compatibles (g↔kg, ml↔l, ud). null si no se pueden comparar.
const UNIT_BASE = { g: ['m', 1], kg: ['m', 1000], ml: ['v', 1], l: ['v', 1000], ud: ['u', 1], '': ['u', 1] };
export function convertQty(qty, from, to) {
  const a = UNIT_BASE[from ?? ''];
  const b = UNIT_BASE[to || 'ud'];
  if (!a || !b || a[0] !== b[0]) return null;
  return round((+qty * a[1]) / b[1]);
}

// Estado de un ingrediente según lo que hay A MANO (la reserva no cuenta).
export function ingredientState(ing, factor = 1) {
  if (ing.basic) return { state: 'basic' };
  const p = ing.productId && S.products[ing.productId] && !S.products[ing.productId].del ? S.products[ing.productId] : null;
  const opt = !!ing.optional;
  if (!p) return { state: 'missing', unlinked: true, optional: opt };
  const have = atHand(p);
  const need = ing.qty ? convertQty(+ing.qty * factor, ing.unit || '', p.unit || 'ud') : null;
  if (have <= 0) return { state: 'missing', p, have, need, optional: opt, reserve: inReserve(p) };
  if (need !== null && have < need) return { state: 'short', p, have, need, optional: opt, reserve: inReserve(p) };
  return { state: 'ok', p, have, need, optional: opt };
}
// ok = lo tienes todo · few = faltan pocos (hasta orangeMax) · many = faltan más (sin contar opcionales ni básicos)
export function recipeStatus(r, orangeMax = 2) {
  const missing = (r.ingredients || []).filter((ing) => {
    const s = ingredientState(ing);
    return (s.state === 'missing' || s.state === 'short') && !s.optional;
  });
  const n = missing.length;
  return { n, missing, level: n === 0 ? 'ok' : n <= orangeMax ? 'few' : 'many' };
}
