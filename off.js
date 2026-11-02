// Busca un código de barras en Open Food Facts (base de datos pública y gratuita de productos).
import * as st from './store.js';
import { BASICOS } from './basicos.js';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_es,generic_name_es,brands,quantity,image_front_url,image_front_small_url,image_url';

// «LECHE SEMIDESNATADA» → «Leche semidesnatada»
function tidy(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function lookupBarcode(code) {
  if (!navigator.onLine || !/^\d{6,14}$/.test(String(code))) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    const p = j.product;
    const name = tidy(p.product_name_es || p.product_name || p.generic_name_es);
    if (!name) return null;
    return {
      name,
      brand: tidy(String(p.brands || '').split(',')[0]),
      quantity: String(p.quantity || '').trim(),
      image: p.image_front_url || p.image_url || p.image_front_small_url || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// La foto se intenta guardar; si el servidor no lo permite, se usa el enlace.
export async function fetchImage(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const b = await r.blob();
    return b.type.startsWith('image/') ? b : null;
  } catch {
    return null;
  }
}

// Básico que mejor encaja con un nombre comercial: «Leche semidesnatada» → Leche,
// «Garbanzo cocido Luengo» → Garbanzos cocidos.
const stem = (w) => w.replace(/(es|s)$/, '');
const words = (s) => st.norm(s).split(/[^a-z0-9ñ]+/).filter(Boolean).map(stem);
export function bestBasicFor(name) {
  const w = new Set(words(name));
  let best = null;
  for (const b of BASICOS) {
    const bw = words(b.name);
    if (bw.length && bw.every((x) => w.has(x)) && (!best || bw.length > words(best.name).length)) best = b;
  }
  return best;
}
