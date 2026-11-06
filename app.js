// Interfaz principal: pestañas, inventario, ficha y editor de artículos, escáner.
import * as st from './store.js';
import { S, UNITS, uid } from './store.js';
import * as g from './google.js';
import { scanBarcode } from './scanner.js';
import { photoSet, photoDel } from './db.js';
import { D, loadDevice, onDeviceChange, setDevice } from './device.js';
import {
  $, h, icon, badge, hue, num, field, inp, toggle, select, numInput, indent, toast, openSheet, sheets, closeAll, nav, resizeImage,
} from './ui.js';
import { locSelect, openLocations, moveSheet, fromReserveSheet, openLocPicker, locChip, locCrumb, locColor } from './locations.js';
import { renderShop, shopItems, focusQuickAdd } from './shop.js';
import { loadRecent, search as qaSearch, addCandidate } from './quickadd.js';
import { lookupBarcode, fetchImage, bestBasicFor } from './off.js';
import { openSuper, isSuperOpen } from './supermode.js';
import { openStockIn } from './stockin.js';
import { renderSettings } from './settings.js';
import { renderStores } from './stores.js';
import { renderRecipes, editRecipe, openRecipe } from './recipes.js';
import { catalogPicker, openCatalog, label } from './catalog.js';
import { openProductDB, findBasic, basicFields, approxExpiry, BASICOS } from './productdb.js';

// ── Estado de la interfaz ──────────────────────────────────
let tab = 'shop';
const ui = { q: '', filter: 'all', loc: '', tag: '', store: '' };

function setTab(t) {
  tab = t;
  $('#main').dataset.view = '';
  render();
  scrollTo(0, 0);
}

function render() {
  $('#title').textContent = { inv: 'Inventario', shop: 'Compra', recipes: 'Recetas', stores: 'Tiendas', set: 'Ajustes' }[tab];
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#fabAdd').hidden = !['inv', 'recipes', 'shop'].includes(tab);
  $('#fabAdd').lastChild.textContent = tab === 'shop' ? 'Apuntar' : 'Nuevo';
  const m = $('#main');
  if (tab === 'inv') renderInv(m);
  else if (tab === 'shop') renderShop(m);
  else if (tab === 'stores') renderStores(m);
  else if (tab === 'recipes') renderRecipes(m);
  else renderSettings(m);
  updateCounts();
  fillDatalists();
}

function rerender() {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') && $('#main').contains(document.activeElement);
  if (!(tab === 'set' && typing)) render();
  else updateCounts();
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
  fill('dl-products', ps.map((p) => p.name));
  if (!$('#dl-basicos').children.length) fill('dl-basicos', BASICOS.map((b) => b.name));
}

// ── Inventario ─────────────────────────────────────────────
function matches(p, q) {
  if (!q) return true;
  const hay = st.norm([p.name, st.loc(p), p.notes, ...st.productTags(p).map((t) => t.name), ...st.productStores(p).map((x) => x.name),
    ...(p.variants || []).flatMap((v) => [v.brand, v.barcode])]
    .filter(Boolean).join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderInv(m) {
  if (m.dataset.view !== 'inv') {
    m.dataset.view = 'inv';
    const search = h('input', { type: 'search', placeholder: 'Buscar artículo, marca, sitio…', value: ui.q, enterkeyhint: 'search' });
    search.addEventListener('input', () => { ui.q = search.value; renderInvList(); });
    m.replaceChildren(
      h('div', { class: 'search' }, icon('search'), search,
        h('button', { class: 'search-btn', onclick: () => openProductDB(), 'aria-label': 'Añadir productos básicos' }, '＋ Básicos')),
      h('div', { class: 'seg inv-seg', id: 'invSeg' }),
      h('div', { class: 'chips', id: 'invChips' }),
      h('div', { class: 'list', id: 'invList' }),
    );
  }
  renderInvList();
}

// Ramas abiertas de la vista «Por sitios» (se recuerdan en este móvil).
let invOpen = null;
function loadInvOpen() {
  if (invOpen) return invOpen;
  try { const v = JSON.parse(localStorage.getItem('invOpen') || 'null'); invOpen = new Set(Array.isArray(v) ? v : st.locChildren(null).map((l) => l.id)); } catch { invOpen = new Set(st.locChildren(null).map((l) => l.id)); }
  return invOpen;
}
function saveInvOpen() { try { localStorage.setItem('invOpen', JSON.stringify([...invOpen])); } catch {} }
const justSaved = { ids: new Set(), until: 0 };
// Muestra el inventario (sin filtros) resaltando unos artículos, p. ej. lo que se acaba de guardar.
function showInInventory(ids = []) {
  Object.assign(ui, { q: '', filter: 'all', loc: '', tag: '', store: '' });
  justSaved.ids = new Set(ids);
  justSaved.until = Date.now() + 8000;
  const o = loadInvOpen();
  for (const id of ids) for (const l of S.products[id]?.lots || []) st.locPath(l.locationId).forEach((x) => o.add(x.id));
  saveInvOpen();
  setTab('inv');
}

// Vista «Por sitios»: estancia › mueble › estante desplegables, con lo que hay en cada uno.
function invTree(list, q) {
  const own = new Map(); // ubicación → [{ p, qty, exp }]
  const add = (lid, p, qty, exp) => { const k = lid && st.getLoc(lid) ? lid : ''; if (!own.has(k)) own.set(k, []); own.get(k).push({ p, qty, exp }); };
  for (const p of list) {
    const lots = (p.lots || []).filter((l) => +l.qty > 0);
    if (!lots.length) { add(p.locationId, p, 0, null); continue; }
    const m = new Map();
    for (const l of lots) {
      const k = l.locationId && st.getLoc(l.locationId) ? l.locationId : '';
      const x = m.get(k) || { qty: 0, exp: null };
      x.qty = st.round(x.qty + +l.qty);
      if (l.expiry && (!x.exp || l.expiry < x.exp)) x.exp = l.expiry;
      m.set(k, x);
    }
    for (const [k, x] of m) add(k, p, x.qty, x.exp);
  }
  const memo = new Map();
  const count = (id) => {
    if (memo.has(id)) return memo.get(id);
    const n = (own.get(id) || []).length + st.locChildren(id).reduce((a, k) => a + count(k.id), 0);
    memo.set(id, n);
    return n;
  };
  const o = loadInvOpen();
  const filtered = !!q || ui.filter !== 'all' || ui.tag || ui.store;
  const node = (l, depth) => {
    const n = count(l.id);
    if (!n && filtered) return null;
    const isOpen = o.has(l.id) || (filtered && n > 0);
    const kids = st.locChildren(l.id);
    const c = locColor(l.id);
    return h('div', { class: `inv-node d${Math.min(depth, 2)}`, style: `--lh:${c.h};--ls:${c.s}%` },
      h('button', { class: 'inv-loc', onclick: () => { if (o.has(l.id)) o.delete(l.id); else o.add(l.id); saveInvOpen(); renderInvList(); } },
        h('span', { class: 'lp-caret' }, kids.length || (own.get(l.id) || []).length ? (isOpen ? '▾' : '▸') : ''),
        h('span', { class: 'inv-loc-name' }, l.symbol ? l.symbol + ' ' : '', l.name),
        st.isReserve(l.id) && !st.isReserve(l.parentId) ? h('small', { class: 'inv-res' }, 'reserva') : null,
        h('span', { class: 'inv-count' }, n)),
      isOpen ? h('div', { class: 'inv-kids' },
        (own.get(l.id) || []).sort((a, b) => a.p.name.localeCompare(b.p.name, 'es')).map((x) => invItem(x)),
        kids.map((k) => node(k, depth + 1))) : null);
  };
  const none = own.get('') || [];
  return [
    ...st.locChildren(null).map((l) => node(l, 0)),
    none.length ? h('div', { class: 'inv-node none' },
      h('div', { class: 'inv-loc' }, h('span', { class: 'lp-caret' }), h('span', { class: 'inv-loc-name' }, 'Sin ubicación'), h('span', { class: 'inv-count' }, none.length)),
      h('div', { class: 'inv-kids' }, none.sort((a, b) => a.p.name.localeCompare(b.p.name, 'es')).map((x) => invItem(x)))) : null,
  ].filter(Boolean);
}
function invItem({ p, qty, exp }) {
  const t = st.today();
  const soon = exp && exp <= st.addDays(t, st.expiryDaysOf(p));
  return h('button', { class: 'row inv-item' + (justSaved.ids.has(p.id) && Date.now() < justSaved.until ? ' just' : ''), onclick: () => openProduct(p.id) },
    thumbFor(p, 'thumb sm'),
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name),
      exp ? h('div', { class: 'row-sub' }, (exp < t ? '⚠️ Caducado ' : soon ? '⏳ Caduca ' : 'Caduca ') + st.fmtDate(exp)) : null),
    h('div', { class: 'row-qty' + (qty <= 0 ? ' zero' : '') }, h('b', {}, st.fmtNum(qty)), h('small', {}, UNITS[p.unit || 'ud'])));
}

function renderInvList() {
  const all = st.products();
  const q = st.norm(ui.q);
  const filters = {
    all: ['Todo', () => true],
    soon: ['Caduca pronto', (p) => !!st.productExpiry(p)],
    low: ['Bajo mínimo', (p) => st.needs(p)],
    empty: ['Agotado', (p) => st.total(p) <= 0],
    reserve: ['Con reserva', (p) => st.inReserve(p) > 0],
    critical: ['Críticos', (p) => !!p.critical],
  };
  const tree = st.locTree();
  const F = D.invFilters;
  if (ui.loc && !st.getLoc(ui.loc)) ui.loc = '';
  if (ui.filter !== 'all' && F[ui.filter] === false) ui.filter = 'all';
  $('#invChips').replaceChildren(...[
    !F.loc ? null : tree.length
      ? h('button', { class: 'chip loc-filter' + (ui.loc ? ' on' : ''), onclick: () => openLocPicker({
          value: ui.loc || null, none: null, allowNew: false, title: 'Ver lo que hay en…',
          extra: [['', '📍 Todas las ubicaciones'], ['__manage', '⚙ Gestionar ubicaciones…']],
          onPick: (v) => { if (v === '__manage') { openLocations(); return; } ui.loc = v || ''; renderInvList(); },
        }) }, ui.loc ? locChip(ui.loc, { small: true }) : '📍 Todas las ubicaciones', ' ▾')
      : h('button', { class: 'chip', onclick: openLocations }, '+ Ubicaciones'),
    F.tag ? catSelect('tags', 'Todas las categorías', ui.tag, (v) => { ui.tag = v; }) : null,
    F.store ? catSelect('stores', 'Todas las tiendas', ui.store, (v) => { ui.store = v; }) : null,
    ...Object.entries(filters).map(([k, [label, fn]]) => {
      if (k !== 'all' && F[k] === false) return null;
      const n = all.filter(fn).length;
      if (k !== 'all' && k !== ui.filter && !n) return null;
      return h('button', { class: 'chip' + (ui.filter === k ? ' on' : ''), onclick: () => { ui.filter = k; renderInvList(); } },
        label, k !== 'all' ? h('small', {}, n) : null);
    }),
  ].filter(Boolean));
  const set = ui.loc ? st.locSubtree(ui.loc) : null;
  if (ui.tag && !st.getTag(ui.tag)) ui.tag = '';
  if (ui.store && !st.getStore(ui.store)) ui.store = '';
  if (!F.loc) ui.loc = '';
  if (!F.tag) ui.tag = '';
  if (!F.store) ui.store = '';
  const showEmpty = D.invShowEmpty || ['empty', 'low'].includes(ui.filter) || q;
  const list = all.filter((p) => filters[ui.filter][1](p) && (!set || st.productInLoc(p, set)) && matches(p, q)
    && st.productHasTag(p, ui.tag) && (!ui.store || (p.stores || []).includes(ui.store))
    && (showEmpty || st.total(p) > 0));
  sortProducts(list);
  const seg = $('#invSeg');
  const view = D.invView === 'tree' && tree.length ? 'tree' : 'list';
  seg.hidden = !tree.length;
  seg.replaceChildren(
    h('button', { class: view === 'list' ? 'on' : '', onclick: () => { setDevice({ invView: 'list' }); renderInvList(); } }, '☰ Lista'),
    h('button', { class: view === 'tree' ? 'on' : '', onclick: () => { setDevice({ invView: 'tree' }); renderInvList(); } }, '🗂️ Por sitios'));
  const box = $('#invList');
  if (!all.length) {
    box.replaceChildren(h('div', { class: 'empty' }, icon('box'), h('p', {}, 'Todavía no hay nada.'),
      h('p', {}, 'Escanea un código con el botón verde, toca «Nuevo» o empieza con los básicos:'),
      h('button', { class: 'btn primary', onclick: () => openProductDB() }, '📚 Añadir productos básicos')));
  } else if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Nada coincide con la búsqueda.')));
  } else if (view === 'tree') {
    box.replaceChildren(...invTree(list, q));
  } else {
    box.replaceChildren(...list.map(productRow));
  }
}

// Desplegable de etiquetas o tiendas para los filtros (con acceso al gestor).
function catSelect(kind, all, value, set) {
  const arr = st.catalog(kind);
  if (!arr.length) return null;
  const lab = (r) => (kind === 'tags' && st.tagDepth(r) ? '\u00a0\u00a0\u00a0› ' : '') + label(r);
  return select([['', all], ...arr.map((r) => [r.id, lab(r)]), ['__manage', kind === 'tags' ? '⚙ Gestionar categorías…' : '⚙ Gestionar tiendas…']], value, {
    class: 'chip' + (value ? ' on' : ''),
    onchange: (e) => {
      if (e.target.value === '__manage') { e.target.value = value; openCatalog(kind); return; }
      set(e.target.value);
      renderInvList();
    },
  });
}

function firstExpiry(p) {
  return (p.lots || []).filter((l) => +l.qty > 0 && l.expiry).map((l) => l.expiry).sort()[0] || '9999';
}
function sortProducts(list) {
  const by = {
    location: (a, b) => (st.loc(a) || '\uffff').localeCompare(st.loc(b) || '\uffff', 'es') || a.name.localeCompare(b.name, 'es'),
    expiry: (a, b) => firstExpiry(a).localeCompare(firstExpiry(b)) || a.name.localeCompare(b.name, 'es'),
    qty: (a, b) => st.total(a) - st.total(b) || a.name.localeCompare(b.name, 'es'),
  }[D.invSort];
  if (by) list.sort(by);
}

// Ubicación propuesta al añadir existencias (según el ajuste del móvil).
function stockLocFor(p) {
  return D.stockLoc === 'device' ? D.defaultLocationId || p.locationId || '' : p.locationId || D.defaultLocationId || '';
}

function thumbFor(p, cls = 'thumb') {
  const tag = st.productTags(p)[0];
  const sym = p.symbol || tag?.symbol;
  const pic = p.photo || p.photoUrl;
  const t = h('div', { class: cls + (sym && !pic ? ' emoji' : ''), style: `--hue:${hue(tag?.name || p.name)}` },
    sym && !pic ? sym : (p.name || '?').trim().charAt(0).toUpperCase());
  if (p.photo) g.photoURL(p.photo).then((u) => { if (u) { t.textContent = ''; t.style.backgroundImage = `url("${u}")`; } });
  else if (p.photoUrl && navigator.onLine) { t.textContent = ''; t.style.backgroundImage = `url("${p.photoUrl}")`; }
  return t;
}

function productRow(p) {
  const tot = st.total(p);
  const res = st.inReserve(p);
  const ex = st.productExpiry(p);
  const where = [...new Set((p.lots || []).filter((l) => +l.qty > 0).map((l) => l.locationId || ''))];
  const locEl = where.length
    ? [locCrumb(where[0], { small: true }), where.length > 1 ? h('small', {}, `+${where.length - 1}`) : null]
    : [locCrumb(p.locationId, { small: true })];
  const sub = h('div', { class: 'row-sub row-locs' }, locEl, res > 0 ? h('small', {}, `${st.fmtNum(res)} en reserva`) : null);
  const syms = st.productTags(p).slice(p.photo ? 0 : 1).map((t) => t.symbol).join('');
  return h('button', { class: 'row' + (justSaved.ids.has(p.id) && Date.now() < justSaved.until ? ' just' : ''), onclick: () => openProduct(p.id) },
    thumbFor(p),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, p.name, syms ? h('span', { class: 'syms' }, syms) : null),
      sub,
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
    const res = st.inReserve(p);
    const out = [];
    if (p.photo) {
      const img = h('img', { class: 'hero', alt: '' });
      g.photoURL(p.photo).then((u) => { if (u) img.src = u; else img.remove(); });
      out.push(img);
    } else if (p.photoUrl && navigator.onLine) {
      out.push(h('img', { class: 'hero contain', alt: '', src: p.photoUrl, onerror: (e) => e.target.remove() }));
    }
    out.push(h('div', { class: 'meta-line' }, st.productTags(p).map((t) => badge(label(t))),
      st.loc(p) ? h('span', { class: 'meta-loc' }, '📍 ', locCrumb(p.locationId, { small: true })) : h('span', {}, 'Sin ubicación habitual')));
    if (st.productStores(p).length) out.push(h('div', { class: 'meta-line', style: 'margin-top:6px' }, 'Se compra en: ', st.productStores(p).map((x) => badge(label(x), 'ok'))));
    out.push(h('div', { class: 'stock' },
      h('div', {}, h('b', { class: 'big' }, st.fmtNum(tot)), ' ', UNITS[p.unit || 'ud']),
      h('div', { class: 'muted' },
        p.restock === false ? 'No se repone'
          : +p.min > 0 ? `Mínimo ${st.fmtNum(p.min)} · reponer hasta ${st.fmtNum(+p.target > 0 ? p.target : p.min)}` : 'Sin mínimo')));
    if (res > 0) {
      out.push(h('div', { class: 'split' },
        h('span', {}, `A mano: ${st.fmtQty(st.atHand(p), p.unit)}`), h('span', {}, `En reserva: ${st.fmtQty(res, p.unit)}`),
        h('button', { class: 'linkbtn', onclick: () => fromReserveSheet(id) }, 'Traer de la reserva')));
    }
    // Un tupper (raciones guardadas de una receta) no se compra: en vez de «A lista», su receta.
    const tupR = p.tupper && S.recipes[p.recipeId] && !S.recipes[p.recipeId].del ? S.recipes[p.recipeId] : null;
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', disabled: tot <= 0, onclick: () => spend(id) }, icon('minus'), p.tupper ? 'Comer' : 'Gastar'),
      h('button', { class: 'btn primary', onclick: () => addStockSheet(id) }, icon('plus'), 'Añadir'),
      tupR ? h('button', { class: 'btn', onclick: () => openRecipe(tupR.id) }, '📖 Receta')
        : p.tupper ? null : h('button', { class: 'btn', onclick: () => addToListSheet(id) }, icon('cart'), 'A lista')));
    if (!p.tupper) out.push(h('button', { class: 'btn block finished-btn', onclick: () => finished(id) }, '🚫 Se ha acabado (y apuntarlo)'));

    out.push(h('h3', {}, 'Existencias'));
    const lots = [...(p.lots || [])].sort((a, b) => (st.isReserve(a.locationId) - st.isReserve(b.locationId))
      || st.locName(a.locationId).localeCompare(st.locName(b.locationId), 'es')
      || (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    if (!lots.length) out.push(h('p', { class: 'muted' }, 'No queda nada.'));
    let lastLoc;
    for (const l of lots) {
      if (l.locationId !== lastLoc) {
        lastLoc = l.locationId;
        out.push(h('div', { class: 'loc-group' }, locCrumb(l.locationId),
          l.locationId && st.isReserve(l.locationId) ? badge('reserva', 'low') : null));
      }
      out.push(lotRow(p, l));
    }

    if (!p.tupper) out.push(h('h3', {}, 'Marcas y códigos'));
    if (!(p.variants || []).length && !p.tupper) out.push(h('p', { class: 'muted' }, 'Sin marcas. Puedes añadirlas en «Editar».'));
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
    const val = num(prompt(`Cantidad (${UNITS[p.unit || 'ud']})`, st.fmtNum(l.qty)));
    if (val === null || isNaN(val)) return;
    change(val - l.qty);
  };
  return h('div', { class: 'lot' },
    h('div', { class: 'row-main' },
      h('div', {}, p.tupper ? `${st.fmtNum(l.qty)} ${+l.qty === 1 ? 'ración' : 'raciones'}` : v ? (v.fav ? '★ ' : '') + (v.brand || 'Sin nombre de marca') : 'Sin marca'),
      h('div', { class: 'row-sub' }, l.expiry ? (p.tupper ? 'Hasta el ' : 'Caduca ') + st.fmtDate(l.expiry) : 'Sin caducidad',
        ex === 'expired' ? [' · ', badge('Caducado', 'bad')] : ex === 'soon' ? [' · ', badge('Pronto', 'warn')] : null)),
    h('div', { class: 'stepper' },
      h('button', { 'aria-label': 'Menos', onclick: () => (isUd ? change(-1) : setQty()) }, icon('minus')),
      h('b', { onclick: setQty }, st.fmtNum(l.qty)),
      h('button', { 'aria-label': 'Más', onclick: () => (isUd ? change(1) : setQty()) }, icon('plus')),
      h('button', { 'aria-label': 'Mover', class: 'mv', onclick: () => moveSheet(p.id, l.id) }, icon('move'))));
}

// «Se ha acabado»: pone a cero lo que hay a mano y lo apunta en la lista (si no estaba).
function finished(id) {
  const p = S.products[id];
  const before = st.clone(p.lots || []);
  p.lots = (p.lots || []).filter((l) => st.isReserve(l.locationId));
  st.putProduct(p);
  let added = null;
  if (!st.onList(S.products[id])) {
    added = uid();
    st.putItem({ id: added, productId: id, listId: st.validList(p.listId), qty: +p.min > 0 ? st.suggest(S.products[id]) : 1 });
  }
  const res = st.inReserve(S.products[id]);
  toast(`${p.name}: apuntado en la lista${res > 0 ? ` (quedan ${st.fmtQty(res, p.unit)} en reserva)` : ''}`, { action: 'Deshacer', ms: 6000, onAction: () => {
    const q = S.products[id];
    q.lots = before;
    st.putProduct(q);
    if (added) st.deleteItem(added);
  } });
}

function spend(id) {
  const p = S.products[id];
  const before = st.clone(p.lots || []);
  const undo = () => { const q = S.products[id]; q.lots = before; st.putProduct(q); };
  if ((p.unit || 'ud') === 'ud') {
    st.consume(p, 1);
    toast(`Gastado 1 de ${p.name}`, { action: 'Deshacer', onAction: undo });
    return;
  }
  const amount = numInput('', { placeholder: '0' });
  const s = openSheet('Gastar ' + p.name, () => [
    field(`Cantidad (${UNITS[p.unit]})`, amount, `Hay ${st.fmtQty(st.total(p), p.unit)}. Se gasta primero lo que está a mano y caduca antes.`),
    h('button', { class: 'btn primary block', onclick: () => {
      const a = num(amount.value);
      if (!a || a <= 0) { amount.focus(); return; }
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
  const where = locSelect(stockLocFor(p));
  const s = openSheet('Añadir ' + p.name, () => [
    field('Marca', vSel),
    h('div', { class: 'grid2' },
      field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn),
      field('Caducidad (opcional)', eIn)),
    expiryHint(p, eIn),
    field('Dónde lo guardas', where),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) { qIn.focus(); return; }
      st.addStock(S.products[id], { variantId: vSel.value || null, qty: q, expiry: eIn.value || null, locationId: where.value || null });
      s.close();
      toast(`Añadido ${st.fmtQty(q, p.unit)} de ${p.name}`);
      onDone?.();
    } }, icon('plus'), 'Añadir al inventario'),
  ]);
}

// Enlace para poner la caducidad aproximada de un básico (p. ej. pan: 2 días).
export function expiryHint(p, eIn) {
  const d = approxExpiry(p);
  if (!d) return null;
  return h('p', { class: 'hint' }, `Suele durar unos ${p.shelfLife} días. `,
    h('button', { type: 'button', class: 'linkbtn', onclick: () => { eIn.value = d; } }, `Poner ${st.fmtDate(d)} (aprox.)`));
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
// Artículo nuevo con los valores por defecto de este móvil.
function newProductDraft(name = '') {
  return {
    id: uid(), name, unit: D.newUnit || 'ud', variants: [], lots: [], restock: D.newRestock !== false, alerts: D.newAlerts !== false,
    locationId: D.defaultLocationId || null, listId: D.newListId && S.lists[D.newListId] && !S.lists[D.newListId].del ? D.newListId : null,
  };
}
function editProduct({ id = null, preset = null, onSaved, focusBrand = false } = {}) {
  const isNew = !id || !S.products[id];
  const p = preset ? st.clone(preset) : isNew
    ? newProductDraft()
    : st.clone(S.products[id]);
  p.variants = p.variants || [];
  p.lots = p.lots || [];
  const oldLoc = isNew ? null : S.products[p.id]?.locationId || null;
  let newPhoto = null;
  let removePhoto = false;

  const name = inp({ value: p.name || '', placeholder: 'p. ej. Garbanzos cocidos', autocapitalize: 'sentences', list: isNew ? 'dl-basicos' : null });
  const symIn = inp({ value: p.symbol || '', class: 'inp sym-input', maxlength: 8, placeholder: '🙂', 'aria-label': 'Símbolo' });
  const tagPick = catalogPicker('tags', p.tags || []);
  const storePick = catalogPicker('stores', p.stores || []);
  const where = locSelect(p.locationId || '');
  const unit = select(Object.entries({ ud: 'Unidades', kg: 'Kilos', g: 'Gramos', l: 'Litros', ml: 'Mililitros', rac: 'Raciones' }), p.unit || 'ud');
  // Rellena con los datos de la base de productos básicos (sin pisar lo que ya hayas puesto).
  const applyBasic = (b, force = false) => {
    const f = basicFields(b);
    if (force || !name.value.trim()) name.value = f.name;
    if (force || !symIn.value.trim()) symIn.value = f.symbol;
    if (force || !tagPick.value.length) tagPick.set(f.tags);
    if (force || unit.value === (D.newUnit || 'ud')) unit.value = f.unit;
    if (f.locationId && (force || !where.value || where.value === (D.defaultLocationId || ''))) where.refill(f.locationId);
    p.shelfLife = f.shelfLife;
  };
  if (isNew) name.addEventListener('change', () => { const b = findBasic(name.value); if (b) applyBasic(b); });
  const min = numInput(p.min ?? '', { placeholder: '0' });
  const target = numInput(p.target ?? '', { placeholder: 'igual que el mínimo' });
  const restock = toggle('Reponer', p.restock !== false, 'Si lo apagas, nunca entra en la lista de la compra');
  const listSel = select([['', 'General'], ...st.lists().filter((l) => l.id !== st.GENERAL).map((l) => [l.id, l.name])], p.listId || '');
  const alerts = toggle('Avisos en el calendario', p.alerts !== false);
  const critical = toggle('Crítico', !!p.critical, 'Avisa aunque en Ajustes elijas «solo críticos»');
  const expiryDays = numInput(p.expiryDays ?? '', { placeholder: `${S.settings.expiryDays} (por defecto)` });
  const notes = h('textarea', { class: 'inp', placeholder: 'Cualquier comentario' }, p.notes || '');

  // Foto
  const photoThumb = thumbFor(p);
  if (!p.photo && !p.photoUrl) photoThumb.replaceChildren(icon('camera'));
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoDelBtn = h('button', { class: 'btn small danger', hidden: !p.photo && !p.photoUrl, onclick: (e) => {
    e.preventDefault(); removePhoto = true; newPhoto = null; p.photoUrl = null; photoThumb.style.backgroundImage = ''; photoThumb.replaceChildren(icon('camera')); photoDelBtn.hidden = true;
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
    const ids = new Set(vars.map((v) => v.id));
    p.lots.forEach((l) => { if (l.variantId && !ids.has(l.variantId)) l.variantId = null; });
    const newLoc = where.value || null;
    if (!isNew && newLoc !== oldLoc) {
      const there = p.lots.filter((l) => (l.locationId || null) === oldLoc);
      if (there.length && confirm(`¿Mover también lo que hay en «${st.locName(oldLoc) || 'sin ubicación'}» a «${st.locName(newLoc) || 'sin ubicación'}»?`)) {
        there.forEach((l) => { l.locationId = newLoc; });
      }
    }
    Object.assign(p, {
      name: nm, symbol: symIn.value.trim() || null, tags: tagPick.value, stores: storePick.value, locationId: newLoc,
      unit: unit.value, min: num(min.value) ?? 0, target: num(target.value), restock: restock.cb.checked, listId: listSel.value || null,
      alerts: alerts.cb.checked, critical: critical.cb.checked, expiryDays: num(expiryDays.value), notes: notes.value.trim(), variants: vars,
    });
    const old = !isNew ? S.products[p.id]?.photo : null;
    if (newPhoto) {
      const pid = uid();
      await photoSet(pid, newPhoto);
      p.photo = { id: pid, driveId: null };
      p.photoUrl = null;
    } else if (removePhoto) p.photo = null;
    if (old && (newPhoto || removePhoto)) photoDel(old.id);
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
    isNew ? h('button', { class: 'btn block', onclick: (e) => { e.preventDefault(); openProductDB({ onPick: (b) => applyBasic(b, true) }); } }, '📚 Elegir de la base de productos') : null,
    h('div', { class: 'sym-row' }, field('Símbolo', symIn), field('Nombre', name)),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Categorías (opcional)'), tagPick),
    field('Ubicación habitual', where, 'Dónde se guarda normalmente. Las existencias pueden estar repartidas.'),

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
        field('Mínimo a mano', min, 'Avisa si hay menos (sin contar la reserva)'),
        field('Reponer hasta', target, 'Cantidad que quieres tener')),
      restock,
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Dónde se compra'), storePick),
      field('Lista habitual', listSel, 'Dónde aparece cuando hay que reponerlo')),

    h('fieldset', {}, h('legend', {}, 'Avisos'),
      alerts, critical,
      field('Días de antelación al caducar', expiryDays)),

    field('Notas', notes),
    h('button', { class: 'btn primary block', onclick: save }, icon('check'), 'Guardar'),
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      if (!confirm(`¿Borrar «${p.name}» y todas sus existencias?`)) return;
      if (p.photo) photoDel(p.photo.id);
      st.deleteProduct(p.id);
      s.close();
      toast('Artículo borrado');
    } }, 'Borrar artículo') : null,
  ]);
  if (isNew && !name.value) setTimeout(() => name.focus(), 300);
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
      h('button', { class: 'btn primary block', onclick: () => { s.close(); addToListSheet(id); } }, icon('cart'), 'Apuntar en la lista de la compra'),
      h('button', { class: 'btn block', onclick: () => { s.close(); finished(id); } }, '🚫 Se ha acabado'),
      h('button', { class: 'btn block', onclick: () => { s.close(); scanFlow(); } }, icon('scan'), 'Escanear otro'),
    ];
  }, { live: true });
}

// Código que no está en el inventario: se busca en Open Food Facts para rellenar nombre, marca y foto.
function unknownCode(code) {
  let loading = navigator.onLine;
  let off = null;
  const addBrandTo = (id, brand) => {
    const p = st.clone(S.products[id]);
    p.variants = p.variants || [];
    const v = { id: uid(), brand: brand || '', barcode: code, fav: !p.variants.length };
    p.variants.push(v);
    editProduct({ id, preset: p, focusBrand: !brand, onSaved: (pid) => addStockSheet(pid, { variantId: v.id }) });
  };
  const create = async (name, b) => {
    s.close();
    const preset = { ...newProductDraft(), ...(b ? basicFields(b) : {}), name: name || '',
      variants: [{ id: uid(), brand: off?.brand || '', barcode: code, fav: true }] };
    if (off?.quantity) preset.notes = 'Formato: ' + off.quantity;
    if (off?.image) {
      const blob = await fetchImage(off.image);
      if (blob) {
        const pid = uid();
        await photoSet(pid, await resizeImage(blob));
        preset.photo = { id: pid, driveId: null };
      } else preset.photoUrl = off.image;
    }
    editProduct({ preset, onSaved: (id) => addStockSheet(id) });
  };
  const s = openSheet('Código nuevo', () => {
    const b = off ? bestBasicFor(off.name) : null;
    const same = b ? st.products().find((p) => st.norm(p.name) === st.norm(b.name)) : null;
    return [
      h('p', {}, 'El código ', h('b', {}, code), ' no está en el inventario.'),
      loading ? h('p', { class: 'muted' }, 'Buscando en Open Food Facts…') : null,
      off ? h('div', { class: 'off-card' },
        off.image ? h('img', { src: off.image, alt: '', onerror: (e) => e.target.remove() }) : null,
        h('div', {}, h('b', {}, off.name), h('div', { class: 'muted' }, [off.brand, off.quantity].filter(Boolean).join(' · ')),
          h('small', { class: 'hint' }, 'Datos de Open Food Facts'))) : null,
      !loading && !off ? h('p', { class: 'muted' }, navigator.onLine ? 'No aparece en Open Food Facts: créalo a mano.' : 'Sin conexión: créalo a mano.') : null,
      same ? h('button', { class: 'btn primary block', onclick: () => { s.close(); addBrandTo(same.id, off.brand); } },
        `Es otra marca de «${same.name}»`) : null,
      off ? h('button', { class: 'btn block' + (same ? '' : ' primary'), onclick: () => create(off.name, b) }, icon('plus'), `Crear «${off.name}»`) : null,
      off && b && !same && st.norm(b.name) !== st.norm(off.name)
        ? h('button', { class: 'btn block', onclick: () => create(b.name, b) }, `Crear como «${b.name}» (nombre genérico)`) : null,
      h('button', { class: 'btn block' + (!off ? ' primary' : ''), onclick: () => create('', null) }, icon('plus'), off ? 'Crear a mano' : 'Crear artículo nuevo'),
      h('button', { class: 'btn block', onclick: () => {
        s.close();
        pickProduct('¿De qué artículo es esta marca?', (id) => addBrandTo(id, off?.brand));
      } }, 'Es otra marca de un artículo que ya tengo'),
    ];
  }, { live: true });
  if (loading) lookupBarcode(code).then((r) => { off = r; loading = false; s.refresh(); });
}

function pickProduct(title, onPick) {
  const q = h('input', { type: 'search', placeholder: 'Buscar…' });
  const box = h('div');
  const fill = () => {
    const t = st.norm(q.value);
    box.replaceChildren(...st.products().filter((p) => matches(p, t)).slice(0, 60).map((p) =>
      h('div', { class: 'pick-row' }, h('button', { class: 'row', onclick: () => { s.close(); onPick(p.id); } }, thumbFor(p),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name), h('div', { class: 'row-sub' }, st.loc(p)))))));
  };
  q.addEventListener('input', fill);
  const s = openSheet(title, () => [h('div', { class: 'search', style: 'margin-bottom:10px' }, icon('search'), q), box]);
  fill();
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
// Pestañas visibles, tema y tamaño de letra de este móvil.
function applyChrome() {
  const vis = { inv: true, shop: true, recipes: D.tabs.recipes !== false, stores: D.tabs.stores !== false, set: true };
  document.querySelectorAll('.tab').forEach((b) => { b.hidden = !vis[b.dataset.tab]; });
  if (!vis[tab]) tab = 'shop';
  const root = document.documentElement;
  if (D.theme === 'light' || D.theme === 'dark') root.dataset.theme = D.theme; else delete root.dataset.theme;
  const dark = D.theme === 'dark' || (D.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#171614' : '#2f7d5b';
  document.body.style.zoom = String(+D.fontScale || 1);
}

Object.assign(nav, { showInInventory, render, rerender, setTab, openProduct, openRecipe, expiryHint, newProductDraft, stockLocFor, applyChrome, editProduct, addStockSheet, variantOptions, scheduleSync });

async function start() {
  const res = g.handleRedirect();
  await st.load();
  await loadDevice();
  await loadRecent();
  tab = D.startTab === 'inv' || (['stores', 'recipes'].includes(D.startTab) && D.tabs[D.startTab] !== false) ? D.startTab : 'shop';

  $('#btnSettings').append(icon('gear'));
  $('#btnSettings').onclick = () => setTab('set');
  $('#fabAdd').append(icon('plus'), 'Nuevo');
  $('#fabAdd').onclick = () => (tab === 'recipes' ? editRecipe() : tab === 'shop' ? focusQuickAdd() : editProduct());
  $('#btnScan').append(icon('scan'));
  $('#btnScan').onclick = () => { closeAll(); scanFlow(); };
  const invTab = $('.tab[data-tab="inv"]');
  invTab.append(icon('box'), 'Inventario');
  const shopTab = $('.tab[data-tab="shop"]');
  shopTab.append(icon('cart'), 'Compra', h('span', { class: 'count', hidden: true }));
  const recTab = $('.tab[data-tab="recipes"]');
  recTab.append(icon('book'), 'Recetas');
  recTab.onclick = () => setTab('recipes');
  const storesTab = $('.tab[data-tab="stores"]');
  storesTab.append(icon('store'), 'Tiendas');
  invTab.onclick = () => setTab('inv');
  shopTab.onclick = () => setTab('shop');
  storesTab.onclick = () => setTab('stores');
  $('#syncPill').onclick = () => {
    if (g.sync.status === 'nocfg') setTab('set');
    else if (g.sync.status === 'auth') g.login();
    else g.syncNow();
  };

  st.onChange(({ local }) => { rerender(); if (local) scheduleSync(); });
  onDeviceChange(() => { applyChrome(); rerender(); scheduleSync(); });
  applyChrome();
  g.onStatus(renderPill);
  render();
  renderPill();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (res?.ok) toast('Conectado con Google');
  else if (res?.error && res.error !== 'state') {
    if (/required/.test(res.error)) toast('Toca «Conectar» para volver a sincronizar');
    else if (res.error !== 'access_denied') toast('No se pudo conectar: ' + res.error);
  }
  if (handleUrlActions()) await st.flush();
  if (!res && maybeSilentLogin()) return;
  g.syncNow();

  addEventListener('online', () => g.syncNow());
  addEventListener('offline', () => g.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    rerender();
    if (!maybeSilentLogin()) g.syncNow();
  });
  // Con la compra abierta (o en el modo súper) se sincroniza cada 20 s; si no, cada 5 min.
  let lastAuto = Date.now();
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const fast = tab === 'shop' || isSuperOpen();
    if (Date.now() - lastAuto >= (fast ? 20e3 : 5 * 60e3)) { lastAuto = Date.now(); g.syncNow(); }
  }, 5000);
}

// Enlaces del tipo …/?apuntar=leche,tomates o …/?accion=super (accesos directos y Atajos de Siri).
function handleUrlActions() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return false;
  history.replaceState(null, '', location.pathname);
  const text = q.get('apuntar');
  if (text) {
    const names = text.split(/\s*(?:,|;|\n|\by\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    const done = [];
    for (const n of names) {
      const best = qaSearch(n, 1)[0];
      const c = best && best.score >= 85 ? best : { kind: 'free', name: n.charAt(0).toUpperCase() + n.slice(1) };
      addCandidate(c, { listId: (p) => (p ? st.validList(p.listId) : st.GENERAL), storeId: '' });
      done.push(c.name);
    }
    setTab('shop');
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    if (done.length) {
      toast('Apuntado: ' + done.join(', ') + (!standalone && !g.everConnected()
        ? '. Ojo: este navegador no está conectado a Google, así que no llegará al otro móvil (conéctalo en Ajustes › Cuenta).' : ''), { ms: 8000 });
    }
  }
  const action = q.get('accion');
  if (action === 'apuntar') { setTab('shop'); setTimeout(focusQuickAdd, 300); }
  if (action === 'escanear') setTimeout(scanFlow, 300);
  if (action === 'super') { setTab('shop'); setTimeout(() => openSuper({}), 300); }
  if (action === 'guardar') setTimeout(openStockIn, 300);
  return !!text;
}

start();
