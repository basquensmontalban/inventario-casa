// Etiquetas y tiendas: gestor (añadir, editar, ordenar, borrar), selector de símbolo y selector en el editor.
import * as st from './store.js';
import { S } from './store.js';
import { h, icon, field, inp, openSheet, toast } from './ui.js';

export const KINDS = {
  tags: {
    one: 'etiqueta', title: 'Etiquetas', newTitle: 'Nueva etiqueta', placeholder: 'p. ej. Verdura, Lácteos, Limpieza',
    help: 'Sirven para clasificar y filtrar los artículos. Un artículo puede tener varias.',
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
            return h('button', { class: 'row', onclick: () => editCatalog(kind, { id: r.id }) },
              h('div', { class: 'sym' }, r.symbol || K.defaultSymbol),
              h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, r.name),
                h('div', { class: 'row-sub' }, n ? `${n} artículo${n > 1 ? 's' : ''}` : 'Sin artículos')));
          }))
        : h('div', { class: 'empty' }, h('p', {}, `Todavía no hay ${K.title.toLowerCase()}.`)),
      h('button', { class: 'btn primary block', onclick: () => editCatalog(kind, {}) }, icon('plus'), K.newTitle),
    ];
  }, { live: true });
}

export function editCatalog(kind, { id = null, name: preName = '', onSaved } = {}) {
  const K = KINDS[kind];
  const isNew = !id || !S[kind][id] || S[kind][id].del;
  const r = isNew ? { id: st.uid(), name: preName, symbol: K.defaultSymbol } : st.clone(S[kind][id]);
  const name = inp({ value: r.name, placeholder: K.placeholder, autocapitalize: 'sentences' });
  const sym = inp({ value: r.symbol || '', class: 'inp sym-input', maxlength: 8, 'aria-label': 'Símbolo' });
  const pal = h('div', { class: 'palette' }, K.palette.map((e) => h('button', { type: 'button', class: 'pal', onclick: () => { sym.value = e; } }, e)));
  const s = openSheet(isNew ? K.newTitle : 'Editar ' + K.one, () => [
    h('div', { class: 'sym-row' }, field('Símbolo', sym), field('Nombre', name)),
    pal,
    h('p', { class: 'hint' }, 'Puedes escribir cualquier emoji en «Símbolo» o elegir uno de la lista.'),
    h('button', { class: 'btn primary block', onclick: () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      if (st.catalog(kind).some((x) => x.id !== r.id && st.norm(x.name) === st.norm(nm))) { toast(`Ya hay una ${K.one} con ese nombre`); return; }
      Object.assign(r, { name: nm, symbol: sym.value.trim() || K.defaultSymbol });
      st.putCatalog(kind, r);
      s.close();
      toast(isNew ? `«${nm}» creada` : 'Guardado');
      onSaved?.(r.id);
    } }, icon('check'), 'Guardar'),
    !isNew ? h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => st.moveCatalogOrder(kind, r.id, -1) }, '↑ Subir'),
      h('button', { class: 'btn small', onclick: () => st.moveCatalogOrder(kind, r.id, 1) }, '↓ Bajar')) : null,
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      const n = usage(kind, r.id);
      if (!confirm(`¿Borrar la ${K.one} «${r.name}»?${n ? `\n\nSe quitará de ${n} artículo${n > 1 ? 's' : ''} (los artículos no se borran).` : ''}`)) return;
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
  const draw = () => {
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
  draw();
  return box;
}
