// Buscador para apuntar cosas en la lista de la compra: busca en el inventario, en la base de
// productos (con sinónimos) y en lo que se ha apuntado antes en este móvil. Tolera tildes y erratas.
import * as st from './store.js';
import { S, uid } from './store.js';
import { kvGet, kvSet } from './db.js';
import { BASICOS, findBasic } from './productdb.js';
import { h, icon, toast } from './ui.js';

// ── Historial de cosas sueltas apuntadas en este móvil ──
let recent = [];
export async function loadRecent() { recent = (await kvGet('recentFree')) || []; }
function remember(name) {
  recent = [name, ...recent.filter((n) => st.norm(n) !== st.norm(name))].slice(0, 80);
  kvSet('recentFree', recent);
}

// ── Búsqueda ──
const words = (s) => st.norm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Puntuación de un texto para la búsqueda (0 = no coincide).
export function scoreText(text, q, qw) {
  const t = st.norm(text);
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 92;
  const tw = words(text);
  if (tw.some((w) => w.startsWith(q))) return 85;
  if (t.includes(q)) return 76;
  if (t.replace(/[^a-z0-9ñ]/g, '').includes(q.replace(/[^a-z0-9ñ]/g, ''))) return 72;
  if (qw.every((x) => tw.some((w) => w.startsWith(x)))) return 70;
  // Erratas: cada palabra buscada se parece a alguna (o a su principio).
  for (const x of qw) {
    if (tw.some((w) => w.startsWith(x))) continue;
    if (x.length < 3) return 0;
    const max = x.length >= 7 ? 2 : 1;
    if (!tw.some((w) => lev(x, w, max) <= max || (w.length > x.length && lev(x, w.slice(0, x.length), max) <= max))) return 0;
  }
  return 50;
}

function candidates() {
  const out = [];
  const have = new Set();
  for (const p of st.products()) {
    have.add(st.norm(p.name));
    const b = findBasic(p.name);
    out.push({ kind: 'product', name: p.name, p, symbol: p.symbol || st.productTags(p)[0]?.symbol || b?.symbol || '📦',
      texts: [p.name, ...(b?.aliases || []), ...(p.variants || []).map((v) => v.brand).filter(Boolean)], boost: 6 });
  }
  for (const b of BASICOS) {
    if (have.has(st.norm(b.name))) continue;
    out.push({ kind: 'basic', name: b.name, b, symbol: b.symbol, texts: [b.name, ...b.aliases], boost: 0 });
  }
  for (const n of recent) {
    if (have.has(st.norm(n)) || findBasic(n)) continue;
    out.push({ kind: 'recent', name: n, symbol: '🕘', texts: [n], boost: 3 });
  }
  return out;
}

export function search(q, limit = 8) {
  const qn = st.norm(q);
  if (!qn) return [];
  const qw = words(q);
  return candidates()
    .map((c) => {
      let best = 0;
      let via = null;
      c.texts.forEach((t, i) => { const s = scoreText(t, qn, qw); if (s > best) { best = s; via = i ? t : null; } });
      return { ...c, score: best, via };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => (b.score + b.boost) - (a.score + a.boost) || a.name.length - b.name.length)
    .slice(0, limit);
}

// ── Apuntar ──
function pendingFor(c) {
  return st.alive(S.items).find((it) => !it.done && !it.dismissed
    && (c.kind === 'product' ? it.productId === c.p.id : !it.productId && st.norm(it.name) === st.norm(c.name)));
}

export function addCandidate(c, ctx) {
  const prev = pendingFor(c);
  if (prev) {
    const before = st.clone(prev);
    prev.qty = st.round((+prev.qty || 1) + 1);
    if (prev.auto) prev.qtyEdited = true;
    if (prev.dismissed) prev.dismissed = false;
    st.putItem(prev);
    toast(`${c.name}: ya estaba, ahora ${st.fmtNum(prev.qty)}`, { action: 'Deshacer', onAction: () => st.putItem(before) });
    return;
  }
  const id = uid();
  if (c.kind === 'product') {
    const p = c.p;
    st.putItem({ id, productId: p.id, listId: ctx.listId(p), qty: st.needs(p) ? st.suggest(p) : 1 });
  } else {
    const b = c.b || findBasic(c.name);
    st.putItem({ id, name: c.name, listId: ctx.listId(null), qty: 1, storeId: ctx.storeId || null, symbol: b?.symbol || null, sub: b?.sub || null });
    remember(c.name);
  }
  toast(`Apuntado: ${c.name}`, { action: 'Deshacer', onAction: () => st.deleteItem(id) });
}

// Barra de apuntar. ctx = { listId(p) → lista donde va, storeId → tienda filtrada (para lo suelto) }
export function quickAddBar(getCtx) {
  const input = h('input', { type: 'search', placeholder: 'Apuntar… (leche, curri rojo, nam pla)', enterkeyhint: 'done', autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': 'Apuntar algo en la lista' });
  const clear = h('button', { class: 'icon-btn', 'aria-label': 'Borrar', hidden: true, onclick: () => { input.value = ''; draw(); input.focus(); } }, icon('x'));
  const sugg = h('div', { class: 'qa-sugg' });
  let results = [];

  const sub = (c) => {
    const parts = [];
    if (c.kind === 'product') {
      const hand = st.atHand(c.p);
      parts.push(hand > 0 ? `Tienes ${st.fmtQty(hand, c.p.unit)}` : 'No te queda');
    } else if (c.kind === 'basic') parts.push(c.b.sub);
    else parts.push('Lo apuntaste antes');
    if (c.via) parts.push(`«${c.via}»`);
    return parts.join(' · ');
  };
  const pick = (c) => {
    addCandidate(c, getCtx());
    input.value = '';
    draw();
    input.focus();
  };
  const draw = () => {
    const q = input.value.trim();
    clear.hidden = !q;
    if (!q) { results = []; sugg.replaceChildren(); return; }
    results = search(q, 7);
    const exact = results.some((c) => st.norm(c.name) === st.norm(q));
    if (!exact) results.push({ kind: 'free', name: q.charAt(0).toUpperCase() + q.slice(1), symbol: '✏️' });
    sugg.replaceChildren(...results.map((c) => {
      const on = c.kind !== 'free' && pendingFor(c);
      return h('button', { class: 'qa-item', onclick: () => pick(c) },
        h('span', { class: 'qa-sym' }, c.symbol),
        h('span', { class: 'row-main' },
          h('span', { class: 'qa-name' }, c.kind === 'free' ? `Apuntar «${c.name}»` : c.name),
          c.kind === 'free' ? null : h('span', { class: 'qa-sub' }, sub(c))),
        on ? h('span', { class: 'badge ok' }, `En la lista · +1`) : h('span', { class: 'qa-plus' }, '+'));
    }));
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (results[0]) pick(results[0]); }
    if (e.key === 'Escape') { input.value = ''; draw(); }
  });
  const box = h('div', { class: 'qa' }, h('div', { class: 'search qa-box' }, icon('plus'), input, clear), sugg);
  box.focusInput = () => input.focus();
  return box;
}
