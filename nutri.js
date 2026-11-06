// Nutrición de las recetas, puntuación de salud (0–100) y balance de un día o una semana del menú.
// Los valores por ingrediente salen de tablas de composición (BEDCA/USDA) redondeadas: son estimaciones.
import * as st from './store.js';
import { FOODS } from './nutridb.js';

// Valores de referencia de nutrientes (VRN de la UE) para los 6 micronutrientes del criterio.
export const NRV = { potassium: 2000, magnesium: 375, iron: 14, vitA: 800, vitC: 80, vitE: 12 };
export const MICRO_NAMES = { potassium: 'Potasio', magnesium: 'Magnesio', iron: 'Hierro', vitA: 'Vitamina A', vitC: 'Vitamina C', vitE: 'Vitamina E' };
const KEYS = ['kcal', 'protein', 'carbs', 'fiber', 'fat', 'sat', 'mono', 'poly', 'o3', 'o6', 'sodium', 'potassium', 'magnesium', 'iron', 'vitA', 'vitC', 'vitE'];
// Gramos por unidad cuando el alimento no dice otra cosa.
const UNIT_G = { cda: 15, cdta: 5, taza: 240, vaso: 200, pizca: 0.5, diente: 5, lata: 400, manojo: 100, rodaja: 30, ud: 100 };

// ── Tabla de alimentos ──
// Cada fila: [nombre, alias[], 17 valores por 100 g en el orden de KEYS, { unidad: gramos, ml: densidad }]
const words = (s) => st.norm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
// Singular sencillo: «tomates» → «tomate», «limones» → «limón», «garbanzos» → «garbanzo».
const stem = (w) => {
  if (w.length <= 3 || !w.endsWith('s')) return w;
  const x = w.slice(0, -1);
  return x.endsWith('e') && /[nlrdzj]e$/.test(x) && x.length > 3 ? x.slice(0, -1) : x;
};
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = FOODS.map(([name, aliases, vals, units]) => {
    const per = Object.fromEntries(KEYS.map((k, i) => [k, vals[i] || 0]));
    const keys = [name, ...(aliases || [])].map((x) => st.norm(x));
    return { name, per, units: units || {}, processed: !!(units && units.proc), keys, kw: keys.map((k) => words(k).map(stem)) };
  });
  return INDEX;
}
const cache = new Map();
// Alimento de la tabla que corresponde a un ingrediente (por nombre exacto, alias o todas sus palabras).
export function foodFor(name) {
  const n = st.norm(name);
  if (!n) return null;
  if (cache.has(n)) return cache.get(n);
  const idx = index();
  let hit = idx.find((f) => f.keys.includes(n)) || null;
  if (!hit) {
    const w = new Set(words(n).map(stem));
    let best = 0;
    for (const f of idx) {
      for (const kw of f.kw) if (kw.length > best && kw.every((x) => w.has(x))) { best = kw.length; hit = f; }
    }
  }
  cache.set(n, hit);
  return hit;
}

// Gramos de un ingrediente (null si no se puede saber).
export function gramsOf(ing, food = foodFor(ing.name)) {
  const q = +ing.qty;
  const u = ing.unit || '';
  if (!q) return null;
  if (u === 'g') return q;
  if (u === 'kg') return q * 1000;
  if (u === 'ml') return q * (food?.units.ml || 1);
  if (u === 'l') return q * 1000 * (food?.units.ml || 1);
  const per = food?.units[u || 'ud'] ?? UNIT_G[u || 'ud'];
  return per ? q * per : null;
}

// Nutrición de UNA ración. Usa los valores escritos en la receta si los trae y el cálculo cubre poco.
export function recipeNutrition(r) {
  if (!r) return null;
  const serv = +r.servings || 1;
  const tot = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let known = 0;
  let unknown = 0;
  let processed = 0;
  const missing = [];
  for (const ing of r.ingredients || []) {
    const food = foodFor(ing.name);
    let g = gramsOf(ing, food);
    if (g === null && ing.basic && food && /^sal\b/.test(st.norm(ing.name))) g = serv; // sal «al gusto»: 1 g por ración
    if (g === null) { if (!ing.basic && !food?.trivial) missing.push(ing.name); continue; }
    if (!food) { unknown += g; missing.push(ing.name); continue; }
    known += g;
    if (food.processed) processed += g;
    for (const k of KEYS) tot[k] += (food.per[k] * g) / 100;
  }
  const coverage = known + unknown > 0 ? known / (known + unknown) : 0;
  const computed = Object.fromEntries(KEYS.map((k) => [k, tot[k] / serv]));
  const explicit = r.nutrition && +r.nutrition.kcal > 0 ? r.nutrition : null;
  if (explicit && (coverage < 0.85 || missing.length > 2)) {
    return { ...Object.fromEntries(KEYS.map((k) => [k, +explicit[k] || 0])), processed: processed / serv, source: 'receta', coverage, missing: [] };
  }
  if (!(computed.kcal > 0) || coverage < 0.5) return explicit ? { ...explicit, processed: processed / serv, source: 'receta', coverage, missing: [] } : null;
  return { ...computed, processed: processed / serv, source: 'calculado', coverage, missing };
}

// ── Puntuación de salud (0–100), según el criterio del recetario y ajustable ──
// Lo que suma: cuatro factores con su peso (por defecto 30 + 25 + 25 + 20 = 100). Si se cambian los pesos,
// el total se reescala para que siga yendo de 0 a 100.
// Lo que resta: sodio > potasio y cocción a más de 180 °C (como en el documento) y, si se activan,
// grasa saturada, embutidos y carnes procesadas, carne roja y platos muy calóricos.
export const HEALTH_DEFAULTS = { ppf: 30, pcg: 25, lip: 25, mic: 20, naK: 10, heat: 100, sat: 0, processed: 0, red: 0, kcal: 0 };
export const healthConfig = () => ({ ...HEALTH_DEFAULTS, ...(st.S?.settings?.health || {}) });
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// ¿Es de carne roja? (según su filtro «Proteína»)
export function isRedMeat(r) {
  const gr = st.recipeGroups().find((g) => st.norm(g.name) === 'proteina');
  if (!gr || !r) return false;
  return (r.cats?.[gr.id] || []).some((oid) => st.norm(gr.options.find((o) => o.id === oid)?.name || '') === 'carne roja');
}
export function healthScore(n, heat = 0, { red = false } = {}, cfg = healthConfig()) {
  if (!n || !(n.kcal > 0)) return null;
  const per100kcal = n.kcal / 100;
  // Densidad proteico-fibrosa: (proteína + 2·fibra) por 100 kcal; el máximo se alcanza con 8.
  const fPpf = clamp01((n.protein + 2 * n.fiber) / per100kcal / 8);
  // Cinética glucémica: R = hidratos netos / fibra; entero si R ≤ 5 y −6 % por cada unidad más.
  const R = n.fiber > 0 ? n.carbs / n.fiber : n.carbs > 1 ? Infinity : 0;
  const fPcg = clamp01((25 - 1.5 * Math.max(0, R - 5)) / 25);
  // Perfil lipídico: 15/25 si insaturadas/saturadas ≥ 2; 10/25 si omega-6/omega-3 ≤ 4.
  const unsat = n.mono + n.poly;
  const lipA = n.sat <= 0.05 ? unsat >= 0 : unsat / n.sat >= 2;
  const lipB = n.o3 > 0 ? n.o6 / n.o3 <= 4 : n.o6 < 0.05;
  const fLip = ((lipA ? 15 : 0) + (lipB ? 10 : 0)) / 25;
  // Densidad micronutricional: media del % de VRN (cada uno hasta 100 %) por cada 10 % de las kcal del día; entero con 20.
  const micro = Object.fromEntries(Object.entries(NRV).map(([k, v]) => [k, Math.min(100, (n[k] / v) * 100)]));
  const avg = Object.values(micro).reduce((a, b) => a + b, 0) / 6;
  const fMic = clamp01(avg / (n.kcal / 200) / 20);
  const W = (+cfg.ppf || 0) + (+cfg.pcg || 0) + (+cfg.lip || 0) + (+cfg.mic || 0);
  const k = W > 0 ? 100 / W : 0;
  const max = { ppf: cfg.ppf * k, pcg: cfg.pcg * k, lip: cfg.lip * k, mic: cfg.mic * k };
  const ppf = fPpf * max.ppf;
  const pcg = fPcg * max.pcg;
  const plip = fLip * max.lip;
  const pmic = fMic * max.mic;
  // Lo que resta
  const naK = n.potassium > 0 ? n.sodium / n.potassium : n.sodium > 0 ? Infinity : 0;
  const satE = (n.sat * 9 * 100) / n.kcal;
  const pen = {
    naK: naK > 1 ? +cfg.naK || 0 : 0,
    heat: ((+heat || 0) * (+cfg.heat || 0)) / 100,
    sat: (+cfg.sat || 0) * clamp01((satE - 10) / 10),
    processed: (+cfg.processed || 0) * clamp01((n.processed || 0) / 30),
    red: red ? +cfg.red || 0 : 0,
    kcal: (+cfg.kcal || 0) * clamp01((n.kcal - 600) / 300),
  };
  const fdeg = Object.values(pen).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.round(ppf + pcg + plip + pmic - fdeg));
  return { score, ppf, pcg, plip, pmic, fdeg, pen, max, R, naK, satE, micro, lipA, lipB, heat: +heat || 0 };
}

export const recipeHealth = (r) => healthScore(recipeNutrition(r), r?.heat, { red: isRedMeat(r) });
export const healthLevel = (s) => (s === null || s === undefined ? '' : s >= 75 ? 'ok' : s >= 50 ? 'mid' : 'bad');

// ── Balance de un día (o de varios) a partir de los platos ──
// Todo va en proporciones (por cada 1000 kcal o % de energía), así que vale aunque solo
// estén planificadas la comida y la cena.
const band = (x, lo, hi, lo0, hi0) => (x >= lo && x <= hi ? 100 : x < lo ? Math.max(0, (100 * (x - lo0)) / (lo - lo0)) : Math.max(0, (100 * (hi0 - x)) / (hi0 - hi)));
export function balance(items) {
  // items: [{ n: nutrición de una ración, health: puntuación }]
  const xs = items.filter((x) => x.n && x.n.kcal > 0);
  if (!xs.length) return null;
  const sum = Object.fromEntries(KEYS.map((k) => [k, xs.reduce((a, x) => a + (x.n[k] || 0), 0)]));
  const kcal = sum.kcal;
  const quality = xs.reduce((a, x) => a + (x.health ?? 50) * x.n.kcal, 0) / kcal;
  const pE = (sum.protein * 4 * 100) / kcal;
  const fE = (sum.fat * 9 * 100) / kcal;
  const cE = (sum.carbs * 4 * 100) / kcal;
  const sE = (sum.sat * 9 * 100) / kcal;
  const fib = (sum.fiber * 1000) / kcal;
  const na = (sum.sodium * 1000) / kcal;
  const crit = [
    { key: 'protein', name: 'Proteína', value: `${Math.round(pE)} % de la energía`, ok: '15–25 %', s: band(pE, 15, 25, 8, 40),
      tip: pE < 15 ? 'Poca proteína: añade legumbre, huevo, pescado o carne magra.' : 'Mucha proteína: cambia algún plato por verdura o cereal integral.' },
    { key: 'carbs', name: 'Hidratos', value: `${Math.round(cE)} %`, ok: '40–60 %', s: band(cE, 40, 60, 20, 75),
      tip: cE < 40 ? 'Pocos hidratos: acompaña con arroz o pasta integral, patata o pan.' : 'Muchos hidratos: añade verdura y proteína.' },
    { key: 'fat', name: 'Grasas', value: `${Math.round(fE)} %`, ok: '20–35 %', s: band(fE, 20, 35, 10, 50),
      tip: fE > 35 ? 'Muchas grasas: mide el aceite y las salsas.' : 'Pocas grasas: un chorrito de aceite de oliva o frutos secos.' },
    { key: 'sat', name: 'Grasas saturadas', value: `${Math.round(sE)} %`, ok: 'menos del 10 %', s: band(sE, 0, 10, -1, 20),
      tip: 'Muchas saturadas: menos nata, queso curado, embutido y carne grasa.' },
    { key: 'fiber', name: 'Fibra', value: `${Math.round(fib)} g por 1000 kcal`, ok: '14 g o más', s: band(fib, 14, 1e9, 4, 1e9),
      tip: 'Falta fibra: más verdura, legumbre, fruta o integrales.' },
    { key: 'sodium', name: 'Sal (sodio)', value: `${Math.round(na)} mg por 1000 kcal`, ok: 'hasta 1000 mg', s: band(na, 0, 1000, -1, 2500),
      tip: 'Mucha sal: menos salsa de soja, embutido, conservas saladas y caldos de pastilla.' },
  ];
  const macro = crit.reduce((a, c) => a + c.s, 0) / crit.length;
  return { score: Math.round(0.4 * quality + 0.6 * macro), quality: Math.round(quality), crit, sum, kcal, n: xs.length };
}

// Variedad de la semana (recomendaciones AESAN), según el filtro «Proteína» de cada receta.
export function variety(dishRecipes) {
  const gr = st.recipeGroups().find((g) => st.norm(g.name) === 'proteina');
  if (!gr) return null;
  const count = (names) => dishRecipes.filter((r) => (r.cats?.[gr.id] || []).some((oid) => names.includes(st.norm(gr.options.find((o) => o.id === oid)?.name || '')))).length;
  const legumes = count(['legumbres']);
  const fish = count(['pescado blanco', 'pescado azul', 'marisco']);
  const oily = count(['pescado azul']);
  const red = count(['carne roja']);
  const meat = red + count(['ave']);
  const checks = [
    { name: 'Legumbres', value: legumes, ok: '4 o más', s: Math.min(100, legumes * 25) },
    { name: 'Pescado y marisco', value: fish, ok: '3 o más (alguno azul)', s: Math.min(100, fish * 33.4) - (fish >= 3 && !oily ? 15 : 0) },
    { name: 'Carne roja', value: red, ok: 'como mucho 2', s: red <= 2 ? 100 : Math.max(0, 100 - (red - 2) * 34) },
    { name: 'Carne en total', value: meat, ok: 'como mucho 4', s: meat <= 4 ? 100 : Math.max(0, 100 - (meat - 4) * 25) },
  ];
  return { checks, score: Math.round(checks.reduce((a, c) => a + c.s, 0) / checks.length) };
}

export const fmtG = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10).toString().replace('.', ',');
