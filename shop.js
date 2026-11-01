// Pestaña «Compra»: listas, copiar/compartir, vaciar y marcar como comprado.
import * as st from './store.js';
import { S, GENERAL, UNITS, uid } from './store.js';
import { D } from './device.js';
import { h, icon, badge, field, inp, select, numInput, num, openSheet, toast, copyText, nav } from './ui.js';
import { locSelect, fromReserveSheet } from './locations.js';

const ui = { list: '__all', showDismissed: false };

export const shopItems = (listId) => st.alive(S.items).filter((it) => !it.done && !it.dismissed && (!listId || it.listId === listId));

function itemInfo(it) {
  const p = it.productId && S.products[it.productId] && !S.products[it.productId].del ? S.products[it.productId] : null;
  return { p, name: p ? p.name : it.name || '?', unit: p ? p.unit || 'ud' : 'ud', brand: p ? st.fav(p)?.brand : null };
}
const sortItems = (its) => [...its].sort((a, b) => itemInfo(a).name.localeCompare(itemInfo(b).name, 'es'));

function itemRow(it) {
  const inf = itemInfo(it);
  const res = inf.p ? st.inReserve(inf.p) : 0;
  const sub = [it.qty ? st.fmtQty(it.qty, inf.unit) : null, inf.brand, res > 0 ? `${st.fmtNum(res)} en reserva` : null].filter(Boolean).join(' · ');
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
export function listText(listIds) {
  const blocks = [];
  for (const l of st.lists().filter((x) => listIds.includes(x.id))) {
    const its = sortItems(shopItems(l.id));
    if (!its.length) continue;
    const lines = its.map((it) => '- ' + itemLabel(it)).join('\n');
    blocks.push(D.copyTitle ? `*${l.name}*\n${lines}` : lines);
  }
  return blocks.join('\n\n');
}
async function copyLists(ids) {
  const text = listText(ids);
  if (!text) { toast('No hay nada que copiar'); return; }
  toast((await copyText(text)) ? 'Lista copiada. Pégala en WhatsApp' : 'No se pudo copiar');
}
async function shareLists(ids) {
  const text = listText(ids);
  if (!text) { toast('No hay nada que compartir'); return; }
  try { await navigator.share({ text }); } catch (e) { if (e.name !== 'AbortError') copyLists(ids); }
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
  if (ui.list !== '__all' && !ls.some((l) => l.id === ui.list)) ui.list = '__all';
  const chips = h('div', { class: 'chips' },
    h('button', { class: 'chip' + (ui.list === '__all' ? ' on' : ''), onclick: () => { ui.list = '__all'; renderShop(m); } }, 'Todas', h('small', {}, shopItems().length)),
    ls.map((l) => h('button', { class: 'chip' + (ui.list === l.id ? ' on' : ''), onclick: () => { ui.list = l.id; renderShop(m); } }, l.name, h('small', {}, shopItems(l.id).length))),
    h('button', { class: 'chip', onclick: newList }, '+ Nueva lista'));

  const parts = [chips];
  if (ui.list === '__all') {
    const n = shopItems().length;
    parts.push(h('div', { class: 'toolbar' },
      h('button', { class: 'btn small', disabled: !n, onclick: () => copyLists(ls.map((l) => l.id)) }, icon('copy'), 'Copiar todo'),
      navigator.share ? h('button', { class: 'btn small', disabled: !n, onclick: () => shareLists(ls.map((l) => l.id)) }, icon('share'), 'Compartir') : null));
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
      : h('div', { class: 'empty' }, h('p', {}, 'Lista vacía.')));

    const addIn = inp({ placeholder: 'Añadir algo a la lista…', list: 'dl-products', enterkeyhint: 'done' });
    parts.push(h('form', { class: 'add-form', onsubmit: (e) => { e.preventDefault(); addFreeItem(addIn.value, l.id); addIn.value = ''; } },
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

function addFreeItem(text, listId) {
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
    st.putItem({ id: uid(), name, listId, qty: 1 });
  }
}

function itemSheet(id) {
  const it = S.items[id];
  const inf = itemInfo(it);
  const qIn = numInput(it.qty ? st.fmtNum(it.qty) : '');
  const lSel = select(st.lists().map((l) => [l.id, l.name]), it.listId);
  const nameIn = inf.p ? null : inp({ value: it.name || '' });
  const res = inf.p ? st.inReserve(inf.p) : 0;
  const s = openSheet(inf.name, () => [
    it.auto ? h('p', { class: 'muted' }, `Está aquí porque hay ${st.fmtQty(st.atHand(inf.p), inf.unit)} a mano y el mínimo es ${st.fmtNum(inf.p.min)}.`) : null,
    res > 0 ? h('div', { class: 'note-box' }, `Tienes ${st.fmtQty(res, inf.unit)} en reserva. `,
      h('button', { class: 'linkbtn', onclick: () => { s.close(); fromReserveSheet(inf.p.id); } }, 'Traer de la reserva')) : null,
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
          preset: { id: uid(), name: inf.name, unit: 'ud', restock: true, alerts: true, lots: [], variants: [], locationId: D.defaultLocationId || null },
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
  const vSel = select(nav.variantOptions(p), st.fav(p)?.id ?? '');
  const qIn = numInput(st.fmtNum(it.qty || 1));
  const eIn = inp({ type: 'date' });
  const where = locSelect(p.locationId || D.defaultLocationId || '');
  const s = openSheet('Comprado: ' + p.name, () => [
    field('Marca', vSel),
    h('div', { class: 'grid2' }, field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn), field('Caducidad (opcional)', eIn)),
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
