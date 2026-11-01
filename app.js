// Interfaz de la app.
import * as st from './store.js';
import { S, GENERAL, UNITS, uid } from './store.js';
import * as g from './google.js';
import { scanBarcode } from './scanner.js';
import { photoSet, photoDel } from './db.js';

const VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);

// ── Utilidades de DOM ───────────────────────────────────────
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'selected', 'disabled'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

const ICONS = {
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 7H6"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
};
const icon = (name) => h('span', { class: 'ic', html: ICONS[name] });
const badge = (text, cls = '') => h('span', { class: 'badge ' + cls }, text);
const hue = (s) => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => (v === '' || v === null || v === undefined ? null : +String(v).replace(',', '.'));

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}
const inp = (props) => h('input', { class: 'inp', ...props });
function toggle(label, checked, sub) {
  const cb = h('input', { type: 'checkbox', checked });
  const el = h('label', { class: 'toggle' }, h('span', {}, label, sub ? h('small', {}, sub) : null), cb, h('span', { class: 'sw' }));
  el.cb = cb;
  return el;
}
function select(options, value, props = {}) {
  return h('select', { class: 'inp', ...props }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, t)));
}
const numInput = (value, props = {}) => inp({ type: 'text', inputmode: 'decimal', value: value ?? '', ...props });

function toast(msg, { action, onAction, ms = 3800 } = {}) {
  const t = h('div', { class: 'toast' }, h('span', {}, msg),
    action ? h('button', { onclick: () => { onAction(); t.remove(); } }, action) : null);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// ── Hojas inferiores (con botón «atrás» de Android) ────────
const sheets = [];
let ignorePop = 0;
function openSheet(title, render, { live = false } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const titleEl = h('h2', {}, title);
  const s = {
    body, live, title: titleEl,
    refresh() {
      const out = render(s);
      if (out === null) return;
      const st0 = body.scrollTop;
      body.replaceChildren(...[].concat(out).flat(Infinity).filter(Boolean));
      body.scrollTop = st0;
    },
    close(fromPop) {
      const i = sheets.indexOf(s);
      if (i < 0) return;
      sheets.splice(i, 1);
      back.classList.remove('open');
      setTimeout(() => back.remove(), 230);
      if (!fromPop) {
        setTimeout(() => {
          if (!sheets.length && history.state?.sheet) { ignorePop++; history.back(); }
        }, 0);
      }
    },
  };
  const panel = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'sheet-head' }, titleEl, h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => s.close() }, icon('x'))),
    body);
  const back = h('div', { class: 'backdrop' }, panel);
  back.addEventListener('click', (e) => { if (e.target === back) s.close(); });
  if (!sheets.length && !history.state?.sheet) history.pushState({ sheet: 1 }, '');
  sheets.push(s);
  s.refresh();
  document.body.append(back);
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('open')));
  return s;
}
addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  const s = sheets[sheets.length - 1];
  if (s) {
    s.close(true);
    if (sheets.length) history.pushState({ sheet: 1 }, '');
  }
});
const closeAll = () => [...sheets].reverse().forEach((s) => s.close());

// ── Estado de la interfaz ──────────────────────────────────
let tab = 'inv';
const ui = { q: '', filter: 'all', room: '', list: '__all', showDismissed: false };

function setTab(t) {
  tab = t;
  $('#main').dataset.view = '';
  render();
  scrollTo(0, 0);
}

function render() {
  $('#title').textContent = { inv: 'Inventario', shop: 'Compra', set: 'Ajustes' }[tab];
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#fabAdd').hidden = tab !== 'inv';
  const m = $('#main');
  if (tab === 'inv') renderInv(m);
  else if (tab === 'shop') renderShop(m);
  else renderSettings(m);
  updateCounts();
  fillDatalists();
}

function rerender() {
  render();
  sheets.forEach((s) => s.live && s.refresh());
}

function updateCounts() {
  const n = shopItems().length;
  const c = $('.tab[data-tab="shop"] .count');
  c.textContent = n;
  c.hidden = !n;
}

function fillDatalists() {
  const ps = st.products();
  const fill = (id, vals) => {
    const dl = $('#' + id);
    const uniq = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    dl.replaceChildren(...uniq.map((v) => h('option', { value: v })));
  };
  fill('dl-rooms', ps.map((p) => p.room));
  fill('dl-furniture', ps.map((p) => p.furniture));
  fill('dl-shelves', ps.map((p) => p.shelf));
  fill('dl-categories', ps.map((p) => p.category));
  fill('dl-products', ps.map((p) => p.name));
}

// ── Inventario ─────────────────────────────────────────────
function matches(p, q) {
  if (!q) return true;
  const hay = [p.name, p.category, p.room, p.furniture, p.shelf, p.notes, ...(p.variants || []).flatMap((v) => [v.brand, v.barcode])]
    .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderInv(m) {
  if (m.dataset.view !== 'inv') {
    m.dataset.view = 'inv';
    const search = h('input', { type: 'search', placeholder: 'Buscar artículo, marca, sitio…', value: ui.q, enterkeyhint: 'search' });
    search.addEventListener('input', () => { ui.q = search.value; renderInvList(); });
    m.replaceChildren(
      h('div', { class: 'search' }, icon('search'), search),
      h('div', { class: 'chips', id: 'invChips' }),
      h('div', { class: 'list', id: 'invList' }),
    );
  }
  renderInvList();
}

function renderInvList() {
  const all = st.products();
  const q = ui.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filters = {
    all: ['Todo', () => true],
    soon: ['Caduca pronto', (p) => !!st.productExpiry(p)],
    low: ['Bajo mínimo', (p) => st.needs(p)],
    empty: ['Agotado', (p) => st.total(p) <= 0],
    critical: ['Críticos', (p) => !!p.critical],
  };
  const rooms = [...new Set(all.map((p) => p.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (ui.room && !rooms.includes(ui.room)) ui.room = '';
  const chips = $('#invChips');
  chips.replaceChildren(...[
    ...Object.entries(filters).map(([k, [label, fn]]) => {
      const n = all.filter(fn).length;
      if (k !== 'all' && k !== ui.filter && !n) return null;
      return h('button', { class: 'chip' + (ui.filter === k ? ' on' : ''), onclick: () => { ui.filter = k; renderInvList(); } },
        label, k !== 'all' ? h('small', {}, n) : null);
    }),
    rooms.length
      ? select([['', 'Todas las habitaciones'], ...rooms.map((r) => [r, r])], ui.room, {
          class: 'chip' + (ui.room ? ' on' : ''),
          onchange: (e) => { ui.room = e.target.value; renderInvList(); },
        })
      : null,
  ].filter(Boolean));
  const list = all.filter((p) => filters[ui.filter][1](p) && (!ui.room || p.room === ui.room) && matches(p, q));
  const box = $('#invList');
  if (!all.length) {
    box.replaceChildren(h('div', { class: 'empty' }, icon('box'), h('p', {}, 'Todavía no hay nada.'),
      h('p', {}, 'Escanea un código con el botón verde o toca «Nuevo».')));
  } else if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Nada coincide con la búsqueda.')));
  } else {
    box.replaceChildren(...list.map(productRow));
  }
}

function thumbFor(p, cls = 'thumb') {
  const t = h('div', { class: cls, style: `--hue:${hue(p.category || p.name)}` }, (p.name || '?').trim().charAt(0).toUpperCase());
  if (p.photo) g.photoURL(p.photo).then((u) => { if (u) { t.textContent = ''; t.style.backgroundImage = `url("${u}")`; } });
  return t;
}

function productRow(p) {
  const tot = st.total(p);
  const ex = st.productExpiry(p);
  return h('button', { class: 'row', onclick: () => openProduct(p.id) },
    thumbFor(p),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, p.name),
      h('div', { class: 'row-sub' }, st.loc(p) || p.category || 'Sin ubicación'),
      (ex || st.needs(p) || p.critical) ? h('div', { class: 'badges' },
        ex === 'expired' ? badge('Caducado', 'bad') : ex === 'soon' ? badge('Caduca pronto', 'warn') : null,
        st.needs(p) ? badge('Bajo mínimo', 'low') : null,
        p.critical ? badge('Crítico') : null) : null),
    h('div', { class: 'row-qty' + (tot <= 0 ? ' zero' : '') }, h('b', {}, st.fmtNum(tot)), h('small', {}, UNITS[p.unit || 'ud'])));
}

// ── Ficha de artículo ──────────────────────────────────────
function openProduct(id) {
  openSheet('', (s) => {
    const p = S.products[id];
    if (!p || p.del) { setTimeout(() => s.close()); return []; }
    s.title.textContent = p.name;
    const tot = st.total(p);
    const out = [];
    if (p.photo) {
      const img = h('img', { class: 'hero', alt: '' });
      g.photoURL(p.photo).then((u) => { if (u) img.src = u; else img.remove(); });
      out.push(img);
    }
    out.push(h('div', { class: 'meta-line' }, p.category ? badge(p.category) : null, h('span', {}, st.loc(p) || 'Sin ubicación')));
    out.push(h('div', { class: 'stock' },
      h('div', {}, h('b', { class: 'big' }, st.fmtNum(tot)), ' ', UNITS[p.unit || 'ud']),
      h('div', { class: 'muted' },
        p.restock === false ? 'No se repone'
          : +p.min > 0 ? `Mínimo ${st.fmtNum(p.min)} · reponer hasta ${st.fmtNum(+p.target > 0 ? p.target : p.min)}` : 'Sin mínimo')));
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', disabled: tot <= 0, onclick: () => spend(id) }, icon('minus'), 'Gastar'),
      h('button', { class: 'btn primary', onclick: () => addStockSheet(id) }, icon('plus'), 'Añadir'),
      h('button', { class: 'btn', onclick: () => addToListSheet(id) }, icon('cart'), 'A lista')));

    out.push(h('h3', {}, 'Existencias'));
    const lots = [...(p.lots || [])].sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    if (!lots.length) out.push(h('p', { class: 'muted' }, 'No queda nada.'));
    for (const l of lots) out.push(lotRow(p, l));

    out.push(h('h3', {}, 'Marcas y códigos'));
    if (!(p.variants || []).length) out.push(h('p', { class: 'muted' }, 'Sin marcas. Puedes añadirlas en «Editar».'));
    for (const v of p.variants || []) {
      out.push(h('div', { class: 'lot' }, h('div', { class: 'row-main' },
        h('div', {}, (v.fav ? '★ ' : '') + (v.brand || 'Sin nombre de marca')),
        h('div', { class: 'row-sub' }, v.barcode || 'Sin código'))));
    }
    const alertTxt = S.settings.alertsMode === 'off' ? 'Avisos desactivados en Ajustes'
      : S.settings.alertsMode === 'critical' && !p.critical ? 'Sin avisos (solo se avisa de los críticos)'
        : p.alerts === false ? 'Sin avisos para este artículo'
          : `Avisos ${st.expiryDaysOf(p)} días antes de caducar` + (p.critical ? ' · crítico' : '');
    out.push(h('p', { class: 'muted' }, '🔔 ' + alertTxt));
    if (p.listId && S.lists[p.listId] && !S.lists[p.listId].del) out.push(h('p', { class: 'muted' }, '🛒 Lista habitual: ' + S.lists[p.listId].name));
    if (p.notes) out.push(h('h3', {}, 'Notas'), h('p', { class: 'notes' }, p.notes));
    out.push(h('button', { class: 'btn block', onclick: () => { s.close(); editProduct({ id }); } }, icon('edit'), 'Editar artículo'));
    return out;
  }, { live: true });
}

function lotRow(p, l) {
  const v = st.variant(p, l.variantId);
  const ex = st.expiryState(p, l);
  const isUd = (p.unit || 'ud') === 'ud';
  const change = (delta) => {
    const q = S.products[p.id];
    const lot = q.lots.find((x) => x.id === l.id);
    if (!lot) return;
    lot.qty = st.round(+lot.qty + delta);
    q.lots = q.lots.filter((x) => +x.qty > 0);
    st.putProduct(q);
  };
  const setQty = () => {
    const val = num(prompt(`Cantidad (${UNITS[p.unit]})`, st.fmtNum(l.qty)));
    if (val === null || isNaN(val)) return;
    change(val - l.qty);
  };
  return h('div', { class: 'lot' },
    h('div', { class: 'row-main' },
      h('div', {}, v ? (v.fav ? '★ ' : '') + (v.brand || 'Sin nombre de marca') : 'Sin marca'),
      h('div', { class: 'row-sub' }, l.expiry ? 'Caduca ' + st.fmtDate(l.expiry) : 'Sin caducidad',
        ex === 'expired' ? ' · ' : '', ex === 'expired' ? badge('Caducado', 'bad') : ex === 'soon' ? [' · ', badge('Pronto', 'warn')] : null)),
    h('div', { class: 'stepper' },
      h('button', { 'aria-label': 'Menos', onclick: () => (isUd ? change(-1) : setQty()) }, icon('minus')),
      h('b', { onclick: setQty }, st.fmtNum(l.qty)),
      h('button', { 'aria-label': 'Más', onclick: () => (isUd ? change(1) : setQty()) }, icon('plus'))));
}

function spend(id) {
  const p = S.products[id];
  const before = clone(p.lots || []);
  const undo = () => { const q = S.products[id]; q.lots = before; st.putProduct(q); };
  if ((p.unit || 'ud') === 'ud') {
    st.consume(p, 1);
    toast(`Gastado 1 de ${p.name}`, { action: 'Deshacer', onAction: undo });
    return;
  }
  const amount = numInput('', { placeholder: '0', autofocus: true });
  const s = openSheet('Gastar ' + p.name, () => [
    field(`Cantidad (${UNITS[p.unit]})`, amount, `Hay ${st.fmtQty(st.total(p), p.unit)}. Se gasta primero lo que caduca antes.`),
    h('button', { class: 'btn primary block', onclick: () => {
      const a = num(amount.value);
      if (!a || a <= 0) return amount.focus();
      st.consume(S.products[id], a);
      s.close();
      toast(`Gastado ${st.fmtQty(a, p.unit)} de ${p.name}`, { action: 'Deshacer', onAction: undo });
    } }, 'Gastar'),
  ]);
  setTimeout(() => amount.focus(), 250);
}

function variantOptions(p) {
  const vs = p.variants || [];
  if (!vs.length) return [['', 'Sin marca']];
  return [...vs.map((v) => [v.id, (v.fav ? '★ ' : '') + (v.brand || v.barcode || 'Marca sin nombre')]), ['', 'Sin marca']];
}

function addStockSheet(id, { variantId, qty = 1, onDone } = {}) {
  const p = S.products[id];
  const vSel = select(variantOptions(p), variantId ?? st.fav(p)?.id ?? '');
  const qIn = numInput(st.fmtNum(qty));
  const eIn = inp({ type: 'date' });
  const s = openSheet('Añadir ' + p.name, () => [
    field('Marca', vSel),
    h('div', { class: 'grid2' },
      field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn),
      field('Caducidad (opcional)', eIn)),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) return qIn.focus();
      st.addStock(S.products[id], { variantId: vSel.value || null, qty: q, expiry: eIn.value || null });
      s.close();
      toast(`Añadido ${st.fmtQty(q, p.unit)} de ${p.name}`);
      onDone?.();
    } }, icon('plus'), 'Añadir al inventario'),
  ]);
}

function addToListSheet(id) {
  const p = S.products[id];
  const auto = S.items['auto-' + id];
  if (auto && !auto.del && !auto.dismissed) {
    toast(`Ya está en la lista «${S.lists[auto.listId]?.name}»`);
    return;
  }
  const lSel = select(st.lists().map((l) => [l.id, l.name]), st.validList(p.listId));
  const qIn = numInput(st.fmtNum(st.needs(p) ? st.suggest(p) : 1));
  const s = openSheet('Añadir a la lista', () => [
    h('p', { class: 'muted' }, p.name),
    field('Lista', lSel),
    field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn),
    h('button', { class: 'btn primary block', onclick: () => {
      st.putItem({ id: uid(), productId: id, listId: lSel.value, qty: num(qIn.value) || 1 });
      s.close();
      toast(`${p.name} añadido a «${S.lists[lSel.value].name}»`);
    } }, icon('cart'), 'Añadir'),
  ]);
}

// ── Editor de artículo ─────────────────────────────────────
function editProduct({ id = null, preset = null, onSaved, focusBrand = false } = {}) {
  const isNew = !id || !S.products[id];
  const p = preset ? clone(preset) : isNew
    ? { id: uid(), name: '', unit: 'ud', variants: [], lots: [], restock: true, alerts: true }
    : clone(S.products[id]);
  p.variants = p.variants || [];
  p.lots = p.lots || [];
  let newPhoto = null;     // Blob
  let removePhoto = false;

  const name = inp({ value: p.name || '', placeholder: 'p. ej. Garbanzos cocidos', autocapitalize: 'sentences' });
  const category = inp({ value: p.category || '', list: 'dl-categories', placeholder: 'Alimentación, limpieza…' });
  const room = inp({ value: p.room || '', list: 'dl-rooms', placeholder: 'Cocina' });
  const furniture = inp({ value: p.furniture || '', list: 'dl-furniture', placeholder: 'Despensa' });
  const shelf = inp({ value: p.shelf || '', list: 'dl-shelves', placeholder: 'Balda 2' });
  const unit = select(Object.entries({ ud: 'Unidades', kg: 'Kilos', g: 'Gramos', l: 'Litros', ml: 'Mililitros' }), p.unit || 'ud');
  const min = numInput(p.min ?? '', { placeholder: '0' });
  const target = numInput(p.target ?? '', { placeholder: 'igual que el mínimo' });
  const restock = toggle('Reponer', p.restock !== false, 'Si lo apagas, nunca entra en la lista de la compra');
  const listSel = select([['', 'General'], ...st.lists().filter((l) => l.id !== GENERAL).map((l) => [l.id, l.name])], p.listId || '');
  const alerts = toggle('Avisos en el calendario', p.alerts !== false);
  const critical = toggle('Crítico', !!p.critical, 'Avisa aunque en Ajustes elijas «solo críticos»');
  const expiryDays = numInput(p.expiryDays ?? '', { placeholder: `${S.settings.expiryDays} (por defecto)` });
  const notes = h('textarea', { class: 'inp', placeholder: 'Cualquier comentario' }, p.notes || '');

  // Foto
  const photoThumb = thumbFor(p);
  if (!p.photo) photoThumb.replaceChildren(icon('camera'));
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoDelBtn = h('button', { class: 'btn small danger', hidden: !p.photo, onclick: (e) => {
    e.preventDefault(); removePhoto = true; newPhoto = null; photoThumb.style.backgroundImage = ''; photoThumb.replaceChildren(icon('camera')); photoDelBtn.hidden = true;
  } }, 'Quitar');
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    newPhoto = await resizeImage(f);
    removePhoto = false;
    photoThumb.textContent = '';
    photoThumb.style.backgroundImage = `url("${URL.createObjectURL(newPhoto)}")`;
    photoDelBtn.hidden = false;
  });

  // Marcas
  const varBox = h('div');
  function renderVars() {
    varBox.replaceChildren(...p.variants.map((v) => {
      const brand = inp({ value: v.brand || '', placeholder: 'Marca', oninput: (e) => { v.brand = e.target.value; } });
      const code = inp({ value: v.barcode || '', placeholder: 'Código', inputmode: 'numeric', oninput: (e) => { v.barcode = e.target.value.trim(); } });
      if (focusBrand && !v.brand && v === p.variants[p.variants.length - 1]) setTimeout(() => brand.focus(), 300);
      return h('div', { class: 'var-row' },
        brand,
        h('div', { class: 'codebox' }, code, h('button', { 'aria-label': 'Escanear', onclick: async (e) => {
          e.preventDefault();
          const c = await scanBarcode('Código de ' + (v.brand || 'esta marca'));
          if (c) { v.barcode = c; code.value = c; }
        } }, icon('scan'))),
        h('button', { class: 'fav' + (v.fav ? ' on' : ''), title: 'Favorita', onclick: (e) => {
          e.preventDefault(); p.variants.forEach((x) => { x.fav = x === v; }); renderVars();
        } }, v.fav ? '★' : '☆'),
        h('button', { class: 'icon-btn', 'aria-label': 'Quitar marca', onclick: (e) => {
          e.preventDefault();
          p.variants = p.variants.filter((x) => x !== v);
          if (p.variants.length && !p.variants.some((x) => x.fav)) p.variants[0].fav = true;
          renderVars();
        } }, icon('x')));
    }));
  }
  renderVars();

  async function save() {
    const nm = name.value.trim();
    if (!nm) { name.focus(); toast('Ponle un nombre'); return; }
    const vars = p.variants.filter((v) => (v.brand || '').trim() || (v.barcode || '').trim());
    if (vars.length && !vars.some((v) => v.fav)) vars[0].fav = true;
    for (const v of vars) {
      v.brand = (v.brand || '').trim();
      if (!v.barcode) continue;
      const other = st.findByBarcode(v.barcode);
      if (other && other.product.id !== p.id &&
        !confirm(`El código ${v.barcode} ya es de «${other.product.name}». ¿Guardarlo también aquí?`)) return;
    }
    // Lotes de marcas borradas pasan a «sin marca»
    const ids = new Set(vars.map((v) => v.id));
    p.lots.forEach((l) => { if (l.variantId && !ids.has(l.variantId)) l.variantId = null; });
    Object.assign(p, {
      name: nm, category: category.value.trim(), room: room.value.trim(), furniture: furniture.value.trim(), shelf: shelf.value.trim(),
      unit: unit.value, min: num(min.value) ?? 0, target: num(target.value), restock: restock.cb.checked, listId: listSel.value || null,
      alerts: alerts.cb.checked, critical: critical.cb.checked, expiryDays: num(expiryDays.value), notes: notes.value.trim(), variants: vars,
    });
    const old = !isNew ? S.products[p.id]?.photo : null;
    if (newPhoto) {
      const pid = uid();
      await photoSet(pid, newPhoto);
      p.photo = { id: pid, driveId: null };
    } else if (removePhoto) p.photo = null;
    if (old && (newPhoto || removePhoto)) { photoDel(old.id); g.deleteDrivePhoto(old); }
    st.putProduct(p);
    s.close();
    toast(isNew ? `«${nm}» creado` : 'Guardado');
    if (onSaved) onSaved(p.id); else if (!isNew) openProduct(p.id);
  }

  const s = openSheet(isNew ? 'Nuevo artículo' : 'Editar artículo', () => [
    h('div', { class: 'photo-box' }, photoThumb,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: (e) => { e.preventDefault(); fileIn.click(); } }, icon('camera'), 'Foto'), photoDelBtn),
      fileIn),
    field('Nombre', name),
    field('Categoría', category),
    h('span', { class: 'lbl' }, 'Ubicación'),
    h('div', { class: 'grid3' }, room, furniture, shelf),
    h('small', { class: 'hint' }, 'Habitación › mueble › estante'),

    h('fieldset', {}, h('legend', {}, 'Marcas y códigos de barras'),
      varBox,
      h('button', { class: 'btn small', onclick: (e) => {
        e.preventDefault();
        p.variants.push({ id: uid(), brand: '', barcode: '', fav: !p.variants.length });
        renderVars();
        varBox.querySelector('.var-row:last-child input')?.focus();
      } }, icon('plus'), 'Añadir marca'),
      h('p', { class: 'hint' }, '★ = marca favorita: es la que aparece en la lista de la compra.')),

    h('fieldset', {}, h('legend', {}, 'Cantidades y compra'),
      field('Se cuenta en', unit),
      h('div', { class: 'grid2' },
        field('Mínimo', min, 'Avisa si hay menos'),
        field('Reponer hasta', target, 'Cantidad que quieres tener')),
      restock,
      field('Lista habitual', listSel, 'Dónde aparece cuando hay que reponerlo')),

    h('fieldset', {}, h('legend', {}, 'Avisos'),
      alerts, critical,
      field('Días de antelación al caducar', expiryDays)),

    field('Notas', notes),
    h('button', { class: 'btn primary block', onclick: save }, icon('check'), 'Guardar'),
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      if (!confirm(`¿Borrar «${p.name}» y todas sus existencias?`)) return;
      if (p.photo) { photoDel(p.photo.id); g.deleteDrivePhoto(p.photo); }
      st.deleteProduct(p.id);
      s.close();
      toast('Artículo borrado');
    } }, 'Borrar artículo') : null,
  ]);
  if (isNew && !name.value) setTimeout(() => name.focus(), 300);
}

async function resizeImage(file, max = 900) {
  let src, w, hgt;
  try {
    src = await createImageBitmap(file);
    w = src.width; hgt = src.height;
  } catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    w = src.naturalWidth; hgt = src.naturalHeight;
  }
  const k = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(hgt * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.78));
}

// ── Escanear ───────────────────────────────────────────────
async function scanFlow() {
  const code = await scanBarcode();
  if (!code) return;
  const found = st.findByBarcode(code);
  if (found) return scanResult(found.product.id, found.variant.id);
  unknownCode(code);
}

function scanResult(id, variantId) {
  openSheet('', (s) => {
    const p = S.products[id];
    if (!p || p.del) { setTimeout(() => s.close()); return []; }
    const v = st.variant(p, variantId);
    s.title.textContent = p.name;
    return [
      h('div', { class: 'row', style: 'box-shadow:none' }, thumbFor(p),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, v?.brand || p.name), h('div', { class: 'row-sub' }, st.loc(p) || 'Sin ubicación')),
        h('div', { class: 'row-qty' }, h('b', {}, st.fmtNum(st.total(p))), h('small', {}, UNITS[p.unit || 'ud']))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: st.total(p) <= 0, onclick: () => spend(id) }, icon('minus'), 'Gastar'),
        h('button', { class: 'btn primary', onclick: () => { s.close(); addStockSheet(id, { variantId }); } }, icon('plus'), 'Añadir'),
        h('button', { class: 'btn', onclick: () => { s.close(); openProduct(id); } }, 'Ficha')),
      h('button', { class: 'btn block', onclick: () => { s.close(); scanFlow(); } }, icon('scan'), 'Escanear otro'),
    ];
  }, { live: true });
}

function unknownCode(code) {
  const s = openSheet('Código nuevo', () => [
    h('p', {}, 'El código ', h('b', {}, code), ' no está en el inventario.'),
    h('button', { class: 'btn primary block', onclick: () => {
      s.close();
      editProduct({
        preset: { id: uid(), name: '', unit: 'ud', restock: true, alerts: true, lots: [], variants: [{ id: uid(), brand: '', barcode: code, fav: true }] },
        onSaved: (id) => addStockSheet(id),
      });
    } }, icon('plus'), 'Crear artículo nuevo'),
    h('button', { class: 'btn block', onclick: () => {
      s.close();
      pickProduct('¿De qué artículo es esta marca?', (id) => {
        const p = clone(S.products[id]);
        p.variants = p.variants || [];
        const v = { id: uid(), brand: '', barcode: code, fav: !p.variants.length };
        p.variants.push(v);
        editProduct({ id, preset: p, focusBrand: true, onSaved: (pid) => addStockSheet(pid, { variantId: v.id }) });
      });
    } }, 'Es otra marca de un artículo que ya tengo'),
  ]);
}

function pickProduct(title, onPick) {
  const q = h('input', { type: 'search', placeholder: 'Buscar…' });
  const box = h('div');
  const fill = () => {
    const t = q.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    box.replaceChildren(...st.products().filter((p) => matches(p, t)).slice(0, 60).map((p) =>
      h('div', { class: 'pick-row' }, h('button', { class: 'row', onclick: () => { s.close(); onPick(p.id); } }, thumbFor(p),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name), h('div', { class: 'row-sub' }, st.loc(p)))))));
  };
  q.addEventListener('input', fill);
  const s = openSheet(title, () => [h('div', { class: 'search', style: 'margin-bottom:10px' }, icon('search'), q), box]);
  fill();
}

// ── Lista de la compra ─────────────────────────────────────
const shopItems = (listId) => st.alive(S.items).filter((it) => !it.done && !it.dismissed && (!listId || it.listId === listId));

function itemInfo(it) {
  const p = it.productId && S.products[it.productId] && !S.products[it.productId].del ? S.products[it.productId] : null;
  return { p, name: p ? p.name : it.name || '?', unit: p ? p.unit || 'ud' : 'ud', brand: p ? st.fav(p)?.brand : null };
}

function itemRow(it) {
  const inf = itemInfo(it);
  const sub = [it.qty ? st.fmtQty(it.qty, inf.unit) : null, inf.brand].filter(Boolean).join(' · ');
  return h('div', { class: 'row item' + (it.done ? ' done' : '') },
    h('button', { class: 'check', 'aria-label': it.done ? 'Desmarcar' : 'Comprado', onclick: () => (it.done ? undone(it.id) : buy(it.id)) }, it.done ? icon('check') : null),
    h('button', { class: 'row-main plain', onclick: () => itemSheet(it.id) },
      h('div', { class: 'row-title' }, inf.name),
      h('div', { class: 'row-sub' }, sub || ' ')),
    it.auto ? badge('bajo mínimo', 'low') : null,
    it.dismissed ? h('button', { class: 'btn small', onclick: () => { const x = S.items[it.id]; x.dismissed = false; st.putItem(x); } }, 'Recuperar') : null);
}

function undone(id) {
  const it = S.items[id];
  it.done = false;
  st.putItem(it);
}

function renderShop(m) {
  m.dataset.view = 'shop';
  const ls = st.lists();
  if (ui.list !== '__all' && !ls.some((l) => l.id === ui.list)) ui.list = '__all';
  const chips = h('div', { class: 'chips' },
    h('button', { class: 'chip' + (ui.list === '__all' ? ' on' : ''), onclick: () => { ui.list = '__all'; renderShop(m); } }, 'Todas', h('small', {}, shopItems().length)),
    ls.map((l) => h('button', { class: 'chip' + (ui.list === l.id ? ' on' : ''), onclick: () => { ui.list = l.id; renderShop(m); } }, l.name, h('small', {}, shopItems(l.id).length))),
    h('button', { class: 'chip', onclick: newList }, '+ Nueva lista'));

  const parts = [chips];
  if (ui.list === '__all') {
    let any = false;
    for (const l of ls) {
      const its = shopItems(l.id);
      if (!its.length) continue;
      any = true;
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, l.name), h('small', {}, its.length)),
        h('div', { class: 'list' }, sortItems(its).map(itemRow)));
    }
    if (!any) parts.push(h('div', { class: 'empty' }, icon('cart'), h('p', {}, 'No hace falta comprar nada.'),
      h('p', {}, 'Lo que baje del mínimo aparecerá aquí solo.')));
  } else {
    const l = S.lists[ui.list];
    const its = shopItems(l.id);
    if (l.id !== GENERAL) {
      parts.push(h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => {
          const n = prompt('Nuevo nombre de la lista', l.name);
          if (n && n.trim()) st.putList({ ...l, name: n.trim() });
        } }, 'Renombrar'),
        h('button', { class: 'btn small danger', onclick: () => {
          if (confirm(`¿Borrar la lista «${l.name}»? Lo que tenga pasa a «General».`)) { st.deleteList(l.id); ui.list = '__all'; render(); }
        } }, 'Borrar lista')));
    }
    parts.push(its.length ? h('div', { class: 'list' }, sortItems(its).map(itemRow))
      : h('div', { class: 'empty' }, h('p', {}, 'Lista vacía.')));

    const addIn = inp({ placeholder: 'Añadir algo a la lista…', list: 'dl-products', enterkeyhint: 'done' });
    parts.push(h('form', { class: 'add-form', onsubmit: (e) => { e.preventDefault(); addFreeItem(addIn.value, l.id); addIn.value = ''; } },
      addIn, h('button', { class: 'btn primary', 'aria-label': 'Añadir' }, icon('plus'))));

    const done = st.alive(S.items).filter((it) => it.listId === l.id && it.done);
    if (done.length) {
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'Comprado'),
        h('button', { class: 'linkbtn', onclick: () => done.forEach((it) => st.deleteItem(it.id)) }, 'Vaciar')),
        h('div', { class: 'list' }, done.map(itemRow)));
    }
    const dismissed = st.alive(S.items).filter((it) => it.listId === l.id && it.dismissed);
    if (dismissed.length) {
      parts.push(h('button', { class: 'linkbtn', onclick: () => { ui.showDismissed = !ui.showDismissed; renderShop(m); } },
        `${ui.showDismissed ? 'Ocultar' : 'Ver'} descartados (${dismissed.length})`));
      if (ui.showDismissed) parts.push(h('div', { class: 'list' }, dismissed.map(itemRow)));
    }
  }
  m.replaceChildren(...parts);
}

const sortItems = (its) => [...its].sort((a, b) => itemInfo(a).name.localeCompare(itemInfo(b).name, 'es'));

function newList() {
  const n = prompt('Nombre de la nueva lista (p. ej. IKEA, Comida)');
  if (!n || !n.trim()) return;
  const id = uid();
  st.putList({ id, name: n.trim() });
  ui.list = id;
  render();
}

function addFreeItem(text, listId) {
  const name = text.trim();
  if (!name) return;
  const key = name.toLowerCase();
  const p = st.products().find((x) => x.name.toLowerCase() === key);
  if (p) {
    const auto = S.items['auto-' + p.id];
    if (auto && !auto.del && !auto.dismissed) {
      auto.listId = listId;
      st.putItem(auto);
      toast(`${p.name} ya estaba pendiente: lo paso a esta lista`);
      return;
    }
    st.putItem({ id: uid(), productId: p.id, listId, qty: st.needs(p) ? st.suggest(p) : 1 });
  } else {
    st.putItem({ id: uid(), name, listId, qty: 1 });
  }
}

function itemSheet(id) {
  const it = S.items[id];
  const inf = itemInfo(it);
  const qIn = numInput(it.qty ? st.fmtNum(it.qty) : '');
  const lSel = select(st.lists().map((l) => [l.id, l.name]), it.listId);
  const nameIn = inf.p ? null : inp({ value: it.name || '' });
  const s = openSheet(inf.name, () => [
    it.auto ? h('p', { class: 'muted' }, `Está aquí porque hay ${st.fmtQty(st.total(inf.p), inf.unit)} y el mínimo es ${st.fmtNum(inf.p.min)}.`) : null,
    nameIn ? field('Nombre', nameIn) : null,
    h('div', { class: 'grid2' }, field(`Cantidad (${UNITS[inf.unit]})`, qIn), field('Lista', lSel)),
    h('button', { class: 'btn primary block', onclick: () => {
      const x = S.items[id];
      const q = num(qIn.value);
      if (q !== x.qty) { x.qty = q; if (x.auto) x.qtyEdited = true; }
      x.listId = lSel.value;
      if (nameIn) x.name = nameIn.value.trim() || x.name;
      st.putItem(x);
      s.close();
    } }, 'Guardar'),
    inf.p ? h('button', { class: 'btn block', onclick: () => { s.close(); openProduct(inf.p.id); } }, 'Ver ficha del artículo') : null,
    h('button', { class: 'btn danger block', onclick: () => {
      if (it.auto) { const x = S.items[id]; x.dismissed = true; st.putItem(x); toast('Quitado. Volverá cuando se reponga y vuelva a bajar.'); }
      else st.deleteItem(id);
      s.close();
    } }, 'Quitar de la lista'),
  ]);
}

function buy(id) {
  const it = S.items[id];
  const inf = itemInfo(it);
  if (!inf.p) {
    const s = openSheet(inf.name, () => [
      h('p', { class: 'muted' }, 'No está en el inventario.'),
      h('button', { class: 'btn primary block', onclick: () => {
        s.close();
        editProduct({
          preset: { id: uid(), name: inf.name, unit: 'ud', restock: true, alerts: true, lots: [], variants: [] },
          onSaved: (pid) => {
            const x = S.items[id];
            x.productId = pid; x.done = true;
            st.putItem(x);
            addStockSheet(pid, { qty: x.qty || 1 });
          },
        });
      } }, icon('box'), 'Dar de alta en el inventario'),
      h('button', { class: 'btn block', onclick: () => { s.close(); markDone(id); } }, icon('check'), 'Solo tachar'),
    ]);
    return;
  }
  const p = inf.p;
  const vSel = select(variantOptions(p), st.fav(p)?.id ?? '');
  const qIn = numInput(st.fmtNum(it.qty || 1));
  const eIn = inp({ type: 'date' });
  const s = openSheet('Comprado: ' + p.name, () => [
    field('Marca', vSel),
    h('div', { class: 'grid2' }, field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn), field('Caducidad (opcional)', eIn)),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) return qIn.focus();
      st.addStock(S.products[p.id], { variantId: vSel.value || null, qty: q, expiry: eIn.value || null });
      const x = S.items[id];
      if (x && !x.del && !x.auto) { x.done = true; st.putItem(x); }
      s.close();
      toast(`${p.name}: +${st.fmtQty(q, p.unit)} en el inventario`);
    } }, icon('check'), 'Añadir al inventario'),
    h('button', { class: 'btn block', onclick: () => {
      s.close();
      if (it.auto) { const x = S.items[id]; x.dismissed = true; st.putItem(x); } else markDone(id);
    } }, 'Tachar sin añadir'),
  ]);
}

function markDone(id) {
  const x = S.items[id];
  x.done = true;
  st.putItem(x);
  toast('Tachado', { action: 'Deshacer', onAction: () => undone(id) });
}

// ── Ajustes ────────────────────────────────────────────────
function renderSettings(m) {
  m.dataset.view = 'set';
  const set = S.settings;
  const connected = !!g.token();
  const parts = [];

  const acc = h('div', { class: 'card' }, h('h3', {}, 'Cuenta de Google'));
  if (!g.configured()) {
    acc.append(h('div', { class: 'note-box' }, 'Falta el «ID de cliente» en config.js. Sigue el paso 3 de la guía. Mientras tanto, todo se guarda solo en este móvil.'));
  } else {
    acc.append(h('p', {}, connected ? '✅ Conectada. Los datos se guardan en Drive, carpeta «Inventario Casa».' : 'Sin conectar: los datos solo están en este móvil.'));
    if (st.meta.lastSync) acc.append(h('p', { class: 'muted' }, 'Última sincronización: ' + new Date(st.meta.lastSync).toLocaleString('es-ES')));
    if (g.sync.error) acc.append(h('p', { class: 'err' }, g.sync.error));
    if (st.meta.calError) acc.append(h('p', { class: 'err' }, 'Calendario: ' + st.meta.calError));
    acc.append(h('div', { class: 'btn-row' },
      connected
        ? [h('button', { class: 'btn primary small', onclick: () => g.syncNow() }, 'Sincronizar ahora'),
          h('button', { class: 'btn small', onclick: () => { if (confirm('¿Desconectar? Los datos seguirán en el móvil y en Drive.')) { g.logout(); render(); } } }, 'Desconectar')]
        : h('button', { class: 'btn primary small', onclick: () => g.login() }, 'Conectar con Google')));
    const auto = toggle('Reconectar al abrir la app', localStorage.getItem('auto_reconnect') !== '0',
      'Google pide renovar el permiso cada hora; así se hace solo');
    auto.cb.onchange = () => localStorage.setItem('auto_reconnect', auto.cb.checked ? '1' : '0');
    acc.append(auto);
  }
  parts.push(acc);

  const mode = select([['all', 'Todos los artículos'], ['critical', 'Solo los críticos'], ['off', 'Ninguno']], set.alertsMode,
    { onchange: (e) => st.putSettings({ alertsMode: e.target.value }) });
  const days = numInput(set.expiryDays, { onchange: (e) => { const v = num(e.target.value); if (v !== null && v >= 0) st.putSettings({ expiryDays: v }); } });
  const hour = select(Array.from({ length: 17 }, (_, i) => [i + 6, `${i + 6}:00`]), set.alertHour,
    { onchange: (e) => st.putSettings({ alertHour: +e.target.value }) });
  const stock = toggle('Avisar cuando algo baje del mínimo', set.stockAlerts !== false);
  stock.cb.onchange = () => st.putSettings({ stockAlerts: stock.cb.checked });
  parts.push(h('div', { class: 'card' }, h('h3', {}, 'Avisos en Google Calendar'),
    h('p', { class: 'muted' }, 'La app crea un calendario «Inventario casa». Los avisos llegan a todos los móviles que tengan la cuenta conjunta en su app de Calendario.'),
    field('Avisar de', mode),
    h('div', { class: 'grid2' }, field('Días antes de caducar', days, 'Se puede cambiar por artículo'), field('Hora del aviso', hour)),
    stock));

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.products || !data.lists) throw new Error('No es una copia de esta app');
      if (!confirm('Esto sustituye todo el inventario por la copia. ¿Seguir?')) return;
      st.replaceAll(data);
      toast('Copia restaurada');
    } catch (e) { toast('No se pudo importar: ' + e.message); }
  } });
  parts.push(h('div', { class: 'card' }, h('h3', {}, 'Copia de seguridad'),
    h('p', { class: 'muted' }, 'Drive ya guarda una copia. Esto es por si quieres otra a mano (sin fotos).'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: exportJSON }, 'Exportar'),
      h('button', { class: 'btn small', onclick: () => fileIn.click() }, 'Importar'), fileIn)));

  parts.push(h('p', { class: 'muted', style: 'text-align:center' }, `Inventario de casa · v${VERSION}`));
  m.replaceChildren(...parts);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `inventario-${st.today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
}

// ── Estado de sincronización ───────────────────────────────
function renderPill() {
  const p = $('#syncPill');
  const map = {
    nocfg: ['Sin configurar', 'warn'], auth: ['Conectar', 'warn'], offline: ['Sin conexión', ''],
    syncing: ['Sincronizando', 'busy'], ok: [st.meta.dirty ? 'Pendiente' : 'Al día', 'ok'], error: ['Error', 'bad'], idle: ['…', ''],
  };
  const [txt, cls] = map[g.sync.status] || map.idle;
  p.textContent = txt;
  p.className = 'pill ' + cls;
  const typing = $('#main').contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (tab === 'set' && !typing) renderSettings($('#main'));
}

let syncTimer;
function scheduleSync(ms = 2500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => g.syncNow(), ms);
}

function maybeSilentLogin() {
  if (!g.configured() || g.token() || !g.everConnected() || !navigator.onLine) return false;
  if (localStorage.getItem('auto_reconnect') === '0' || sheets.length) return false;
  if (Date.now() - (+localStorage.getItem('last_silent') || 0) < 10 * 60000) return false;
  localStorage.setItem('last_silent', String(Date.now()));
  g.login({ silent: true });
  return true;
}

// ── Arranque ───────────────────────────────────────────────
async function start() {
  const res = g.handleRedirect();
  await st.load();

  $('#btnSettings').append(icon('gear'));
  $('#btnSettings').onclick = () => setTab('set');
  $('#fabAdd').append(icon('plus'), 'Nuevo');
  $('#fabAdd').onclick = () => editProduct();
  $('#btnScan').append(icon('scan'));
  $('#btnScan').onclick = () => { closeAll(); scanFlow(); };
  const invTab = $('.tab[data-tab="inv"]');
  invTab.append(icon('box'), 'Inventario');
  const shopTab = $('.tab[data-tab="shop"]');
  shopTab.append(icon('cart'), 'Compra', h('span', { class: 'count', hidden: true }));
  invTab.onclick = () => setTab('inv');
  shopTab.onclick = () => setTab('shop');
  $('#syncPill').onclick = () => {
    if (g.sync.status === 'nocfg') setTab('set');
    else if (g.sync.status === 'auth') g.login();
    else g.syncNow();
  };

  st.onChange(({ local }) => { rerender(); if (local) scheduleSync(); });
  g.onStatus(renderPill);
  render();
  renderPill();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (res?.ok) toast('Conectado con Google');
  else if (res?.error && res.error !== 'state') {
    if (/required/.test(res.error)) toast('Toca «Conectar» para volver a sincronizar');
    else if (res.error !== 'access_denied') toast('No se pudo conectar: ' + res.error);
  }
  if (!res && maybeSilentLogin()) return;
  g.syncNow();

  addEventListener('online', () => g.syncNow());
  addEventListener('offline', () => g.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    rerender();
    if (!maybeSilentLogin()) g.syncNow();
  });
  setInterval(() => { if (document.visibilityState === 'visible') g.syncNow(); }, 5 * 60000);
}

start();
