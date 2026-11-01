// Interfaz principal: pestañas, inventario, ficha y editor de artículos, escáner.
import * as st from './store.js';
import { S, UNITS, uid } from './store.js';
import * as g from './google.js';
import { scanBarcode } from './scanner.js';
import { photoSet, photoDel } from './db.js';
import { D, loadDevice, onDeviceChange } from './device.js';
import {
  $, h, icon, badge, hue, num, field, inp, toggle, select, numInput, indent, toast, openSheet, sheets, closeAll, nav,
} from './ui.js';
import { locSelect, openLocations, moveSheet, fromReserveSheet } from './locations.js';
import { renderShop, shopItems } from './shop.js';
import { renderSettings } from './settings.js';

// ── Estado de la interfaz ──────────────────────────────────
let tab = 'inv';
const ui = { q: '', filter: 'all', loc: '' };

function setTab(t) {
  tab = t;
  $('#main').dataset.view = '';
  render();
  scrollTo(0, 0);
}

function render() {
  $('#title').textContent = { inv: 'Inventario', shop: 'Compra', set: 'Ajustes' }[tab];
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#fabAdd').hidden = tab !== 'inv';
  const m = $('#main');
  if (tab === 'inv') renderInv(m);
  else if (tab === 'shop') renderShop(m);
  else renderSettings(m);
  updateCounts();
  fillDatalists();
}

function rerender() {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') && $('#main').contains(document.activeElement);
  if (!(tab === 'set' && typing)) render();
  else updateCounts();
  sheets.forEach((s) => s.live && s.refresh());
}

function updateCounts() {
  const n = shopItems().length;
  const c = $('.tab[data-tab="shop"] .count');
  c.textContent = n;
  c.hidden = !n;
}

function fillDatalists() {
  const ps = st.products();
  const fill = (id, vals) => {
    const dl = $('#' + id);
    const uniq = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    dl.replaceChildren(...uniq.map((v) => h('option', { value: v })));
  };
  fill('dl-categories', ps.map((p) => p.category));
  fill('dl-products', ps.map((p) => p.name));
}

// ── Inventario ─────────────────────────────────────────────
function matches(p, q) {
  if (!q) return true;
  const hay = st.norm([p.name, p.category, st.loc(p), p.notes, ...(p.variants || []).flatMap((v) => [v.brand, v.barcode])]
    .filter(Boolean).join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderInv(m) {
  if (m.dataset.view !== 'inv') {
    m.dataset.view = 'inv';
    const search = h('input', { type: 'search', placeholder: 'Buscar artículo, marca, sitio…', value: ui.q, enterkeyhint: 'search' });
    search.addEventListener('input', () => { ui.q = search.value; renderInvList(); });
    m.replaceChildren(
      h('div', { class: 'search' }, icon('search'), search),
      h('div', { class: 'chips', id: 'invChips' }),
      h('div', { class: 'list', id: 'invList' }),
    );
  }
  renderInvList();
}

function renderInvList() {
  const all = st.products();
  const q = st.norm(ui.q);
  const filters = {
    all: ['Todo', () => true],
    soon: ['Caduca pronto', (p) => !!st.productExpiry(p)],
    low: ['Bajo mínimo', (p) => st.needs(p)],
    empty: ['Agotado', (p) => st.total(p) <= 0],
    reserve: ['Con reserva', (p) => st.inReserve(p) > 0],
    critical: ['Críticos', (p) => !!p.critical],
  };
  const tree = st.locTree();
  if (ui.loc && !st.getLoc(ui.loc)) ui.loc = '';
  $('#invChips').replaceChildren(...[
    tree.length
      ? select([['', 'Todas las ubicaciones'], ...tree.map(({ loc, depth }) => [loc.id, indent(depth) + loc.name]), ['__manage', '⚙ Gestionar ubicaciones…']], ui.loc, {
          class: 'chip' + (ui.loc ? ' on' : ''),
          onchange: (e) => {
            if (e.target.value === '__manage') { e.target.value = ui.loc; openLocations(); return; }
            ui.loc = e.target.value;
            renderInvList();
          },
        })
      : h('button', { class: 'chip', onclick: openLocations }, '+ Ubicaciones'),
    ...Object.entries(filters).map(([k, [label, fn]]) => {
      const n = all.filter(fn).length;
      if (k !== 'all' && k !== ui.filter && !n) return null;
      return h('button', { class: 'chip' + (ui.filter === k ? ' on' : ''), onclick: () => { ui.filter = k; renderInvList(); } },
        label, k !== 'all' ? h('small', {}, n) : null);
    }),
  ].filter(Boolean));
  const set = ui.loc ? st.locSubtree(ui.loc) : null;
  const list = all.filter((p) => filters[ui.filter][1](p) && (!set || st.productInLoc(p, set)) && matches(p, q));
  const box = $('#invList');
  if (!all.length) {
    box.replaceChildren(h('div', { class: 'empty' }, icon('box'), h('p', {}, 'Todavía no hay nada.'),
      h('p', {}, 'Escanea un código con el botón verde o toca «Nuevo».')));
  } else if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Nada coincide con la búsqueda.')));
  } else {
    box.replaceChildren(...list.map(productRow));
  }
}

function thumbFor(p, cls = 'thumb') {
  const t = h('div', { class: cls, style: `--hue:${hue(p.category || p.name)}` }, (p.name || '?').trim().charAt(0).toUpperCase());
  if (p.photo) g.photoURL(p.photo).then((u) => { if (u) { t.textContent = ''; t.style.backgroundImage = `url("${u}")`; } });
  return t;
}

function productRow(p) {
  const tot = st.total(p);
  const res = st.inReserve(p);
  const ex = st.productExpiry(p);
  const sub = [st.loc(p) || p.category || 'Sin ubicación', res > 0 ? `${st.fmtNum(res)} en reserva` : null].filter(Boolean).join(' · ');
  return h('button', { class: 'row', onclick: () => openProduct(p.id) },
    thumbFor(p),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, p.name),
      h('div', { class: 'row-sub' }, sub),
      (ex || st.needs(p) || p.critical) ? h('div', { class: 'badges' },
        ex === 'expired' ? badge('Caducado', 'bad') : ex === 'soon' ? badge('Caduca pronto', 'warn') : null,
        st.needs(p) ? badge('Bajo mínimo', 'low') : null,
        p.critical ? badge('Crítico') : null) : null),
    h('div', { class: 'row-qty' + (tot <= 0 ? ' zero' : '') }, h('b', {}, st.fmtNum(tot)), h('small', {}, UNITS[p.unit || 'ud'])));
}

// ── Ficha de artículo ──────────────────────────────────────
function openProduct(id) {
  openSheet('', (s) => {
    const p = S.products[id];
    if (!p || p.del) { setTimeout(() => s.close()); return []; }
    s.title.textContent = p.name;
    const tot = st.total(p);
    const res = st.inReserve(p);
    const out = [];
    if (p.photo) {
      const img = h('img', { class: 'hero', alt: '' });
      g.photoURL(p.photo).then((u) => { if (u) img.src = u; else img.remove(); });
      out.push(img);
    }
    out.push(h('div', { class: 'meta-line' }, p.category ? badge(p.category) : null,
      h('span', {}, st.loc(p) ? '📍 ' + st.loc(p) : 'Sin ubicación habitual')));
    out.push(h('div', { class: 'stock' },
      h('div', {}, h('b', { class: 'big' }, st.fmtNum(tot)), ' ', UNITS[p.unit || 'ud']),
      h('div', { class: 'muted' },
        p.restock === false ? 'No se repone'
          : +p.min > 0 ? `Mínimo ${st.fmtNum(p.min)} · reponer hasta ${st.fmtNum(+p.target > 0 ? p.target : p.min)}` : 'Sin mínimo')));
    if (res > 0) {
      out.push(h('div', { class: 'split' },
        h('span', {}, `A mano: ${st.fmtQty(st.atHand(p), p.unit)}`), h('span', {}, `En reserva: ${st.fmtQty(res, p.unit)}`),
        h('button', { class: 'linkbtn', onclick: () => fromReserveSheet(id) }, 'Traer de la reserva')));
    }
    out.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', disabled: tot <= 0, onclick: () => spend(id) }, icon('minus'), 'Gastar'),
      h('button', { class: 'btn primary', onclick: () => addStockSheet(id) }, icon('plus'), 'Añadir'),
      h('button', { class: 'btn', onclick: () => addToListSheet(id) }, icon('cart'), 'A lista')));

    out.push(h('h3', {}, 'Existencias'));
    const lots = [...(p.lots || [])].sort((a, b) => (st.isReserve(a.locationId) - st.isReserve(b.locationId))
      || st.locName(a.locationId).localeCompare(st.locName(b.locationId), 'es')
      || (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    if (!lots.length) out.push(h('p', { class: 'muted' }, 'No queda nada.'));
    let lastLoc;
    for (const l of lots) {
      if (l.locationId !== lastLoc) {
        lastLoc = l.locationId;
        out.push(h('div', { class: 'loc-group' }, icon('pin'), st.locName(l.locationId) || 'Sin ubicación',
          l.locationId && st.isReserve(l.locationId) ? badge('reserva', 'low') : null));
      }
      out.push(lotRow(p, l));
    }

    out.push(h('h3', {}, 'Marcas y códigos'));
    if (!(p.variants || []).length) out.push(h('p', { class: 'muted' }, 'Sin marcas. Puedes añadirlas en «Editar».'));
    for (const v of p.variants || []) {
      out.push(h('div', { class: 'lot' }, h('div', { class: 'row-main' },
        h('div', {}, (v.fav ? '★ ' : '') + (v.brand || 'Sin nombre de marca')),
        h('div', { class: 'row-sub' }, v.barcode || 'Sin código'))));
    }
    const alertTxt = S.settings.alertsMode === 'off' ? 'Avisos desactivados en Ajustes'
      : S.settings.alertsMode === 'critical' && !p.critical ? 'Sin avisos (solo se avisa de los críticos)'
        : p.alerts === false ? 'Sin avisos para este artículo'
          : `Avisos ${st.expiryDaysOf(p)} días antes de caducar` + (p.critical ? ' · crítico' : '');
    out.push(h('p', { class: 'muted' }, '🔔 ' + alertTxt));
    if (p.listId && S.lists[p.listId] && !S.lists[p.listId].del) out.push(h('p', { class: 'muted' }, '🛒 Lista habitual: ' + S.lists[p.listId].name));
    if (p.notes) out.push(h('h3', {}, 'Notas'), h('p', { class: 'notes' }, p.notes));
    out.push(h('button', { class: 'btn block', onclick: () => { s.close(); editProduct({ id }); } }, icon('edit'), 'Editar artículo'));
    return out;
  }, { live: true });
}

function lotRow(p, l) {
  const v = st.variant(p, l.variantId);
  const ex = st.expiryState(p, l);
  const isUd = (p.unit || 'ud') === 'ud';
  const change = (delta) => {
    const q = S.products[p.id];
    const lot = q.lots.find((x) => x.id === l.id);
    if (!lot) return;
    lot.qty = st.round(+lot.qty + delta);
    q.lots = q.lots.filter((x) => +x.qty > 0);
    st.putProduct(q);
  };
  const setQty = () => {
    const val = num(prompt(`Cantidad (${UNITS[p.unit || 'ud']})`, st.fmtNum(l.qty)));
    if (val === null || isNaN(val)) return;
    change(val - l.qty);
  };
  return h('div', { class: 'lot' },
    h('div', { class: 'row-main' },
      h('div', {}, v ? (v.fav ? '★ ' : '') + (v.brand || 'Sin nombre de marca') : 'Sin marca'),
      h('div', { class: 'row-sub' }, l.expiry ? 'Caduca ' + st.fmtDate(l.expiry) : 'Sin caducidad',
        ex === 'expired' ? [' · ', badge('Caducado', 'bad')] : ex === 'soon' ? [' · ', badge('Pronto', 'warn')] : null)),
    h('div', { class: 'stepper' },
      h('button', { 'aria-label': 'Menos', onclick: () => (isUd ? change(-1) : setQty()) }, icon('minus')),
      h('b', { onclick: setQty }, st.fmtNum(l.qty)),
      h('button', { 'aria-label': 'Más', onclick: () => (isUd ? change(1) : setQty()) }, icon('plus')),
      h('button', { 'aria-label': 'Mover', class: 'mv', onclick: () => moveSheet(p.id, l.id) }, icon('move'))));
}

function spend(id) {
  const p = S.products[id];
  const before = st.clone(p.lots || []);
  const undo = () => { const q = S.products[id]; q.lots = before; st.putProduct(q); };
  if ((p.unit || 'ud') === 'ud') {
    st.consume(p, 1);
    toast(`Gastado 1 de ${p.name}`, { action: 'Deshacer', onAction: undo });
    return;
  }
  const amount = numInput('', { placeholder: '0' });
  const s = openSheet('Gastar ' + p.name, () => [
    field(`Cantidad (${UNITS[p.unit]})`, amount, `Hay ${st.fmtQty(st.total(p), p.unit)}. Se gasta primero lo que está a mano y caduca antes.`),
    h('button', { class: 'btn primary block', onclick: () => {
      const a = num(amount.value);
      if (!a || a <= 0) { amount.focus(); return; }
      st.consume(S.products[id], a);
      s.close();
      toast(`Gastado ${st.fmtQty(a, p.unit)} de ${p.name}`, { action: 'Deshacer', onAction: undo });
    } }, 'Gastar'),
  ]);
  setTimeout(() => amount.focus(), 250);
}

function variantOptions(p) {
  const vs = p.variants || [];
  if (!vs.length) return [['', 'Sin marca']];
  return [...vs.map((v) => [v.id, (v.fav ? '★ ' : '') + (v.brand || v.barcode || 'Marca sin nombre')]), ['', 'Sin marca']];
}

function addStockSheet(id, { variantId, qty = 1, onDone } = {}) {
  const p = S.products[id];
  const vSel = select(variantOptions(p), variantId ?? st.fav(p)?.id ?? '');
  const qIn = numInput(st.fmtNum(qty));
  const eIn = inp({ type: 'date' });
  const where = locSelect(p.locationId || D.defaultLocationId || '');
  const s = openSheet('Añadir ' + p.name, () => [
    field('Marca', vSel),
    h('div', { class: 'grid2' },
      field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn),
      field('Caducidad (opcional)', eIn)),
    field('Dónde lo guardas', where),
    h('button', { class: 'btn primary block', onclick: () => {
      const q = num(qIn.value);
      if (!q || q <= 0) { qIn.focus(); return; }
      st.addStock(S.products[id], { variantId: vSel.value || null, qty: q, expiry: eIn.value || null, locationId: where.value || null });
      s.close();
      toast(`Añadido ${st.fmtQty(q, p.unit)} de ${p.name}`);
      onDone?.();
    } }, icon('plus'), 'Añadir al inventario'),
  ]);
}

function addToListSheet(id) {
  const p = S.products[id];
  const auto = S.items['auto-' + id];
  if (auto && !auto.del && !auto.dismissed) {
    toast(`Ya está en la lista «${S.lists[auto.listId]?.name}»`);
    return;
  }
  const lSel = select(st.lists().map((l) => [l.id, l.name]), st.validList(p.listId));
  const qIn = numInput(st.fmtNum(st.needs(p) ? st.suggest(p) : 1));
  const s = openSheet('Añadir a la lista', () => [
    h('p', { class: 'muted' }, p.name),
    field('Lista', lSel),
    field(`Cantidad (${UNITS[p.unit || 'ud']})`, qIn),
    h('button', { class: 'btn primary block', onclick: () => {
      st.putItem({ id: uid(), productId: id, listId: lSel.value, qty: num(qIn.value) || 1 });
      s.close();
      toast(`${p.name} añadido a «${S.lists[lSel.value].name}»`);
    } }, icon('cart'), 'Añadir'),
  ]);
}

// ── Editor de artículo ─────────────────────────────────────
function editProduct({ id = null, preset = null, onSaved, focusBrand = false } = {}) {
  const isNew = !id || !S.products[id];
  const p = preset ? st.clone(preset) : isNew
    ? { id: uid(), name: '', unit: 'ud', variants: [], lots: [], restock: true, alerts: true, locationId: D.defaultLocationId || null }
    : st.clone(S.products[id]);
  p.variants = p.variants || [];
  p.lots = p.lots || [];
  const oldLoc = isNew ? null : S.products[p.id]?.locationId || null;
  let newPhoto = null;
  let removePhoto = false;

  const name = inp({ value: p.name || '', placeholder: 'p. ej. Garbanzos cocidos', autocapitalize: 'sentences' });
  const category = inp({ value: p.category || '', list: 'dl-categories', placeholder: 'Alimentación, limpieza…' });
  const where = locSelect(p.locationId || '');
  const unit = select(Object.entries({ ud: 'Unidades', kg: 'Kilos', g: 'Gramos', l: 'Litros', ml: 'Mililitros' }), p.unit || 'ud');
  const min = numInput(p.min ?? '', { placeholder: '0' });
  const target = numInput(p.target ?? '', { placeholder: 'igual que el mínimo' });
  const restock = toggle('Reponer', p.restock !== false, 'Si lo apagas, nunca entra en la lista de la compra');
  const listSel = select([['', 'General'], ...st.lists().filter((l) => l.id !== st.GENERAL).map((l) => [l.id, l.name])], p.listId || '');
  const alerts = toggle('Avisos en el calendario', p.alerts !== false);
  const critical = toggle('Crítico', !!p.critical, 'Avisa aunque en Ajustes elijas «solo críticos»');
  const expiryDays = numInput(p.expiryDays ?? '', { placeholder: `${S.settings.expiryDays} (por defecto)` });
  const notes = h('textarea', { class: 'inp', placeholder: 'Cualquier comentario' }, p.notes || '');

  // Foto
  const photoThumb = thumbFor(p);
  if (!p.photo) photoThumb.replaceChildren(icon('camera'));
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoDelBtn = h('button', { class: 'btn small danger', hidden: !p.photo, onclick: (e) => {
    e.preventDefault(); removePhoto = true; newPhoto = null; photoThumb.style.backgroundImage = ''; photoThumb.replaceChildren(icon('camera')); photoDelBtn.hidden = true;
  } }, 'Quitar');
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    newPhoto = await resizeImage(f);
    removePhoto = false;
    photoThumb.textContent = '';
    photoThumb.style.backgroundImage = `url("${URL.createObjectURL(newPhoto)}")`;
    photoDelBtn.hidden = false;
  });

  // Marcas
  const varBox = h('div');
  function renderVars() {
    varBox.replaceChildren(...p.variants.map((v) => {
      const brand = inp({ value: v.brand || '', placeholder: 'Marca', oninput: (e) => { v.brand = e.target.value; } });
      const code = inp({ value: v.barcode || '', placeholder: 'Código', inputmode: 'numeric', oninput: (e) => { v.barcode = e.target.value.trim(); } });
      if (focusBrand && !v.brand && v === p.variants[p.variants.length - 1]) setTimeout(() => brand.focus(), 300);
      return h('div', { class: 'var-row' },
        brand,
        h('div', { class: 'codebox' }, code, h('button', { 'aria-label': 'Escanear', onclick: async (e) => {
          e.preventDefault();
          const c = await scanBarcode('Código de ' + (v.brand || 'esta marca'));
          if (c) { v.barcode = c; code.value = c; }
        } }, icon('scan'))),
        h('button', { class: 'fav' + (v.fav ? ' on' : ''), title: 'Favorita', onclick: (e) => {
          e.preventDefault(); p.variants.forEach((x) => { x.fav = x === v; }); renderVars();
        } }, v.fav ? '★' : '☆'),
        h('button', { class: 'icon-btn', 'aria-label': 'Quitar marca', onclick: (e) => {
          e.preventDefault();
          p.variants = p.variants.filter((x) => x !== v);
          if (p.variants.length && !p.variants.some((x) => x.fav)) p.variants[0].fav = true;
          renderVars();
        } }, icon('x')));
    }));
  }
  renderVars();

  async function save() {
    const nm = name.value.trim();
    if (!nm) { name.focus(); toast('Ponle un nombre'); return; }
    const vars = p.variants.filter((v) => (v.brand || '').trim() || (v.barcode || '').trim());
    if (vars.length && !vars.some((v) => v.fav)) vars[0].fav = true;
    for (const v of vars) {
      v.brand = (v.brand || '').trim();
      if (!v.barcode) continue;
      const other = st.findByBarcode(v.barcode);
      if (other && other.product.id !== p.id &&
        !confirm(`El código ${v.barcode} ya es de «${other.product.name}». ¿Guardarlo también aquí?`)) return;
    }
    const ids = new Set(vars.map((v) => v.id));
    p.lots.forEach((l) => { if (l.variantId && !ids.has(l.variantId)) l.variantId = null; });
    const newLoc = where.value || null;
    if (!isNew && newLoc !== oldLoc) {
      const there = p.lots.filter((l) => (l.locationId || null) === oldLoc);
      if (there.length && confirm(`¿Mover también lo que hay en «${st.locName(oldLoc) || 'sin ubicación'}» a «${st.locName(newLoc) || 'sin ubicación'}»?`)) {
        there.forEach((l) => { l.locationId = newLoc; });
      }
    }
    Object.assign(p, {
      name: nm, category: category.value.trim(), locationId: newLoc,
      unit: unit.value, min: num(min.value) ?? 0, target: num(target.value), restock: restock.cb.checked, listId: listSel.value || null,
      alerts: alerts.cb.checked, critical: critical.cb.checked, expiryDays: num(expiryDays.value), notes: notes.value.trim(), variants: vars,
    });
    const old = !isNew ? S.products[p.id]?.photo : null;
    if (newPhoto) {
      const pid = uid();
      await photoSet(pid, newPhoto);
      p.photo = { id: pid, driveId: null };
    } else if (removePhoto) p.photo = null;
    if (old && (newPhoto || removePhoto)) photoDel(old.id);
    st.putProduct(p);
    s.close();
    toast(isNew ? `«${nm}» creado` : 'Guardado');
    if (onSaved) onSaved(p.id); else if (!isNew) openProduct(p.id);
  }

  const s = openSheet(isNew ? 'Nuevo artículo' : 'Editar artículo', () => [
    h('div', { class: 'photo-box' }, photoThumb,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: (e) => { e.preventDefault(); fileIn.click(); } }, icon('camera'), 'Foto'), photoDelBtn),
      fileIn),
    field('Nombre', name),
    field('Categoría', category),
    field('Ubicación habitual', where, 'Dónde se guarda normalmente. Las existencias pueden estar repartidas.'),

    h('fieldset', {}, h('legend', {}, 'Marcas y códigos de barras'),
      varBox,
      h('button', { class: 'btn small', onclick: (e) => {
        e.preventDefault();
        p.variants.push({ id: uid(), brand: '', barcode: '', fav: !p.variants.length });
        renderVars();
        varBox.querySelector('.var-row:last-child input')?.focus();
      } }, icon('plus'), 'Añadir marca'),
      h('p', { class: 'hint' }, '★ = marca favorita: es la que aparece en la lista de la compra.')),

    h('fieldset', {}, h('legend', {}, 'Cantidades y compra'),
      field('Se cuenta en', unit),
      h('div', { class: 'grid2' },
        field('Mínimo a mano', min, 'Avisa si hay menos (sin contar la reserva)'),
        field('Reponer hasta', target, 'Cantidad que quieres tener')),
      restock,
      field('Lista habitual', listSel, 'Dónde aparece cuando hay que reponerlo')),

    h('fieldset', {}, h('legend', {}, 'Avisos'),
      alerts, critical,
      field('Días de antelación al caducar', expiryDays)),

    field('Notas', notes),
    h('button', { class: 'btn primary block', onclick: save }, icon('check'), 'Guardar'),
    !isNew ? h('button', { class: 'btn danger block', onclick: () => {
      if (!confirm(`¿Borrar «${p.name}» y todas sus existencias?`)) return;
      if (p.photo) photoDel(p.photo.id);
      st.deleteProduct(p.id);
      s.close();
      toast('Artículo borrado');
    } }, 'Borrar artículo') : null,
  ]);
  if (isNew && !name.value) setTimeout(() => name.focus(), 300);
}

async function resizeImage(file, max = 900) {
  let src, w, hgt;
  try {
    src = await createImageBitmap(file);
    w = src.width; hgt = src.height;
  } catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    w = src.naturalWidth; hgt = src.naturalHeight;
  }
  const k = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(hgt * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.78));
}

// ── Escanear ───────────────────────────────────────────────
async function scanFlow() {
  const code = await scanBarcode();
  if (!code) return;
  const found = st.findByBarcode(code);
  if (found) return scanResult(found.product.id, found.variant.id);
  unknownCode(code);
}

function scanResult(id, variantId) {
  openSheet('', (s) => {
    const p = S.products[id];
    if (!p || p.del) { setTimeout(() => s.close()); return []; }
    const v = st.variant(p, variantId);
    s.title.textContent = p.name;
    return [
      h('div', { class: 'row', style: 'box-shadow:none' }, thumbFor(p),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, v?.brand || p.name), h('div', { class: 'row-sub' }, st.loc(p) || 'Sin ubicación')),
        h('div', { class: 'row-qty' }, h('b', {}, st.fmtNum(st.total(p))), h('small', {}, UNITS[p.unit || 'ud']))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: st.total(p) <= 0, onclick: () => spend(id) }, icon('minus'), 'Gastar'),
        h('button', { class: 'btn primary', onclick: () => { s.close(); addStockSheet(id, { variantId }); } }, icon('plus'), 'Añadir'),
        h('button', { class: 'btn', onclick: () => { s.close(); openProduct(id); } }, 'Ficha')),
      h('button', { class: 'btn block', onclick: () => { s.close(); scanFlow(); } }, icon('scan'), 'Escanear otro'),
    ];
  }, { live: true });
}

function unknownCode(code) {
  const s = openSheet('Código nuevo', () => [
    h('p', {}, 'El código ', h('b', {}, code), ' no está en el inventario.'),
    h('button', { class: 'btn primary block', onclick: () => {
      s.close();
      editProduct({
        preset: { id: uid(), name: '', unit: 'ud', restock: true, alerts: true, lots: [], locationId: D.defaultLocationId || null,
          variants: [{ id: uid(), brand: '', barcode: code, fav: true }] },
        onSaved: (id) => addStockSheet(id),
      });
    } }, icon('plus'), 'Crear artículo nuevo'),
    h('button', { class: 'btn block', onclick: () => {
      s.close();
      pickProduct('¿De qué artículo es esta marca?', (id) => {
        const p = st.clone(S.products[id]);
        p.variants = p.variants || [];
        const v = { id: uid(), brand: '', barcode: code, fav: !p.variants.length };
        p.variants.push(v);
        editProduct({ id, preset: p, focusBrand: true, onSaved: (pid) => addStockSheet(pid, { variantId: v.id }) });
      });
    } }, 'Es otra marca de un artículo que ya tengo'),
  ]);
}

function pickProduct(title, onPick) {
  const q = h('input', { type: 'search', placeholder: 'Buscar…' });
  const box = h('div');
  const fill = () => {
    const t = st.norm(q.value);
    box.replaceChildren(...st.products().filter((p) => matches(p, t)).slice(0, 60).map((p) =>
      h('div', { class: 'pick-row' }, h('button', { class: 'row', onclick: () => { s.close(); onPick(p.id); } }, thumbFor(p),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name), h('div', { class: 'row-sub' }, st.loc(p)))))));
  };
  q.addEventListener('input', fill);
  const s = openSheet(title, () => [h('div', { class: 'search', style: 'margin-bottom:10px' }, icon('search'), q), box]);
  fill();
}

// ── Estado de sincronización ───────────────────────────────
function renderPill() {
  const p = $('#syncPill');
  const map = {
    nocfg: ['Sin configurar', 'warn'], auth: ['Conectar', 'warn'], offline: ['Sin conexión', ''],
    syncing: ['Sincronizando', 'busy'], ok: [st.meta.dirty ? 'Pendiente' : 'Al día', 'ok'], error: ['Error', 'bad'], idle: ['…', ''],
  };
  const [txt, cls] = map[g.sync.status] || map.idle;
  p.textContent = txt;
  p.className = 'pill ' + cls;
  const typing = $('#main').contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (tab === 'set' && !typing) renderSettings($('#main'));
}

let syncTimer;
function scheduleSync(ms = 2500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => g.syncNow(), ms);
}

function maybeSilentLogin() {
  if (!g.configured() || g.token() || !g.everConnected() || !navigator.onLine) return false;
  if (localStorage.getItem('auto_reconnect') === '0' || sheets.length) return false;
  if (Date.now() - (+localStorage.getItem('last_silent') || 0) < 10 * 60000) return false;
  localStorage.setItem('last_silent', String(Date.now()));
  g.login({ silent: true });
  return true;
}

// ── Arranque ───────────────────────────────────────────────
Object.assign(nav, { render, rerender, setTab, openProduct, editProduct, addStockSheet, variantOptions, scheduleSync });

async function start() {
  const res = g.handleRedirect();
  await st.load();
  await loadDevice();
  tab = D.startTab === 'shop' ? 'shop' : 'inv';

  $('#btnSettings').append(icon('gear'));
  $('#btnSettings').onclick = () => setTab('set');
  $('#fabAdd').append(icon('plus'), 'Nuevo');
  $('#fabAdd').onclick = () => editProduct();
  $('#btnScan').append(icon('scan'));
  $('#btnScan').onclick = () => { closeAll(); scanFlow(); };
  const invTab = $('.tab[data-tab="inv"]');
  invTab.append(icon('box'), 'Inventario');
  const shopTab = $('.tab[data-tab="shop"]');
  shopTab.append(icon('cart'), 'Compra', h('span', { class: 'count', hidden: true }));
  invTab.onclick = () => setTab('inv');
  shopTab.onclick = () => setTab('shop');
  $('#syncPill').onclick = () => {
    if (g.sync.status === 'nocfg') setTab('set');
    else if (g.sync.status === 'auth') g.login();
    else g.syncNow();
  };

  st.onChange(({ local }) => { rerender(); if (local) scheduleSync(); });
  onDeviceChange(() => scheduleSync());
  g.onStatus(renderPill);
  render();
  renderPill();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (res?.ok) toast('Conectado con Google');
  else if (res?.error && res.error !== 'state') {
    if (/required/.test(res.error)) toast('Toca «Conectar» para volver a sincronizar');
    else if (res.error !== 'access_denied') toast('No se pudo conectar: ' + res.error);
  }
  if (!res && maybeSilentLogin()) return;
  g.syncNow();

  addEventListener('online', () => g.syncNow());
  addEventListener('offline', () => g.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    rerender();
    if (!maybeSilentLogin()) g.syncNow();
  });
  setInterval(() => { if (document.visibilityState === 'visible') g.syncNow(); }, 5 * 60000);
}

start();
