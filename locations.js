// Ubicaciones: selector, gestor (añadir, editar, borrar, ordenar) y mover existencias.
import * as st from './store.js';
import { S } from './store.js';
import { h, icon, field, inp, toggle, numInput, num, openSheet, toast } from './ui.js';

const MAX_DEPTH = 2; // 0 estancia, 1 mueble, 2 estante

// ── Colores de las ubicaciones ──
// Cada estancia tiene un tono; lo que hay dentro lo hereda con menos intensidad (estancia fuerte,
// mueble medio, estante clarito). Lo que está a mano va en tonos fríos y la reserva en cálidos.
export const LOC_PALETTE = {
  cold: [
    { key: 'verde', name: 'Verde', h: 145, s: 48 }, { key: 'azul', name: 'Azul', h: 212, s: 55 },
    { key: 'turquesa', name: 'Turquesa', h: 178, s: 52 }, { key: 'anil', name: 'Añil', h: 238, s: 42 },
    { key: 'cielo', name: 'Azul cielo', h: 198, s: 62 }, { key: 'violeta', name: 'Violeta', h: 268, s: 38 },
    { key: 'menta', name: 'Verde menta', h: 160, s: 40 }, { key: 'gris', name: 'Gris azulado', h: 215, s: 16 },
  ],
  warm: [
    { key: 'naranja', name: 'Naranja', h: 27, s: 78 }, { key: 'teja', name: 'Teja', h: 11, s: 62 },
    { key: 'ambar', name: 'Ámbar', h: 40, s: 80 }, { key: 'granate', name: 'Granate', h: 352, s: 52 },
    { key: 'marron', name: 'Marrón', h: 26, s: 38 }, { key: 'mostaza', name: 'Mostaza', h: 47, s: 70 },
    { key: 'rosa', name: 'Rosa', h: 340, s: 55 }, { key: 'arena', name: 'Arena', h: 36, s: 34 },
  ],
};
const COLOR_BY_KEY = Object.fromEntries([...LOC_PALETTE.cold, ...LOC_PALETTE.warm].map((c) => [c.key, c]));
export const colorByKey = (k) => COLOR_BY_KEY[k] || null;

// Primera ubicación de su «grupo»: la estancia, o la primera de reserva del camino.
function groupRoot(id) {
  const path = st.locPath(id);
  if (!st.isReserve(id)) return path[0];
  return path.find((l) => st.isReserve(l.id)) || path[0];
}
export function locColor(id) {
  const l = st.getLoc(id);
  if (!l) return null;
  const path = st.locPath(id);
  const root = groupRoot(id);
  // El color elegido más cercano (sin cruzar de «a mano» a reserva).
  for (let i = path.length - 1; i >= 0; i--) {
    if (colorByKey(path[i].color)) return colorByKey(path[i].color);
    if (path[i].id === root.id) break;
  }
  const warm = st.isReserve(root.id);
  const roots = st.locTree().map(({ loc }) => loc).filter((x) => groupRoot(x.id).id === x.id && st.isReserve(x.id) === warm);
  const pal = warm ? LOC_PALETTE.warm : LOC_PALETTE.cold;
  return pal[Math.max(0, roots.findIndex((x) => x.id === root.id)) % pal.length];
}
const styleFor = (c) => (c ? `--lh:${c.h};--ls:${c.s}%` : '');

// Etiqueta de color de una ubicación (solo su nombre).
export function locChip(id, { depth = null, small = false } = {}) {
  const l = st.getLoc(id);
  if (!l) return h('span', { class: 'loc-chip none' + (small ? ' sm' : '') }, 'Sin ubicación');
  const d = Math.min(depth ?? st.locDepth(id), 2);
  return h('span', { class: `loc-chip d${d}${small ? ' sm' : ''}`, style: styleFor(locColor(id)) }, l.symbol ? l.symbol + ' ' : '', l.name);
}
// Camino completo: «Cocina › Armario derecho › Balda superior», cada nivel con su intensidad.
export function locCrumb(id, { small = false, none = 'Sin ubicación' } = {}) {
  const path = st.locPath(id);
  if (!path.length) return h('span', { class: 'loc-crumb' }, h('span', { class: 'loc-chip none' + (small ? ' sm' : '') }, none));
  return h('span', { class: 'loc-crumb' + (small ? ' sm' : '') }, path.map((l) => locChip(l.id, { small })));
}

// ── Selector de ubicación en árbol desplegable ──
const open = new Set(); // ramas abiertas (en esta sesión)
function openPath(id) { st.locPath(id).slice(0, -1).forEach((l) => open.add(l.id)); }

// Hoja con el árbol: toca una ubicación para elegirla, la flecha para abrir o cerrar lo que tiene dentro.
export function openLocPicker({ value = null, none = 'Sin ubicación', allowNew = true, allowed = null, title = '¿Dónde?', extra = null, onPick }) {
  let q = '';
  if (value) openPath(value);
  const tree = st.locTree();
  if (tree.length <= 10) tree.forEach(({ loc }) => open.add(loc.id));
  const search = h('input', { type: 'search', class: 'inp', placeholder: 'Buscar ubicación…', autocomplete: 'off' });
  search.addEventListener('input', () => { q = st.norm(search.value); s.refresh(); });
  const pick = (v) => { s.close(); onPick(v); };
  const node = (l, depth) => {
    const kids = st.locChildren(l.id);
    const isOpen = open.has(l.id) || !!q;
    const ok = !allowed || allowed(l);
    const n = st.locUsage(l.id);
    return [
      h('div', { class: 'lp-row' + (l.id === value ? ' sel' : '') + (ok ? '' : ' off'), style: `--ind:${depth}` },
        kids.length
          ? h('button', { type: 'button', class: 'lp-caret', 'aria-label': isOpen ? 'Cerrar' : 'Abrir', onclick: () => { if (open.has(l.id)) open.delete(l.id); else open.add(l.id); s.refresh(); } }, isOpen ? '▾' : '▸')
          : h('span', { class: 'lp-caret empty' }),
        h('button', { type: 'button', class: 'lp-main', disabled: !ok, onclick: () => pick(l.id) },
          locChip(l.id, { depth }),
          h('small', {}, [l.reserve ? 'reserva' : null, n ? `${n} artículo${n > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')),
          l.id === value ? h('span', { class: 'lp-check' }, '✓') : null)),
      isOpen ? kids.map((k) => node(k, depth + 1)) : null,
    ];
  };
  const s = openSheet(title, () => {
    const all = st.locTree();
    const hits = q ? all.filter(({ loc }) => st.norm(st.locName(loc.id)).includes(q)) : null;
    return [
      all.length > 8 ? h('div', { class: 'search' }, icon('search'), search) : null,
      extra ? extra.map(([v, label]) => h('button', { type: 'button', class: 'lp-row lp-plain' + ((value || '') === v ? ' sel' : ''), onclick: () => pick(v) }, label)) : null,
      none !== null && !q ? h('button', { type: 'button', class: 'lp-row lp-plain' + (!value ? ' sel' : ''), onclick: () => pick(null) }, h('span', { class: 'loc-chip none' }, none)) : null,
      h('div', { class: 'lp-tree' }, hits
        ? hits.map(({ loc }) => h('div', { class: 'lp-row' + (loc.id === value ? ' sel' : '') },
          h('button', { type: 'button', class: 'lp-main', disabled: allowed && !allowed(loc), onclick: () => pick(loc.id) }, locCrumb(loc.id))))
        : st.locChildren(null).map((l) => node(l, 0))),
      !all.length ? h('p', { class: 'muted' }, 'Todavía no hay ubicaciones.') : null,
      allowNew ? h('button', { type: 'button', class: 'btn block', onclick: () => {
        const parentId = value && st.locDepth(value) < MAX_DEPTH ? value : value ? st.getLoc(value)?.parentId || null : null;
        editLocation({ parentId, onSaved: (id) => pick(id) });
      } }, icon('plus'), value ? 'Nueva ubicación (dentro de la elegida)' : 'Nueva ubicación') : null,
    ];
  }, { live: true });
  return s;
}

// Campo para elegir ubicación. Se usa como un desplegable: .value, .refill(v) y evento «change».
export function locSelect(value, { none = 'Sin ubicación', allowNew = true, onChange, allowed = null, title } = {}) {
  let cur = null;
  const btn = h('button', { type: 'button', class: 'inp loc-pick' });
  const draw = () => btn.replaceChildren(cur ? locCrumb(cur, { small: true }) : h('span', { class: 'muted' }, none ?? 'Elige…'), h('span', { class: 'lp-arrow' }, '▾'));
  const set = (v, fire) => {
    const nv = v && st.getLoc(v) ? v : null;
    const changed = nv !== cur;
    cur = nv;
    draw();
    if (fire && changed) { onChange?.(cur); btn.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  Object.defineProperty(btn, 'value', { get: () => cur || '', set: (v) => set(v, false), configurable: true });
  btn.refill = (v) => set(v, false);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLocPicker({ value: cur, none, allowNew, allowed, title, onPick: (v) => set(v, true) });
  });
  set(value, false);
  return btn;
}

function usageText(id) {
  const n = st.locUsage(id);
  return n ? `${n} artículo${n > 1 ? 's' : ''}` : 'Vacía';
}

export function openLocations() {
  const s = openSheet('Ubicaciones', () => {
    const roots = st.locChildren(null);
    const node = (l, depth) => {
      const kids = st.locChildren(l.id);
      const isOpen = open.has(l.id);
      return [
        h('div', { class: 'lp-row', style: `--ind:${depth}` },
          kids.length
            ? h('button', { type: 'button', class: 'lp-caret', 'aria-label': isOpen ? 'Cerrar' : 'Abrir', onclick: () => { if (isOpen) open.delete(l.id); else open.add(l.id); s.refresh(); } }, isOpen ? '▾' : '▸')
            : h('span', { class: 'lp-caret empty' }),
          h('button', { type: 'button', class: 'lp-main', onclick: () => editLocation({ id: l.id }) },
            locChip(l.id, { depth }), h('small', {}, [l.reserve ? 'reserva' : null, usageText(l.id), kids.length && !isOpen ? `${kids.length} dentro` : null].filter(Boolean).join(' · '))),
          depth < MAX_DEPTH
            ? h('button', { class: 'icon-btn', 'aria-label': 'Añadir dentro de ' + l.name, onclick: () => { open.add(l.id); editLocation({ parentId: l.id }); } }, icon('plus'))
            : null),
        isOpen ? kids.map((k) => node(k, depth + 1)) : null,
      ];
    };
    return [
      h('p', { class: 'muted' }, 'Estancia › mueble › estante. Toca una para cambiarle el nombre, el color o el sitio, o marcarla como reserva. La flecha despliega lo que tiene dentro.'),
      roots.length
        ? [h('div', { class: 'btn-row' },
            h('button', { class: 'btn small', onclick: () => { st.locTree().forEach(({ loc }) => open.add(loc.id)); s.refresh(); } }, 'Abrir todo'),
            h('button', { class: 'btn small', onclick: () => { open.clear(); s.refresh(); } }, 'Cerrar todo')),
          h('div', { class: 'lp-tree' }, roots.map((l) => node(l, 0)))]
        : h('div', { class: 'empty' }, icon('pin'), h('p', {}, 'Todavía no hay ubicaciones.')),
      h('p', { class: 'hint' }, 'Colores: lo que está a mano va en tonos fríos y la reserva en tonos cálidos. Cada estancia puede tener el suyo y lo de dentro lo hereda, más clarito cuanto más dentro.'),
      h('button', { class: 'btn primary block', onclick: () => editLocation({}) }, icon('plus'), 'Nueva estancia'),
    ];
  }, { live: true });
}

// Muestras de color para elegir (fríos para lo de a mano, cálidos para la reserva).
function colorPicker(l, isRes) {
  let cur = l.color || '';
  const box = h('div', { class: 'swatches' });
  const draw = () => {
    const auto = h('button', { type: 'button', class: 'swatch auto' + (!cur ? ' on' : ''), onclick: () => { cur = ''; draw(); } }, 'Auto');
    const row = (pal, label) => h('div', { class: 'sw-row' }, h('small', {}, label),
      h('div', { class: 'sw-list' }, pal.map((c) => h('button', { type: 'button', class: 'swatch' + (cur === c.key ? ' on' : ''), title: c.name, 'aria-label': c.name,
        style: styleFor(c), onclick: () => { cur = c.key; draw(); } }))));
    box.replaceChildren(auto,
      row(isRes() ? LOC_PALETTE.warm : LOC_PALETTE.cold, isRes() ? 'Cálidos (reserva)' : 'Fríos (a mano)'),
      row(isRes() ? LOC_PALETTE.cold : LOC_PALETTE.warm, isRes() ? 'Fríos' : 'Cálidos'));
  };
  draw();
  box.get = () => cur || null;
  box.redraw = draw;
  return box;
}

export function editLocation({ id = null, parentId = null, onSaved } = {}) {
  const isNew = !id || !st.getLoc(id);
  const l = isNew ? { id: st.uid(), name: '', parentId: parentId || null, reserve: false } : st.clone(S.locations[id]);
  const name = inp({ value: l.name, placeholder: 'p. ej. Cocina, Despensa, Balda 2', autocapitalize: 'sentences' });
  const symIn = inp({ value: l.symbol || '', class: 'inp sym-input', maxlength: 8, placeholder: '🙂', 'aria-label': 'Símbolo' });
  const sub = isNew ? new Set() : st.locSubtree(l.id);
  const height = isNew ? 0 : st.locHeight(l.id);
  const okParent = (loc) => !sub.has(loc.id) && st.locDepth(loc.id) + 1 + height <= MAX_DEPTH;
  const parentSel = locSelect(l.parentId && st.getLoc(l.parentId) ? l.parentId : '', {
    none: '— Ninguna: es una estancia —', allowNew: false, allowed: okParent, title: '¿Dentro de qué está?',
    onChange: () => colors.redraw(),
  });
  const reserve = toggle('De reserva', !!l.reserve, 'Lo que hay aquí no cuenta como «a mano» ni para el mínimo de compra', () => colors.redraw());
  const isRes = () => reserve.cb.checked || (!!parentSel.value && st.isReserve(parentSel.value));
  const colors = colorPicker(l, isRes);

  const s = openSheet(isNew ? 'Nueva ubicación' : 'Editar ubicación', () => [
    h('div', { class: 'sym-row' }, field('Símbolo', symIn), field('Nombre', name)),
    field('Dentro de', parentSel, 'Hasta 3 niveles: estancia › mueble › estante'),
    reserve,
    parentSel.value && st.isReserve(parentSel.value) ? h('p', { class: 'hint' }, 'Ya es de reserva porque está dentro de una ubicación de reserva.') : null,
    h('span', { class: 'lbl' }, 'Color'),
    h('p', { class: 'hint', style: 'margin:2px 0 6px' }, '«Auto» usa el color de la estancia (o de la reserva) en la que está, más clarito cuanto más dentro.'),
    colors,
    h('button', { class: 'btn primary block', onclick: () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      const pid = parentSel.value || null;
      const dup = st.locChildren(pid).find((x) => x.id !== l.id && st.norm(x.name) === st.norm(nm));
      if (dup) { toast('Ya hay una ubicación con ese nombre ahí'); return; }
      if (pid !== (l.parentId || null)) delete l.order;
      Object.assign(l, { name: nm, parentId: pid, reserve: reserve.cb.checked, symbol: symIn.value.trim() || null, color: colors.get() });
      st.putLoc(l);
      if (pid) open.add(pid);
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
  const gone = st.locSubtree(id);
  const dest = locSelect(parent?.id || '', { allowNew: false, allowed: (x) => !gone.has(x.id) });
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
    h('p', { class: 'muted' }, 'Desde: ', locCrumb(lot.locationId, { small: true })),
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
