// Menú semanal: qué se come cada día (una receta o un texto libre) y la lista de la compra de la semana,
// que suma los ingredientes de todas las recetas y resta lo que ya hay a mano.
import * as st from './store.js';
import { S, uid } from './store.js';
import { D, setDevice } from './device.js';
import { h, icon, field, inp, select, toggle, numInput, num, openSheet, toast, copyText } from './ui.js';
import { fmtAmount, openRecipe, cookSheet } from './recipes.js';
import { findBasic } from './productdb.js';

export const SLOTS = { desayuno: 'Desayuno', comida: 'Comida', merienda: 'Merienda', cena: 'Cena' };
const ORDER = ['desayuno', 'comida', 'merienda', 'cena'];
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const LEVEL = { ok: 'ok', few: 'warn', many: 'bad' };

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
const recipeOf = (e) => (e?.recipeId && S.recipes[e.recipeId] && !S.recipes[e.recipeId].del ? S.recipes[e.recipeId] : null);
const factorOf = (e, r) => (e.servings && +r.servings ? e.servings / +r.servings : 1);
const mealName = (e) => recipeOf(e)?.name || e.recipeName || e.text || '';

// Interruptores de qué comidas se planifican (en este móvil).
export function slotToggles() {
  return ORDER.map((s) => toggle(SLOTS[s], menuSlots().includes(s), null, (v) => {
    const set = new Set(menuSlots());
    if (v) set.add(s); else set.delete(s);
    if (!set.size) set.add('comida');
    setDevice({ menuSlots: ORDER.filter((x) => set.has(x)) });
  }));
}

// ── Vista de la semana ──
export function renderMenu(box) {
  if (!box) return;
  const t = st.today();
  if (!week) week = st.mondayOf(t);
  const days = [...Array(7)].map((_, i) => st.addDays(week, i));
  const slots = menuSlots();
  const planned = days.flatMap((d) => slots.map((s) => st.menuEntry(d, s))).filter(Boolean);
  const go = (n) => { week = n === 0 ? st.mondayOf(t) : st.addDays(week, n); renderMenu(box); };
  const current = week === st.mondayOf(t);

  box.replaceChildren(...[
    h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Semana anterior', onclick: () => go(-7) }, '‹'),
      h('div', { class: 'week-title' }, h('b', {}, weekLabel(week)),
        current ? h('small', {}, 'Esta semana') : h('button', { class: 'linkbtn', onclick: () => go(0) }, 'Volver a esta semana')),
      h('button', { class: 'icon-btn', 'aria-label': 'Semana siguiente', onclick: () => go(7) }, '›')),
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn small primary', disabled: !planned.length, onclick: () => weekListSheet(days, slots) }, icon('cart'), 'Lista de la semana'),
      h('button', { class: 'btn small', disabled: !planned.length, onclick: async () => toast((await copyText(menuText(days, slots))) ? 'Menú copiado' : 'No se pudo copiar') }, icon('copy'), 'Copiar menú'),
      h('button', { class: 'btn small', onclick: () => openSheet('Comidas del menú', () => [
        h('p', { class: 'muted' }, 'Qué comidas del día quieres planificar (en este móvil).'), ...slotToggles()]) }, '⚙ Comidas')),
    h('div', { class: 'week' }, days.map((d) => h('div', { class: 'day' + (d === t ? ' today' : '') + (d < t ? ' past' : '') },
      h('div', { class: 'day-h' }, h('b', {}, DAYS[dayIdx(d)]), h('small', {}, d === t ? 'Hoy · ' + dayNum(d) : dayNum(d))),
      slots.map((s) => mealBtn(d, s))))),
    !planned.length ? h('p', { class: 'hint' }, 'Toca una comida para poner una receta o lo que vayáis a comer. Luego, «Lista de la semana» apunta lo que falta.') : null,
  ].filter(Boolean));
}

function mealBtn(d, s) {
  const e = st.menuEntry(d, s);
  const r = recipeOf(e);
  let main;
  if (r) {
    const lvl = LEVEL[st.recipeStatus(r, +D.recOrangeMax || 2).level];
    main = [e.cooked ? h('span', { class: 'meal-done' }, '✓') : h('span', { class: 'dot ' + lvl }), h('span', { class: 'meal-name' }, r.name),
      e.servings ? h('small', {}, `${e.servings} rac.`) : null, e.text ? h('small', {}, e.text) : null];
  } else if (e) {
    main = [h('span', { class: 'meal-name' }, e.recipeName ? `${e.recipeName} (receta borrada)` : e.text)];
  } else main = [h('span', { class: 'meal-add' }, '+ Añadir')];
  return h('button', { class: 'meal' + (e ? '' : ' empty'), onclick: () => slotSheet(d, s) },
    h('span', { class: 'meal-slot' }, SLOTS[s]), h('span', { class: 'meal-main' }, main));
}

// ── Elegir qué se come ──
function slotSheet(d, s, presetRecipe = null) {
  const e = st.menuEntry(d, s);
  let rid = presetRecipe || recipeOf(e)?.id || null;
  let q = '';
  const text = inp({ value: e?.text || '', placeholder: rid ? 'Nota (opcional)' : 'p. ej. Sobras, cena fuera, pizza…', autocapitalize: 'sentences' });
  const serv = numInput(e?.servings ?? '', { placeholder: 'las de la receta' });
  const search = h('input', { type: 'search', class: 'inp', placeholder: 'Buscar receta…', autocomplete: 'off' });
  const listBox = h('div', { class: 'list rec-pick' });
  const chosen = h('div');

  const drawChosen = () => {
    const r = rid ? S.recipes[rid] : null;
    text.placeholder = r ? 'Nota (opcional)' : 'p. ej. Sobras, cena fuera, pizza…';
    chosen.replaceChildren(r
      ? h('div', { class: 'chosen' }, h('b', {}, '🍲 ' + r.name), h('button', { class: 'linkbtn', onclick: () => { rid = null; drawChosen(); drawList(); } }, 'Quitar receta'))
      : h('p', { class: 'muted' }, 'Elige una receta de la lista o escribe lo que vais a comer.'));
  };
  const drawList = () => {
    const nq = st.norm(q);
    const rank = { ok: 0, few: 1, many: 2 };
    const rs = st.recipes()
      .filter((r) => !nq || st.norm(r.name + ' ' + (r.ingredients || []).map((i) => i.name).join(' ')).includes(nq))
      .map((r) => ({ r, s: st.recipeStatus(r, +D.recOrangeMax || 2) }))
      .sort((a, b) => rank[a.s.level] - rank[b.s.level] || a.r.name.localeCompare(b.r.name, 'es'))
      .slice(0, 30);
    listBox.replaceChildren(...(rs.length ? rs.map(({ r, s: stt }) => h('button', { class: 'row' + (r.id === rid ? ' sel' : ''), onclick: () => { rid = r.id; drawChosen(); drawList(); } },
      h('span', { class: 'dot ' + LEVEL[stt.level] }),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.name),
        h('div', { class: 'row-sub' }, stt.n ? `Falta${stt.n > 1 ? 'n' : ''} ${stt.n}` : 'Tienes todo')),
      r.id === rid ? h('span', { class: 'badge ok' }, '✓') : null))
      : [h('p', { class: 'muted' }, st.recipes().length ? 'Ninguna receta con ese nombre.' : 'Todavía no hay recetas: escribe lo que vais a comer.')]));
  };
  search.addEventListener('input', () => { q = search.value; drawList(); });
  drawChosen();
  drawList();

  const save = () => {
    const r = rid ? S.recipes[rid] : null;
    const tx = text.value.trim();
    if (!r && !tx) { if (e) st.clearMenu(d, s); sh.close(); return; }
    st.putMenu(d, s, { recipeId: r?.id || null, recipeName: r?.name || null, servings: r ? num(serv.value) || null : null, text: tx || null,
      cooked: e && e.recipeId === (r?.id || null) ? !!e.cooked : false });
    sh.close();
    toast(`${dayName(d)}, ${SLOTS[s].toLowerCase()}: ${r ? r.name : tx}`);
  };
  const er = recipeOf(e);
  const sh = openSheet(`${dayName(d)} · ${SLOTS[s]}`, () => [
    chosen,
    h('div', { class: 'search' }, icon('search'), search),
    listBox,
    h('div', { class: 'grid2' }, field('Texto o nota', text), field('Raciones', serv)),
    h('button', { class: 'btn primary block', onclick: save }, 'Guardar'),
    er ? h('div', { class: 'actions two' },
      h('button', { class: 'btn', onclick: () => { sh.close(); openRecipe(er.id); } }, '📖 Ver receta'),
      h('button', { class: 'btn', onclick: () => { sh.close(); cookSheet(er.id, factorOf(e, er), () => st.putMenu(d, s, { ...e, cooked: true })); } }, '🍳 La hemos cocinado')) : null,
    e ? h('button', { class: 'btn block danger', onclick: () => { st.clearMenu(d, s); sh.close(); toast('Quitado del menú'); } }, 'Quitar del menú') : null,
  ]);
}

// Desde la ficha de una receta: «Al menú».
export function addToMenuSheet(recipeId) {
  const t = st.today();
  const days = [...Array(14)].map((_, i) => st.addDays(t, i));
  const slots = menuSlots();
  const r = S.recipes[recipeId];
  const sh = openSheet(`«${r.name}» al menú`, () => [
    h('p', { class: 'muted' }, 'Elige día y comida.'),
    h('div', { class: 'menu-pick' }, days.map((d) => h('div', { class: 'mp-day' },
      h('b', {}, d === t ? 'Hoy' : dayName(d)),
      h('div', { class: 'mp-slots' }, slots.map((s) => {
        const e = st.menuEntry(d, s);
        return h('button', { class: 'chip' + (e ? ' busy' : ''), title: e ? mealName(e) : '', onclick: () => {
          if (e && !confirm(`${dayName(d)}, ${SLOTS[s].toLowerCase()} ya tiene «${mealName(e)}». ¿Cambiarlo?`)) return;
          st.putMenu(d, s, { recipeId, recipeName: r.name, servings: null, text: null, cooked: false });
          sh.close();
          toast(`Al menú: ${dayName(d)}, ${SLOTS[s].toLowerCase()}`);
        } }, SLOTS[s], e ? ' ·' : '');
      }))))),
  ]);
}

// ── Texto para WhatsApp ──
function menuText(days, slots) {
  const lines = [`*Menú ${weekLabel(days[0])}*`];
  for (const d of days) {
    const es = slots.map((s) => [s, st.menuEntry(d, s)]).filter(([, e]) => e);
    if (!es.length) continue;
    lines.push('', `*${dayName(d)}*`);
    for (const [s, e] of es) lines.push(`- ${SLOTS[s]}: ${mealName(e)}${recipeOf(e) && e.text ? ` (${e.text})` : ''}`);
  }
  return lines.join('\n');
}

// ── Lista de la compra de la semana ──
// Suma lo que piden todas las recetas (ajustado a las raciones), lo pasa a la unidad del artículo
// y resta lo que hay a mano (la reserva no cuenta). Lo que no está vinculado se suma por nombre.
export function weekNeeds(entries) {
  const prods = new Map();
  const free = new Map();
  for (const e of entries) {
    const r = recipeOf(e);
    if (!r) continue;
    const f = factorOf(e, r);
    for (const ing of r.ingredients || []) {
      if (ing.basic) continue;
      const p = ing.productId && S.products[ing.productId] && !S.products[ing.productId].del ? S.products[ing.productId] : null;
      if (p) {
        const x = prods.get(p.id) || { p, need: 0, unknown: false, optional: true, recipes: new Set() };
        const q = ing.qty ? st.convertQty(+ing.qty * f, ing.unit || '', p.unit || 'ud') : null;
        if (q === null) x.unknown = true; else x.need = st.round(x.need + q);
        x.optional = x.optional && !!ing.optional;
        x.recipes.add(r.name);
        prods.set(p.id, x);
      } else {
        const unit = ing.unit || '';
        const key = st.norm(ing.name) + '|' + unit;
        const x = free.get(key) || { name: ing.name, unit, qty: 0, hasQty: false, optional: true, recipes: new Set() };
        if (ing.qty) { x.qty = st.round(x.qty + +ing.qty * f); x.hasQty = true; }
        x.optional = x.optional && !!ing.optional;
        x.recipes.add(r.name);
        free.set(key, x);
      }
    }
  }
  const rows = [];
  for (const x of prods.values()) {
    const isUd = (x.p.unit || 'ud') === 'ud';
    const have = st.atHand(x.p);
    let buy = 0;
    if (x.need > 0) buy = x.need - have;
    else if (x.unknown && have <= 0) buy = isUd ? 1 : st.suggest(x.p) || 1;
    buy = buy > 0 ? (isUd ? Math.ceil(buy) : st.round(buy)) : 0;
    const already = st.onList(x.p);
    rows.push({ kind: 'product', p: x.p, name: x.p.name, buy, have, need: x.need, unknown: x.unknown, optional: x.optional, recipes: [...x.recipes], already,
      on: buy > 0 && !x.optional && !already });
  }
  for (const x of free.values()) {
    const already = st.alive(S.items).some((it) => !it.done && !it.dismissed && !it.productId && st.norm(it.name).startsWith(st.norm(x.name)));
    rows.push({ kind: 'free', name: x.name, unit: x.unit, qty: x.hasQty ? x.qty : null, optional: x.optional, recipes: [...x.recipes], already,
      on: !x.optional && !already });
  }
  return rows.sort((a, b) => (b.on - a.on) || a.name.localeCompare(b.name, 'es'));
}

function weekListSheet(days, slots) {
  const t = st.today();
  const hasPast = days.some((d) => d < t) && days.some((d) => d >= t);
  let fromToday = hasPast;
  let rows = [];
  const picked = new Set();
  const compute = () => {
    const es = days.filter((d) => !fromToday || d >= t).flatMap((d) => slots.map((s) => st.menuEntry(d, s))).filter((e) => e && !e.cooked);
    rows = weekNeeds(es);
    picked.clear();
    rows.forEach((r, k) => { if (r.on) picked.add(k); });
    return es;
  };
  let es = compute();
  const lSel = select(st.lists().map((l) => [l.id, l.name]), st.validList(D.recListId));
  const freeName = (r) => r.name + (r.qty && r.unit && r.unit !== 'ud' ? ` (${fmtAmount(r.qty, r.unit)})` : '');
  const freeQty = (r) => (r.qty && (!r.unit || r.unit === 'ud') ? Math.ceil(r.qty) : 1);

  const sh = openSheet('Lista de la semana', () => [
    hasPast ? h('div', { class: 'seg' },
      h('button', { class: fromToday ? 'on' : '', onclick: () => { fromToday = true; es = compute(); sh.refresh(); } }, 'Desde hoy'),
      h('button', { class: !fromToday ? 'on' : '', onclick: () => { fromToday = false; es = compute(); sh.refresh(); } }, 'Toda la semana')) : null,
    h('p', { class: 'hint' }, `${es.length} comida${es.length === 1 ? '' : 's'} con receta. Se suma lo de todas las recetas y se resta lo que tenéis a mano (sin la reserva). Lo ya cocinado no cuenta.`),
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
          h('div', { class: 'row-sub muted' }, 'Para: ' + r.recipes.join(', '))));
    })) : h('p', { class: 'muted' }, 'Ninguna de estas comidas tiene receta con ingredientes.'),
    rows.length ? field('Lista', lSel) : null,
    rows.length ? h('button', { class: 'btn primary block', onclick: () => {
      let n = 0;
      for (const k of picked) {
        const r = rows[k];
        if (r.already) continue;
        if (r.kind === 'product') {
          st.putItem({ id: uid(), productId: r.p.id, listId: lSel.value, qty: r.buy > 0 ? r.buy : (r.p.unit || 'ud') === 'ud' ? 1 : st.suggest(r.p) || 1, fromMenu: week });
        } else {
          const b = findBasic(r.name);
          st.putItem({ id: uid(), name: freeName(r), listId: lSel.value, qty: freeQty(r), symbol: b?.symbol || null, sub: b?.sub || null, fromMenu: week });
        }
        n++;
      }
      sh.close();
      toast(n ? `${n} cosa${n > 1 ? 's' : ''} apuntada${n > 1 ? 's' : ''} en «${S.lists[lSel.value].name}»` : 'Nada que apuntar');
    } }, icon('cart'), 'Apuntar en la lista') : null,
  ]);
}
