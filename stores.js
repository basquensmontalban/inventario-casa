// Pestaña «Tiendas»: qué comprar en cada tienda y sugerencias.
import * as st from './store.js';
import { S, UNITS, uid } from './store.js';
import { h, icon, toast, nav } from './ui.js';
import { D } from './device.js';
import { itemRow, shopItems, copyLists, shareLists } from './shop.js';
import { openCatalog, editCatalog, label } from './catalog.js';

const ui = { store: '', showAll: false };

// Por qué conviene comprarlo aunque no esté bajo mínimo.
function reason(p) {
  if (p.restock === false) return null;
  const C = D.storesCrit;
  const hand = st.atHand(p);
  const target = +p.target > 0 ? +p.target : 0;
  if (C.empty && st.total(p) <= 0) return 'Se ha acabado';
  if (C.below && target && hand < target) return `Tienes ${st.fmtQty(hand, p.unit)}; sueles tener ${st.fmtNum(target)}`;
  const soon = (p.lots || []).some((l) => +l.qty > 0 && !st.isReserve(l.locationId) && st.expiryState(p, l));
  if (C.expiring && soon) return 'Lo que tienes caduca pronto';
  return null;
}
const howMuch = (p) => {
  const target = +p.target > 0 ? +p.target : +p.min;
  return target > 0 ? Math.max(st.round(target - st.atHand(p)), 1) : 1;
};

function addToList(p) {
  st.putItem({ id: uid(), productId: p.id, listId: st.validList(p.listId), qty: howMuch(p) });
  toast(`${p.name} añadido a «${S.lists[st.validList(p.listId)].name}»`);
}

function productLine(p, sub) {
  return h('div', { class: 'row' },
    h('button', { class: 'row-main plain', onclick: () => nav.openProduct(p.id) },
      h('div', { class: 'row-title' }, p.name),
      h('div', { class: 'row-sub' }, sub)),
    st.onList(p)
      ? h('span', { class: 'badge ok' }, 'En la lista')
      : h('button', { class: 'btn small', onclick: () => addToList(p) }, icon('plus'), 'Lista'));
}

export function renderStores(m) {
  m.dataset.view = 'stores';
  const stores = st.stores();
  if (!stores.length) {
    m.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'sym big' }, '🛒'),
      h('p', {}, 'Añade las tiendas donde compráis y, en cada artículo, dónde se compra.'),
      h('p', {}, 'Aquí verás qué comprar en cada una y sugerencias.'),
      h('button', { class: 'btn primary', onclick: () => editCatalog('stores', {}) }, icon('plus'), 'Añadir tienda')));
    return;
  }
  if (!st.getStore(ui.store) && st.getStore(D.storesDefault)) ui.store = D.storesDefault;
  if (!st.getStore(ui.store)) {
    // Por defecto, la tienda con más cosas pendientes.
    const count = (x) => shopItems().filter((it) => st.itemStoreIds(it).includes(x.id)).length;
    ui.store = [...stores].sort((a, b) => count(b) - count(a))[0].id;
  }
  const sid = ui.store;
  const pending = shopItems().filter((it) => st.itemStoreIds(it).includes(sid));
  const chips = h('div', { class: 'chips' },
    stores.map((x) => {
      const n = shopItems().filter((it) => st.itemStoreIds(it).includes(x.id)).length;
      return h('button', { class: 'chip' + (x.id === sid ? ' on' : ''), onclick: () => { ui.store = x.id; ui.showAll = false; renderStores(m); } },
        label(x), n ? h('small', {}, n) : null);
    }),
    h('button', { class: 'chip', onclick: () => openCatalog('stores') }, '⚙ Tiendas'));

  const here = st.products().filter((p) => (p.stores || []).includes(sid));
  const sugg = here.filter((p) => !st.onList(p) && reason(p));
  const parts = [chips];

  parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'Para comprar aquí'), h('small', {}, pending.length)));
  if (pending.length) {
    const ids = st.lists().map((l) => l.id);
    parts.push(h('div', { class: 'toolbar' },
      h('button', { class: 'btn small', onclick: () => copyLists(ids, sid) }, icon('copy'), 'Copiar'),
      navigator.share ? h('button', { class: 'btn small', onclick: () => shareLists(ids, sid) }, icon('share'), 'Compartir') : null));
    parts.push(h('div', { class: 'list' }, pending.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es')).map(itemRow)));
  } else {
    parts.push(h('p', { class: 'muted' }, 'Nada pendiente en la lista para esta tienda.'));
  }

  if (D.storesSugg !== false) {
    parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'Quizás también'), h('small', {}, sugg.length)));
    parts.push(sugg.length
      ? h('div', { class: 'list' }, sugg.map((p) => productLine(p, reason(p))))
      : h('p', { class: 'muted' }, here.length ? 'Nada más que sugerir por ahora.' : 'Cuando indiques en los artículos que se compran aquí, verás sugerencias.'));
  }

  if (here.length) {
    parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'Lo que soléis comprar aquí'),
      h('button', { class: 'linkbtn', onclick: () => { ui.showAll = !ui.showAll; renderStores(m); } }, ui.showAll ? 'Ocultar' : `Ver (${here.length})`)));
    if (ui.showAll) parts.push(h('div', { class: 'list' }, here.map((p) => productLine(p, `Hay ${st.fmtQty(st.total(p), p.unit)}${st.loc(p) ? ' · ' + st.loc(p) : ''}`))));
  }
  m.replaceChildren(...parts);
}

function nameOf(it) {
  const p = it.productId && S.products[it.productId];
  return (p && !p.del ? p.name : it.name) || '';
}
