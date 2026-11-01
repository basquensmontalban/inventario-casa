// Ajustes de ESTE móvil (cada móvil tiene los suyos). Se guardan en el móvil y en Drive.
import { kvGet, kvSet } from './db.js';
import { uid } from './store.js';

export const DEFAULTS = {
  // General
  name: '',
  startTab: 'inv',            // inv | shop | recipes | stores
  tabs: { shop: true, recipes: true, stores: true },
  theme: 'auto',              // auto | light | dark
  fontScale: 1,               // 1 | 1.1 | 1.2
  vibrate: true,              // vibrar al leer un código

  // Inventario
  defaultLocationId: null,    // ubicación preferida al crear artículos
  stockLoc: 'product',        // al añadir existencias: product (habitual del artículo) | device (la preferida)
  invSort: 'name',            // name | location | expiry | qty
  invShowEmpty: true,         // mostrar artículos agotados
  invFilters: { loc: true, tag: true, store: true, soon: true, low: true, empty: true, reserve: true, critical: true },
  newUnit: 'ud',              // valores para artículos nuevos
  newRestock: true,
  newAlerts: true,
  newListId: '',

  // Compra
  shopList: '__all',          // lista al abrir
  shopStore: '',              // tienda filtrada al abrir
  shopUnassigned: true,       // al filtrar por tienda, mostrar lo que no tiene tienda
  shopAskOnBuy: true,         // al marcar comprado: preguntar cantidad y caducidad
  shopSort: 'name',           // name | location
  copyQty: true,
  copyBrand: false,
  copyTitle: true,
  copyBullet: '- ',

  // Recetas
  recOrangeMax: 2,            // naranja si faltan como mucho N ingredientes
  recSort: 'avail',           // avail | name | time
  recFilters: { avail: true, time: true, ing: true, sort: true },
  recHiddenGroups: [],        // grupos de filtros que no se muestran
  recServings: 2,
  recListId: '',
  recListMode: 'missing',     // missing | all

  // Tiendas
  storesDefault: '',          // '' = la que tenga más cosas pendientes
  storesSugg: true,
  storesCrit: { empty: true, below: true, expiring: true },
};

export let D = null;
const listeners = new Set();
export const onDeviceChange = (fn) => listeners.add(fn);

function guessName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'Este dispositivo';
}

// Completa con los valores por defecto (también dentro de los objetos anidados).
function withDefaults(o) {
  const out = { ...DEFAULTS, ...(o || {}) };
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...v, ...((o || {})[k] || {}) };
  }
  return out;
}

export async function loadDevice() {
  D = withDefaults(await kvGet('device'));
  if (!D.id) {
    D.id = uid();
    D.name = D.name || guessName();
    D.u = Date.now();
    await kvSet('device', D);
  }
}

export function setDevice(patch) {
  Object.assign(D, patch, { u: Date.now() });
  kvSet('device', D);
  listeners.forEach((f) => f());
}

// Cambia una opción dentro de un objeto anidado, p. ej. setDeviceIn('invFilters', 'tag', false).
export function setDeviceIn(group, key, value) {
  setDevice({ [group]: { ...D[group], [key]: value } });
}

// Aplica una configuración recuperada (se mantiene el identificador de este móvil).
export function applyDevice(settings) {
  const { id, u, ...rest } = settings || {};
  const keepName = D.name;
  setDevice({ ...withDefaults(rest), name: rest.name || keepName });
}

export function resetDevice() {
  const { id, name } = D;
  setDevice({ ...withDefaults({}), id, name });
}
