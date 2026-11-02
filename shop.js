// Pestaña «Compra»: listas, copiar/compartir, vaciar y marcar como comprado.
import * as st from './store.js';
import { S, GENERAL, UNITS, uid } from './store.js';
import { D } from './device.js';
import { h, icon, badge, field, inp, select, numInput, num, openSheet, toast, copyText, nav } from './ui.js';
import { locSelect, fromReserveSheet } from './locations.js';
import { label } from './catalog.js';
import { quickAddBar } from './quickadd.js';
import { findBasic, basicFields } from './productdb.js';
import { openSuper } from './supermode.js';
import { openStockIn } from './stockin.js';

const ui = { list: '__all', showDismissed: false, store: '', init: false };

// Filtro por tienda: los que se compran en ella / los que no tienen tienda asignada.
const inStore = (it, sid) => st.itemStoreIds(it).includes(sid);
const noStore = (it) => !st.itemStoreIds(it).length;
const byStore = (its) => (ui.store ? its.filter((it) => inStore(it, ui.store)) : its);

export const shopItems = (listId) => st.alive(S.items).filter((it) => !it.done && !it.dismissed && (!listId || it.listId === listId));

function itemInfo(it) {
  const p = it.productId && S.products[it.productId] && !S.products[it.productId].del ? S.products[it.productId] : null;
  return { p, name: p ? p.name : it.name || '?', unit: p ? p.unit || 'ud' : 'ud', brand: p ? st.fav(p)?.brand : null };
}
// Categoría (para ordenar por pasillos): la del artículo o la del básico apuntado.
function itemCat(it) {
  const inf = itemInfo(it);
  if (inf.p) return st.productTags(inf.p)[0] || null;
  const sub = it.sub || findBasic(inf.name)?.sub;
  return sub ? st.getTag(st.tagIdFor(sub)) : null;
}
// Posición de una categoría: según el orden de pasillos de la tienda (si lo tiene) o el orden general.
export function catIndex(t, storeId = ui.store) {
  if (!t) return 1e6;
  const aisles = st.getStore(storeId)?.aisles;
  if (aisles?.length) {
    const i = aisles.indexOf(t.id);
    if (i >= 0) return i;
    const j = t.parentId ? aisles.indexOf(t.parentId) : -1;
    if (j >= 0) return j + 0.5;
    return 5000 + st.tags().findIndex((x) => x.id === t.id);
  }
  const i = st.tags().findIndex((x) => x.id === t.id);
  return i < 0 ? 1e6 : i;
}
export { itemCat };
// Símbolo que se ve delante del nombre.
function itemSym(it) {
  const inf = itemInfo(it);
  if (inf.p) return inf.p.symbol || st.productTags(inf.p)[0]?.symbol || findBasic(inf.p.name)?.symbol || '';
  return it.symbol || findBasic(inf.name)?.symbol || '';
}
// Filas de la lista; ordenadas por categoría llevan un encabezado por pasillo.
export function rowsFor(its, rowFn = itemRow, storeId = ui.store) {
  const sorted = sortItems(its, storeId);
  if (D.shopSort !== 'category') return sorted.map((it) => rowFn(it));
  const out = [];
  let last;
  for (const it of sorted) {
    const c = itemCat(it);
    const key = c?.id || '';
    if (key !== last) {
      last = key;
      out.push(h('div', { class: 'cat-h' }, c ? `${c.symbol || ''} ${c.name}` : 'Otros'));
    }
    out.push(rowFn(it));
  }
  return out;
}
// Orden de la lista: por nombre, por categoría (pasillos) o por la ubicación habitual en casa.
export const sortItems = (its, storeId = ui.store) => [...its].sort((a, b) => {
  const A = itemInfo(a);
  const B = itemInfo(b);
  if (D.shopSort === 'category') {
    const c = catIndex(itemCat(a), storeId) - catIndex(itemCat(b), storeId);
    if (c) return c;
  }
  if (D.shopSort === 'location') {
    const la = A.p ? st.loc(A.p) || '\uffff' : '\uffff\uffff';
    const lb = B.p ? st.loc(B.p) || '\uffff' : '\uffff\uffff';
    const c = la.localeCompare(lb, 'es');
    if (c) return c;
  }
  return A.name.localeCompare(B.name, 'es');
});

export const stepFor = (unit) => (unit === 'g' || unit === 'ml' ? 100 : unit === 'kg' || unit === 'l' ? 0.5 : 1);

// Cambia la cantidad desde la propia fila; a cero, se quita (con deshacer).
export function changeQty(id, delta) {
  const x = S.items[id];
  if (!x || x.del) return;
  const before = st.clone(x);
  const q = st.round((+x.qty || 1) + delta);
  if (q <= 0) {
    if (x.auto) { x.dismissed = true; st.putItem(x); } else st.deleteItem(id);
    toast(`Quitado: ${itemInfo(before).name}`, { action: 'Deshacer', onAction: () => st.putItem(before) });
    return;
  }
  x.qty = q;
  if (x.auto) x.qtyEdited = true;
  st.putItem(x);
}

export function itemRow(it) {
  const inf = itemInfo(it);
  const res = inf.p ? st.inReserve(inf.p) : 0;
  const syms = st.itemStoreIds(it).map((id) => st.getStore(id).symbol).join('');
  const pending = !it.done && !it.dismissed;
  const sub = [pending ? null : it.qty ? st.fmtQty(it.qty, inf.unit) : null, inf.brand, it.auto && pending ? 'bajo mínimo' : null,
    res > 0 ? `${st.fmtNum(res)} en reserva` : null, !ui.store && syms ? syms : null, it.inCart && it.done ? 'en el carro' : null].filter(Boolean).join(' · ');
  const step = stepFor(inf.unit);
  return h('div', { class: 'row item' + (it.done ? ' done' : '') },
    h('button', { class: 'check', 'aria-label': it.done ? 'Desmarcar' : 'Comprado', onclick: () => onCheck(it.id) }, it.done ? icon('check') : null),
    h('button', { class: 'row-main plain', onclick: () => itemSheet(it.id) },
      h('div', { class: 'row-title' }, itemSym(it) ? h('span', { class: 'isym' }, itemSym(it)) : null, inf.name),
      sub ? h('div', { class: 'row-sub' }, sub) : null,
      it.note ? h('div', { class: 'row-note' }, it.note) : null),
    pending ? h('div', { class: 'mini-step' },
      h('button', { 'aria-label': 'Menos', onclick: () => changeQty(it.id, -step) }, '−'),
      h('b', {}, st.fmtNum(it.qty || 1) + (inf.unit && inf.unit !== 'ud' ? ' ' + UNITS[inf.unit] : '')),
      h('button', { 'aria-label': 'Más', onclick: () => changeQty(it.id, step) }, '+')) : null,
    it.dismissed ? h('button', { class: 'btn small', onclick: () => { const x = S.items[it.id]; x.dismissed = false; st.putItem(x); } }, 'Recuperar') : null);
}

// Tachar: según el ajuste, va al carro (se guarda luego en casa), pregunta, o suma directamente.
export function onCheck(id) {
  const it = S.items[id];
  if (!it || it.del) return;
  if (it.done) { undone(id); return; }
  if ((D.shopOnBuy || 'cart') === 'cart') { toCart(id); return; }
  buy(id);
}
export function toCart(id) {
  const x = S.items[id];
  x.done = true;
  x.inCart = true;
  st.recordPurchase(x.productId, itemInfo(x).name);
  st.putItem(x);
}
function undone(id) {
  const it = S.items[id];
  if (it.inCart) st.recordPurchase(it.productId, itemInfo(it).name, true);
  it.done = false;
  it.inCart = false;
  st.putItem(it);
}

// ── Texto para copiar o compartir (formato de lista con guiones) ──
function itemLabel(it) {
  const inf = itemInfo(it);
  let s = inf.name;
  if (D.copyBrand && inf.brand) s += ' ' + inf.brand;
  if (D.copyQty && it.qty && !(inf.unit === 'ud' && +it.qty === 1)) {
    s += inf.unit === 'ud' ? ` (${st.fmtNum(it.qty)})` : ` (${st.fmtQty(it.qty, inf.unit)})`;
  }
  if (it.note) s += ` — ${it.note}`;
  return s;
}
export function listText(listIds, storeId = '') {
  const blocks = [];
  for (const l of st.lists().filter((x) => listIds.includes(x.id))) {
    const its = sortItems(shopItems(l.id).filter((it) => !storeId || inStore(it, storeId)));
    if (!its.length) continue;
    const lines = its.map((it) => (D.copyBullet ?? '- ') + itemLabel(it)).join('\n');
    blocks.push(D.copyTitle ? `*${l.name}*\n${lines}` : lines);
  }
  const store = st.getStore(storeId);
  return blocks.length && store && D.copyTitle ? `🛒 *${store.name}*\n\n` + blocks.join('\n\n') : blocks.join('\n\n');
}
export async function copyLists(ids, storeId = ui.store) {
  const text = listText(ids, storeId);
  if (!text) { toast('No hay nada que copiar'); return; }
  toast((await copyText(text)) ? 'Lista copiada. Pégala en WhatsApp' : 'No se pudo copiar');
}
export async function shareLists(ids, storeId = ui.store) {
  const text = listText(ids, storeId);
  if (!text) { toast('No hay nada que compartir'); return; }
  try { await navigator.share({ text }); } catch (e) { if (e.name !== 'AbortError') copyLists(ids, storeId); }
}

function emptyList(l) {
  const its = st.alive(S.items).filter((it) => it.listId === l.id && !it.dismissed);
  if (!its.length) { toast('La lista ya está vacía'); return; }
  const autos = its.filter((it) => it.auto && !it.done).length;
  const msg = `¿Seguro que quieres vaciar «${l.name}»?\n\nSe quitarán ${its.length} artículo${its.length > 1 ? 's' : ''}.`
    + (autos ? `\n\n${autos} está${autos > 1 ? 'n' : ''} bajo mínimo: no volverá${autos > 1 ? 'n' : ''} a la lista hasta que se reponga${autos > 1 ? 'n' : ''} y vuelva${autos > 1 ? 'n' : ''} a bajar.` : '');
  if (!confirm(msg)) return;
  const before = its.map(st.clone);
  const t = Date.now();
  for (const it of its) {
    if (it.auto) { it.dismissed = true; it.done = false; it.u = t; }
    else S.items[it.id] = { id: it.id, del: true, u: t };
  }
  st.commit();
  toast('Lista vaciada', { action: 'Deshacer', ms: 6000, onAction: () => {
    const t2 = Date.now();
    before.forEach((x) => { x.u = t2; S.items[x.id] = x; });
    st.commit();
  } });
}

let qaBar = null;
export function renderShop(m) {
  if (m.dataset.view !== 'shop' || !m.querySelector('#shopBody')) {
    m.dataset.view = 'shop';
    qaBar = quickAddBar(() => ({
      listId: (p) => (ui.list !== '__all' ? ui.list : p ? st.validList(p.listId) : GENERAL),
      storeId: ui.store,
    }));
    m.replaceChildren(qaBar, h('div', { id: 'shopBody' }));
  }
  renderShopBody(m.querySelector('#shopBody'));
}
export const focusQuickAdd = () => { scrollTo(0, 0); qaBar?.focusInput(); };

function renderShopBody(m) {
  const ls = st.lists();
  if (!ui.init) { ui.init = true; ui.list = D.shopList || '__all'; ui.store = D.shopStore || ''; }
  if (ui.list !== '__all' && !ls.some((l) => l.id === ui.list)) ui.list = '__all';
  const stores = st.stores();
  if (ui.store && !st.getStore(ui.store)) ui.store = '';
  const chips = h('div', { class: 'chips' },
    stores.length ? select([['', 'Todas las tiendas'], ...stores.map((x) => [x.id, label(x)])], ui.store, {
      class: 'chip' + (ui.store ? ' on' : ''), onchange: (e) => { ui.store = e.target.value; renderShopBody(m); },
    }) : null,
    h('button', { class: 'chip' + (ui.list === '__all' ? ' on' : ''), onclick: () => { ui.list = '__all'; renderShopBody(m); } }, 'Todas', h('small', {}, byStore(shopItems()).length)),
    ls.map((l) => h('button', { class: 'chip' + (ui.list === l.id ? ' on' : ''), onclick: () => { ui.list = l.id; renderShopBody(m); } }, l.name, h('small', {}, byStore(shopItems(l.id)).length))),
    h('button', { class: 'chip', onclick: newList }, '+ Nueva lista'));

  const parts = [chips];
  // Sugerencias: lo que soléis comprar (y toca reponer).
  if (D.shopSuggest !== false) {
    const sugg = st.frequentSuggestions(10);
    if (sugg.length) {
      parts.push(h('div', { class: 'sugg' }, h('span', { class: 'lbl' }, 'Soléis comprar'),
        h('div', { class: 'chips' }, sugg.map((f) => {
          const p = f.productId ? S.products[f.productId] : null;
          const sym = p ? p.symbol || st.productTags(p)[0]?.symbol || '' : findBasic(f.name)?.symbol || '';
          const days = Math.round(f.since / 864e5);
          return h('button', { class: 'chip sugg-chip' + (f.due >= 0.9 ? ' due' : ''), onclick: () => addSuggestion(f) },
            `${sym ? sym + ' ' : ''}${p ? p.name : f.name}`, days >= 1 ? h('small', {}, `${days} d`) : null);
        }))));
    }
  }
  const cart = st.alive(S.items).filter((it) => it.done && it.inCart);
  if (cart.length) {
    parts.push(h('div', { class: 'note-box ok cart-banner' }, `🧺 ${cart.length} cosa${cart.length > 1 ? 's' : ''} en el carro sin guardar. `,
      h('button', { class: 'linkbtn', onclick: openStockIn }, 'Guardar la compra')));
  }
  const unassignedSection = (its) => {
    const un = ui.store && D.shopUnassigned !== false ? its.filter(noStore) : [];
    return un.length ? [h('div', { class: 'section-h' }, h('h3', {}, 'Sin tienda asignada'), h('small', {}, un.length)),
      h('p', { class: 'hint' }, 'Se pueden comprar en cualquier sitio. Asígnales tienda en su ficha.'),
      h('div', { class: 'list' }, rowsFor(un))] : [];
  };
  if (ui.list === '__all') {
    const n = byStore(shopItems()).length;
    parts.push(h('div', { class: 'toolbar' },
      h('button', { class: 'btn small primary', disabled: !n, onclick: () => openSuper({ listId: null, storeId: ui.store }) }, '🛒 Modo súper'),
      h('button', { class: 'btn small', disabled: !n, onclick: () => copyLists(ls.map((l) => l.id)) }, icon('copy'), 'Copiar todo'),
      navigator.share ? h('button', { class: 'btn small', disabled: !n, onclick: () => shareLists(ls.map((l) => l.id)) }, icon('share'), 'Compartir') : null));
    let any = false;
    for (const l of ls) {
      const its = byStore(shopItems(l.id));
      if (!its.length) continue;
      any = true;
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, l.name), h('small', {}, its.length)),
        h('div', { class: 'list' }, rowsFor(its)));
    }
    if (!any) parts.push(h('div', { class: 'empty' }, icon('cart'), h('p', {}, ui.store ? 'Nada que comprar en esta tienda.' : 'La lista está vacía.'),
      h('p', {}, 'Apunta arriba lo que necesites. Lo que baje del mínimo aparecerá aquí solo.')));
    parts.push(...unassignedSection(shopItems()));
    if (cart.length) {
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'En el carro'), h('small', {}, cart.length)),
        h('div', { class: 'list' }, sortItems(cart).map(itemRow)));
    }
  } else {
    const l = S.lists[ui.list];
    const its = byStore(shopItems(l.id));
    const anyInList = st.alive(S.items).some((it) => it.listId === l.id && !it.dismissed);
    parts.push(h('div', { class: 'toolbar' },
      h('button', { class: 'btn small primary', disabled: !its.length, onclick: () => openSuper({ listId: l.id, storeId: ui.store }) }, '🛒 Modo súper'),
      h('button', { class: 'btn small', disabled: !its.length, onclick: () => copyLists([l.id]) }, icon('copy'), 'Copiar'),
      navigator.share ? h('button', { class: 'btn small', disabled: !its.length, onclick: () => shareLists([l.id]) }, icon('share'), 'Compartir') : null,
      h('button', { class: 'btn small danger', disabled: !anyInList, onclick: () => emptyList(l) }, 'Vaciar'),
      l.id !== GENERAL ? h('button', { class: 'btn small', onclick: () => {
        const n = prompt('Nuevo nombre de la lista', l.name);
        if (n && n.trim()) st.putList({ ...l, name: n.trim() });
      } }, 'Renombrar') : null,
      l.id !== GENERAL ? h('button', { class: 'btn small danger', onclick: () => {
        if (confirm(`¿Borrar la lista «${l.name}»? Lo que tenga pasa a «General».`)) { st.deleteList(l.id); ui.list = '__all'; nav.render(); }
      } }, 'Borrar lista') : null));
    parts.push(its.length ? h('div', { class: 'list' }, rowsFor(its))
      : h('div', { class: 'empty' }, h('p', {}, ui.store ? 'Nada de esta lista para esta tienda.' : 'Lista vacía.')));
    parts.push(...unassignedSection(shopItems(l.id)));


    const done = st.alive(S.items).filter((it) => it.listId === l.id && it.done);
    if (done.length) {
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'Comprado'),
        h('button', { class: 'linkbtn', onclick: () => done.forEach((it) => st.deleteItem(it.id)) }, 'Quitar tachados')),
        h('div', { class: 'list' }, done.map(itemRow)));
    }
    const dismissed = st.alive(S.items).filter((it) => it.listId === l.id && it.dismissed);
    if (dismissed.length) {
      parts.push(h('button', { class: 'linkbtn', onclick: () => { ui.showDismissed = !ui.showDismissed; renderShopBody(m); } },
        `${ui.showDismissed ? 'Ocultar' : 'Ver'} descartados (${dismissed.length})`));
      if (ui.showDismissed) parts.push(h('div', { class: 'list' }, dismissed.map(itemRow)));
    }
  }
  m.replaceChildren(...parts);
}

function addSuggestion(f) {
  const p = f.productId ? S.products[f.productId] : null;
  const listId = ui.list !== '__all' ? ui.list : p ? st.validList(p.listId) : GENERAL;
  const id = uid();
  if (p) st.putItem({ id, productId: p.id, listId, qty: st.needs(p) ? st.suggest(p) : 1 });
  else { const b = findBasic(f.name); st.putItem({ id, name: f.name, listId, qty: 1, symbol: b?.symbol || null, sub: b?.sub || null, storeId: ui.store || null }); }
  toast(`Apuntado: ${p ? p.name : f.name}`, { action: 'Deshacer', onAction: () => st.deleteItem(id) });
}

function newList() {
  const n = prompt('Nombre de la nueva lista (p. ej. IKEA, Comida)');
  if (!n || !n.trim()) return;
  const id = uid();
  st.putList({ id, name: n.trim() });
  ui.list = id;
  nav.render();
}

export function addFreeItem(text, listId, storeId = '') {
  const name = text.trim();
  if (!name) return;
  const p = st.products().find((x) => st.norm(x.name) === st.norm(name));
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
    st.putItem({ id: uid(), name, listId, qty: 1, storeId: storeId || null });
  }
}

function itemSheet(id) {
  const it = S.items[id];
  const inf = itemInfo(it);
  const qIn = numInput(it.qty ? st.fmtNum(it.qty) : '');
  const lSel = select(st.lists().map((l) => [l.id, l.name]), it.listId);
  const nameIn = inf.p ? null : inp({ value: it.name || '' });
  const noteIn = inp({ value: it.note || '', placeholder: 'p. ej. la sin lactosa, la grande, solo si hay oferta' });
  const storeSel = inf.p ? null : select([['', 'Cualquiera'], ...st.stores().map((x) => [x.id, label(x)])], it.storeId || '');
  const res = inf.p ? st.inReserve(inf.p) : 0;
  const s = openSheet(inf.name, () => [
    it.auto ? h('p', { class: 'muted' }, `Está aquí porque hay ${st.fmtQty(st.atHand(inf.p), inf.unit)} a mano y el mínimo es ${st.fmtNum(inf.p.min)}.`) : null,
    res > 0 ? h('div', { class: 'note-box' }, `Tienes ${st.fmtQty(res, inf.unit)} en reserva. `,
      h('button', { class: 'linkbtn', onclick: () => { s.close(); fromReserveSheet(inf.p.id); } }, 'Traer de la reserva')) : null,
    nameIn ? field('Nombre', nameIn) : null,
    h('div', { class: 'grid2' }, field(`Cantidad (${UNITS[inf.unit]})`, qIn), field('Lista', lSel)),
    field('Nota', noteIn),
    storeSel ? field('Tienda', storeSel) : inf.p && st.productStores(inf.p).length
      ? h('p', { class: 'muted' }, 'Se compra en: ' + st.productStores(inf.p).map(label).join(', ')) : null,
    h('button', { class: 'btn primary block', onclick: () => {
      const x = S.items[id];
      const q = num(qIn.value);
      if (q !== x.qty) { x.qty = q; if (x.auto) x.qtyEdited = true; }
      x.listId = lSel.value;
      if (nameIn) x.name = nameIn.value.trim() || x.name;
      if (storeSel) x.storeId = storeSel.value || null;
      x.note = noteIn.value.trim() || null;
      st.putItem(x);
      s.close();
    } }, 'Guardar'),
    inf.p ? h('button', { class: 'btn block', onclick: () => { s.close(); nav.openProduct(inf.p.id); } }, 'Ver ficha del artículo') : null,
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
        nav.editProduct({
          preset: { ...nav.newProductDraft(inf.name), ...(findBasic(inf.name) ? basicFields(findBasic(inf.name)) : {}) },
          onSaved: (pid) => {
            const x = S.items[id];
            x.productId = pid; x.done = true;
            st.recordPurchase(null, inf.name);
            st.putItem(x);
            nav.addStockSheet(pid, { qty: x.qty || 1 });
          },
        });
      } }, icon('box'), 'Dar de alta en el inventario'),
      h('button', { class: 'btn block', onclick: () => { s.close(); markDone(id); } }, icon('check'), 'Solo tachar'),
    ]);
    return;
  }
  const p = inf.p;
  if (D.shopOnBuy === 'quick') {
    // Modo rápido: suma la cantidad de la lista con la marca favorita, sin preguntar.
    const beforeLots = st.clone(p.lots || []);
    const beforeItem = st.clone(it);
    const q = +it.qty || 1;
    st.recordPurchase(p.id, p.name);
    st.addStock(S.products[p.id], { variantId: st.fav(p)?.id || null, qty: q, locationId: nav.stockLocFor(p) || null });
    const x = S.items[id];
    if (x && !x.del && !x.auto) { x.done = true; st.putItem(x); }
    toast(`${p.name}: +${st.fmtQty(q, p.unit)} en el inventario`, { action: 'Deshacer', ms: 6000, onAction: () => {
      const pp = S.products[p.id];
      pp.lots = beforeLots;
      st.putProduct(pp);
      if (!beforeItem.auto) st.putItem(beforeItem);
    } });
    return;
  }
  const vSel = select(nav.variantOptions(p), st.fav(p)?.id ?? '');
  const qIn = numInput(st.fmtNum(it.qty || 1));
  const eIn = inp({ type: 'date' });
  const where = locSelect(nav.stockLocFor(p));
  const s = openSheet('Comprado: ' + p.name, () => [
    field('Marca', vSel),
    h('div', { class: 'grid2' }, field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn), field('Caducidad (opcional)', eIn)),
    nav.expiryHint(p, eIn),
    field('Dónde lo guardas', where),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) { qIn.focus(); return; }
      st.recordPurchase(p.id, p.name);
      st.addStock(S.products[p.id], { variantId: vSel.value || null, qty: q, expiry: eIn.value || null, locationId: where.value || null });
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
  st.recordPurchase(x.productId, itemInfo(x).name);
  st.putItem(x);
  toast('Tachado', { action: 'Deshacer', onAction: () => undone(id) });
}

// Para otras pantallas
export { itemInfo };
