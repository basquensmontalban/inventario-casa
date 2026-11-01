// Piezas de interfaz comunes: creación de elementos, iconos, hojas inferiores, avisos breves.
export const $ = (s, r = document) => r.querySelector(s);

// Funciones de navegación que rellena app.js (render, openProduct, …) para evitar dependencias circulares.
export const nav = {};

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'selected', 'disabled'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

const SVG = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  box: SVG('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  cart: SVG('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 7H6"/>'),
  scan: SVG('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>', 2.4),
  minus: SVG('<path d="M5 12h14"/>', 2.4),
  x: SVG('<path d="M6 6l12 12M18 6L6 18"/>', 2.2),
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  edit: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  check: SVG('<path d="M5 12l5 5L20 7"/>', 3),
  camera: SVG('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  move: SVG('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
  copy: SVG('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  share: SVG('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  pin: SVG('<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  shield: SVG('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
};
export const icon = (name) => h('span', { class: 'ic', html: ICONS[name] });
export const badge = (text, cls = '') => h('span', { class: 'badge ' + cls }, text);
export const hue = (s) => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export const num = (v) => (v === '' || v === null || v === undefined ? null : +String(v).replace(',', '.'));

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}
export const inp = (props) => h('input', { class: 'inp', ...props });
export function toggle(label, checked, sub, onchange) {
  const cb = h('input', { type: 'checkbox', checked });
  if (onchange) cb.addEventListener('change', () => onchange(cb.checked));
  const el = h('label', { class: 'toggle' }, h('span', {}, label, sub ? h('small', {}, sub) : null), cb, h('span', { class: 'sw' }));
  el.cb = cb;
  return el;
}
export function select(options, value, props = {}) {
  return h('select', { class: 'inp', ...props }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, t)));
}
export const numInput = (value, props = {}) => inp({ type: 'text', inputmode: 'decimal', value: value ?? '', ...props });
export const indent = (depth) => '   '.repeat(depth) + (depth ? '› ' : '');

export function toast(msg, { action, onAction, ms = 3800 } = {}) {
  const t = h('div', { class: 'toast' }, h('span', {}, msg),
    action ? h('button', { onclick: () => { onAction(); t.remove(); } }, action) : null);
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export const fmtDateTime = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;top:0;opacity:0' }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const f = h('input', { type: 'file', accept, hidden: true });
    f.addEventListener('change', () => { resolve(f.files[0] || null); f.remove(); });
    document.body.append(f);
    f.click();
  });
}

// ── Hojas inferiores (con botón «atrás» de Android) ────────
export const sheets = [];
let ignorePop = 0;
export function openSheet(title, render, { live = false } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const titleEl = h('h2', {}, title);
  const s = {
    body, live, title: titleEl,
    refresh() {
      const out = render(s);
      if (out === null) return;
      const st0 = body.scrollTop;
      body.replaceChildren(...[].concat(out).flat(Infinity).filter(Boolean));
      body.scrollTop = st0;
    },
    close(fromPop) {
      const i = sheets.indexOf(s);
      if (i < 0) return;
      sheets.splice(i, 1);
      back.classList.remove('open');
      setTimeout(() => back.remove(), 230);
      if (!fromPop) {
        setTimeout(() => {
          if (!sheets.length && history.state?.sheet) { ignorePop++; history.back(); }
        }, 0);
      }
    },
  };
  const panel = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'sheet-head' }, titleEl, h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => s.close() }, icon('x'))),
    body);
  const back = h('div', { class: 'backdrop' }, panel);
  back.addEventListener('click', (e) => { if (e.target === back) s.close(); });
  if (!sheets.length && !history.state?.sheet) history.pushState({ sheet: 1 }, '');
  sheets.push(s);
  s.refresh();
  document.body.append(back);
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('open')));
  return s;
}
addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  const s = sheets[sheets.length - 1];
  if (s) {
    s.close(true);
    if (sheets.length) history.pushState({ sheet: 1 }, '');
  }
});
export const closeAll = () => [...sheets].reverse().forEach((s) => s.close());
