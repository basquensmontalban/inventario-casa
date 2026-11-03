// «Guardar la compra»: al llegar a casa, pasar al inventario todo lo que está en el carro de una vez.
import * as st from './store.js';
import { S, UNITS, uid } from './store.js';
import { D } from './device.js';
import { h, inp, numInput, num, toggle, openSheet, toast, nav } from './ui.js';
import { locSelect, locCrumb } from './locations.js';
import { findBasic, basicFields, approxExpiry } from './productdb.js';
import { bestBasicFor } from './off.js';

const alive = (id) => (id && S.products[id] && !S.products[id].del ? S.products[id] : null);
// «Comino (3 cucharaditas)» → «Comino»
const cleanName = (n) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || String(n || '').trim();

export function openStockIn() {
  const cart = st.alive(S.items).filter((it) => it.done && it.inCart);
  if (!cart.length) { toast('No hay nada en el carro'); return; }

  const rows = cart.map((it) => {
    const name = cleanName(it.name);
    // Si lo apuntado a mano ya existe en el inventario (mismo nombre), se suma a ese artículo.
    const p = alive(it.productId) || (name ? st.products().find((x) => st.norm(x.name) === st.norm(name)) || null : null);
    const exact = p ? null : findBasic(name);
    const like = p || exact ? null : bestBasicFor(name);
    const b = exact || like;
    const proto = p || (b ? { ...basicFields(b), name: exact ? b.name : name } : { name, unit: 'ud' });
    const r = { it, p, b, proto, name: p ? p.name : proto.name };
    r.card = h('div', { class: 'card stock-in' });
    // Todo se guarda salvo que lo desmarques; tocar cantidad, fecha o sitio lo vuelve a marcar.
    r.save = toggle(p ? 'Guardar en el inventario' : 'Guardar (artículo nuevo)', true, null, (v) => r.card.classList.toggle('off', !v));
    const on = () => { if (!r.save.cb.checked) { r.save.cb.checked = true; r.card.classList.remove('off'); } };
    r.qty = numInput(st.fmtNum(it.qty || 1));
    r.qty.addEventListener('input', on);
    r.exp = inp({ type: 'date' });
    r.exp.addEventListener('change', on);
    r.loc = locSelect(p ? nav.stockLocFor(p) : proto.locationId || D.defaultLocationId || '', { onChange: on, title: `¿Dónde va ${r.name}?` });
    const approx = approxExpiry(proto);
    r.approx = approx ? h('button', { type: 'button', class: 'linkbtn small-link', onclick: () => { r.exp.value = approx; on(); } }, `≈ ${st.fmtDate(approx)}`) : null;
    return r;
  });

  let result = null; // tras guardar: [{ pid, name, qty, unit, locationId }]
  let undo = null;

  const s = openSheet('Guardar la compra', () => {
    if (result) return resultView();
    return [
      h('p', { class: 'muted' }, 'Revisa cantidad, caducidad y dónde va cada cosa. Lo que no quieras guardar en el inventario, desmárcalo.'),
      h('div', { class: 'list' }, rows.map((r) => {
        const sym = r.p ? r.p.symbol || st.productTags(r.p)[0]?.symbol || '' : r.proto.symbol || '';
        const unit = UNITS[(r.p || r.proto).unit || 'ud'];
        r.card.replaceChildren(
          h('div', { class: 'si-head' }, h('b', {}, `${sym ? sym + ' ' : ''}${r.name}`),
            r.it.note ? h('small', { class: 'muted' }, r.it.note) : null,
            !r.p ? h('small', { class: 'muted' }, r.b ? 'Nuevo en el inventario' : 'Nuevo en el inventario (sin categoría)') : null),
          r.save,
          h('div', { class: 'grid2' },
            h('label', { class: 'field' }, h('span', { class: 'lbl' }, `Cantidad (${unit})`), r.qty),
            h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Caduca ', r.approx), r.exp)),
          h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Dónde'), r.loc));
        return r.card;
      })),
      h('button', { class: 'btn primary block', onclick: save }, 'Guardar en el inventario'),
      h('button', { class: 'btn block', onclick: () => {
        if (!confirm('¿Quitar todo del carro sin guardarlo en el inventario?')) return;
        const t = Date.now();
        for (const r of rows) S.items[r.it.id] = { id: r.it.id, del: true, u: t };
        st.commit();
        s.close();
        toast('Carro vaciado');
      } }, 'Quitar del carro sin guardar'),
    ];
  });

  function resultView() {
    s.title.textContent = result.length ? '✓ Guardado en el inventario' : 'Hecho';
    return [
      result.length
        ? h('div', { class: 'list' }, result.map((x) => h('button', { class: 'row', onclick: () => { s.close(); nav.openProduct(x.pid); } },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, x.name, h('span', { class: 'muted' }, ` · ${st.fmtQty(x.qty, x.unit)}`)),
            h('div', { class: 'row-sub row-locs' }, locCrumb(x.locationId, { small: true }))))))
        : h('p', { class: 'muted' }, 'No se ha guardado nada en el inventario; lo del carro se ha quitado de la lista.'),
      result.length ? h('button', { class: 'btn primary block', onclick: () => { s.close(); nav.showInInventory(result.map((x) => x.pid)); } }, 'Verlo en el inventario') : null,
      h('div', { class: 'actions two' },
        h('button', { class: 'btn', onclick: () => { undo(); s.close(); toast('Deshecho: todo vuelve a estar en el carro'); } }, 'Deshacer'),
        h('button', { class: 'btn', onclick: () => s.close() }, 'Hecho')),
    ];
  }

  function save() {
    const before = { products: {}, items: {} };
    const out = [];
    try {
      const t = Date.now();
      const entries = [];
      for (const r of rows) {
        const cur = S.items[r.it.id];
        before.items[r.it.id] = cur ? st.clone(cur) : null;
        if (r.save.cb.checked) {
          const qty = num(r.qty.value) || 1;
          const locationId = r.loc.value || null;
          let p = r.p ? alive(r.p.id) : null;
          if (!p) p = st.products().find((x) => st.norm(x.name) === st.norm(r.name)) || null; // creado en otra fila
          if (p) before.products[p.id] = before.products[p.id] || st.clone(p);
          else {
            const pid = uid();
            const base = r.b ? { ...basicFields(r.b), name: r.proto.name } : { name: r.name, unit: 'ud' };
            if (!base.name) throw new Error('falta el nombre');
            p = S.products[pid] = {
              id: pid, ...base, variants: [], lots: [], min: 0, restock: D.newRestock !== false, alerts: D.newAlerts !== false,
              locationId: locationId || base.locationId || null, listId: null, u: t,
            };
            before.products[pid] = null;
          }
          entries.push({ productId: p.id, variantId: r.p ? st.fav(r.p)?.id || null : null, qty, expiry: r.exp.value || null, locationId });
          out.push({ pid: p.id, name: p.name, qty, unit: p.unit || 'ud', locationId });
        }
        // Ya está comprado: se quita de la lista (si sigue faltando, volverá solo).
        S.items[r.it.id] = { id: r.it.id, del: true, u: t };
      }
      st.addStockBatch(entries);
      // Comprobación: cada cosa tiene que estar en el inventario.
      for (const e of entries) {
        if (!(S.products[e.productId]?.lots || []).some((l) => (l.locationId || null) === e.locationId)) throw new Error('no se ha podido añadir ' + S.products[e.productId]?.name);
      }
    } catch (err) {
      for (const [id, v] of Object.entries(before.items)) { if (v) S.items[id] = v; }
      for (const [id, v] of Object.entries(before.products)) { if (v) S.products[id] = v; else delete S.products[id]; }
      st.commit();
      console.error(err);
      toast('No se ha podido guardar (' + err.message + '). No se ha cambiado nada: vuelve a intentarlo.', { ms: 9000 });
      return;
    }
    undo = () => {
      const t = Date.now();
      for (const [id, v] of Object.entries(before.items)) if (v) S.items[id] = { ...v, u: t };
      for (const [id, v] of Object.entries(before.products)) S.products[id] = v ? { ...v, u: t } : { id, del: true, u: t };
      st.commit();
    };
    result = out;
    s.refresh();
  }
}
