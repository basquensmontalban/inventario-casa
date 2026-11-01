// Pestaña «Compra»: listas, copiar/compartir, vaciar y marcar como comprado.
import * as st from './store.js';
import { S, GENERAL, UNITS, uid } from './store.js';
import { D } from './device.js';
import { h, icon, badge, field, inp, select, numInput, num, openSheet, toast, copyText, nav } from './ui.js';
import { locSelect, fromReserveSheet } from './locations.js';
import { label } from './catalog.js';

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
// Orden de la lista: por nombre o por la ubicación habitual del artículo (para ir recorriendo la casa).
const sortItems = (its) => [...its].sort((a, b) => {
  const A = itemInfo(a);
  const B = itemInfo(b);
  if (D.shopSort === 'location') {
    const la = A.p ? st.loc(A.p) || '\uffff' : '\uffff\uffff';
    const lb = B.p ? st.loc(B.p) || '\uffff' : '\uffff\uffff';
    const c = la.localeCompare(lb, 'es');
    if (c) return c;
  }
  return A.name.localeCompare(B.name, 'es');
});

export function itemRow(it) {
  const inf = itemInfo(it);
  const res = inf.p ? st.inReserve(inf.p) : 0;
  const syms = st.itemStoreIds(it).map((id) => st.getStore(id).symbol).join('');
  const sub = [it.qty ? st.fmtQty(it.qty, inf.unit) : null, inf.brand, res > 0 ? `${st.fmtNum(res)} en reserva` : null, !ui.store && syms ? syms : null].filter(Boolean).join(' · ');
  return h('div', { class: 'row item' + (it.done ? ' done' : '') },
    h('button', { class: 'check', 'aria-label': it.done ? 'Desmarcar' : 'Comprado', onclick: () => (it.done ? undone(it.id) : buy(it.id)) }, it.done ? icon('check') : null),
    h('button', { class: 'row-main plain', onclick: () => itemSheet(it.id) },
      h('div', { class: 'row-title' }, inf.name),
      h('div', { class: 'row-sub' }, sub || ' ')),
    it.auto && !it.dismissed ? badge('bajo mínimo', 'low') : null,
    it.dismissed ? h('button', { class: 'btn small', onclick: () => { const x = S.items[it.id]; x.dismissed = false; st.putItem(x); } }, 'Recuperar') : null);
}

function undone(id) {
  const it = S.items[id];
  it.done = false;
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

export function renderShop(m) {
  m.dataset.view = 'shop';
  const ls = st.lists();
  if (!ui.init) { ui.init = true; ui.list = D.shopList || '__all'; ui.store = D.shopStore || ''; }
  if (ui.list !== '__all' && !ls.some((l) => l.id === ui.list)) ui.list = '__all';
  const stores = st.stores();
  if (ui.store && !st.getStore(ui.store)) ui.store = '';
  const chips = h('div', { class: 'chips' },
    stores.length ? select([['', 'Todas las tiendas'], ...stores.map((x) => [x.id, label(x)])], ui.store, {
      class: 'chip' + (ui.store ? ' on' : ''), onchange: (e) => { ui.store = e.target.value; renderShop(m); },
    }) : null,
    h('button', { class: 'chip' + (ui.list === '__all' ? ' on' : ''), onclick: () => { ui.list = '__all'; renderShop(m); } }, 'Todas', h('small', {}, byStore(shopItems()).length)),
    ls.map((l) => h('button', { class: 'chip' + (ui.list === l.id ? ' on' : ''), onclick: () => { ui.list = l.id; renderShop(m); } }, l.name, h('small', {}, byStore(shopItems(l.id)).length))),
    h('button', { class: 'chip', onclick: newList }, '+ Nueva lista'));

  const parts = [chips];
  const unassignedSection = (its) => {
    const un = ui.store && D.shopUnassigned !== false ? its.filter(noStore) : [];
    return un.length ? [h('div', { class: 'section-h' }, h('h3', {}, 'Sin tienda asignada'), h('small', {}, un.length)),
      h('p', { class: 'hint' }, 'Se pueden comprar en cualquier sitio. Asígnales tienda en su ficha.'),
      h('div', { class: 'list' }, sortItems(un).map(itemRow))] : [];
  };
  if (ui.list === '__all') {
    const n = byStore(shopItems()).length;
    parts.push(h('div', { class: 'toolbar' },
      h('button', { class: 'btn small', disabled: !n, onclick: () => copyLists(ls.map((l) => l.id)) }, icon('copy'), 'Copiar todo'),
      navigator.share ? h('button', { class: 'btn small', disabled: !n, onclick: () => shareLists(ls.map((l) => l.id)) }, icon('share'), 'Compartir') : null));
    let any = false;
    for (const l of ls) {
      const its = byStore(shopItems(l.id));
      if (!its.length) continue;
      any = true;
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, l.name), h('small', {}, its.length)),
        h('div', { class: 'list' }, sortItems(its).map(itemRow)));
    }
    if (!any) parts.push(h('div', { class: 'empty' }, icon('cart'), h('p', {}, ui.store ? 'Nada que comprar en esta tienda.' : 'No hace falta comprar nada.'),
      h('p', {}, 'Lo que baje del mínimo aparecerá aquí solo.')));
    parts.push(...unassignedSection(shopItems()));
  } else {
    const l = S.lists[ui.list];
    const its = byStore(shopItems(l.id));
    const anyInList = st.alive(S.items).some((it) => it.listId === l.id && !it.dismissed);
    parts.push(h('div', { class: 'toolbar' },
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
    parts.push(its.length ? h('div', { class: 'list' }, sortItems(its).map(itemRow))
      : h('div', { class: 'empty' }, h('p', {}, ui.store ? 'Nada de esta lista para esta tienda.' : 'Lista vacía.')));
    parts.push(...unassignedSection(shopItems(l.id)));

    const addIn = inp({ placeholder: 'Añadir algo a la lista…', list: 'dl-products', enterkeyhint: 'done' });
    parts.push(h('form', { class: 'add-form', onsubmit: (e) => { e.preventDefault(); addFreeItem(addIn.value, l.id, ui.store); addIn.value = ''; } },
      addIn, h('button', { class: 'btn primary', 'aria-label': 'Añadir' }, icon('plus'))));

    const done = st.alive(S.items).filter((it) => it.listId === l.id && it.done);
    if (done.length) {
      parts.push(h('div', { class: 'section-h' }, h('h3', {}, 'Comprado'),
        h('button', { class: 'linkbtn', onclick: () => done.forEach((it) => st.deleteItem(it.id)) }, 'Quitar tachados')),
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
  const storeSel = inf.p ? null : select([['', 'Cualquiera'], ...st.stores().map((x) => [x.id, label(x)])], it.storeId || '');
  const res = inf.p ? st.inReserve(inf.p) : 0;
  const s = openSheet(inf.name, () => [
    it.auto ? h('p', { class: 'muted' }, `Está aquí porque hay ${st.fmtQty(st.atHand(inf.p), inf.unit)} a mano y el mínimo es ${st.fmtNum(inf.p.min)}.`) : null,
    res > 0 ? h('div', { class: 'note-box' }, `Tienes ${st.fmtQty(res, inf.unit)} en reserva. `,
      h('button', { class: 'linkbtn', onclick: () => { s.close(); fromReserveSheet(inf.p.id); } }, 'Traer de la reserva')) : null,
    nameIn ? field('Nombre', nameIn) : null,
    h('div', { class: 'grid2' }, field(`Cantidad (${UNITS[inf.unit]})`, qIn), field('Lista', lSel)),
    storeSel ? field('Tienda', storeSel) : inf.p && st.productStores(inf.p).length
      ? h('p', { class: 'muted' }, 'Se compra en: ' + st.productStores(inf.p).map(label).join(', ')) : null,
    h('button', { class: 'btn primary block', onclick: () => {
      const x = S.items[id];
      const q = num(qIn.value);
      if (q !== x.qty) { x.qty = q; if (x.auto) x.qtyEdited = true; }
      x.listId = lSel.value;
      if (nameIn) x.name = nameIn.value.trim() || x.name;
      if (storeSel) x.storeId = storeSel.value || null;
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
          preset: nav.newProductDraft(inf.name),
          onSaved: (pid) => {
            const x = S.items[id];
            x.productId = pid; x.done = true;
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
  if (D.shopAskOnBuy === false) {
    // Modo rápido: suma la cantidad de la lista con la marca favorita, sin preguntar.
    const beforeLots = st.clone(p.lots || []);
    const beforeItem = st.clone(it);
    const q = +it.qty || 1;
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
  st.putItem(x);
  toast('Tachado', { action: 'Deshacer', onAction: () => undone(id) });
}

// Para otras pantallas
export { itemInfo };
