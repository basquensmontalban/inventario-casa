// Base de productos básicos: buscar, elegir uno para el editor o añadir varios de golpe.
import * as st from './store.js';
import { S } from './store.js';
import { D } from './device.js';
import { BASICOS, STORAGE_NAMES } from './basicos.js';
import { h, icon, openSheet, toast } from './ui.js';

export { BASICOS };

export const findBasic = (name) => BASICOS.find((b) => st.norm(b.name) === st.norm(name)) || null;

const STORAGE_WORDS = {
  nevera: ['nevera', 'frigorifico', 'frigo', 'refrigerador'],
  congelador: ['congelador', 'arcon'],
  despensa: ['despensa', 'alacena'],
};
// Busca entre tus ubicaciones una que encaje con dónde se guarda (nevera, congelador, despensa).
export function storageLocation(storage) {
  const words = STORAGE_WORDS[storage] || [];
  const hit = st.locTree().find(({ loc }) => words.some((w) => st.norm(loc.name).includes(w)));
  return hit ? hit.loc.id : null;
}

export const subTagId = (sub) => st.tagIdFor(sub);

// Campos de un artículo a partir de un básico.
export function basicFields(b) {
  const tag = subTagId(b.sub);
  return {
    name: b.name, symbol: b.symbol, unit: b.unit, shelfLife: b.days,
    tags: tag ? [tag] : [],
    locationId: storageLocation(b.storage) || D.defaultLocationId || null,
  };
}

const existing = () => new Set(st.products().map((p) => st.norm(p.name)));

// onPick(b): modo de elegir uno. Sin onPick: modo de añadir varios a la vez.
export function openProductDB({ onPick } = {}) {
  const multi = !onPick;
  const picked = new Set();
  const q = h('input', { type: 'search', placeholder: 'Buscar (pan, leche, brócoli…)' });
  const body = h('div');
  const addBtn = h('button', { class: 'btn primary block sticky-bottom', disabled: true, onclick: addPicked }, 'Añadir');
  const have = existing();

  const draw = () => {
    const t = st.norm(q.value);
    const groups = new Map();
    for (const b of BASICOS) {
      if (t && !st.norm(b.name).includes(t) && !st.norm(b.sub).includes(t)) continue;
      if (!groups.has(b.sub)) groups.set(b.sub, []);
      groups.get(b.sub).push(b);
    }
    body.replaceChildren(...[...groups].map(([sub, items]) => {
      const tag = st.getTag(subTagId(sub));
      return h('div', {},
        h('div', { class: 'section-h' }, h('h3', {}, (tag?.symbol ? tag.symbol + ' ' : '') + sub), h('small', {}, items.length)),
        h('div', { class: 'db-grid' }, items.map((b) => {
          const isHave = have.has(st.norm(b.name));
          const on = picked.has(b.name);
          return h('button', {
            class: 'db-item' + (on ? ' on' : '') + (isHave ? ' have' : ''),
            disabled: multi && isHave,
            onclick: () => {
              if (!multi) { s.close(); onPick(b); return; }
              if (on) picked.delete(b.name); else picked.add(b.name);
              draw();
            },
          }, h('span', { class: 'db-sym' }, b.symbol), h('span', { class: 'db-name' }, b.name), isHave ? h('span', { class: 'db-have' }, '✓ ya está') : null);
        })));
    }));
    if (!groups.size) body.replaceChildren(h('p', { class: 'muted' }, 'No está en la base. Puedes crearlo a mano.'));
    addBtn.disabled = !picked.size;
    addBtn.textContent = picked.size ? `Añadir ${picked.size} artículo${picked.size > 1 ? 's' : ''}` : 'Elige los que tengas en casa';
  };

  function addPicked() {
    const t = Date.now();
    let n = 0;
    for (const name of picked) {
      const b = BASICOS.find((x) => x.name === name);
      const id = st.uid();
      S.products[id] = {
        id, ...basicFields(b), variants: [], lots: [], min: 0,
        restock: D.newRestock !== false, alerts: D.newAlerts !== false,
        listId: D.newListId && S.lists[D.newListId] && !S.lists[D.newListId].del ? D.newListId : null, u: t,
      };
      n++;
    }
    st.commit();
    s.close();
    toast(`${n} artículo${n > 1 ? 's' : ''} añadido${n > 1 ? 's' : ''}. Ahora puedes indicar cuánto tienes de cada uno.`, { ms: 5000 });
  }

  q.addEventListener('input', draw);
  const s = openSheet(multi ? 'Productos básicos' : 'Elegir de la base', () => [
    h('p', { class: 'hint' }, multi
      ? 'Marca los que tengáis en casa y se crean con su categoría, símbolo, unidad y sitio (nevera, congelador o despensa, si tienes esas ubicaciones). La caducidad que proponen es aproximada.'
      : 'Al elegir uno se rellenan el símbolo, la categoría, la unidad y la ubicación.'),
    h('div', { class: 'search', style: 'margin-bottom:6px' }, icon('search'), q),
    body,
    multi ? addBtn : null,
  ]);
  draw();
}

// Texto «aprox.» para la caducidad de un artículo con vida útil conocida.
export function approxExpiry(p) {
  const days = +p.shelfLife;
  if (!(days > 0)) return null;
  return st.addDays(st.today(), days);
}
export { STORAGE_NAMES };
