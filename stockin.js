// «Guardar la compra»: al llegar a casa, pasar al inventario todo lo que está en el carro de una vez.
import * as st from './store.js';
import { S, UNITS, uid } from './store.js';
import { D } from './device.js';
import { h, inp, numInput, num, toggle, openSheet, toast, nav } from './ui.js';
import { locSelect } from './locations.js';
import { findBasic, basicFields, approxExpiry } from './productdb.js';

export function openStockIn() {
  const cart = st.alive(S.items).filter((it) => it.done && it.inCart);
  if (!cart.length) { toast('No hay nada en el carro'); return; }

  const rows = cart.map((it) => {
    const p = it.productId && S.products[it.productId] && !S.products[it.productId].del ? S.products[it.productId] : null;
    const b = p ? null : findBasic(it.name);
    const proto = p || (b ? { ...basicFields(b) } : { name: it.name, unit: 'ud' });
    const r = { it, p, b, proto };
    r.save = toggle(p ? 'Guardar' : 'Añadir al inventario', p ? true : !!b);
    r.qty = numInput(st.fmtNum(it.qty || 1));
    r.exp = inp({ type: 'date' });
    r.loc = locSelect(p ? nav.stockLocFor(p) : proto.locationId || D.defaultLocationId || '');
    const approx = approxExpiry(proto);
    r.approx = approx ? h('button', { type: 'button', class: 'linkbtn small-link', onclick: () => { r.exp.value = approx; } }, `≈ ${st.fmtDate(approx)}`) : null;
    return r;
  });

  const s = openSheet('Guardar la compra', () => [
    h('p', { class: 'muted' }, 'Revisa cantidad, caducidad y dónde va cada cosa. Lo que no quieras en el inventario, desmárcalo.'),
    h('div', { class: 'list' }, rows.map((r) => {
      const name = r.p ? r.p.name : r.it.name;
      const sym = r.p ? r.p.symbol || st.productTags(r.p)[0]?.symbol || '' : r.b?.symbol || '';
      const unit = UNITS[(r.p || r.proto).unit || 'ud'];
      return h('div', { class: 'card stock-in' },
        h('div', { class: 'si-head' }, h('b', {}, `${sym ? sym + ' ' : ''}${name}`), r.it.note ? h('small', { class: 'muted' }, r.it.note) : null),
        r.save,
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, `Cantidad (${unit})`), r.qty),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Caduca ', r.approx), r.exp)),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Dónde'), r.loc));
    })),
    h('button', { class: 'btn primary block', onclick: save }, `Guardar en el inventario`),
    h('button', { class: 'btn block', onclick: () => {
      if (!confirm('¿Quitar todo del carro sin guardarlo en el inventario?')) return;
      const t = Date.now();
      for (const r of rows) S.items[r.it.id] = { id: r.it.id, del: true, u: t };
      st.commit();
      s.close();
      toast('Carro vaciado');
    } }, 'Quitar del carro sin guardar'),
  ]);

  function save() {
    const t = Date.now();
    const entries = [];
    let created = 0;
    for (const r of rows) {
      const include = r.save.cb.checked;
      if (include) {
        let pid = r.p?.id;
        if (!pid) {
          pid = uid();
          const base = r.b ? basicFields(r.b) : { name: r.it.name, unit: 'ud' };
          S.products[pid] = {
            id: pid, ...base, variants: [], lots: [], min: 0, restock: D.newRestock !== false, alerts: D.newAlerts !== false,
            locationId: r.loc.value || base.locationId || null, listId: null, u: t,
          };
          created++;
        }
        entries.push({ productId: pid, variantId: r.p ? st.fav(r.p)?.id || null : null, qty: num(r.qty.value) || 1, expiry: r.exp.value || null, locationId: r.loc.value || null });
      }
      // El elemento de la lista ya está comprado: se quita (si sigue faltando, volverá solo).
      S.items[r.it.id] = { id: r.it.id, del: true, u: t };
    }
    st.addStockBatch(entries);
    s.close();
    toast(`Guardado en el inventario: ${entries.length} artículo${entries.length === 1 ? '' : 's'}${created ? ` (${created} nuevo${created > 1 ? 's' : ''})` : ''}`);
  }
}
