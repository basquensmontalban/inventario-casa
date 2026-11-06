// Menú semanal: qué se come cada día. Cada comida puede tener varios platos (entrante, primero,
// segundo, postre…), cada uno una receta o un texto libre. Desde aquí se apuntan en la lista de la compra
// los ingredientes de un plato, de una comida, de un día o de toda la semana (sumados y restando lo que hay).
import * as st from './store.js';
import { S, uid } from './store.js';
import { D, setDevice } from './device.js';
import { h, icon, inp, select, toggle, num, openSheet, toast, copyText } from './ui.js';
import { fmtAmount, openRecipe, cookSheet } from './recipes.js';
import { findBasic } from './productdb.js';
import { recipeNutrition, healthScore, balance, variety, healthLevel, isRedMeat, fmtG } from './nutri.js';

export const SLOTS = { desayuno: 'Desayuno', comida: 'Comida', merienda: 'Merienda', cena: 'Cena' };
const ORDER = ['desayuno', 'comida', 'merienda', 'cena'];
export const COURSES = [['entrante', 'Entrante'], ['primero', 'Primero'], ['segundo', 'Segundo'], ['guarnicion', 'Guarnición'], ['postre', 'Postre']];
const COURSE_NAME = Object.fromEntries(COURSES);
const COURSE_RANK = Object.fromEntries(COURSES.map(([k], i) => [k, i]));
// Tipo de plato de la receta → plato del menú
const COURSE_BY_TYPE = {
  entrante: 'entrante', entrantes: 'entrante', aperitivo: 'entrante', primero: 'primero', 'primer plato': 'primero',
  segundo: 'segundo', 'segundo plato': 'segundo', 'plato principal': 'segundo', principal: 'segundo',
  guarnicion: 'guarnicion', acompanamiento: 'guarnicion', postre: 'postre', postres: 'postre',
};
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const LEVEL = { ok: 'ok', few: 'mid', many: 'bad' };

let week = null; // lunes de la semana que se ve (AAAA-MM-DD)

export const menuSlots = () => ORDER.filter((s) => (D.menuSlots || ['comida', 'cena']).includes(s));
const parts = (d) => d.split('-').map(Number);
const dayIdx = (d) => { const [y, m, dd] = parts(d); return (new Date(y, m - 1, dd).getDay() + 6) % 7; };
const dayNum = (d) => { const [, m, dd] = parts(d); return `${dd} ${MONTHS[m - 1]}`; };
const dayName = (d) => `${DAYS[dayIdx(d)]} ${dayNum(d)}`;
function weekLabel(mon) {
  const sun = st.addDays(mon, 6);
  const [, m1, d1] = parts(mon);
  const [, m2, d2] = parts(sun);
  return m1 === m2 ? `${d1}–${d2} ${MONTHS[m2 - 1]}` : `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]}`;
}
const recipeById = (id) => (id && S.recipes[id] && !S.recipes[id].del ? S.recipes[id] : null);
const factorOf = (x, r) => (x.servings && +r.servings ? x.servings / +r.servings : 1);
const dishName = (x) => recipeById(x.recipeId)?.name || (x.recipeName ? `${x.recipeName} (receta borrada)` : x.text || '');

// Platos de una comida (las comidas guardadas por la v1.7 tenían un solo plato).
export function dishesOf(e) {
  if (!e) return [];
  if (Array.isArray(e.dishes)) return e.dishes;
  if (e.recipeId || e.text) {
    return [{ id: 'd0', recipeId: e.recipeId || null, recipeName: e.recipeName || null, text: e.recipeId ? null : e.text || null,
      note: e.recipeId ? e.text || null : null, servings: e.servings || null, cooked: !!e.cooked, course: '' }];
  }
  return [];
}
const sortDishes = (ds) => [...ds].sort((a, b) => (COURSE_RANK[a.course] ?? 99) - (COURSE_RANK[b.course] ?? 99));
function saveDishes(d, s, dishes) {
  if (!dishes.length) { st.clearMenu(d, s); return; }
  const ds = sortDishes(dishes);
  // «text» resume los platos para que un móvil con la versión anterior lo siga viendo.
  st.putMenu(d, s, { dishes: ds, text: ds.map(dishName).join(' · ') });
}
// Tipo de plato de una receta (según su filtro «Tipo de plato»), para ordenarla en el menú.
export function courseFor(r) {
  for (const gr of st.recipeGroups()) {
    for (const oid of r?.cats?.[gr.id] || []) {
      const o = gr.options.find((x) => x.id === oid);
      const k = o && COURSE_BY_TYPE[st.norm(o.name)];
      if (k) return k;
    }
  }
  return '';
}
const newDish = (r, text = null, course = null) => ({
  id: uid(), recipeId: r?.id || null, recipeName: r?.name || null, text: r ? null : text, note: null,
  servings: null, cooked: false, course: course ?? (r ? courseFor(r) : ''),
});
// Plato que sale de un tupper: no hace falta comprar nada; al comerlo se descuentan las raciones.
const tupperDish = (r, course = null) => {
  const left = st.portionsOf(r.id);
  return { ...newDish(r, null, course), tupper: true, servings: Math.max(1, Math.min(left || 1, st.people().length || 2)) };
};
// Saca las raciones del tupper (las que haya, como mucho).
function eatFromTupper(x, r) {
  const tp = st.tupperOf(r.id);
  const want = x.servings || 1;
  const have = tp ? st.total(tp) : 0;
  if (tp && have > 0) st.consume(S.products[tp.id], Math.min(want, have));
  return { took: Math.min(want, have), left: Math.max(0, have - want) };
}

// Interruptores de qué comidas se planifican (en este móvil).
export function slotToggles() {
  return ORDER.map((s) => toggle(SLOTS[s], menuSlots().includes(s), null, (v) => {
    const set = new Set(menuSlots());
    if (v) set.add(s); else set.delete(s);
    if (!set.size) set.add('comida');
    setDevice({ menuSlots: ORDER.filter((x) => set.has(x)) });
  }));
}

// Todos los platos de unos días: [{ d, s, dish }]
const dishesIn = (days, slots) => days.flatMap((d) => slots.flatMap((s) => dishesOf(st.menuEntry(d, s)).map((dish) => ({ d, s, dish }))));
const withRecipes = (xs) => xs.filter((x) => recipeById(x.dish.recipeId) && !x.dish.cooked && !x.dish.tupper);

// ── Vista de la semana ──
export function renderMenu(box) {
  if (!box) return;
  const t = st.today();
  if (!week) week = st.mondayOf(t);
  const days = [...Array(7)].map((_, i) => st.addDays(week, i));
  const slots = menuSlots();
  const planned = dishesIn(days, slots);
  const go = (n) => { week = n === 0 ? st.mondayOf(t) : st.addDays(week, n); renderMenu(box); };
  const current = week === st.mondayOf(t);

  box.replaceChildren(...[
    h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Semana anterior', onclick: () => go(-7) }, '‹'),
      h('div', { class: 'week-title' }, h('b', {}, weekLabel(week)),
        current ? h('small', {}, 'Esta semana') : h('button', { class: 'linkbtn', onclick: () => go(0) }, 'Volver a esta semana')),
      h('button', { class: 'icon-btn', 'aria-label': 'Semana siguiente', onclick: () => go(7) }, '›')),
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn small primary', disabled: !withRecipes(planned).length, onclick: () => listSheet({ title: 'Lista de la semana', days, slots }) }, icon('cart'), 'Lista de la semana'),
      h('button', { class: 'btn small', disabled: !planned.length, onclick: async () => toast((await copyText(menuText(days, slots))) ? 'Menú copiado' : 'No se pudo copiar') }, icon('copy'), 'Copiar menú'),
      h('button', { class: 'btn small', onclick: () => openSheet('Comidas del menú', () => [
        h('p', { class: 'muted' }, 'Qué comidas del día quieres planificar (en este móvil).'), ...slotToggles()]) }, '⚙ Comidas')),
    weekCard(days, slots),
    h('div', { class: 'week' }, days.map((d) => {
      const dayHas = withRecipes(dishesIn([d], slots)).length;
      const bal = dayBalance(d, slots);
      return h('div', { class: 'day' + (d === t ? ' today' : '') + (d < t ? ' past' : '') },
        h('div', { class: 'day-h' }, h('b', {}, DAYS[dayIdx(d)]),
          bal ? h('button', { class: 'day-score ' + healthLevel(bal.score), title: 'Balance del día', onclick: () => balanceSheet(`Balance del ${dayName(d).toLowerCase()}`, bal) }, `${bal.score}`) : null,
          h('small', {}, d === t ? 'Hoy · ' + dayNum(d) : dayNum(d)),
          dayHas ? h('button', { class: 'icon-btn day-cart', 'aria-label': 'Apuntar los ingredientes de este día', title: 'Apuntar los ingredientes de este día',
            onclick: () => listSheet({ title: `Ingredientes del ${dayName(d).toLowerCase()}`, days: [d], slots }) }, icon('cart')) : null),
        slots.map((s) => mealBtn(d, s)));
    })),
    !planned.length ? h('p', { class: 'hint' }, 'Toca una comida para poner uno o varios platos (entrante, primero, segundo, postre…). Luego, «Lista de la semana» apunta lo que falta.') : null,
  ].filter(Boolean));
}

function mealBtn(d, s) {
  const ds = dishesOf(st.menuEntry(d, s));
  const lines = ds.map((x) => {
    const r = recipeById(x.recipeId);
    const lvl = r ? LEVEL[st.recipeStatus(r, +D.recOrangeMax || 2).level] : null;
    return h('span', { class: 'dish-line' },
      x.cooked ? h('span', { class: 'meal-done' }, '✓') : x.tupper && r ? h('span', { class: 'meal-tup', title: 'Del tupper' }, '🫙') : r ? h('span', { class: 'dot ' + lvl }) : h('span', { class: 'dot' }),
      h('span', { class: 'dish-txt' }, h('span', { class: 'meal-name' }, dishName(x)),
        x.course && ds.length > 1 ? h('small', {}, COURSE_NAME[x.course]) : null,
        x.servings ? h('small', {}, `${x.servings} rac.`) : null));
  });
  return h('button', { class: 'meal' + (ds.length ? '' : ' empty'), onclick: () => mealSheet(d, s) },
    h('span', { class: 'meal-slot' }, SLOTS[s]),
    h('span', { class: 'meal-main' }, ds.length ? lines : h('span', { class: 'meal-add' }, '+ Añadir')));
}

// ── Balance nutricional (por persona: una ración de cada plato) ──
function dishData(dishes) {
  const out = [];
  let without = 0;
  for (const x of dishes) {
    const r = recipeById(x.recipeId);
    const n = r ? recipeNutrition(r) : null;
    if (!n) { without++; continue; }
    out.push({ n, health: healthScore(n, r.heat, { red: isRedMeat(r) })?.score ?? null, r });
  }
  return { items: out, without };
}
function dayBalance(d, slots) {
  const { items, without } = dishData(dishesIn([d], slots).map((x) => x.dish));
  const b = balance(items);
  return b ? { ...b, without } : null;
}
function weekBalance(days, slots) {
  const ds = days.map((d) => dayBalance(d, slots)).filter(Boolean);
  if (!ds.length) return null;
  const all = dishData(dishesIn(days, slots).map((x) => x.dish));
  const v = all.items.length >= 8 ? variety(all.items.map((x) => x.r)) : null;
  const dayAvg = ds.reduce((a, b) => a + b.score, 0) / ds.length;
  const score = Math.round(v ? 0.7 * dayAvg + 0.3 * v.score : dayAvg);
  return { score, dayAvg: Math.round(dayAvg), days: ds.length, variety: v, total: balance(all.items), without: all.without };
}
function weekCard(days, slots) {
  const w = weekBalance(days, slots);
  if (!w) return null;
  return h('button', { class: 'week-score ' + healthLevel(w.score), onclick: () => balanceSheet('Balance de la semana', w.total, w) },
    h('span', { class: 'hs-num' }, w.score),
    h('span', { class: 'ws-main' }, h('b', {}, 'Balance de la semana'),
      h('small', {}, `${w.days} día${w.days === 1 ? '' : 's'} con datos${w.variety ? ` · variedad ${w.variety.score}` : ''} · toca para ver el detalle`)));
}
function balanceSheet(title, b, w = null) {
  const lvl = (s) => (s >= 75 ? 'ok' : s >= 50 ? 'mid' : 'bad');
  const crit = (name, value, ok, s, tip) => h('div', { class: 'crit ' + lvl(s) },
    h('div', { class: 'crit-h' }, h('span', {}, name), h('b', {}, value)),
    h('div', { class: 'bar' }, h('span', { style: `width:${Math.round(s)}%` })),
    h('small', { class: 'hint' }, `Recomendado: ${ok}${s < 75 && tip ? ' · ' + tip : ''}`));
  const per = b.n ? b.sum : null;
  openSheet(title, () => [
    h('div', { class: 'hs-box big ' + healthLevel(w ? w.score : b.score) },
      h('span', { class: 'hs-num' }, w ? w.score : b.score),
      h('span', {}, h('b', {}, w ? 'Semana' : 'Día'), h('small', {}, ' de 100'))),
    w ? h('p', { class: 'hint' }, `Media de los días: ${w.dayAvg}${w.variety ? ` · variedad: ${w.variety.score} (cuenta un 30 %)` : ' · la variedad se valora a partir de 8 platos con receta'}.`) : null,
    h('h3', {}, 'Calidad de los platos'),
    crit('Salud media de las recetas', `${b.quality} / 100`, '75 o más', b.quality, 'cambia algún plato por otro con más verdura, legumbre o pescado'),
    h('h3', {}, 'Reparto' + (w ? ' (toda la semana)' : '')),
    b.crit.map((c) => crit(c.name, c.value, c.ok, c.s, c.tip)),
    w?.variety ? [h('h3', {}, 'Variedad de la semana'), w.variety.checks.map((c) => crit(c.name, `${c.value} plato${c.value === 1 ? '' : 's'}`, c.ok, c.s, ''))] : null,
    per ? h('div', { class: 'nut-grid', style: 'margin-top:14px' },
      ...[[Math.round(per.kcal), 'kcal', 'Energía'], [fmtG(per.protein), 'g', 'Proteína'], [fmtG(per.carbs), 'g', 'Hidratos'], [fmtG(per.fat), 'g', 'Grasas'], [fmtG(per.fiber), 'g', 'Fibra']]
        .map(([v, u, l]) => h('div', { class: 'nut' }, h('b', {}, v), h('small', {}, u), h('span', {}, l)))) : null,
    h('p', { class: 'hint' }, `Por persona, contando una ración de cada plato${w ? ' de toda la semana' : ''}. Se valora en proporciones, así que sirve aunque solo planifiquéis comida y cena. Son estimaciones a partir de los ingredientes.`
      + ((w ? w.without : b.without) ? ` Hay ${w ? w.without : b.without} plato${(w ? w.without : b.without) === 1 ? '' : 's'} sin datos (texto libre o receta sin cantidades).` : '')),
  ]);
}

// ── Una comida: sus platos y añadir más ──
function mealSheet(d, s) {
  let ds = dishesOf(st.menuEntry(d, s)).map((x) => ({ ...x }));
  let course = '';
  let q = '';
  const persist = () => { saveDishes(d, s, ds); drawDishes(); drawTup(); };
  const dishesBox = h('div', { class: 'dishes' });
  const listBox = h('div', { class: 'list rec-pick' });
  const courseBox = h('div', { class: 'chips wrap course-pick' });
  const search = h('input', { type: 'search', class: 'inp', placeholder: 'Buscar receta…', autocomplete: 'off' });
  const text = inp({ placeholder: 'O escribe un plato (sobras, pizza, ensalada…)', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const footer = h('div');

  const NEXT = { entrante: 'primero', primero: 'segundo', segundo: 'postre', guarnicion: 'postre', postre: '' };
  const add = (r, tx, fromTupper = false) => {
    const x = fromTupper ? tupperDish(r, course || null) : newDish(r, tx, course || null);
    ds.push(x);
    ds = sortDishes(ds);
    persist();
    toast(`Añadido: ${dishName(x)}${x.tupper ? ' (del tupper)' : x.course ? ' (' + COURSE_NAME[x.course].toLowerCase() + ')' : ''}`);
    // Para ir seguido: después del entrante, el primero; después del primero, el segundo…
    course = course ? NEXT[course] : '';
    drawCourse();
    drawList();
  };
  // Lo que hay guardado en tuppers, para ponerlo con un toque.
  const tupBox = h('div', { class: 'tup-pick' });
  const drawTup = () => {
    const used = new Set(ds.filter((x) => x.tupper && !x.cooked).map((x) => x.recipeId));
    const tps = st.tuppers().filter((p) => !used.has(p.recipeId));
    tupBox.replaceChildren(...(tps.length ? [h('div', { class: 'lbl' }, '🫙 De lo que tenéis guardado'),
      h('div', { class: 'chips wrap' }, tps.map((p) => {
        const r = recipeById(p.recipeId);
        return h('button', { type: 'button', class: 'chip tup', onclick: () => add(r, null, true) }, r.name, h('small', {}, ` ${st.fmtNum(st.total(p))} rac.`));
      }))] : []));
  };
  const drawCourse = () => courseBox.replaceChildren(
    h('button', { type: 'button', class: 'chip' + (!course ? ' on' : ''), onclick: () => { course = ''; drawCourse(); } }, 'Automático'),
    ...COURSES.map(([k, n]) => h('button', { type: 'button', class: 'chip' + (course === k ? ' on' : ''), onclick: () => { course = k; drawCourse(); } }, n)));
  const drawList = () => {
    const nq = st.norm(q);
    const rank = { ok: 0, few: 1, many: 2 };
    const rs = st.recipes()
      .filter((r) => !nq || st.norm(r.name + ' ' + (r.ingredients || []).map((i) => i.name).join(' ')).includes(nq))
      .map((r) => ({ r, s: st.recipeStatus(r, +D.recOrangeMax || 2), c: courseFor(r) }))
      .sort((a, b) => (course ? (b.c === course) - (a.c === course) : 0) || rank[a.s.level] - rank[b.s.level] || a.r.name.localeCompare(b.r.name, 'es'))
      .slice(0, 40);
    listBox.replaceChildren(...(rs.length ? rs.map(({ r, s: stt, c }) => h('button', { class: 'row', onclick: () => add(r) },
      h('span', { class: 'dot ' + LEVEL[stt.level] }),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.name),
        h('div', { class: 'row-sub' }, [c ? COURSE_NAME[c] : null, stt.n ? `Falta${stt.n > 1 ? 'n' : ''} ${stt.n}` : 'Tienes todo'].filter(Boolean).join(' · '))),
      h('span', { class: 'qa-plus' }, '+')))
      : [h('p', { class: 'muted' }, st.recipes().length ? 'Ninguna receta con ese nombre.' : 'Todavía no hay recetas: escribe el plato.')]));
  };
  const drawDishes = () => {
    dishesBox.replaceChildren(...(ds.length ? ds.map((x) => dishCard(x)) : [h('p', { class: 'muted' }, 'Todavía no hay nada. Añade uno o varios platos.')]));
    footer.replaceChildren(...[
      withRecipes(ds.map((dish) => ({ dish }))).length
        ? h('button', { class: 'btn primary block', onclick: () => listSheet({ title: `Ingredientes · ${SLOTS[s].toLowerCase()} del ${dayName(d).toLowerCase()}`, items: ds.map((dish) => ({ d, s, dish })) }) },
          icon('cart'), ds.length > 1 ? 'Apuntar los ingredientes de esta comida' : 'Apuntar los ingredientes')
        : null,
      ds.length ? h('button', { class: 'btn block danger', onclick: () => { if (!confirm('¿Quitar todos los platos de esta comida?')) return; ds = []; persist(); sh.close(); toast('Comida vaciada'); } }, 'Quitar toda la comida') : null,
    ].filter(Boolean));
  };
  const dishCard = (x) => {
    const r = recipeById(x.recipeId);
    const cSel = select([['', 'Plato'], ...COURSES], x.course || '', { class: 'chip course-sel' + (x.course ? ' on' : ''), onchange: (e) => { x.course = e.target.value; ds = sortDishes(ds); persist(); } });
    const serv = r ? h('div', { class: 'stepper' },
      h('button', { 'aria-label': 'Menos raciones', onclick: () => { const v = (x.servings || +r.servings || 2) - 1; if (v >= 1) { x.servings = v; persist(); } } }, icon('minus')),
      h('b', {}, `${x.servings || +r.servings || '—'} rac.`),
      h('button', { 'aria-label': 'Más raciones', onclick: () => { x.servings = (x.servings || +r.servings || 2) + 1; persist(); } }, icon('plus'))) : null;
    return h('div', { class: 'card dish' + (x.cooked ? ' cooked' : '') },
      h('div', { class: 'dish-top' }, cSel,
        h('b', { class: 'dish-name' }, x.cooked ? '✓ ' : '', dishName(x)),
        h('button', { class: 'icon-btn', 'aria-label': 'Quitar plato', onclick: () => { ds = ds.filter((y) => y !== x); persist(); } }, icon('x'))),
      x.tupper && r ? h('div', { class: 'dish-tup' }, `🫙 Del tupper · quedan ${st.fmtNum(st.portionsOf(r.id))} rac.`,
        h('button', { class: 'linkbtn', onclick: () => { x.tupper = false; x.servings = null; persist(); } }, 'Cocinarlo de nuevo')) : null,
      r ? h('div', { class: 'dish-actions' }, serv,
        x.tupper ? null : h('button', { class: 'btn small', onclick: () => listSheet({ title: `Ingredientes de ${r.name}`, items: [{ d, s, dish: x }] }) }, icon('cart'), 'A la lista'),
        h('button', { class: 'btn small sq', 'aria-label': 'Ver receta', title: 'Ver receta', onclick: () => openRecipe(r.id) }, '📖'),
        x.tupper
          ? h('button', { class: 'btn small', disabled: x.cooked, onclick: () => {
            const { took, left } = eatFromTupper(x, r);
            x.cooked = true;
            persist();
            toast(took ? `Sacada${took > 1 ? 's' : ''} ${st.fmtNum(took)} rac. del tupper` + (left ? ` · quedan ${st.fmtNum(left)}` : ' · ya no queda') : 'En el tupper ya no quedaba nada');
          } }, '🍽️ Sacar')
          : h('button', { class: 'btn small sq', 'aria-label': 'La hemos cocinado', title: 'La hemos cocinado', disabled: x.cooked, onclick: () => cookSheet(r.id, factorOf(x, r), () => { x.cooked = true; persist(); }) }, '🍳')) : null);
  };
  search.addEventListener('input', () => { q = search.value; drawList(); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addText(); } });
  const addText = () => { const tx = text.value.trim(); if (!tx) { text.focus(); return; } add(null, tx.charAt(0).toUpperCase() + tx.slice(1)); text.value = ''; };
  drawCourse(); drawList(); drawDishes(); drawTup();

  const sh = openSheet(`${dayName(d)} · ${SLOTS[s]}`, () => [
    dishesBox,
    footer,
    h('h3', {}, 'Añadir plato'),
    courseBox,
    tupBox,
    h('div', { class: 'add-form' }, text, h('button', { class: 'btn', onclick: addText }, 'Añadir')),
    h('div', { class: 'search', style: 'margin-top:8px' }, icon('search'), search),
    listBox,
  ]);
}

// Desde la ficha de una receta: «Añadir al menú».
export function addToMenuSheet(recipeId) {
  const t = st.today();
  const days = [...Array(14)].map((_, i) => st.addDays(t, i));
  const slots = menuSlots();
  const r = S.recipes[recipeId];
  const left = st.portionsOf(recipeId);
  let fromTup = left > 0;
  const sh = openSheet(`«${r.name}» al menú`, () => [
    h('p', { class: 'muted' }, 'Elige día y comida. Si ya hay platos, se añade a ellos.'),
    left > 0 ? toggle(`🫙 Del tupper (quedan ${st.fmtNum(left)} rac.)`, fromTup, 'Así no se apuntan sus ingredientes a la lista.', (v) => { fromTup = v; }) : null,
    h('div', { class: 'menu-pick' }, days.map((d) => h('div', { class: 'mp-day' },
      h('b', {}, d === t ? 'Hoy' : dayName(d)),
      h('div', { class: 'mp-slots' }, slots.map((s) => {
        const ds = dishesOf(st.menuEntry(d, s));
        return h('button', { class: 'chip' + (ds.length ? ' busy' : ''), title: ds.map(dishName).join(' · '), onclick: () => {
          saveDishes(d, s, [...ds, fromTup ? tupperDish(r) : newDish(r)]);
          sh.close();
          toast(`Al menú: ${dayName(d)}, ${SLOTS[s].toLowerCase()}`);
        } }, SLOTS[s], ds.length ? h('small', {}, `${ds.length}`) : null);
      }))))),
  ]);
}

// ── Texto para WhatsApp ──
function menuText(days, slots) {
  const lines = [`*Menú ${weekLabel(days[0])}*`];
  for (const d of days) {
    const es = slots.map((s) => [s, dishesOf(st.menuEntry(d, s))]).filter(([, ds]) => ds.length);
    if (!es.length) continue;
    lines.push('', `*${dayName(d)}*`);
    for (const [s, ds] of es) {
      lines.push(`- ${SLOTS[s]}: ${ds.map((x) => dishName(x) + (x.course && ds.length > 1 ? ` (${COURSE_NAME[x.course].toLowerCase()})` : '')).join(' · ')}`);
    }
  }
  return lines.join('\n');
}

// ── Ingredientes a la lista de la compra ──
// Suma lo que piden las recetas (ajustado a las raciones), lo pasa a la unidad del artículo
// y resta lo que hay a mano (la reserva no cuenta). Lo que no está vinculado se suma por nombre.
export function needsFor(dishes) {
  const prods = new Map();
  const free = new Map();
  for (const x of dishes) {
    const r = recipeById(x.recipeId);
    if (!r || x.cooked || x.tupper) continue;
    const f = factorOf(x, r);
    for (const ing of r.ingredients || []) {
      if (ing.basic) continue;
      const p = ing.productId && S.products[ing.productId] && !S.products[ing.productId].del ? S.products[ing.productId] : null;
      if (p) {
        const y = prods.get(p.id) || { p, need: 0, unknown: false, optional: true, recipes: new Set() };
        const q = ing.qty ? st.convertQty(+ing.qty * f, ing.unit || '', p.unit || 'ud') : null;
        if (q === null) y.unknown = true; else y.need = st.round(y.need + q);
        y.optional = y.optional && !!ing.optional;
        y.recipes.add(r.name);
        prods.set(p.id, y);
      } else {
        const unit = ing.unit || '';
        const key = st.norm(ing.name) + '|' + unit;
        const y = free.get(key) || { name: ing.name, unit, qty: 0, hasQty: false, optional: true, recipes: new Set() };
        if (ing.qty) { y.qty = st.round(y.qty + +ing.qty * f); y.hasQty = true; }
        y.optional = y.optional && !!ing.optional;
        y.recipes.add(r.name);
        free.set(key, y);
      }
    }
  }
  const rows = [];
  for (const y of prods.values()) {
    const isUd = (y.p.unit || 'ud') === 'ud';
    const have = st.atHand(y.p);
    let buy = 0;
    if (y.need > 0) buy = y.need - have;
    else if (y.unknown && have <= 0) buy = isUd ? 1 : st.suggest(y.p) || 1;
    buy = buy > 0 ? (isUd ? Math.ceil(buy) : st.round(buy)) : 0;
    const already = st.onList(y.p);
    rows.push({ kind: 'product', p: y.p, name: y.p.name, buy, have, need: y.need, unknown: y.unknown, optional: y.optional, recipes: [...y.recipes], already,
      on: buy > 0 && !y.optional && !already });
  }
  for (const y of free.values()) {
    const already = st.alive(S.items).some((it) => !it.done && !it.dismissed && !it.productId && st.norm(it.name).startsWith(st.norm(y.name)));
    rows.push({ kind: 'free', name: y.name, unit: y.unit, qty: y.hasQty ? y.qty : null, optional: y.optional, recipes: [...y.recipes], already,
      on: !y.optional && !already });
  }
  return rows.sort((a, b) => (b.on - a.on) || a.name.localeCompare(b.name, 'es'));
}
// Compatibilidad: lista a partir de comidas guardadas.
export const weekNeeds = (entries) => needsFor(entries.flatMap((e) => dishesOf(e)));

// items: [{ d, s, dish }] ya elegidos; o days + slots (con la opción «desde hoy» si la semana ya ha empezado).
function listSheet({ title, items = null, days = null, slots = null }) {
  const t = st.today();
  const hasPast = !items && days.some((d) => d < t) && days.some((d) => d >= t);
  let fromToday = hasPast;
  let rows = [];
  let n = 0;
  const picked = new Set();
  const compute = () => {
    const xs = items || dishesIn(days.filter((d) => !fromToday || d >= t), slots);
    const ds = withRecipes(xs).map((x) => x.dish);
    n = ds.length;
    rows = needsFor(ds);
    picked.clear();
    rows.forEach((r, k) => { if (r.on) picked.add(k); });
  };
  compute();
  const lSel = select(st.lists().map((l) => [l.id, l.name]), st.validList(D.recListId));
  const freeName = (r) => r.name + (r.qty && r.unit && r.unit !== 'ud' ? ` (${fmtAmount(r.qty, r.unit)})` : '');
  const freeQty = (r) => (r.qty && (!r.unit || r.unit === 'ud') ? Math.ceil(r.qty) : 1);

  const sh = openSheet(title, () => [
    hasPast ? h('div', { class: 'seg' },
      h('button', { class: fromToday ? 'on' : '', onclick: () => { fromToday = true; compute(); sh.refresh(); } }, 'Desde hoy'),
      h('button', { class: !fromToday ? 'on' : '', onclick: () => { fromToday = false; compute(); sh.refresh(); } }, 'Toda la semana')) : null,
    h('p', { class: 'hint' }, `${n} plato${n === 1 ? '' : 's'} con receta. Se suma lo de todas las recetas y se resta lo que tenéis a mano (sin la reserva). Lo ya cocinado no cuenta.`),
    rows.length ? h('div', { class: 'list' }, rows.map((r, k) => {
      const cb = h('input', { type: 'checkbox', checked: picked.has(k), disabled: r.already, onchange: (ev) => { if (ev.target.checked) picked.add(k); else picked.delete(k); } });
      let sub;
      if (r.already) sub = 'Ya está en la lista';
      else if (r.kind === 'product') {
        const need = r.need > 0 ? `Hace falta ${st.fmtQty(r.need, r.p.unit)}${r.unknown ? ' y algo más' : ''}` : 'Hace falta';
        sub = `${need} · tienes ${st.fmtQty(r.have, r.p.unit)}` + (r.buy > 0 ? ` → comprar ${st.fmtQty(r.buy, r.p.unit)}` : ' · ✓ suficiente');
      } else sub = (r.qty ? fmtAmount(r.qty, r.unit) + ' · ' : '') + 'no vinculado al inventario';
      if (r.optional) sub += ' · opcional';
      return h('label', { class: 'row pick' }, cb,
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.name),
          h('div', { class: 'row-sub' }, sub),
          r.recipes.length > 1 || !items || items.length > 1 ? h('div', { class: 'row-sub muted' }, 'Para: ' + r.recipes.join(', ')) : null));
    })) : h('p', { class: 'muted' }, 'Estas recetas no tienen ingredientes que apuntar.'),
    rows.length ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Lista'), lSel) : null,
    rows.length ? h('button', { class: 'btn primary block', onclick: () => {
      let k2 = 0;
      for (const k of picked) {
        const r = rows[k];
        if (r.already) continue;
        if (r.kind === 'product') {
          st.putItem({ id: uid(), productId: r.p.id, listId: lSel.value, qty: r.buy > 0 ? r.buy : (r.p.unit || 'ud') === 'ud' ? 1 : st.suggest(r.p) || 1, fromMenu: week });
        } else {
          const b = findBasic(r.name);
          st.putItem({ id: uid(), name: freeName(r), listId: lSel.value, qty: freeQty(r), symbol: b?.symbol || null, sub: b?.sub || null, fromMenu: week });
        }
        k2++;
      }
      sh.close();
      toast(k2 ? `${k2} cosa${k2 > 1 ? 's' : ''} apuntada${k2 > 1 ? 's' : ''} en «${S.lists[lSel.value].name}»` : 'Nada que apuntar');
    } }, icon('cart'), 'Apuntar en la lista') : null,
  ]);
}
