// Modo «en el súper»: pantalla grande, tachar con un toque, progreso y pantalla siempre encendida.
import * as st from './store.js';
import { S } from './store.js';
import { D } from './device.js';
import { h, icon, toast } from './ui.js';
import { itemInfo, rowsFor, toCart, onCheck, sortItems, changeQty, stepFor } from './shop.js';
import { label } from './catalog.js';
import { quickAddBar } from './quickadd.js';
import { openStockIn } from './stockin.js';

let cur = null; // { el, listId, storeId, wake, body }
export const isSuperOpen = () => !!cur;

st.onChange(() => { if (cur) draw(); });
document.addEventListener('visibilitychange', () => { if (cur && document.visibilityState === 'visible') keepAwake(); });
addEventListener('popstate', () => { if (cur && !history.state?.super) close(false); });

async function keepAwake() {
  try { cur.wake = await navigator.wakeLock?.request('screen'); } catch {}
}

function matches(it) {
  if (cur.listId && it.listId !== cur.listId) return false;
  if (!cur.storeId) return true;
  const ids = st.itemStoreIds(it);
  return ids.includes(cur.storeId) || (!ids.length && D.shopUnassigned !== false);
}

export function openSuper({ listId = null, storeId = '' } = {}) {
  if (cur) close(true);
  const body = h('div', { class: 'super-body' });
  const el = h('div', { class: 'super' + (D.superBig !== false ? ' big' : '') }, body);
  cur = { el, body, listId, storeId, wake: null };
  cur.qa = quickAddBar(() => ({ listId: (p) => listId || (p ? st.validList(p.listId) : st.GENERAL), storeId }));
  document.body.append(el);
  document.body.classList.add('super-open');
  history.pushState({ super: 1 }, '');
  keepAwake();
  draw();
}

function close(fromCode = true) {
  if (!cur) return;
  try { cur.wake?.release(); } catch {}
  cur.el.remove();
  document.body.classList.remove('super-open');
  cur = null;
  if (fromCode && history.state?.super) history.back();
}

function finish() {
  const n = st.alive(S.items).filter((it) => it.done && it.inCart).length;
  close(true);
  if (n && confirm(`Tienes ${n} cosa${n > 1 ? 's' : ''} en el carro. ¿Las guardas ahora en el inventario?\n\n(Si no, puedes hacerlo luego con «Guardar la compra».)`)) {
    setTimeout(openStockIn, 300);
  }
}

function bigRow(it) {
  const inf = itemInfo(it);
  const sym = inf.p ? inf.p.symbol || st.productTags(inf.p)[0]?.symbol || '' : it.symbol || '';
  const qty = it.qty ? (inf.unit === 'ud' ? (+it.qty !== 1 ? `× ${st.fmtNum(it.qty)}` : '') : st.fmtQty(it.qty, inf.unit)) : '';
  const step = stepFor(inf.unit);
  return h('div', { class: 'srow' + (it.done ? ' done' : '') },
    h('button', { class: 'srow-main', onclick: () => {
      if (it.done) onCheck(it.id);
      else { toCart(it.id); if (D.vibrate !== false) navigator.vibrate?.(30); }
    } },
      h('span', { class: 'scheck' }, it.done ? '✓' : ''),
      h('span', { class: 'ssym' }, sym),
      h('span', { class: 'sname' }, inf.name, it.note ? h('small', {}, it.note) : null),
      h('span', { class: 'sqty' }, qty)),
    !it.done ? h('div', { class: 'sstep' },
      h('button', { 'aria-label': 'Menos', onclick: () => changeQty(it.id, -step) }, '−'),
      h('button', { 'aria-label': 'Más', onclick: () => changeQty(it.id, step) }, '+')) : null);
}

function draw() {
  const all = st.alive(S.items).filter((it) => !it.dismissed && matches(it));
  const pending = all.filter((it) => !it.done);
  const cart = all.filter((it) => it.done && it.inCart);
  const total = pending.length + cart.length;
  const pct = total ? Math.round((cart.length / total) * 100) : 100;
  const store = st.getStore(cur.storeId);
  const list = cur.listId ? S.lists[cur.listId] : null;
  const stores = st.stores();
  cur.body.replaceChildren(...[
    h('div', { class: 'super-top' },
      h('div', { class: 'super-title' },
        h('b', {}, store ? label(store) : list ? list.name : 'Compra'),
        h('small', {}, `${cart.length} de ${total} en el carro`)),
      h('button', { class: 'btn small', onclick: finish }, 'Terminar')),
    h('div', { class: 'progress' }, h('span', { style: `width:${pct}%` })),
    stores.length ? h('div', { class: 'chips' },
      h('button', { class: 'chip' + (!cur.storeId ? ' on' : ''), onclick: () => { cur.storeId = ''; draw(); } }, 'Todas las tiendas'),
      stores.map((x) => h('button', { class: 'chip' + (cur.storeId === x.id ? ' on' : ''), onclick: () => { cur.storeId = x.id; draw(); } }, label(x)))) : null,
    cur.qa,
    pending.length
      ? h('div', { class: 'slist' }, rowsFor(pending, bigRow, cur.storeId))
      : h('div', { class: 'empty' }, h('div', { class: 'sym big' }, '🎉'), h('p', {}, total ? '¡Todo en el carro!' : 'No hay nada que comprar aquí.'),
        cart.length ? h('button', { class: 'btn primary', onclick: () => { close(true); setTimeout(openStockIn, 300); } }, '🧺 Guardar la compra') : null),
    cart.length ? [h('div', { class: 'section-h' }, h('h3', {}, 'En el carro'), h('small', {}, 'Toca para devolver')),
      h('div', { class: 'slist' }, sortItems(cart, cur.storeId).map(bigRow))] : null,
  ].flat().filter(Boolean));
}
