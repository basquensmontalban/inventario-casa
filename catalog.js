// Etiquetas y tiendas: gestor (añadir, editar, ordenar, borrar), selector de símbolo y selector en el editor.
import * as st from './store.js';
import { S } from './store.js';
import { h, icon, field, inp, openSheet, toast } from './ui.js';

export const KINDS = {
  tags: {
    one: 'categoría', title: 'Categorías', newTitle: 'Nueva categoría', placeholder: 'p. ej. Limpieza, Higiene, Mascotas',
    help: 'Categorías con sus subcategorías (p. ej. Alimentación › Conservas). Filtrar por una categoría incluye sus subcategorías. Un artículo puede tener varias.',
    defaultSymbol: '🏷️',
    palette: '🥬 🍎 🥫 🥩 🐟 🥛 🧀 🥚 🍞 🍝 🍚 🫘 🥜 🧂 🫒 🍫 🍪 ☕ 🍷 🥤 ❄️ 🧊 🧴 🧽 🧻 🧹 💊 🐾 👶 🔧 🔋 💡 🏷️'.split(' '),
  },
  stores: {
    one: 'tienda', title: 'Tiendas', newTitle: 'Nueva tienda', placeholder: 'p. ej. Mercadona, Lidl, IKEA',
    help: 'Indica en cada artículo dónde se compra y luego filtra por tienda en el inventario, en la compra y en la pestaña Tiendas.',
    defaultSymbol: '🛒',
    palette: '🛒 🏪 🏬 🥖 🥩 🐟 🍎 🧀 💊 🧴 🧰 🛋️ 🌿 🐾 📦 🍷 🏷️ 🟢 🔵 🟡 🟠 🔴 🟣'.split(' '),
  },
};

export const label = (rec) => `${rec.symbol ? rec.symbol + ' ' : ''}${rec.name}`;

function usage(kind, id) {
  const f = kind === 'tags' ? 'tags' : 'stores';
  return st.alive(S.products).filter((p) => (p[f] || []).includes(id)).length;
}

export function openCatalog(kind) {
  const K = KINDS[kind];
  openSheet(K.title, () => {
    const arr = st.catalog(kind);
    return [
      h('p', { class: 'muted' }, K.help),
      arr.length
        ? h('div', { class: 'list' }, arr.map((r) => {
            const n = usage(kind, r.id);
            const child = kind === 'tags' && st.tagDepth(r) === 1;
            const kids = kind === 'tags' && !child ? st.tagChildren(r.id).length : 0;
            return h('div', { class: 'row' + (child ? ' child' : '') },
              h('button', { class: 'row-main plain cat-main', onclick: () => editCatalog(kind, { id: r.id }) },
                h('div', { class: 'sym' }, r.symbol || K.defaultSymbol),
                h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.name),
                  h('div', { class: 'row-sub' }, [kids ? `${kids} subcategorías` : null, n ? `${n} artículo${n > 1 ? 's' : ''}` : (kids ? null : 'Sin artículos')].filter(Boolean).join(' · ')))),
              kind === 'tags' && !child
                ? h('button', { class: 'icon-btn', 'aria-label': 'Añadir subcategoría a ' + r.name, onclick: () => editCatalog(kind, { parentId: r.id }) }, icon('plus'))
                : null);
          }))
        : h('div', { class: 'empty' }, h('p', {}, `Todavía no hay ${K.title.toLowerCase()}.`)),
      h('button', { class: 'btn primary block', onclick: () => editCatalog(kind, {}) }, icon('plus'), K.newTitle),
    ];
  }, { live: true });
}

export function editCatalog(kind, { id = null, name: preName = '', parentId = null, onSaved } = {}) {
  const K = KINDS[kind];
  const isNew = !id || !S[kind][id] || S[kind][id].del;
  const r = isNew ? { id: st.uid(), name: preName, symbol: K.defaultSymbol, ...(kind === 'tags' ? { parentId } : {}) } : st.clone(S[kind][id]);
  // Solo hay dos niveles: una categoría con subcategorías no puede meterse dentro de otra.
  const hasKids = kind === 'tags' && !isNew && st.tagChildren(r.id).length > 0;
  const parentSel = kind === 'tags' ? h('select', { class: 'inp', disabled: hasKids },
    h('option', { value: '' }, '— Ninguna: es una categoría principal —'),
    st.tagChildren(null).filter((t) => t.id !== r.id).map((t) => h('option', { value: t.id, selected: t.id === r.parentId }, label(t)))) : null;
  const name = inp({ value: r.name, placeholder: K.placeholder, autocapitalize: 'sentences' });
  const sym = inp({ value: r.symbol || '', class: 'inp sym-input', maxlength: 8, 'aria-label': 'Símbolo' });
  const pal = h('div', { class: 'palette' }, K.palette.map((e) => h('button', { type: 'button', class: 'pal', onclick: () => { sym.value = e; } }, e)));
  const s = openSheet(isNew ? K.newTitle : 'Editar ' + K.one, () => [
    h('div', { class: 'sym-row' }, field('Símbolo', sym), field('Nombre', name)),
    parentSel ? field('Dentro de', parentSel, hasKids ? 'Tiene subcategorías, así que es una categoría principal.' : 'Déjalo en «Ninguna» para que sea una categoría principal.') : null,
    pal,
    h('p', { class: 'hint' }, 'Puedes escribir cualquier emoji en «Símbolo» o elegir uno de la lista.'),
    h('button', { class: 'btn primary block', onclick: () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      if (st.catalog(kind).some((x) => x.id !== r.id && st.norm(x.name) === st.norm(nm))) { toast(`Ya hay una ${K.one} con ese nombre`); return; }
      Object.assign(r, { name: nm, symbol: sym.value.trim() || K.defaultSymbol });
      if (parentSel) {
        if ((parentSel.value || null) !== (r.parentId || null)) delete r.order;
        r.parentId = parentSel.value || null;
      }
      if (!isNew && S[kind][r.id]?.aisles) r.aisles = S[kind][r.id].aisles;
      st.putCatalog(kind, r);
      s.close();
      toast(isNew ? `«${nm}» creada` : 'Guardado');
      onSaved?.(r.id);
    } }, icon('check'), 'Guardar'),
    !isNew && kind === 'stores' ? h('button', { class: 'btn block', onclick: () => openAisles(r.id) }, '🧭 Orden de pasillos de esta tienda',
      r.aisles?.length ? h('small', { class: 'muted' }, ' (personalizado)') : null) : null,
    !isNew ? h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => st.moveCatalogOrder(kind, r.id, -1) }, '↑ Subir'),
      h('button', { class: 'btn small', onclick: () => st.moveCatalogOrder(kind, r.id, 1) }, '↓ Bajar')) : null,
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      const n = usage(kind, r.id);
      if (!confirm(`¿Borrar la ${K.one} «${r.name}»?${n ? `\n\nSe quitará de ${n} artículo${n > 1 ? 's' : ''} (los artículos no se borran).` : ''}${hasKids ? '\n\nSus subcategorías pasarán a ser categorías principales.' : ''}`)) return;
      st.deleteCatalog(kind, r.id);
      s.close();
      toast(`${K.one[0].toUpperCase() + K.one.slice(1)} borrada`);
    } }, `Borrar ${K.one}`) : null,
  ]);
  if (isNew && !preName) setTimeout(() => name.focus(), 300);
}

// Selector múltiple en forma de chips. Devuelve un elemento con .value (array de ids).
export function catalogPicker(kind, selected = []) {
  const K = KINDS[kind];
  const box = h('div', { class: 'chips wrap' });
  box.value = [...selected].filter((id) => (kind === 'tags' ? st.getTag(id) : st.getStore(id)));
  const open = {};
  const chip = (r, extra = '') => h('button', {
    type: 'button', class: 'chip' + extra + (box.value.includes(r.id) ? ' on' : ''),
    onclick: () => {
      box.value = box.value.includes(r.id) ? box.value.filter((x) => x !== r.id) : [...box.value, r.id];
      draw();
    },
  }, label(r));
  const draw = () => {
    if (kind === 'tags') {
      // Agrupado: cada categoría con sus subcategorías debajo.
      box.replaceChildren(
        ...st.tagChildren(null).map((t) => {
          const kids = st.tagChildren(t.id);
          if (!kids.length) return chip(t);
          const nSel = kids.filter((c) => box.value.includes(c.id)).length;
          if (!(t.id in open)) open[t.id] = nSel > 0;
          return h('div', { class: 'tag-group' },
            h('div', { class: 'tag-head' }, chip(t, ' parent'),
              h('button', { type: 'button', class: 'linkbtn', onclick: () => { open[t.id] = !open[t.id]; draw(); } },
                open[t.id] ? 'Ocultar subcategorías' : `Subcategorías (${kids.length})${nSel ? ` · ${nSel} marcada${nSel > 1 ? 's' : ''}` : ''}`)),
            open[t.id] ? h('div', { class: 'chips wrap' }, kids.map((c) => chip(c))) : null);
        }),
        h('button', { type: 'button', class: 'chip add', onclick: () => editCatalog(kind, { onSaved: (id) => { box.value = [...box.value, id]; draw(); } }) }, '+ ' + K.one),
      );
      return;
    }
    box.replaceChildren(
      ...st.catalog(kind).map((r) => h('button', {
        type: 'button', class: 'chip' + (box.value.includes(r.id) ? ' on' : ''),
        onclick: () => {
          box.value = box.value.includes(r.id) ? box.value.filter((x) => x !== r.id) : [...box.value, r.id];
          draw();
        },
      }, label(r))),
      h('button', { type: 'button', class: 'chip add', onclick: () => editCatalog(kind, { onSaved: (id) => { box.value = [...box.value, id]; draw(); } }) }, '+ ' + K.one),
    );
  };
  box.set = (ids) => { box.value = [...ids]; draw(); };
  draw();
  return box;
}

// ── Orden de pasillos de una tienda: en qué orden aparecen las categorías al comprar allí ──
function aisleCats() {
  return st.tags().filter((t) => st.tagDepth(t) === 1 || !st.tagChildren(t.id).length);
}
export function openAisles(storeId) {
  const store = S.stores[storeId];
  const all = aisleCats();
  const ids = new Set(all.map((t) => t.id));
  let order = [...(store.aisles || []).filter((id) => ids.has(id)), ...all.map((t) => t.id).filter((id) => !(store.aisles || []).includes(id))];
  const move = (i, j) => { if (j < 0 || j >= order.length) return; const [x] = order.splice(i, 1); order.splice(j, 0, x); s.refresh(); };
  const s = openSheet('Pasillos de ' + store.name, () => [
    h('p', { class: 'muted' }, 'Ordena las categorías como las vas encontrando en esta tienda. Al filtrar la compra por esta tienda (o en el modo súper), la lista sale en este orden.'),
    h('div', { class: 'list' }, order.map((id, i) => {
      const t = st.getTag(id);
      return h('div', { class: 'row aisle' },
        h('span', { class: 'aisle-n' }, i + 1),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, `${t.symbol || ''} ${t.name}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Al principio', onclick: () => move(i, 0) }, '⤒'),
        h('button', { class: 'icon-btn', 'aria-label': 'Subir', onclick: () => move(i, i - 1) }, '↑'),
        h('button', { class: 'icon-btn', 'aria-label': 'Bajar', onclick: () => move(i, i + 1) }, '↓'));
    })),
    h('button', { class: 'btn primary block sticky-bottom', onclick: () => {
      st.putCatalog('stores', { ...st.clone(S.stores[storeId]), aisles: order });
      s.close();
      toast('Orden de pasillos guardado');
    } }, 'Guardar orden'),
    store.aisles?.length ? h('button', { class: 'btn block', onclick: () => {
      const rec = st.clone(S.stores[storeId]);
      delete rec.aisles;
      st.putCatalog('stores', rec);
      s.close();
      toast('Vuelve al orden general');
    } }, 'Usar el orden general') : null,
  ]);
}
