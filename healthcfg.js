// Ajustes de la puntuación de salud: cuánto pesa lo que suma y cuánto resta cada castigo.
// Son comunes a los dos móviles (se guardan con los datos, en Drive).
import * as st from './store.js';
import { h, openSheet, toast, nav } from './ui.js';
import { HEALTH_DEFAULTS, healthConfig, healthScore, recipeNutrition, isRedMeat, healthLevel } from './nutri.js';

const PLUS = [
  ['ppf', 'Proteína y fibra', 'Cuánta proteína y fibra hay por cada 100 kcal.'],
  ['pcg', 'Carga glucémica', 'Que los hidratos vengan con fibra (integrales, legumbre, verdura).'],
  ['lip', 'Grasas buenas', 'Más insaturadas que saturadas y buen equilibrio omega-6/omega-3.'],
  ['mic', 'Vitaminas y minerales', 'Potasio, magnesio, hierro y vitaminas A, C y E por cada caloría.'],
];
const MINUS = [
  ['naK', 'Más sodio que potasio', 'Resta esto si el plato lleva más sodio (sal, salsas saladas) que potasio.', 30],
  ['heat', 'Cocción a más de 180 °C', 'Cuánto cuenta lo que resta cada receta por cocinarse fuerte (plancha, brasa, fritura). 100 % es lo del documento.', 200, '%'],
  ['sat', 'Grasa saturada', 'Empieza a restar si pasa del 10 % de las calorías y resta todo al llegar al 20 %.', 40],
  ['processed', 'Embutidos y carnes procesadas', 'Chorizo, morcilla, panceta, jamón, lacón…: resta todo a partir de 30 g por ración.', 40],
  ['red', 'Carne roja', 'Recetas con «Carne roja» en el filtro Proteína (ternera, cerdo, cordero).', 30],
  ['kcal', 'Muchas calorías por ración', 'Empieza a restar a partir de 600 kcal y resta todo a partir de 900.', 30],
];
export const isDefaultHealth = (cfg = healthConfig()) => Object.keys(HEALTH_DEFAULTS).every((k) => +cfg[k] === HEALTH_DEFAULTS[k]);

// Recetas de ejemplo repartidas entre las de nota más baja y más alta, para ver el efecto al mover los ajustes.
function samples(cfg) {
  const xs = st.recipes().map((r) => {
    const n = recipeNutrition(r);
    if (!n) return null;
    const red = isRedMeat(r);
    return { r, n, red, before: healthScore(n, r.heat, { red }, cfg).score };
  }).filter(Boolean).sort((a, b) => a.before - b.before);
  if (xs.length <= 8) return xs;
  return [...Array(8)].map((_, i) => xs[Math.round((i * (xs.length - 1)) / 7)]);
}

export function openHealthSettings() {
  const saved = healthConfig();
  let cfg = { ...saved };
  const sample = samples(saved);
  const preview = h('div', { class: 'list hs-preview' });
  const totals = h('p', { class: 'hint' });
  const drawPreview = () => {
    const W = PLUS.reduce((a, [k]) => a + (+cfg[k] || 0), 0);
    totals.textContent = W ? `Lo que suma se reparte así: ${PLUS.map(([k, l]) => `${l.toLowerCase()} ${Math.round(((+cfg[k] || 0) * 100) / W)}`).join(', ')} (sobre 100).`
      : 'Si todo lo que suma está a 0, todas las recetas sacan 0.';
    preview.replaceChildren(...(sample.length ? sample.map(({ r, n, red, before }) => {
      const now = healthScore(n, r.heat, { red }, cfg).score;
      const d = now - before;
      return h('div', { class: 'row prev-row' },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.name)),
        h('span', { class: 'fact hs ' + healthLevel(before) }, before), h('span', { class: 'muted' }, '→'),
        h('span', { class: 'fact hs ' + healthLevel(now) }, now),
        h('small', { class: 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') }, d ? (d > 0 ? `+${d}` : `${d}`) : '='));
    }) : [h('p', { class: 'muted' }, 'Cuando haya recetas con nutrición, aquí verás cómo cambia su nota.')]));
  };
  const slider = (key, label, help, max, unit, minus) => {
    const out = h('b', {});
    const show = () => {
      out.textContent = unit === '%' ? `${cfg[key]} %` : minus ? (cfg[key] ? `−${cfg[key]}` : 'no resta') : `${cfg[key]}`;
      out.classList.toggle('zero', !+cfg[key]);
    };
    const input = h('input', { type: 'range', min: 0, max, step: 1, value: cfg[key], class: 'range', 'aria-label': label });
    input.addEventListener('input', () => { cfg = { ...cfg, [key]: +input.value }; show(); drawPreview(); });
    show();
    return h('div', { class: 'slider' + (minus ? ' minus' : '') },
      h('div', { class: 'slider-h' }, h('span', {}, label), out), input,
      h('small', { class: 'hint' }, help + (HEALTH_DEFAULTS[key] !== +cfg[key] ? '' : '')));
  };
  const s = openSheet('Puntuación de salud', () => {
    drawPreview();
    return [
      h('p', { class: 'muted' }, 'Elige cuánto pesa cada cosa. Vale para las recetas y para el balance del menú, y es igual en los dos móviles.'),
      h('h3', {}, 'Lo que suma'),
      PLUS.map(([k, l, help]) => slider(k, l, help, 50, '', false)),
      totals,
      h('h3', {}, 'Lo que resta'),
      MINUS.map(([k, l, help, max, unit]) => slider(k, l, help, max, unit, true)),
      h('h3', {}, 'Así cambian algunas de vuestras recetas'),
      preview,
      h('button', { class: 'btn primary block sticky-bottom', onclick: () => {
        st.putSettings({ health: { ...cfg } });
        s.close();
        toast(isDefaultHealth(cfg) ? 'Puntuación como en el documento' : 'Puntuación de salud ajustada');
      } }, 'Guardar'),
      h('button', { class: 'btn block', onclick: () => { cfg = { ...HEALTH_DEFAULTS }; s.refresh(); } }, 'Volver al criterio del documento'),
    ];
  });
}

nav.healthSettings = openHealthSettings;
