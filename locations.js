// Ubicaciones: selector, gestor (añadir, editar, borrar, ordenar) y mover existencias.
import * as st from './store.js';
import { S } from './store.js';
import { h, icon, badge, field, inp, toggle, select, numInput, num, indent, openSheet, toast } from './ui.js';

const MAX_DEPTH = 2; // 0 estancia, 1 mueble, 2 estante

// Desplegable de ubicaciones con opción de crear una nueva al vuelo.
export function locSelect(value, { none = 'Sin ubicación', allowNew = true, onChange } = {}) {
  const sel = h('select', { class: 'inp' });
  const fill = (v) => {
    sel.replaceChildren(...[
      none !== null ? h('option', { value: '' }, none) : null,
      ...st.locTree().map(({ loc, depth }) =>
        h('option', { value: loc.id }, st.locName(loc.id) + (st.isReserve(loc.id) ? ' · reserva' : ''))),
      allowNew ? h('option', { value: '__new' }, '+ Nueva ubicación…') : null,
    ].filter(Boolean));
    sel.value = v && st.getLoc(v) ? v : none !== null ? '' : sel.options[0]?.value || '';
    sel.dataset.prev = sel.value;
  };
  fill(value);
  sel.addEventListener('change', () => {
    if (sel.value === '__new') {
      const prev = sel.dataset.prev;
      sel.value = prev;
      const parentId = prev && st.locDepth(prev) < MAX_DEPTH ? prev : prev ? st.getLoc(prev)?.parentId || null : null;
      editLocation({ parentId, onSaved: (id) => { fill(id); onChange?.(id); } });
      return;
    }
    sel.dataset.prev = sel.value;
    onChange?.(sel.value || null);
  });
  sel.refill = fill;
  return sel;
}

function usageText(id) {
  const n = st.locUsage(id);
  return n ? `${n} artículo${n > 1 ? 's' : ''}` : 'Vacía';
}

export function openLocations() {
  openSheet('Ubicaciones', () => {
    const tree = st.locTree();
    return [
      h('p', { class: 'muted' }, 'Estancia › mueble › estante. Toca una para editarla, cambiarla de sitio o marcarla como reserva.'),
      tree.length
        ? tree.map(({ loc, depth }) => h('div', { class: 'tree-row d' + Math.min(depth, 2) },
            h('button', { class: 'row-main plain', onclick: () => editLocation({ id: loc.id }) },
              h('div', { class: 'row-title' }, loc.name),
              h('div', { class: 'row-sub' }, usageText(loc.id))),
            loc.reserve ? badge('reserva', 'low') : null,
            depth < MAX_DEPTH
              ? h('button', { class: 'icon-btn', 'aria-label': 'Añadir dentro de ' + loc.name, onclick: () => editLocation({ parentId: loc.id }) }, icon('plus'))
              : null))
        : h('div', { class: 'empty' }, icon('pin'), h('p', {}, 'Todavía no hay ubicaciones.')),
      h('button', { class: 'btn primary block', onclick: () => editLocation({}) }, icon('plus'), 'Nueva estancia'),
    ];
  }, { live: true });
}

export function editLocation({ id = null, parentId = null, onSaved } = {}) {
  const isNew = !id || !st.getLoc(id);
  const l = isNew ? { id: st.uid(), name: '', parentId: parentId || null, reserve: false } : st.clone(S.locations[id]);
  const name = inp({ value: l.name, placeholder: 'p. ej. Cocina, Despensa, Balda 2', autocapitalize: 'sentences' });
  const sub = isNew ? new Set() : st.locSubtree(l.id);
  const height = isNew ? 0 : st.locHeight(l.id);
  const parents = st.locTree().filter(({ loc, depth }) => !sub.has(loc.id) && depth + 1 + height <= MAX_DEPTH);
  const parentSel = select([['', '— Ninguna: es una estancia —'], ...parents.map(({ loc }) => [loc.id, st.locName(loc.id)])],
    l.parentId && st.getLoc(l.parentId) ? l.parentId : '');
  const inherited = l.parentId && st.isReserve(l.parentId);
  const reserve = toggle('De reserva', !!l.reserve,
    inherited ? 'Ya es de reserva porque está dentro de una ubicación de reserva' : 'Lo que hay aquí no cuenta como «a mano» ni para el mínimo de compra');

  const s = openSheet(isNew ? 'Nueva ubicación' : 'Editar ubicación', () => [
    field('Nombre', name),
    field('Dentro de', parentSel, 'Hasta 3 niveles: estancia › mueble › estante'),
    reserve,
    h('button', { class: 'btn primary block', onclick: () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      const pid = parentSel.value || null;
      const dup = st.locChildren(pid).find((x) => x.id !== l.id && st.norm(x.name) === st.norm(nm));
      if (dup) { toast('Ya hay una ubicación con ese nombre ahí'); return; }
      if (pid !== (l.parentId || null)) delete l.order;
      Object.assign(l, { name: nm, parentId: pid, reserve: reserve.cb.checked });
      st.putLoc(l);
      s.close();
      toast(isNew ? `«${nm}» creada` : 'Guardado');
      onSaved?.(l.id);
    } }, icon('check'), 'Guardar'),
    !isNew ? h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => st.moveLocOrder(l.id, -1) }, '↑ Subir'),
      h('button', { class: 'btn small', onclick: () => st.moveLocOrder(l.id, 1) }, '↓ Bajar'),
      h('small', { class: 'hint', style: 'align-self:center' }, 'Orden dentro de su nivel')) : null,
    !isNew ? h('button', { class: 'btn danger block', onclick: () => removeLocation(l.id, s) }, 'Borrar ubicación') : null,
  ]);
  if (isNew) setTimeout(() => name.focus(), 300);
}

function removeLocation(id, parentSheet) {
  const loc = st.getLoc(id);
  const n = st.locUsage(id);
  const kids = st.locChildren(id);
  const parent = st.getLoc(loc.parentId);
  if (!n && !kids.length) {
    if (!confirm(`¿Borrar «${loc.name}»?`)) return;
    st.deleteLoc(id, null);
    parentSheet.close();
    toast('Ubicación borrada');
    return;
  }
  const dest = locSelect(parent?.id || '', { allowNew: false });
  const s = openSheet('Borrar «' + loc.name + '»', () => [
    n ? field(`Hay ${n} artículo${n > 1 ? 's' : ''} aquí. ¿A dónde los paso?`, dest) : null,
    kids.length ? h('p', { class: 'muted' }, `Lo que hay dentro (${kids.map((k) => k.name).join(', ')}) pasará a ${parent ? '«' + parent.name + '»' : 'ser estancia'}.`) : null,
    h('button', { class: 'btn danger block', onclick: () => {
      if (dest.value === id) { toast('Elige otra ubicación'); return; }
      st.deleteLoc(id, dest.value || null);
      s.close();
      parentSheet.close();
      toast('Ubicación borrada');
    } }, 'Borrar y mover'),
  ]);
}

// Mover un lote (o parte) a otra ubicación.
export function moveSheet(pid, lotId) {
  const p = S.products[pid];
  const lot = (p.lots || []).find((l) => l.id === lotId);
  if (!lot) return;
  const fromRes = st.isReserve(lot.locationId);
  let def = p.locationId && p.locationId !== lot.locationId ? p.locationId : '';
  if (!fromRes && !def) def = st.locTree().find(({ loc }) => st.isReserve(loc.id))?.loc.id || '';
  const qIn = numInput(st.fmtNum(lot.qty));
  const dest = locSelect(def);
  const s = openSheet('Mover ' + p.name, () => [
    h('p', { class: 'muted' }, 'Desde: ' + (st.locName(lot.locationId) || 'Sin ubicación')),
    h('div', { class: 'grid2' },
      field(`Cantidad (de ${st.fmtNum(lot.qty)})`, qIn),
      field('A', dest)),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) { qIn.focus(); return; }
      if ((dest.value || null) === (lot.locationId || null)) { toast('Ya está ahí'); return; }
      st.moveStock(S.products[pid], lotId, q, dest.value || null);
      s.close();
      toast(`Movido a ${st.locName(dest.value) || 'sin ubicación'}`);
    } }, icon('move'), 'Mover'),
  ]);
}

// Traer existencias de la reserva a la ubicación habitual (o la que se elija).
export function fromReserveSheet(pid) {
  const p = S.products[pid];
  const res = st.inReserve(p);
  if (!(res > 0)) { toast('No hay nada en reserva'); return; }
  const target = +p.target > 0 ? +p.target : +p.min;
  const want = target > 0 ? Math.max(target - st.atHand(p), 1) : res;
  const qIn = numInput(st.fmtNum(Math.min(res, want)));
  const dest = locSelect(p.locationId && !st.isReserve(p.locationId) ? p.locationId : '');
  const s = openSheet('Traer de la reserva', () => [
    h('p', { class: 'muted' }, `${p.name}: ${st.fmtQty(res, p.unit)} en reserva, ${st.fmtQty(st.atHand(p), p.unit)} a mano. Se coge primero lo que caduca antes.`),
    h('div', { class: 'grid2' }, field('Cantidad', qIn), field('Llevar a', dest)),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) { qIn.focus(); return; }
      if (dest.value && st.isReserve(dest.value)) { toast('Elige una ubicación que no sea de reserva'); return; }
      st.fromReserve(S.products[pid], Math.min(q, res), dest.value || null);
      s.close();
      toast(`${p.name}: ${st.fmtQty(Math.min(q, res), p.unit)} a mano`);
    } }, icon('move'), 'Traer'),
  ]);
}
