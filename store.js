// Estado de la app, cambios, fusión entre móviles y cálculos derivados.
import { kvGet, kvSet, kvSetMany } from './db.js';
import { mergeRecord, merge3 } from './merge3.js';

export const GENERAL = 'general';
export const UNITS = { ud: 'ud.', kg: 'kg', g: 'g', l: 'l', ml: 'ml', rac: 'rac.' };
export const SCHEMA = 8;
const COLLECTIONS = ['products', 'lists', 'items', 'locations', 'tags', 'stores', 'recipes', 'recipeGroups', 'menu', 'freq', 'people', 'recipeFavs', 'recipeRatings'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Marca de tiempo de cada cambio. Nunca va hacia atrás respecto a lo que ya se ha visto (aunque el reloj
// del otro móvil vaya adelantado), para que un cambio nuevo siempre cuente como posterior al anterior.
let maxU = 0;
const now = () => (maxU = Math.max(Date.now(), maxU + 1));
export const stamp = now;
const seen = (data) => {
  if (!data) return;
  for (const k of COLLECTIONS) for (const r of Object.values(data[k] || {})) if (+r.u > maxU) maxU = +r.u;
  if (+data.settings?.u > maxU) maxU = +data.settings.u;
};
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
    menu: {},
    freq: {},
    people: {},
    recipeFavs: {},
    recipeRatings: {},
    settings: { ...DEFAULT_SETTINGS },
    backupInfo: { last: 0, by: '', u: 0 },
  };
}

export let S = null;      // estado común (va a Drive)
export let meta = {};     // datos técnicos solo de este móvil
// Última versión de Drive que este móvil ya tiene incorporada: sirve para saber qué ha cambiado
// cada móvil desde entonces y juntar los dos cambios en vez de quedarse solo con uno.
let base = null;
export const getBase = () => base;
export async function setBase(data, md5) {
  base = data ? (typeof data === 'string' ? JSON.parse(data) : clone(data)) : null;
  meta.baseMd5 = base ? md5 || null : null;
  await kvSetMany({ state: S, meta, base });
}
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);

export async function load() {
  S = (await kvGet('state')) || emptyState();
  meta = (await kvGet('meta')) || {};
  base = (await kvGet('base')) || null;
  if (!base) meta.baseMd5 = null;
  if ((S.v || 1) < SCHEMA && Object.keys(S.products || {}).length) {
    // Guarda los datos tal como estaban antes de actualizar; se subirán también a Drive.
    await kvSet('state-before-v' + SCHEMA, clone(S));
    meta.pendingUpgradeBackup = true;
  }
  ensure();
  seen(S);
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
  seedTaxonomy();
  if (!Object.keys(S.recipeGroups).length) seedRecipeGroups();
  // v1.8: filtro «Tipo de plato» (si se borra, no vuelve).
  if (!S.recipeGroups[COURSE_GROUP]) seedGroup(RG_COURSE, -1);
  // v1.9: filtro «Proteína» (para la variedad de la semana).
  if (!S.recipeGroups[PROTEIN_GROUP]) seedGroup(RG_PROTEIN, -0.5);
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

export const COURSE_GROUP = 'rg-plato';
const RG_COURSE = [COURSE_GROUP, 'Tipo de plato', true, ['Desayuno', 'Entrante', 'Primero', 'Plato principal', 'Postre', 'Salsa']];
export const PROTEIN_GROUP = 'rg-proteina';
const RG_PROTEIN = [PROTEIN_GROUP, 'Proteína', true, ['Legumbres', 'Pescado blanco', 'Pescado azul', 'Marisco', 'Ave', 'Carne roja', 'Huevo', 'Proteína vegetal']];
const RG_SEEDS = [
  ['rg-momento', 'Momento', true, ['Desayuno', 'Comida', 'Cena', 'Merienda', 'Picoteo']],
  ['rg-tipo', 'Tipo', false, ['Ligero', 'Pesado']],
];
function seedGroup([id, name, multi, opts], order) {
  S.recipeGroups[id] = { id, name, multi, order, options: opts.map((n) => ({ id: id + '-' + hash(norm(n)), name: n })), u: 1 };
}
function seedRecipeGroups() {
  RG_SEEDS.forEach((g, i) => seedGroup(g, i));
}

// Categorías de alimentación con sus subcategorías. Se crean solas si no existen
// (las que se hayan borrado no vuelven) y las etiquetas antiguas con el mismo nombre pasan a ser subcategorías.
export const FOOD_TAXONOMY = ['Alimentación', '🍽️', [
  ['Fruta', '🍎'], ['Verdura', '🥬'], ['Carne', '🥩'], ['Pescado y marisco', '🐟'], ['Embutidos', '🥓'], ['Lácteos', '🥛'],
  ['Quesos', '🧀'], ['Huevos', '🥚'], ['Pan y bollería', '🍞'], ['Pasta y arroz', '🍝'], ['Legumbres', '🫘'], ['Conservas', '🥫'],
  ['Cereales y desayuno', '🥣'], ['Harinas y repostería', '🌾'], ['Aceites y vinagres', '🫒'], ['Especias y condimentos', '🧂'],
  ['Hierbas secas', '🌿'], ['Chiles y pimientas', '🌶️'], ['Mezclas de especias', '🍛'], ['Pastas de curry y especias', '🥘'],
  ['Salsas', '🫙'], ['Salsas asiáticas', '🥢'], ['Caldos y fondos', '🍲'], ['Café e infusiones', '☕'], ['Dulces y snacks', '🍫'], ['Frutos secos', '🥜'], ['Bebidas', '🥤'],
  ['Congelados', '🧊'], ['Platos preparados', '🍱'],
]];
function seedTaxonomy() {
  const [pname, psym, kids] = FOOD_TAXONOMY;
  const pid = ensureTagSeed(pname, psym, null, 0);
  kids.forEach(([n, sym], i) => ensureTagSeed(n, sym, pid, i));
}
function ensureTagSeed(name, symbol, parentId, order) {
  const id = 'tag-' + hash(norm(name));
  const found = alive(S.tags).find((t) => norm(t.name) === norm(name)) || S.tags[id];
  if (found) {
    if (!found.del && found.parentId === undefined) found.parentId = parentId;
    // Las que nunca se han tocado (fecha 1) siguen el orden de la lista inicial.
    if (!found.del && order !== undefined && (found.order === undefined || found.u === 1)) found.order = order;
    return found.id;
  }
  S.tags[id] = { id, name, symbol, parentId, order, u: 1 };
  return id;
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
// Espera a que todo quede escrito en el móvil (antes de salir de la página).
export async function flush() { await kvSet('state', S); await saveMeta(); }

// Guarda y avisa a la interfaz. local=true marca que hay cambios por subir.
export function commit({ local = true } = {}) {
  linkCache = null;
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
const tagParent = (t) => (t.parentId && getTag(t.parentId) ? t.parentId : null);
export const tagChildren = (pid) => alive(S.tags).filter((t) => tagParent(t) === (pid || null)).sort(byOrder);
// Etiquetas en orden de árbol: cada categoría seguida de sus subcategorías.
export const tags = () => tagChildren(null).flatMap((t) => [t, ...tagChildren(t.id)]);
export const tagDepth = (t) => (tagParent(t) ? 1 : 0);
export const tagFull = (t) => { const p = getTag(tagParent(t)); return p ? `${p.name} › ${t.name}` : t.name; };
// Id de una categoría de la lista inicial aunque se le haya cambiado el nombre.
export const tagIdFor = (name) => {
  const id = 'tag-' + hash(norm(name));
  return getTag(id) ? id : tags().find((t) => norm(t.name) === norm(name))?.id || null;
};
// ¿Es comida? (sin categorías: se considera que sí)
export const isFood = (p) => {
  const food = tagIdFor(FOOD_TAXONOMY[0]);
  return !(p.tags || []).length || !food || productHasTag(p, food);
};
// ¿Tiene el artículo esta etiqueta (o una subcategoría suya)?
export const productHasTag = (p, tagId) => !tagId || (p.tags || []).some((id) => id === tagId || tagParent(getTag(id) || {}) === tagId);
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
  if (kind === 'tags') for (const c of alive(S.tags)) if (c.parentId === id) { c.parentId = null; c.u = t; }
  const field = kind === 'tags' ? 'tags' : 'stores';
  for (const p of alive(S.products)) if ((p[field] || []).includes(id)) { p[field] = p[field].filter((x) => x !== id); p.u = t; }
  if (kind === 'stores') for (const it of alive(S.items)) if (it.storeId === id) { it.storeId = null; it.u = t; }
  S[kind][id] = { id, del: true, u: t };
  commit();
}
export function moveCatalogOrder(kind, id, dir) {
  const arr = kind === 'tags' ? tagChildren(tagParent(getTag(id) || {})) : stores();
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

// Varias entradas de golpe (guardar la compra): una sola grabación al final.
export function addStockBatch(entries) {
  const t = now();
  for (const { productId, variantId = null, qty, expiry = null, locationId } of entries) {
    const p = S.products[productId];
    if (!p || p.del || !(+qty > 0)) continue;
    p.lots = p.lots || [];
    p.lots.push({ id: uid(), variantId, qty: round(qty), expiry: expiry || null, locationId: locationId === undefined ? p.locationId || null : locationId || null });
    mergeLots(p);
    p.u = t;
  }
  commit();
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

// ── Fusión con la copia de Drive ──
// Con la versión común (base) se sabe quién cambió cada registro: si solo cambió uno, vale ese cambio;
// si cambiaron los dos, se juntan (existencias sumando lo que cambió cada uno, el resto campo a campo).
// Sin versión común (primera vez), gana el cambio más reciente.
export function merge(remote, { useBase = true } = {}) {
  if (!remote) return false;
  linkCache = null;
  seen(remote);
  const B = useBase ? base : null;
  let changed = false;
  for (const k of COLLECTIONS) {
    for (const [id, rv] of Object.entries(remote[k] || {})) {
      const lv = S[k][id];
      if (!lv) { S[k][id] = rv; changed = true; continue; }
      const lu = +lv.u || 0;
      const ru = +rv.u || 0;
      if (ru === lu) continue;
      const bv = B?.[k]?.[id];
      if (bv) {
        const bu = +bv.u || 0;
        if (ru <= bu) continue;                          // en Drive no hay nada nuevo (o es una copia vieja): se queda lo de aquí
        S[k][id] = lu === bu ? rv : mergeRecord(lv, rv, bv);   // solo cambió el otro móvil, o cambiaron los dos
        changed = true;
      } else if (ru > lu) { S[k][id] = rv; changed = true; }
    }
  }
  const rs = remote.settings;
  if (rs) {
    const ls = S.settings;
    const lu = +ls.u || 0;
    const ru = +rs.u || 0;
    const bs = B?.settings;
    const bu = +bs?.u || 0;
    if (ru !== lu) {
      if (bs && ru > bu && lu !== bu) { S.settings = { ...merge3(ls, rs, bs, ru > lu), u: Math.max(ru, lu) + 1 }; changed = true; }
      else if (bs ? ru > bu : ru > lu) { S.settings = { ...ls, ...rs }; changed = true; }
    }
  }
  if ((remote.backupInfo?.u || 0) > (S.backupInfo?.u || 0)) {
    S.backupInfo = remote.backupInfo;
    changed = true;
  }
  // Conserva datos de versiones más nuevas de la app que esta todavía no conoce.
  for (const [k, v] of Object.entries(remote)) if (!(k in S)) S[k] = v;
  ensure();
  seen(S);
  return changed;
}

// ¿Hay algo aquí que Drive no tenga? (Después de fusionar, cualquier diferencia es un cambio de este móvil.)
export function newerThan(remote) {
  if (!remote) return true;
  for (const k of COLLECTIONS) {
    for (const [id, lv] of Object.entries(S[k])) {
      const rv = remote[k]?.[id];
      if (!rv || (+lv.u || 0) !== (+rv.u || 0)) return true;
    }
  }
  if ((S.backupInfo?.u || 0) > (remote.backupInfo?.u || 0)) return true;
  return (+S.settings.u || 0) !== (+remote.settings?.u || 0) || (remote.v || 1) < SCHEMA;
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

// ── Personas de casa y recetas favoritas (las ven los dos móviles) ──
export const people = () => alive(S.people).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'es'));
export function putPerson(p) {
  p.u = now();
  S.people[p.id] = p;
  commit();
}
export function deletePerson(id) {
  const t = now();
  S.people[id] = { id, del: true, u: t };
  for (const f of alive(S.recipeFavs)) if (f.personId === id) S.recipeFavs[f.id] = { id: f.id, del: true, u: t };
  commit();
}
const favKey = (rid, pid) => `${rid}|${pid}`;
export const isFav = (rid, pid) => { const f = S.recipeFavs[favKey(rid, pid)]; return !!(f && !f.del); };
export const favPeople = (rid) => people().filter((p) => isFav(rid, p.id));
export function toggleFav(rid, pid) {
  const id = favKey(rid, pid);
  S.recipeFavs[id] = isFav(rid, pid) ? { id, del: true, u: now() } : { id, recipeId: rid, personId: pid, u: now() };
  commit();
}
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

// Artículo del inventario que corresponde a un nombre (igual, o todas las palabras del artículo en el nombre).
const lw = (s) => norm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
export function guessProduct(name) {
  const w = new Set(lw(name));
  const ps = alive(S.products).filter((p) => !p.tupper);
  const exact = ps.find((p) => norm(p.name) === norm(name));
  if (exact) return exact.id;
  const cands = ps.filter((p) => { const pw = lw(p.name); return pw.length && pw.every((x) => w.has(x)); });
  cands.sort((a, b) => lw(b.name).length - lw(a.name).length);
  return cands[0]?.id || null;
}
let linkCache = null;
// Si un ingrediente no se vinculó a mano, se busca su artículo cada vez (así, al comprarlo, la receta lo ve).
function linkedProduct(ing) {
  if (ing.productId && S.products[ing.productId] && !S.products[ing.productId].del) return S.products[ing.productId];
  if (ing.productIdManual) return null;
  if (!linkCache) linkCache = new Map();
  const k = norm(ing.name);
  if (!linkCache.has(k)) linkCache.set(k, guessProduct(ing.name));
  const id = linkCache.get(k);
  return id ? S.products[id] : null;
}
// Estado de un ingrediente según lo que hay A MANO (la reserva no cuenta).
export function ingredientState(ing, factor = 1) {
  if (ing.basic) return { state: 'basic' };
  const p = linkedProduct(ing);
  const opt = !!ing.optional;
  if (!p) return { state: 'missing', unlinked: true, optional: opt };
  const have = atHand(p);
  const need = ing.qty ? convertQty(+ing.qty * factor, ing.unit || '', p.unit || 'ud') : null;
  if (have <= 0) return { state: 'missing', p, have, need, optional: opt, reserve: inReserve(p) };
  if (need !== null && have < need) return { state: 'short', p, have, need, optional: opt, reserve: inReserve(p) };
  return { state: 'ok', p, have, need, optional: opt };
}
// Colores de una receta: rojo si falta algún imprescindible; amarillo si faltan la mitad o más
// de los recomendados; verde en los demás casos. Los básicos (sal, agua…) no cuentan.
export function recipeStatus(r) {
  const ings = (r.ingredients || []).filter((i) => !i.basic);
  const ess = ings.filter((i) => !i.optional);
  const rec = ings.filter((i) => i.optional);
  const miss = (i) => { const s = ingredientState(i); return s.state === 'missing' || s.state === 'short'; };
  const missing = ess.filter(miss);
  const missingRec = rec.filter(miss);
  const level = missing.length ? 'many' : rec.length && missingRec.length * 2 >= rec.length ? 'few' : 'ok';
  return { n: missing.length, missing, missingRec, nRec: rec.length, level, empty: !ings.length };
}

// ── Notas de 0 a 10 de cada persona (o de la casa si no hay personas) ──
const rateKey = (rid, pid) => `${rid}|${pid}`;
export const rating = (rid, pid) => { const x = S.recipeRatings[rateKey(rid, pid)]; return x && !x.del ? x.value : null; };
export function setRating(rid, pid, value) {
  const id = rateKey(rid, pid);
  S.recipeRatings[id] = value === null || value === undefined ? { id, del: true, u: now() } : { id, recipeId: rid, personId: pid, value: +value, u: now() };
  commit();
}
export function ratingAvg(rid) {
  const vs = alive(S.recipeRatings).filter((x) => x.recipeId === rid && (x.personId === 'casa' || (S.people[x.personId] && !S.people[x.personId].del))).map((x) => +x.value);
  return vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 : null;
}

// ── Lo que más compráis: cuántas veces y cuándo se ha comprado cada cosa ──
export const freqKey = (productId, name) => (productId ? 'fp-' + productId : 'fn-' + hash(norm(name)));
export function recordPurchase(productId, name, undo = false) {
  const key = freqKey(productId, name);
  const t = now();
  const f = S.freq[key] && !S.freq[key].del ? S.freq[key] : { id: key, productId: productId || null, name, count: 0, times: [] };
  if (undo) {
    const last = f.times[f.times.length - 1];
    if (last && t - last < 3 * 3600e3) { f.times.pop(); f.count = Math.max(0, f.count - 1); }
  } else {
    f.count += 1;
    f.times = [...f.times, t].slice(-8);
  }
  f.name = name;
  f.u = t;
  S.freq[key] = f;
}
// Sugerencias: lo que toca volver a comprar (por su ritmo habitual) y lo más comprado.
export function frequentSuggestions(limit = 10) {
  const t = now();
  const onListKeys = new Set(alive(S.items).filter((it) => !it.done && !it.dismissed).map((it) => freqKey(it.productId, it.name)));
  return alive(S.freq)
    .filter((f) => f.count >= 2 && !onListKeys.has(f.id) && (!f.productId || (S.products[f.productId] && !S.products[f.productId].del)))
    .map((f) => {
      const ts = f.times;
      const gaps = ts.slice(1).map((x, i) => x - ts[i]).filter((g) => g > 12 * 3600e3);
      const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
      const since = t - ts[ts.length - 1];
      const due = avg ? since / avg : 0;
      return { ...f, avg, since, due };
    })
    .filter((f) => f.since > 12 * 3600e3)
    .sort((a, b) => (b.due >= 0.9) - (a.due >= 0.9) || b.due - a.due || b.count - a.count)
    .slice(0, limit);
}

// ── Tuppers: raciones que sobran al cocinar en cantidad ──
// Cada receta tiene un artículo «Tupper de …» (en raciones) con un lote por sitio y fecha.
export const tupperOf = (rid) => alive(S.products).find((p) => p.tupper && p.recipeId === rid) || null;
export const portionsOf = (rid) => { const p = tupperOf(rid); return p ? total(p) : 0; };
export const tuppers = () => alive(S.products).filter((p) => p.tupper && total(p) > 0 && S.recipes[p.recipeId] && !S.recipes[p.recipeId].del);
const findLoc = (re) => alive(S.locations).filter((l) => re.test(norm(l.name))).sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))[0]?.id || null;
export const freezerLoc = () => findLoc(/congel/);
export const fridgeLoc = () => findLoc(/nevera|frigo|refri/);
export function addMonths(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return ymd(new Date(y, m - 1 + n, Math.min(d, last)));
}
export function saveTupper(r, entries) {
  let p = tupperOf(r.id);
  if (!p) {
    p = { id: uid(), name: 'Tupper de ' + r.name, unit: 'rac', tupper: true, recipeId: r.id, restock: false, alerts: true, min: 0,
      variants: [], lots: [], tags: [ensureTag('Platos preparados', '🍱')].filter(Boolean), locationId: entries[0]?.locationId || null };
  } else p = clone(p);
  let n = 0;
  for (const e of entries) {
    if (!(+e.qty > 0)) continue;
    p.lots.push({ id: uid(), variantId: null, qty: round(e.qty), expiry: e.expiry || null, locationId: e.locationId || null });
    n += +e.qty;
  }
  if (!n) return null;
  mergeLots(p);
  putProduct(p);
  return p;
}

// ── Menú semanal: un registro por día y comida ──
export const menuKey = (date, slot) => `${date}|${slot}`;
export const menuEntry = (date, slot) => { const e = S.menu[menuKey(date, slot)]; return e && !e.del ? e : null; };
export function putMenu(date, slot, data) {
  const id = menuKey(date, slot);
  S.menu[id] = { id, date, slot, ...data, u: now() };
  commit();
}
export function clearMenu(date, slot) {
  const id = menuKey(date, slot);
  S.menu[id] = { id, del: true, u: now() };
  commit();
}
export function mondayOf(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = (dt.getDay() + 6) % 7;
  return ymd(new Date(y, m - 1, d - wd));
}
