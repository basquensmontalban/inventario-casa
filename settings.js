// Pestaña «Ajustes»: este móvil, ubicaciones, cuenta, avisos y copias de seguridad.
import * as st from './store.js';
import { S } from './store.js';
import { D, setDevice, applyDevice } from './device.js';
import * as g from './google.js';
import * as bk from './backup.js';
import { h, icon, field, inp, select, toggle, openSheet, toast, download, pickFile, fmtDateTime, closeAll, nav } from './ui.js';
import { locSelect, openLocations } from './locations.js';

export const VERSION = '1.1.0';

export function renderSettings(m) {
  m.dataset.view = 'set';
  const set = S.settings;
  const connected = !!g.token();
  const parts = [];

  // ── Este móvil ──
  const saved = st.meta.deviceSavedAt && st.meta.deviceSavedAt >= (D.u || 0);
  parts.push(h('div', { class: 'card' },
    h('h3', {}, 'Este móvil'),
    h('p', { class: 'muted' }, 'Estos ajustes son solo de este móvil; el otro móvil tiene los suyos.'),
    field('Nombre del móvil', inp({ value: D.name, onchange: (e) => setDevice({ name: e.target.value.trim() || D.name }) })),
    field('Ubicación preferida al crear artículos', locSelect(D.defaultLocationId, { none: 'Ninguna', onChange: (v) => setDevice({ defaultLocationId: v || null }) })),
    field('Al abrir la app, mostrar', select([['inv', 'Inventario'], ['shop', 'Compra']], D.startTab, { onchange: (e) => setDevice({ startTab: e.target.value }) })),
    h('span', { class: 'lbl' }, 'Al copiar o compartir una lista'),
    toggle('Incluir cantidades', D.copyQty, null, (v) => setDevice({ copyQty: v })),
    toggle('Incluir la marca favorita', D.copyBrand, null, (v) => setDevice({ copyBrand: v })),
    toggle('Incluir el nombre de la lista', D.copyTitle, null, (v) => setDevice({ copyTitle: v })),
    h('p', { class: 'muted' }, saved ? `✓ Configuración guardada en Drive (${fmtDateTime(st.meta.deviceSavedAt)})` : 'La configuración se guardará en Drive en la próxima sincronización.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: restoreDeviceConfig }, 'Recuperar una configuración guardada'))));

  // ── Ubicaciones ──
  const nLoc = st.alive(S.locations).length;
  parts.push(h('div', { class: 'card' },
    h('h3', {}, 'Ubicaciones'),
    h('p', { class: 'muted' }, nLoc ? `${nLoc} ubicaciones (estancias, muebles y estantes).` : 'Todavía no hay ubicaciones.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small primary', onclick: openLocations }, icon('pin'), 'Gestionar ubicaciones'))));

  // ── Cuenta de Google ──
  const acc = h('div', { class: 'card' }, h('h3', {}, 'Cuenta de Google'));
  if (!g.configured()) {
    acc.append(h('div', { class: 'note-box' }, 'Falta el «ID de cliente» en config.js. Mientras tanto, todo se guarda solo en este móvil.'));
  } else {
    acc.append(h('p', {}, connected ? '✅ Conectada. Los datos se guardan en Drive, carpeta «Inventario Casa».' : 'Sin conectar: los datos solo están en este móvil.'));
    if (st.meta.lastSync) acc.append(h('p', { class: 'muted' }, 'Última sincronización: ' + fmtDateTime(st.meta.lastSync)));
    if (g.sync.error) acc.append(h('p', { class: 'err' }, g.sync.error));
    if (st.meta.calError) acc.append(h('p', { class: 'err' }, 'Calendario: ' + st.meta.calError));
    acc.append(h('div', { class: 'btn-row' },
      connected
        ? [h('button', { class: 'btn primary small', onclick: () => g.syncNow() }, 'Sincronizar ahora'),
          h('button', { class: 'btn small', onclick: () => { if (confirm('¿Desconectar? Los datos seguirán en el móvil y en Drive.')) { g.logout(); nav.render(); } } }, 'Desconectar')]
        : h('button', { class: 'btn primary small', onclick: () => g.login() }, 'Conectar con Google')));
    acc.append(toggle('Reconectar al abrir la app', localStorage.getItem('auto_reconnect') !== '0',
      'Google pide renovar el permiso cada hora; así se hace solo', (v) => localStorage.setItem('auto_reconnect', v ? '1' : '0')));
  }
  parts.push(acc);

  // ── Avisos (comunes) ──
  parts.push(h('div', { class: 'card' }, h('h3', {}, 'Avisos en Google Calendar'),
    h('p', { class: 'muted' }, 'Comunes a los dos móviles, porque van al calendario conjunto «Inventario casa».'),
    field('Avisar de', select([['all', 'Todos los artículos'], ['critical', 'Solo los críticos'], ['off', 'Ninguno']], set.alertsMode,
      { onchange: (e) => st.putSettings({ alertsMode: e.target.value }) })),
    h('div', { class: 'grid2' },
      field('Días antes de caducar', inp({ type: 'text', inputmode: 'numeric', value: set.expiryDays,
        onchange: (e) => { const v = parseInt(e.target.value, 10); if (v >= 0) st.putSettings({ expiryDays: v }); } }), 'Se puede cambiar por artículo'),
      field('Hora del aviso', select(Array.from({ length: 17 }, (_, i) => [i + 6, `${i + 6}:00`]), set.alertHour,
        { onchange: (e) => st.putSettings({ alertHour: +e.target.value }) }))),
    toggle('Avisar cuando algo baje del mínimo', set.stockAlerts !== false, null, (v) => st.putSettings({ stockAlerts: v }))));

  // ── Copias de seguridad ──
  const info = S.backupInfo || {};
  parts.push(h('div', { class: 'card' },
    h('h3', {}, 'Copias de seguridad'),
    h('p', { class: 'muted' }, 'Se hacen solas en Drive › Inventario Casa › Copias de seguridad, con todo: artículos, existencias, listas y ubicaciones (las fotos ya están en Drive). La primera copia de cada mes se guarda para siempre. Comunes a los dos móviles.'),
    h('div', { class: 'grid2' },
      field('Frecuencia', select([['1', 'Cada día'], ['3', 'Cada 3 días'], ['7', 'Cada semana']], String(set.backupEveryDays || 1),
        { onchange: (e) => st.putSettings({ backupEveryDays: +e.target.value }) })),
      field('Guardar', select([['15', 'Las 15 últimas'], ['30', 'Las 30 últimas'], ['60', 'Las 60 últimas'], ['120', 'Las 120 últimas']], String(set.backupKeep || 30),
        { onchange: (e) => st.putSettings({ backupKeep: +e.target.value }) }))),
    h('p', {}, info.last ? `Última copia: ${fmtDateTime(info.last)}${info.by ? ' (' + info.by + ')' : ''}` : 'Todavía no hay ninguna copia en Drive.'),
    st.meta.backupError ? h('p', { class: 'err' }, 'Copias: ' + st.meta.backupError) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small primary', onclick: backupNow }, icon('shield'), 'Hacer copia ahora'),
      h('button', { class: 'btn small', onclick: openBackups }, 'Ver copias y restaurar'),
      h('button', { class: 'btn small', onclick: () => readable(S, 'Inventario de casa — ' + new Date().toLocaleDateString('es-ES')) }, 'Documento legible')),
    h('span', { class: 'lbl', style: 'display:block;margin-top:12px' }, 'En este móvil (sin conexión)'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => download(`inventario-${st.today()}.json`, JSON.stringify(bk.wrap(S, 'manual'), null, 1)) }, 'Descargar archivo'),
      h('button', { class: 'btn small', onclick: restoreFromFile }, 'Restaurar desde archivo'),
      h('button', { class: 'btn small', onclick: openLocalBackups }, 'Copias del móvil'))));

  parts.push(h('p', { class: 'muted', style: 'text-align:center' }, `Inventario de casa · v${VERSION}`));
  m.replaceChildren(...parts);
}

const needOnline = () => {
  if (!g.token() || !navigator.onLine) { toast('Necesitas conexión y estar conectado con Google'); return false; }
  return true;
};

async function backupNow() {
  if (!needOnline()) return;
  toast('Haciendo copia…');
  try {
    await bk.createBackup('manual');
    st.commit();
    toast('Copia guardada en Drive');
  } catch (e) { toast('No se pudo: ' + e.message); }
}

function restoreData(data, label) {
  const n = st.alive(data.products).length;
  if (!confirm(`¿Restaurar ${label}?\n\nTiene ${n} artículos. Todo lo actual se sustituirá por esa copia (antes se guarda una copia de lo actual).`)) return false;
  const doIt = async () => {
    try { if (g.token() && navigator.onLine) await bk.createBackup('antes-de-restaurar'); } catch (e) { console.warn(e); }
    await st.localSnapshot(true);
    st.replaceAll(data);
    closeAll();
    toast('Copia restaurada');
  };
  doIt();
  return true;
}

async function readable(data, title) {
  if (!g.token() || !navigator.onLine) {
    download(title.replace(/[\\/:*?"<>|]/g, '-') + '.html', bk.readableHTML(data, title), 'text/html');
    return;
  }
  toast('Creando documento en Drive…');
  try {
    const f = await bk.makeReadableDoc(data, title);
    openSheet('Documento creado', () => [
      h('p', {}, `«${title}» está en Drive, en la carpeta de copias. Se puede abrir con Google Docs y descargar como Word o PDF.`),
      h('a', { class: 'btn primary block', href: f.webViewLink || `https://docs.google.com/document/d/${f.id}/edit`, target: '_blank', rel: 'noopener' }, 'Abrir documento'),
    ]);
  } catch (e) { toast('No se pudo crear: ' + e.message); }
}

async function restoreFromFile() {
  const f = await pickFile('application/json,.json');
  if (!f) return;
  try {
    const data = bk.unwrap(JSON.parse(await f.text()));
    restoreData(data, 'la copia «' + f.name + '»');
  } catch (e) { toast('No se pudo leer: ' + e.message); }
}

function kindOf(f) {
  if (f.mimeType === 'application/vnd.google-apps.document') return 'Documento legible';
  const r = f.name.match(/^copia-(.+)-\d{4}-\d{2}-\d{2}_/);
  return r ? bk.REASONS[r[1]] || r[1] : bk.REASONS.auto;
}

function openBackups() {
  if (!needOnline()) return;
  let files = null;
  let error = null;
  const s = openSheet('Copias en Drive', () => {
    if (error) return h('p', { class: 'err' }, error);
    if (!files) return h('p', { class: 'muted' }, 'Cargando…');
    const list = files.filter((f) => f.name.startsWith('copia') || f.mimeType === 'application/vnd.google-apps.document');
    if (!list.length) return h('div', { class: 'empty' }, h('p', {}, 'Todavía no hay copias.'));
    return [
      h('p', { class: 'muted' }, `${list.length} copias, de la más reciente a la más antigua.`),
      h('div', { class: 'list' }, list.map((f) => h('button', { class: 'row', onclick: () => (f.mimeType.includes('document') ? window.open(f.webViewLink, '_blank') : backupDetail(f)) },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, fmtDateTime(f.createdTime)),
          h('div', { class: 'row-sub' }, [kindOf(f), (f.description || '').split(' · ')[1]].filter(Boolean).join(' · ')))))),
    ];
  });
  bk.listBackupFolder().then((r) => { files = r; s.refresh(); }).catch((e) => { error = e.message; s.refresh(); });
}

function summary(data) {
  const n = (o) => st.alive(o).length;
  return `${n(data.products)} artículos · ${n(data.lists)} listas · ${n(data.locations || {})} ubicaciones`;
}

function backupDetail(f) {
  let j = null;
  let error = null;
  const title = 'Copia del ' + fmtDateTime(f.createdTime);
  const s = openSheet(title, () => {
    if (error) return h('p', { class: 'err' }, error);
    if (!j) return h('p', { class: 'muted' }, 'Descargando…');
    const data = bk.unwrap(j);
    return [
      h('p', {}, summary(data)),
      h('p', { class: 'muted' }, `${kindOf(f)}${j.device ? ' · hecha en ' + j.device : ''}`),
      h('button', { class: 'btn primary block', onclick: () => restoreData(data, 'la copia del ' + fmtDateTime(f.createdTime)) }, 'Restaurar esta copia'),
      h('button', { class: 'btn block', onclick: () => readable(data, 'Inventario — ' + title.toLowerCase()) }, 'Ver en formato legible'),
      h('button', { class: 'btn block', onclick: () => download(f.name, JSON.stringify(j, null, 1)) }, 'Descargar archivo'),
    ];
  });
  bk.readJSONFile(f.id).then((r) => { j = r; s.refresh(); }).catch((e) => { error = e.message; s.refresh(); });
}

async function openLocalBackups() {
  const arr = await st.localBackups();
  openSheet('Copias en este móvil', () => [
    h('p', { class: 'muted' }, 'El móvil guarda una copia al día (las 7 últimas), aunque no haya conexión.'),
    arr.length ? h('div', { class: 'list' }, arr.map((b) => h('div', { class: 'row' },
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, fmtDateTime(b.ts)), h('div', { class: 'row-sub' }, summary(b.data))),
      h('button', { class: 'btn small', onclick: () => restoreData(b.data, 'la copia del ' + fmtDateTime(b.ts)) }, 'Restaurar'))))
      : h('p', {}, 'Todavía no hay copias en el móvil.'),
  ]);
}

function restoreDeviceConfig() {
  if (!needOnline()) return;
  let files = null;
  let error = null;
  const s = openSheet('Configuraciones guardadas', () => {
    if (error) return h('p', { class: 'err' }, error);
    if (!files) return h('p', { class: 'muted' }, 'Cargando…');
    if (!files.length) return h('p', {}, 'No hay ninguna configuración guardada todavía.');
    return [
      h('p', { class: 'muted' }, 'Elige de qué móvil quieres copiar la configuración a este.'),
      h('div', { class: 'list' }, files.map((f) => h('button', { class: 'row', onclick: async () => {
        try {
          const j = await bk.readJSONFile(f.id);
          if (j?.kind !== 'device-settings') throw new Error('Archivo no válido');
          if (!confirm(`¿Aplicar a este móvil la configuración de «${j.device}»?`)) return;
          applyDevice(j.settings);
          s.close();
          nav.render();
          toast('Configuración recuperada');
        } catch (e) { toast('No se pudo: ' + e.message); }
      } },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, (f.description || 'Móvil') + (f.name.includes(D.id) ? ' (este móvil)' : '')),
          h('div', { class: 'row-sub' }, 'Guardada ' + fmtDateTime(f.modifiedTime || f.createdTime)))))),
    ];
  });
  bk.listDeviceConfigs().then((r) => { files = r; s.refresh(); }).catch((e) => { error = e.message; s.refresh(); });
}
