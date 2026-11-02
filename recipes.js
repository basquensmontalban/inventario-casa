// Pestaña «Recetas»: lista con filtros, ficha, editor, ingredientes a la lista, cocinar e importar.
import * as st from './store.js';
import { S, uid } from './store.js';
import * as g from './google.js';
import { D } from './device.js';
import { photoSet, photoDel } from './db.js';
import {
  h, icon, badge, field, inp, select, toggle, numInput, num, openSheet, toast, copyText, pickFile, resizeImage, hue, nav,
} from './ui.js';
import { renderMenu, addToMenuSheet } from './menu.js';

const ui = { q: '', avail: '', time: '', ing: '', groups: {}, sort: null, mode: 'recipes' };
const status = (r) => st.recipeStatus(r, +D.recOrangeMax || 2);

// ── Unidades de los ingredientes ──
export const ING_UNITS = [
  ['', '—'], ['ud', 'unidad'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'l'], ['cda', 'cucharada'], ['cdta', 'cucharadita'],
  ['taza', 'taza'], ['vaso', 'vaso'], ['pizca', 'pizca'], ['diente', 'diente'], ['lata', 'lata'], ['manojo', 'manojo'], ['rodaja', 'rodaja'],
];
const PLURAL = { ud: 'unidades', cda: 'cucharadas', cdta: 'cucharaditas', taza: 'tazas', vaso: 'vasos', pizca: 'pizcas', diente: 'dientes', lata: 'latas', manojo: 'manojos', rodaja: 'rodajas' };
const SINGULAR = Object.fromEntries(ING_UNITS);
const ALIASES = {
  unidad: 'ud', unidades: 'ud', u: 'ud', uds: 'ud', 'ud.': 'ud', gramo: 'g', gramos: 'g', gr: 'g', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  mililitro: 'ml', mililitros: 'ml', litro: 'l', litros: 'l', cucharada: 'cda', cucharadas: 'cda', cucharadita: 'cdta', cucharaditas: 'cdta',
  tazas: 'taza', vasos: 'vaso', pizcas: 'pizca', dientes: 'diente', latas: 'lata', manojos: 'manojo', rodajas: 'rodaja',
};
export const normUnit = (u) => {
  const k = String(u || '').trim().toLowerCase();
  return SINGULAR[k] !== undefined ? k : ALIASES[k] || k;
};
export function fmtAmount(qty, unit) {
  if (!qty && qty !== 0) return unit && !SINGULAR[unit] ? unit : '';
  const q = st.fmtNum(qty);
  if (!unit || unit === 'ud') return q;
  const name = +qty === 1 ? SINGULAR[unit] || unit : PLURAL[unit] || SINGULAR[unit] || unit;
  return `${q} ${name}`;
}
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);

const LEVEL = { ok: { cls: 'ok', dot: '🟢' }, few: { cls: 'warn', dot: '🟠' }, many: { cls: 'bad', dot: '🔴' } };
function statusText(stt) {
  if (!stt.n) return 'Tienes todo';
  const names = stt.missing.map((i) => i.name).slice(0, 3).join(', ') + (stt.n > 3 ? '…' : '');
  return `Falta${stt.n > 1 ? 'n' : ''} ${stt.n}: ${names}`;
}

// Vincula un ingrediente con un artículo del inventario por el nombre (todas las palabras del artículo).
const words = (s) => st.norm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
export function guessProduct(name) {
  const w = new Set(words(name));
  const exact = st.products().find((p) => st.norm(p.name) === st.norm(name));
  if (exact) return exact.id;
  const cands = st.products().filter((p) => { const pw = words(p.name); return pw.length && pw.every((x) => w.has(x)); });
  cands.sort((a, b) => words(b.name).length - words(a.name).length);
  return cands[0]?.id || null;
}

// ── Lista ──
function matches(r, q) {
  if (!q) return true;
  const hay = st.norm([r.name, r.notes, ...(r.ingredients || []).map((i) => i.name)].join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function renderRecipes(m) {
  const view = 'recipes-' + ui.mode;
  if (m.dataset.view !== view) {
    m.dataset.view = view;
    const seg = h('div', { class: 'seg top-seg' },
      h('button', { class: ui.mode === 'recipes' ? 'on' : '', onclick: () => { ui.mode = 'recipes'; renderRecipes(m); } }, '🍲 Recetas'),
      h('button', { class: ui.mode === 'menu' ? 'on' : '', onclick: () => { ui.mode = 'menu'; renderRecipes(m); } }, '📅 Menú semanal'));
    if (ui.mode === 'menu') {
      m.replaceChildren(seg, h('div', { id: 'menuBox' }));
      renderMenu($('#menuBox'));
      return;
    }
    const search = h('input', { type: 'search', placeholder: 'Buscar receta o ingrediente…', value: ui.q, enterkeyhint: 'search' });
    search.addEventListener('input', () => { ui.q = search.value; renderList(); });
    m.replaceChildren(
      seg,
      h('div', { class: 'search' }, icon('search'), search),
      h('div', { class: 'chips', id: 'recChips' }),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn small', onclick: askClaudeSheet }, '✨ Ideas con lo que tengo'),
        h('button', { class: 'btn small', onclick: importSheet }, icon('download'), 'Importar receta'),
        h('button', { class: 'btn small', onclick: openGroups }, '⚙ Filtros de recetas')),
      h('div', { class: 'list', id: 'recList' }),
    );
  }
  if (ui.mode === 'menu') renderMenu($('#menuBox')); else renderList();
}

function chipSelect(opts, value, set) {
  return select(opts, value, { class: 'chip' + (value ? ' on' : ''), onchange: (e) => { set(e.target.value); renderList(); } });
}

function renderList() {
  const all = st.recipes();
  const F = D.recFilters;
  if (ui.sort === null) ui.sort = D.recSort || 'avail';
  const hidden = new Set(D.recHiddenGroups || []);
  const groups = st.recipeGroups().filter((gr) => !hidden.has(gr.id));
  if (!F.avail) ui.avail = '';
  if (!F.time) ui.time = '';
  if (!F.ing) ui.ing = '';
  for (const gid of Object.keys(ui.groups)) if (hidden.has(gid)) delete ui.groups[gid];
  const ingNames = [...new Map(all.flatMap((r) => (r.ingredients || []).filter((i) => !i.basic).map((i) => [st.norm(i.name), i.name]))).values()]
    .sort((a, b) => a.localeCompare(b, 'es'));
  if (ui.ing && !ingNames.some((n) => st.norm(n) === ui.ing)) ui.ing = '';
  $('#recChips').replaceChildren(...[
    F.avail ? chipSelect([['', 'Disponibilidad'], ['ok', '🟢 Tengo todo'], ['few', '🟠 Falta poco'], ['many', '🔴 Faltan más']], ui.avail, (v) => { ui.avail = v; }) : null,
    F.time ? chipSelect([['', 'Cualquier tiempo'], ['15', 'Hasta 15 min'], ['30', 'Hasta 30 min'], ['60', 'Hasta 1 h'], ['61', 'Más de 1 h']], ui.time, (v) => { ui.time = v; }) : null,
    ...groups.map((gr) => chipSelect([['', gr.name], ...gr.options.map((o) => [o.id, o.name])], ui.groups[gr.id] || '', (v) => { ui.groups[gr.id] = v; })),
    F.ing && ingNames.length ? chipSelect([['', 'Ingrediente'], ...ingNames.map((n) => [st.norm(n), n])], ui.ing, (v) => { ui.ing = v; }) : null,
    F.sort ? chipSelect([['avail', 'Disponibles primero'], ['name', 'Por nombre'], ['time', 'Más rápidas']], ui.sort, (v) => { ui.sort = v; }) : null,
  ].filter(Boolean));

  const q = st.norm(ui.q);
  const withSt = all.map((r) => ({ r, s: status(r), min: st.recipeMinutes(r) }));
  let list = withSt.filter(({ r, s, min }) => matches(r, q)
    && (!ui.avail || s.level === ui.avail)
    && (!ui.time || (ui.time === '61' ? min > 60 : min && min <= +ui.time))
    && (!ui.ing || (r.ingredients || []).some((i) => st.norm(i.name) === ui.ing))
    && groups.every((gr) => !ui.groups[gr.id] || (r.cats?.[gr.id] || []).includes(ui.groups[gr.id])));
  const rank = { ok: 0, few: 1, many: 2 };
  if (ui.sort === 'avail') list.sort((a, b) => rank[a.s.level] - rank[b.s.level] || a.s.n - b.s.n || a.r.name.localeCompare(b.r.name, 'es'));
  if (ui.sort === 'time') list.sort((a, b) => (a.min || 1e9) - (b.min || 1e9));

  const box = $('#recList');
  if (!all.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'sym big' }, '🍲'), h('p', {}, 'Todavía no hay recetas.'),
      h('p', {}, 'Crea una con «Nueva» o importa una que te pase Claude.')));
  } else if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Ninguna receta con esos filtros.')));
  } else {
    box.replaceChildren(...list.map(({ r, s, min }) => recipeCard(r, s, min)));
  }
}
const $ = (sel) => document.querySelector(sel);

function recThumb(r, cls = 'thumb') {
  const t = h('div', { class: cls + (r.photo ? '' : ' emoji'), style: `--hue:${hue(r.name)}` }, r.photo ? '' : '🍲');
  if (r.photo) g.photoURL(r.photo).then((u) => { if (u) t.style.backgroundImage = `url("${u}")`; else t.textContent = '🍲'; });
  return t;
}

function catBadges(r) {
  return st.recipeGroups().flatMap((gr) => (r.cats?.[gr.id] || []).map((oid) => gr.options.find((o) => o.id === oid)?.name).filter(Boolean));
}

function recipeCard(r, s, min) {
  const L = LEVEL[s.level];
  return h('button', { class: 'row recipe ' + L.cls, onclick: () => openRecipe(r.id) },
    recThumb(r),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, r.name),
      h('div', { class: 'row-sub' }, [min ? '⏱ ' + fmtMin(min) : null, statusText(s)].filter(Boolean).join(' · ')),
      catBadges(r).length ? h('div', { class: 'badges' }, catBadges(r).map((b) => badge(b))) : null),
    h('span', { class: 'dot ' + L.cls }));
}

// ── Ficha ──
export function openRecipe(id) {
  let servings = null;
  openSheet('', (sh) => {
    const r = S.recipes[id];
    if (!r || r.del) { setTimeout(() => sh.close()); return []; }
    sh.title.textContent = r.name;
    const base = +r.servings || 0;
    if (servings === null) servings = base || 0;
    const factor = base && servings ? servings / base : 1;
    const s = status(r);
    const L = LEVEL[s.level];
    const out = [];
    if (r.photo) {
      const img = h('img', { class: 'hero', alt: '' });
      g.photoURL(r.photo).then((u) => { if (u) img.src = u; else img.remove(); });
      out.push(img);
    }
    out.push(h('div', { class: 'status-box ' + L.cls }, L.dot + ' ' + statusText(s)));
    const min = st.recipeMinutes(r);
    out.push(h('div', { class: 'split' },
      r.prepMin ? h('span', {}, `Preparación: ${fmtMin(+r.prepMin)}`) : null,
      r.cookMin ? h('span', {}, `Cocción: ${fmtMin(+r.cookMin)}`) : null,
      min ? h('span', {}, h('b', {}, `Total: ${fmtMin(min)}`)) : null));
    if (catBadges(r).length) out.push(h('div', { class: 'badges', style: 'margin-top:8px' }, catBadges(r).map((b) => badge(b))));

    out.push(h('div', { class: 'section-h' }, h('h3', {}, 'Ingredientes'),
      base ? h('div', { class: 'stepper' },
        h('button', { 'aria-label': 'Menos raciones', onclick: () => { if (servings > 1) { servings--; sh.refresh(); } } }, icon('minus')),
        h('b', {}, `${servings} rac.`),
        h('button', { 'aria-label': 'Más raciones', onclick: () => { servings++; sh.refresh(); } }, icon('plus'))) : null));
    out.push(h('div', { class: 'ing-list' }, (r.ingredients || []).map((ing) => ingLine(ing, factor))));
    out.push(h('div', { class: 'actions two' },
      h('button', { class: 'btn primary', onclick: () => toListSheet(id, factor) }, icon('cart'), 'A la lista'),
      h('button', { class: 'btn', onclick: () => cookSheet(id, factor) }, '🍳 La he cocinado')));
    out.push(h('button', { class: 'btn block', onclick: () => addToMenuSheet(id) }, '📅 Añadir al menú semanal'));

    if ((r.steps || []).length) {
      out.push(h('h3', {}, 'Preparación'), h('ol', { class: 'steps' }, r.steps.map((x) => h('li', {}, x))));
    }
    if (r.notes) out.push(h('h3', {}, 'Notas'), h('p', { class: 'notes' }, r.notes));
    if (r.source) out.push(h('p', { class: 'muted' }, 'Fuente: ', /^https?:\/\//.test(r.source) ? h('a', { href: r.source, target: '_blank', rel: 'noopener' }, r.source) : r.source));
    out.push(h('div', { class: 'btn-row', style: 'margin-top:14px' },
      h('button', { class: 'btn small', onclick: () => { sh.close(); editRecipe({ id }); } }, icon('edit'), 'Editar'),
      h('button', { class: 'btn small', onclick: async () => toast((await copyText(recipeText(r, factor, servings))) ? 'Receta copiada' : 'No se pudo copiar') }, icon('copy'), 'Copiar texto'),
      navigator.share ? h('button', { class: 'btn small', onclick: () => navigator.share({ text: recipeText(r, factor, servings) }).catch(() => {}) }, icon('share'), 'Compartir') : null));
    return out;
  }, { live: true });
}

function ingLine(ing, factor) {
  const s = st.ingredientState(ing, factor);
  const qty = ing.qty ? +ing.qty * factor : null;
  const mark = s.state === 'basic' ? h('span', { class: 'ing-mark basic' }, '·')
    : s.state === 'ok' ? h('span', { class: 'ing-mark ok' }, '✓')
      : h('span', { class: 'ing-mark ' + (s.optional ? 'basic' : 'bad') }, '✗');
  let sub = null;
  if (s.state === 'basic') sub = 'Básico: se da por hecho que hay';
  else if (s.unlinked) sub = 'No está vinculado al inventario';
  else if (s.p) {
    sub = `Tienes ${st.fmtQty(s.have, s.p.unit)} a mano`;
    if (s.reserve > 0 && s.state !== 'ok') sub += ` (y ${st.fmtQty(s.reserve, s.p.unit)} en reserva)`;
  }
  return h('div', { class: 'ing' }, mark,
    h('div', { class: 'row-main' },
      h('div', {}, ing.name, ing.optional ? h('span', { class: 'muted' }, ' (opcional)') : null),
      sub ? h('div', { class: 'row-sub' }, sub) : null),
    h('div', { class: 'ing-qty' }, fmtAmount(qty, ing.unit) || (ing.unit === '' && ing.note ? ing.note : '')));
}

function recipeText(r, factor, servings) {
  const lines = [`*${r.name}*`];
  const min = st.recipeMinutes(r);
  const meta = [servings ? `${servings} raciones` : null, min ? fmtMin(min) : null].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  lines.push('', '*Ingredientes*');
  for (const i of r.ingredients || []) {
    const a = fmtAmount(i.qty ? +i.qty * factor : null, i.unit);
    lines.push(`- ${i.name}${a ? ': ' + a : ''}${i.optional ? ' (opcional)' : ''}`);
  }
  if ((r.steps || []).length) {
    lines.push('', '*Preparación*');
    r.steps.forEach((x, k) => lines.push(`${k + 1}. ${x}`));
  }
  if (r.notes) lines.push('', r.notes);
  return lines.join('\n');
}

// ── Ingredientes a la lista ──
function listQty(ing, p, factor, onlyMissing) {
  const isUd = (p.unit || 'ud') === 'ud';
  const need = ing.qty ? st.convertQty(+ing.qty * factor, ing.unit || '', p.unit || 'ud') : null;
  let q = need === null ? (isUd ? 1 : null) : onlyMissing ? need - st.atHand(p) : need;
  if (q === null || q <= 0) q = isUd ? 1 : need || 1;
  return isUd ? Math.ceil(q) : st.round(q);
}

function toListSheet(id, factor) {
  const r = S.recipes[id];
  const ings = (r.ingredients || []).filter((i) => !i.basic);
  const states = ings.map((i) => st.ingredientState(i, factor));
  const isMissing = (k) => (states[k].state === 'missing' || states[k].state === 'short') && !states[k].optional;
  let mode = D.recListMode === 'all' || !states.some((x, k) => isMissing(k)) ? 'all' : 'missing';
  let picked = new Set();
  const lSel = select(st.lists().map((l) => [l.id, l.name]), st.validList(D.recListId));
  const setMode = (m) => { mode = m; picked = new Set(ings.map((_, k) => k).filter((k) => (m === 'all' ? true : isMissing(k)))); };
  setMode(mode);
  const sh = openSheet('Añadir a la lista', () => [
    h('div', { class: 'seg' },
      h('button', { class: mode === 'missing' ? 'on' : '', onclick: () => { setMode('missing'); sh.refresh(); } }, 'Solo lo que falta'),
      h('button', { class: mode === 'all' ? 'on' : '', onclick: () => { setMode('all'); sh.refresh(); } }, 'Todos')),
    h('p', { class: 'hint' }, 'Los básicos (sal, agua…) no se añaden. Lo que falta se calcula con lo que hay a mano, sin la reserva.'),
    h('div', { class: 'list' }, ings.map((ing, k) => {
      const s = states[k];
      const already = s.p && st.onList(s.p);
      const cb = h('input', { type: 'checkbox', checked: picked.has(k) && !already, disabled: already, onchange: (e) => { if (e.target.checked) picked.add(k); else picked.delete(k); } });
      const amount = s.p ? st.fmtQty(listQty(ing, s.p, factor, mode === 'missing'), s.p.unit) : fmtAmount(ing.qty ? +ing.qty * factor : null, ing.unit);
      return h('label', { class: 'row pick' }, cb,
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, ing.name),
          h('div', { class: 'row-sub' }, already ? 'Ya está en la lista' : [amount, s.state === 'ok' ? 'lo tienes' : s.optional ? 'opcional' : 'falta'].filter(Boolean).join(' · '))));
    })),
    field('Lista', lSel),
    h('button', { class: 'btn primary block', onclick: () => {
      let n = 0;
      for (const k of picked) {
        const ing = ings[k];
        const s = states[k];
        if (s.p) {
          if (st.onList(s.p)) continue;
          st.putItem({ id: uid(), productId: s.p.id, listId: lSel.value, qty: listQty(ing, s.p, factor, mode === 'missing'), fromRecipe: r.id });
        } else {
          const a = fmtAmount(ing.qty ? +ing.qty * factor : null, ing.unit);
          st.putItem({ id: uid(), name: ing.name + (a && ing.unit && ing.unit !== 'ud' ? ` (${a})` : ''), listId: lSel.value,
            qty: ing.qty && (!ing.unit || ing.unit === 'ud') ? Math.ceil(+ing.qty * factor) : 1, fromRecipe: r.id });
        }
        n++;
      }
      sh.close();
      toast(n ? `${n} ingrediente${n > 1 ? 's' : ''} añadido${n > 1 ? 's' : ''} a «${S.lists[lSel.value].name}»` : 'Nada que añadir');
    } }, icon('cart'), 'Añadir a la lista'),
  ]);
}

// ── Cocinar: descontar del inventario ──
export function cookSheet(id, factor, onDone) {
  const r = S.recipes[id];
  const rows = (r.ingredients || []).map((ing) => ({ ing, s: st.ingredientState(ing, factor) })).filter((x) => x.s.p);
  const inputs = rows.map(({ ing, s }) => {
    const need = ing.qty ? st.convertQty(+ing.qty * factor, ing.unit || '', s.p.unit || 'ud') : null;
    const val = need !== null ? Math.min(need, st.total(s.p)) : '';
    return { cb: h('input', { type: 'checkbox', checked: need !== null && val > 0 }), q: numInput(val === '' ? '' : st.fmtNum(val), { placeholder: '0' }) };
  });
  const sh = openSheet('La he cocinado', () => [
    h('p', { class: 'muted' }, 'Descuenta del inventario lo que has usado (primero lo que está a mano y caduca antes).'),
    rows.length ? h('div', { class: 'list' }, rows.map(({ ing, s }, k) => h('div', { class: 'row pick' }, inputs[k].cb,
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, s.p.name), h('div', { class: 'row-sub' }, `Hay ${st.fmtQty(st.total(s.p), s.p.unit)}`)),
      h('div', { class: 'qty-in' }, inputs[k].q, h('small', {}, st.UNITS[s.p.unit || 'ud'])))))
      : h('p', {}, 'Ningún ingrediente está vinculado al inventario.'),
    rows.length ? h('button', { class: 'btn primary block', onclick: () => {
      let n = 0;
      rows.forEach(({ s }, k) => {
        const q = num(inputs[k].q.value);
        if (inputs[k].cb.checked && q > 0) { st.consume(S.products[s.p.id], q); n++; }
      });
      sh.close();
      if (onDone) onDone();
      toast(n ? `Descontados ${n} ingredientes. ¡Que aproveche!` : 'No se ha descontado nada');
    } }, 'Descontar del inventario') : null,
  ]);
}

// ── Editor ──
export function editRecipe({ id = null, preset = null, onSaved } = {}) {
  const isNew = !id || !S.recipes[id] || S.recipes[id].del;
  const r = preset ? st.clone(preset) : isNew ? { id: uid(), name: '', servings: +D.recServings || 2, ingredients: [], steps: [], cats: {} } : st.clone(S.recipes[id]);
  r.ingredients = r.ingredients || [];
  r.cats = r.cats || {};
  let newPhoto = null;
  let removePhoto = false;

  const name = inp({ value: r.name || '', placeholder: 'p. ej. Garbanzos con espinacas', autocapitalize: 'sentences' });
  const prep = numInput(r.prepMin ?? '', { placeholder: 'min' });
  const cook = numInput(r.cookMin ?? '', { placeholder: 'min' });
  const serv = numInput(r.servings ?? '', { placeholder: '2' });
  const steps = h('textarea', { class: 'inp tall', placeholder: 'Un paso por línea' }, (r.steps || []).join('\n'));
  const notes = h('textarea', { class: 'inp', placeholder: 'Trucos, variantes…' }, r.notes || '');
  const source = inp({ value: r.source || '', placeholder: 'Libro, web o persona (opcional)' });

  const thumb = recThumb(r, 'thumb big');
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const delPhoto = h('button', { class: 'btn small danger', hidden: !r.photo, onclick: (e) => {
    e.preventDefault(); removePhoto = true; newPhoto = null; thumb.style.backgroundImage = ''; thumb.textContent = '🍲'; delPhoto.hidden = true;
  } }, 'Quitar');
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    newPhoto = await resizeImage(f, 1200);
    removePhoto = false;
    thumb.textContent = '';
    thumb.style.backgroundImage = `url("${URL.createObjectURL(newPhoto)}")`;
    delPhoto.hidden = false;
  });

  // Filtros (grupos)
  const catBox = h('div');
  const drawCats = () => catBox.replaceChildren(...st.recipeGroups().map((gr) => h('div', { class: 'field' },
    h('span', { class: 'lbl' }, gr.name + (gr.multi ? '' : ' (uno)')),
    h('div', { class: 'chips wrap' }, gr.options.map((o) => {
      const on = (r.cats[gr.id] || []).includes(o.id);
      return h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), onclick: () => {
        const cur = r.cats[gr.id] || [];
        r.cats[gr.id] = on ? cur.filter((x) => x !== o.id) : gr.multi ? [...cur, o.id] : [o.id];
        drawCats();
      } }, o.name);
    })))));
  drawCats();

  // Ingredientes
  const ingBox = h('div');
  const drawIngs = () => ingBox.replaceChildren(...r.ingredients.map((ing) => {
    const nm = inp({ value: ing.name || '', placeholder: 'Ingrediente', list: 'dl-products', oninput: (e) => { ing.name = e.target.value; },
      onchange: () => { if (!ing.productIdManual) { ing.productId = guessProduct(ing.name); drawIngs(); } } });
    const q = numInput(ing.qty ?? '', { placeholder: 'cant.', oninput: (e) => { ing.qty = num(e.target.value); } });
    const u = select(ING_UNITS, ing.unit || '', { onchange: (e) => { ing.unit = e.target.value; } });
    const p = ing.productId && S.products[ing.productId];
    return h('div', { class: 'ing-edit' },
      h('div', { class: 'ing-row' }, nm,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar ingrediente', onclick: () => { r.ingredients = r.ingredients.filter((x) => x !== ing); drawIngs(); } }, icon('x'))),
      h('div', { class: 'ing-row2' }, q, u),
      h('div', { class: 'ing-opts' },
        h('button', { type: 'button', class: 'mini-chip' + (p ? ' on' : ''), onclick: () => linkSheet(ing, drawIngs) }, p ? '🔗 ' + p.name : 'Sin vincular'),
        h('button', { type: 'button', class: 'mini-chip' + (ing.basic ? ' on' : ''), onclick: () => { ing.basic = !ing.basic; drawIngs(); } }, 'Básico'),
        h('button', { type: 'button', class: 'mini-chip' + (ing.optional ? ' on' : ''), onclick: () => { ing.optional = !ing.optional; drawIngs(); } }, 'Opcional')));
  }));
  drawIngs();

  async function save() {
    const nm = name.value.trim();
    if (!nm) { name.focus(); toast('Ponle un nombre'); return; }
    Object.assign(r, {
      name: nm, prepMin: num(prep.value), cookMin: num(cook.value), servings: num(serv.value),
      steps: steps.value.split('\n').map((x) => x.trim()).filter(Boolean),
      notes: notes.value.trim(), source: source.value.trim(),
      ingredients: r.ingredients.filter((i) => (i.name || '').trim()).map((i) => ({ ...i, name: i.name.trim() })),
    });
    for (const k of Object.keys(r.cats)) if (!r.cats[k].length) delete r.cats[k];
    const old = !isNew ? S.recipes[r.id]?.photo : null;
    if (newPhoto) {
      const pid = uid();
      await photoSet(pid, newPhoto);
      r.photo = { id: pid, driveId: null };
    } else if (removePhoto) r.photo = null;
    if (old && (newPhoto || removePhoto)) photoDel(old.id);
    st.putRecipe(r);
    s.close();
    toast(isNew ? `«${nm}» guardada` : 'Guardado');
    if (onSaved) onSaved(r.id); else openRecipe(r.id);
  }

  const s = openSheet(isNew ? (preset ? 'Revisar receta importada' : 'Nueva receta') : 'Editar receta', () => [
    preset ? h('div', { class: 'note-box ok' }, 'Revisa la receta y pulsa «Guardar». Los ingredientes con 🔗 se han vinculado con tu inventario.') : null,
    h('div', { class: 'photo-box' }, thumb,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: (e) => { e.preventDefault(); fileIn.click(); } }, icon('camera'), 'Foto'), delPhoto), fileIn),
    field('Nombre', name),
    h('div', { class: 'grid3' }, field('Preparación', prep), field('Cocción', cook), field('Raciones', serv)),
    h('fieldset', {}, h('legend', {}, 'Ingredientes'),
      ingBox,
      h('button', { class: 'btn small', onclick: (e) => {
        e.preventDefault();
        r.ingredients.push({ id: uid(), name: '', qty: null, unit: '' });
        drawIngs();
        ingBox.querySelector('.ing-edit:last-child input')?.focus();
      } }, icon('plus'), 'Añadir ingrediente'),
      h('p', { class: 'hint' }, '🔗 Vinculado: se comprueba si lo tienes. Básico: sal, agua… (siempre hay). Opcional: no cuenta para el color.')),
    h('fieldset', {}, h('legend', {}, 'Filtros'), catBox),
    field('Preparación (pasos)', steps),
    field('Notas', notes),
    field('Fuente', source),
    h('button', { class: 'btn primary block', onclick: save }, icon('check'), 'Guardar'),
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      if (!confirm(`¿Borrar la receta «${r.name}»? (Las copias de seguridad la conservan)`)) return;
      st.deleteRecipe(r.id);
      s.close();
      toast('Receta borrada');
    } }, 'Borrar receta') : null,
  ]);
  if (isNew && !preset) setTimeout(() => name.focus(), 300);
}

function linkSheet(ing, redraw) {
  const q = h('input', { type: 'search', placeholder: 'Buscar en el inventario…', value: ing.name || '' });
  const box = h('div', { class: 'list' });
  const fill = () => {
    const t = st.norm(q.value);
    const ps = st.products().filter((p) => !t || st.norm(p.name).includes(t) || t.includes(st.norm(p.name))).slice(0, 40);
    box.replaceChildren(
      h('button', { class: 'row', onclick: () => { ing.productId = null; ing.productIdManual = true; sh.close(); redraw(); } },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Sin vincular'), h('div', { class: 'row-sub' }, 'No se comprueba si lo tienes'))),
      ...ps.map((p) => h('button', { class: 'row' + (p.id === ing.productId ? ' sel' : ''), onclick: () => { ing.productId = p.id; ing.productIdManual = true; sh.close(); redraw(); } },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name), h('div', { class: 'row-sub' }, `Hay ${st.fmtQty(st.atHand(p), p.unit)} a mano`)))));
  };
  q.addEventListener('input', fill);
  const sh = openSheet('Vincular «' + (ing.name || 'ingrediente') + '»', () => [h('div', { class: 'search', style: 'margin-bottom:10px' }, icon('search'), q), box]);
  fill();
}

// ── Grupos de filtros (Momento, Tipo y los que crees) ──
export function openGroups() {
  openSheet('Filtros de recetas', () => [
    h('p', { class: 'muted' }, 'Grupos para clasificar y filtrar las recetas. Puedes crear los tuyos (p. ej. «Cocina»: italiana, mexicana…).'),
    h('div', { class: 'list' }, st.recipeGroups().map((gr) => h('button', { class: 'row', onclick: () => editGroup(gr.id) },
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, gr.name),
        h('div', { class: 'row-sub' }, gr.options.map((o) => o.name).join(', ') || 'Sin opciones'))))),
    h('button', { class: 'btn primary block', onclick: () => editGroup(null) }, icon('plus'), 'Nuevo filtro'),
  ], { live: true });
}

function editGroup(id) {
  const isNew = !id;
  const gr = isNew ? { id: 'rg-' + uid(), name: '', multi: true, options: [] } : st.clone(S.recipeGroups[id]);
  const name = inp({ value: gr.name, placeholder: 'p. ej. Cocina, Dieta, Temporada' });
  const multi = toggle('Se pueden marcar varias opciones', gr.multi !== false);
  const optBox = h('div');
  const newOpt = inp({ placeholder: 'Nueva opción…', enterkeyhint: 'done' });
  const drawOpts = () => optBox.replaceChildren(...gr.options.map((o) => h('div', { class: 'opt-row' },
    inp({ value: o.name, oninput: (e) => { o.name = e.target.value; } }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar opción', onclick: () => { gr.options = gr.options.filter((x) => x !== o); drawOpts(); } }, icon('x')))));
  drawOpts();
  const addOpt = () => { const v = newOpt.value.trim(); if (!v) return; gr.options.push({ id: gr.id + '-' + uid(), name: v }); newOpt.value = ''; drawOpts(); newOpt.focus(); };
  newOpt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOpt(); } });
  const s = openSheet(isNew ? 'Nuevo filtro' : 'Editar filtro', () => [
    field('Nombre del filtro', name),
    multi,
    h('span', { class: 'lbl' }, 'Opciones'),
    optBox,
    h('div', { class: 'add-form' }, newOpt, h('button', { type: 'button', class: 'btn', onclick: addOpt }, icon('plus'))),
    h('button', { class: 'btn primary block', onclick: () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      addOpt();
      gr.name = nm;
      gr.multi = multi.cb.checked;
      gr.options = gr.options.map((o) => ({ ...o, name: o.name.trim() })).filter((o) => o.name);
      st.putGroup(gr);
      s.close();
      toast('Guardado');
    } }, icon('check'), 'Guardar'),
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      if (!confirm(`¿Borrar el filtro «${gr.name}»? Las recetas no se borran.`)) return;
      st.deleteGroup(gr.id);
      s.close();
    } }, 'Borrar filtro') : null,
  ]);
}

// ── Importar (archivo o texto pegado) ──
// Formato: ver README («Formato de receta para importar»).
export function parseRecipes(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No encuentro una receta en el texto');
  const j = JSON.parse(text.slice(a, b + 1));
  const arr = j.recipes || (j.recipe ? [j.recipe] : j.name ? [j] : []);
  if (!arr.length) throw new Error('El archivo no contiene recetas');
  return arr.map(toDraft);
}

function findOrCreateOption(groupName, optName, multi = true) {
  let gr = st.recipeGroups().find((x) => st.norm(x.name) === st.norm(groupName));
  if (!gr) {
    gr = { id: 'rg-' + uid(), name: groupName, multi, options: [] };
    S.recipeGroups[gr.id] = gr;
    gr.u = Date.now();
  }
  let o = gr.options.find((x) => st.norm(x.name) === st.norm(optName));
  if (!o) {
    o = { id: gr.id + '-' + uid(), name: String(optName).trim() };
    gr.options.push(o);
    gr.u = Date.now();
  }
  return [gr.id, o.id];
}

function toDraft(x) {
  const r = { id: uid(), name: String(x.name || x.nombre || 'Receta').trim(), cats: {}, ingredients: [], steps: [] };
  r.servings = num(x.servings ?? x.raciones) || null;
  r.prepMin = num(x.prepMinutes ?? x.preparacion ?? x.prepMin) || null;
  r.cookMin = num(x.cookMinutes ?? x.coccion ?? x.cookMin) || null;
  r.notes = x.notes || x.notas || '';
  r.source = x.source || x.fuente || '';
  r.steps = (x.steps || x.pasos || []).map((s) => String(s).replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  const add = (group, vals, multi) => {
    for (const v of [].concat(vals || []).filter(Boolean)) {
      const [gid, oid] = findOrCreateOption(group, v, multi);
      r.cats[gid] = multi ? [...new Set([...(r.cats[gid] || []), oid])] : [oid];
    }
  };
  add('Momento', x.meal ?? x.momento, true);
  add('Tipo', x.weight ?? x.tipo, false);
  for (const [gname, vals] of Object.entries(x.extra || x.filtros || {})) add(gname, vals, true);
  r.ingredients = (x.ingredients || x.ingredientes || []).map((i) => {
    const ing = typeof i === 'string' ? { name: i } : i;
    const nm = String(ing.name || ing.nombre || '').trim();
    return {
      id: uid(), name: nm, qty: num(ing.qty ?? ing.cantidad), unit: normUnit(ing.unit ?? ing.unidad),
      basic: !!(ing.basic ?? ing.basico), optional: !!(ing.optional ?? ing.opcional), productId: guessProduct(nm),
    };
  }).filter((i) => i.name);
  return r;
}

function importSheet() {
  const ta = h('textarea', { class: 'inp tall', placeholder: 'Pega aquí la receta que te ha pasado Claude' });
  const doImport = (text) => {
    let drafts;
    try { drafts = parseRecipes(text); } catch (e) { toast('No se pudo leer: ' + e.message); return; }
    st.commit();  // guarda los filtros nuevos que traiga
    s.close();
    if (drafts.length === 1) { editRecipe({ preset: drafts[0] }); return; }
    drafts.forEach((d) => { S.recipes[d.id] = { ...d, u: Date.now() }; });
    st.commit();
    toast(`${drafts.length} recetas importadas`);
  };
  const s = openSheet('Importar receta', () => [
    h('p', { class: 'muted' }, 'Pídele a Claude una receta «para importar en la app del inventario» y te pasará un archivo .json o un texto.'),
    h('button', { class: 'btn primary block', onclick: async () => {
      const f = await pickFile('application/json,.json,text/plain,.txt');
      if (f) doImport(await f.text());
    } }, 'Elegir archivo'),
    h('div', { class: 'or' }, 'o'),
    ta,
    h('button', { class: 'btn block', onclick: () => doImport(ta.value) }, 'Importar texto pegado'),
  ]);
}

// ── Pedir ideas a Claude con lo que hay en casa ──
export function pantryText({ onlyHand = true, withRecipes = true } = {}) {
  const qty = (p) => (onlyHand ? st.atHand(p) : st.total(p));
  const ps = st.products().filter((p) => qty(p) > 0 && st.isFood(p));
  const soon = [];
  const lines = ['Hola Claude. Recomiéndame recetas para importar en mi app «Inventario de casa» con lo que tengo en casa.', ''];
  lines.push(`Lo que tengo${onlyHand ? ' a mano' : ''}:`);
  for (const p of ps) {
    const lots = (p.lots || []).filter((l) => +l.qty > 0 && (!onlyHand || !st.isReserve(l.locationId)));
    const exp = lots.map((l) => l.expiry).filter(Boolean).sort()[0];
    const state = lots.map((l) => st.expiryState(p, l)).find(Boolean);
    if (state) soon.push(p.name);
    lines.push(`- ${p.name}: ${st.fmtQty(qty(p), p.unit)}${exp ? ` (caduca ${st.fmtDate(exp)})` : ''}`);
  }
  if (!ps.length) lines.push('- (nada registrado todavía)');
  if (soon.length) lines.push('', `Caduca pronto, úsalo primero: ${soon.join(', ')}.`);
  const rs = st.recipes();
  if (withRecipes && rs.length) lines.push('', `Ya tengo estas recetas (no las repitas): ${rs.map((r) => r.name).join(', ')}.`);
  lines.push('', 'Doy por hecho que hay sal, agua y pimienta.');
  return lines.join('\n');
}

function askClaudeSheet() {
  const opts = { onlyHand: true, withRecipes: true };
  const pre = h('pre', { class: 'preview tall' });
  const draw = () => { pre.textContent = pantryText(opts); };
  openSheet('Ideas con lo que tengo', () => {
    draw();
    return [
      h('p', { class: 'muted' }, 'Copia este texto y pégalo en una conversación con Claude. Te propondrá recetas con lo que tienes (empezando por lo que caduca antes) y te pasará el archivo para importarlas aquí.'),
      toggle('Solo lo que está a mano (sin la reserva)', opts.onlyHand, null, (v) => { opts.onlyHand = v; draw(); }),
      toggle('Decirle qué recetas ya tengo', opts.withRecipes, null, (v) => { opts.withRecipes = v; draw(); }),
      pre,
      h('div', { class: 'actions two' },
        h('button', { class: 'btn primary', onclick: async () => toast((await copyText(pantryText(opts))) ? 'Copiado. Pégalo en Claude' : 'No se pudo copiar') }, icon('copy'), 'Copiar'),
        navigator.share
          ? h('button', { class: 'btn', onclick: () => navigator.share({ text: pantryText(opts) }).catch(() => {}) }, icon('share'), 'Compartir')
          : h('span')),
    ];
  });
}
