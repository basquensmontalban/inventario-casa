// Ajustes de ESTE móvil (cada móvil tiene los suyos). Se guardan en el móvil y en Drive.
import { kvGet, kvSet } from './db.js';
import { uid } from './store.js';

const DEFAULTS = {
  name: '',
  defaultLocationId: null, // ubicación preferida al crear artículos
  startTab: 'inv',         // pestaña al abrir: inv | shop
  copyQty: true,           // al copiar una lista: incluir cantidades
  copyBrand: false,        // … incluir la marca favorita
  copyTitle: true,         // … incluir el nombre de la lista
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

export async function loadDevice() {
  D = { ...DEFAULTS, ...((await kvGet('device')) || {}) };
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

// Aplica una configuración recuperada (se mantiene el identificador de este móvil).
export function applyDevice(settings) {
  const { id, u, ...rest } = settings || {};
  setDevice({ ...DEFAULTS, ...rest });
}
