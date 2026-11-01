// Pestaña «Ajustes»: menú por secciones. Arriba, lo de ESTE móvil; abajo, lo común a los dos.
import * as st from './store.js';
import { S, GENERAL } from './store.js';
import { D, setDevice, setDeviceIn, applyDevice, resetDevice } from './device.js';
import * as g from './google.js';
import * as bk from './backup.js';
import { h, icon, field, inp, select, toggle, openSheet, toast, download, pickFile, fmtDateTime, closeAll, nav } from './ui.js';
import { locSelect, openLocations } from './locations.js';
import { openCatalog, label } from './catalog.js';
import { openGroups } from './recipes.js';

export const VERSION = '1.4.0';

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const TAB_NAMES = { inv: 'Inventario', shop: 'Compra', recipes: 'Recetas', stores: 'Tiendas' };

function row(sym, title, sub, onclick) {
  return h('button', { class: 'row set-row', onclick },
    h('div', { class: 'sym' }, sym),
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, title), sub ? h('div', { class: 'row-sub' }, sub) : null),
    h('span', { class: 'chev' }, '›'));
}

export function renderSettings(m) {
  m.dataset.view = 'set';
  const set = S.settings;
  const saved = st.meta.deviceSavedAt && st.meta.deviceSavedAt >= (D.u || 0);
  const info = S.backupInfo || {};
  const n = (o) => st.alive(o).length;
  m.replaceChildren(
    h('div', { class: 'set-h' }, h('h3', {}, 'Este móvil'), h('small', {}, D.name)),
    h('p', { class: 'hint' }, 'Solo afecta a este móvil; el otro tiene su propia configuración.'),
    h('div', { class: 'list' },
      row('📱', 'General', `Pestañas, tema y letra · Abre en ${TAB_NAMES[D.startTab] || 'Inventario'}`, secGeneral),
      row('📦', 'Inventario', `Filtros visibles, orden y valores para artículos nuevos`, secInventory),
      row('🛒', 'Compra', `Lista al abrir, al marcar comprado y formato al copiar`, secShop),
      row('🍲', 'Recetas', `Colores, filtros visibles y valores por defecto`, secRecipes),
      row('🏪', 'Tiendas', `Tienda al abrir y sugerencias`, secStores),
      row('💾', 'Copia de esta configuración', saved ? `Guardada en Drive · ${fmtDateTime(st.meta.deviceSavedAt)}` : 'Pendiente de guardar en Drive', secDeviceCopy)),

    h('div', { class: 'set-h' }, h('h3', {}, 'Común a los dos móviles')),
    h('div', { class: 'list' },
      row('📍', 'Ubicaciones', pl(n(S.locations), 'ubicación', 'estancias, muebles y estantes'), openLocations),
      row('🏷️', 'Etiquetas', pl(st.tags().length, 'etiqueta', 'etiquetas'), () => openCatalog('tags')),
      row('🏬', 'Lista de tiendas', pl(st.stores().length, 'tienda', 'tiendas'), () => openCatalog('stores')),
      row('📝', 'Listas de la compra', pl(st.lists().length, 'lista', 'listas'), openLists),
      row('⚙️', 'Filtros de recetas', st.recipeGroups().map((x) => x.name).join(', ') || 'Ninguno', openGroups),
      row('🔔', 'Avisos en el calendario', { all: 'De todos los artículos', critical: 'Solo de los críticos', off: 'Desactivados' }[set.alertsMode], secAlerts),
      row('🛡️', 'Copias de seguridad', info.last ? `Última: ${fmtDateTime(info.last)}` : 'Todavía no hay ninguna', secBackups)),

    h('div', { class: 'set-h' }, h('h3', {}, 'Cuenta')),
    h('div', { class: 'list' },
      row('🔑', 'Cuenta de Google', !g.configured() ? 'Sin configurar' : g.token() ? 'Conectada' : 'Sin conectar', secAccount)),

    h('p', { class: 'muted', style: 'text-align:center;margin-top:18px' }, `Inventario de casa · v${VERSION}`),
  );
}

// Ayudantes para controles enlazados a los ajustes del móvil
const dSel = (label, opts, key, hint) => field(label, select(opts, String(D[key] ?? ''), { onchange: (e) => setDevice({ [key]: castLike(D[key], e.target.value) }) }), hint);
const dTog = (label, key, sub) => toggle(label, D[key] !== false, sub, (v) => setDevice({ [key]: v }));
const dTogIn = (label, group, key, sub) => toggle(label, D[group][key] !== false, sub, (v) => setDeviceIn(group, key, v));
const castLike = (old, v) => (typeof old === 'number' ? +v : v);
const sub = (text) => h('h4', { class: 'sub-h' }, text);

function secGeneral() {
  const s = openSheet('General', () => {
    const tabs = [['inv', 'Inventario'], ...['shop', 'recipes', 'stores'].filter((t) => D.tabs[t] !== false).map((t) => [t, TAB_NAMES[t]])];
    return [
      field('Nombre de este móvil', inp({ value: D.name, onchange: (e) => setDevice({ name: e.target.value.trim() || D.name }) })),
      field('Al abrir la app, mostrar', select(tabs, D.startTab, { onchange: (e) => setDevice({ startTab: e.target.value }) })),
      sub('Pestañas que se ven'),
      ...['shop', 'recipes', 'stores'].map((t) => toggle(TAB_NAMES[t], D.tabs[t] !== false, null, (v) => { setDeviceIn('tabs', t, v); s.refresh(); })),
      sub('Aspecto'),
      dSel('Tema', [['auto', 'Automático (como el móvil)'], ['light', 'Claro'], ['dark', 'Oscuro']], 'theme'),
      dSel('Tamaño de la letra', [['1', 'Normal'], ['1.1', 'Grande'], ['1.2', 'Muy grande']], 'fontScale'),
      dTog('Vibrar al leer un código', 'vibrate'),
    ];
  });
}

function listOpts(first) {
  return [['', first], ...st.lists().map((l) => [l.id, l.name])];
}

function secInventory() {
  openSheet('Inventario', () => [
    field('Ubicación preferida', locSelect(D.defaultLocationId, { none: 'Ninguna', onChange: (v) => setDevice({ defaultLocationId: v || null }) }),
      'Viene marcada al crear artículos nuevos'),
    dSel('Al añadir existencias, proponer', [['product', 'La ubicación habitual del artículo'], ['device', 'Mi ubicación preferida']], 'stockLoc'),
    dSel('Ordenar los artículos', [['name', 'Por nombre'], ['location', 'Por ubicación'], ['expiry', 'Por caducidad (lo que antes caduca)'], ['qty', 'Por cantidad (lo que menos hay)']], 'invSort'),
    dTog('Mostrar artículos agotados', 'invShowEmpty', 'Si lo apagas, solo salen al buscar o con el filtro «Agotado»'),
    sub('Filtros que se ven'),
    dTogIn('Ubicación', 'invFilters', 'loc'), dTogIn('Etiquetas', 'invFilters', 'tag'), dTogIn('Tiendas', 'invFilters', 'store'),
    dTogIn('Caduca pronto', 'invFilters', 'soon'), dTogIn('Bajo mínimo', 'invFilters', 'low'), dTogIn('Agotado', 'invFilters', 'empty'),
    dTogIn('Con reserva', 'invFilters', 'reserve'), dTogIn('Críticos', 'invFilters', 'critical'),
    sub('Valores para artículos nuevos'),
    dSel('Se cuenta en', [['ud', 'Unidades'], ['kg', 'Kilos'], ['g', 'Gramos'], ['l', 'Litros'], ['ml', 'Mililitros']], 'newUnit'),
    dTog('Reponer', 'newRestock'),
    dTog('Avisos en el calendario', 'newAlerts'),
    field('Lista habitual', select(listOpts('General'), D.newListId || '', { onchange: (e) => setDevice({ newListId: e.target.value }) })),
  ]);
}

function secShop() {
  const preview = h('pre', { class: 'preview' });
  const drawPreview = () => {
    const b = D.copyBullet ?? '- ';
    const lines = [`${b}Garbanzos${D.copyBrand ? ' Hacendado' : ''}${D.copyQty ? ' (6)' : ''}`, `${b}Leche${D.copyQty ? ' (2 l)' : ''}`];
    preview.textContent = (D.copyTitle ? '*General*\n' : '') + lines.join('\n');
  };
  const s = openSheet('Compra', () => {
    drawPreview();
    const t = (label, key) => toggle(label, D[key] !== false, null, (v) => { setDevice({ [key]: v }); drawPreview(); });
    return [
      field('Lista al abrir', select([['__all', 'Todas'], ...st.lists().map((l) => [l.id, l.name])], D.shopList || '__all', { onchange: (e) => setDevice({ shopList: e.target.value }) })),
      st.stores().length ? field('Filtrar por tienda al abrir', select([['', 'No, todas las tiendas'], ...st.stores().map((x) => [x.id, label(x)])], D.shopStore || '', { onchange: (e) => setDevice({ shopStore: e.target.value }) })) : null,
      dTog('Al filtrar por tienda, mostrar lo que no tiene tienda', 'shopUnassigned'),
      dSel('Ordenar', [['name', 'Por nombre'], ['location', 'Por ubicación en casa']], 'shopSort'),
      dTog('Al marcar comprado, preguntar cantidad y caducidad', 'shopAskOnBuy', 'Si lo apagas, se suma directamente la cantidad de la lista (con opción de deshacer)'),
      sub('Al copiar o compartir una lista'),
      t('Incluir cantidades', 'copyQty'), t('Incluir la marca favorita', 'copyBrand'), t('Incluir el nombre de la lista', 'copyTitle'),
      field('Viñeta', select([['- ', 'Guion  -'], ['• ', 'Punto  •'], ['☐ ', 'Casilla  ☐'], ['', 'Ninguna']], D.copyBullet ?? '- ',
        { onchange: (e) => { setDevice({ copyBullet: e.target.value }); drawPreview(); } })),
      h('span', { class: 'lbl' }, 'Así queda'), preview,
    ];
  });
}

function secRecipes() {
  openSheet('Recetas', () => [
    field('Color naranja cuando faltan', select([1, 2, 3, 4, 5].map((k) => [k, `Hasta ${k} ingrediente${k > 1 ? 's' : ''}`]), D.recOrangeMax,
      { onchange: (e) => setDevice({ recOrangeMax: +e.target.value }) }), 'Verde: tienes todo. Rojo: faltan más que esto.'),
    dSel('Orden', [['avail', 'Disponibles primero'], ['name', 'Por nombre'], ['time', 'Más rápidas primero']], 'recSort'),
    dSel('Raciones de una receta nueva', [1, 2, 3, 4, 5, 6, 8].map((k) => [k, String(k)]), 'recServings'),
    sub('Al añadir ingredientes a la lista'),
    field('Lista', select(listOpts('General'), D.recListId || '', { onchange: (e) => setDevice({ recListId: e.target.value }) })),
    dSel('Marcar de entrada', [['missing', 'Solo lo que falta'], ['all', 'Todos los ingredientes']], 'recListMode'),
    sub('Filtros que se ven'),
    dTogIn('Disponibilidad', 'recFilters', 'avail'), dTogIn('Tiempo', 'recFilters', 'time'),
    dTogIn('Ingrediente', 'recFilters', 'ing'), dTogIn('Orden', 'recFilters', 'sort'),
    ...st.recipeGroups().map((gr) => toggle(gr.name, !(D.recHiddenGroups || []).includes(gr.id), null, (v) => {
      const set = new Set(D.recHiddenGroups || []);
      if (v) set.delete(gr.id); else set.add(gr.id);
      setDevice({ recHiddenGroups: [...set] });
    })),
    h('button', { class: 'btn small', style: 'margin-top:10px', onclick: openGroups }, '⚙ Crear o editar filtros'),
  ]);
}

function secStores() {
  openSheet('Tiendas', () => [
    st.stores().length
      ? field('Al abrir la pestaña, mostrar', select([['', 'La que tenga más cosas pendientes'], ...st.stores().map((x) => [x.id, label(x)])], D.storesDefault || '',
        { onchange: (e) => setDevice({ storesDefault: e.target.value }) }))
      : h('p', { class: 'muted' }, 'Todavía no hay tiendas.'),
    dTog('Mostrar «Quizás también»', 'storesSugg'),
    sub('Qué sugerir'),
    dTogIn('Lo que se ha acabado', 'storesCrit', 'empty'),
    dTogIn('Lo que está por debajo de lo que soléis tener', 'storesCrit', 'below'),
    dTogIn('Lo que caduca pronto', 'storesCrit', 'expiring'),
  ]);
}

function secDeviceCopy() {
  openSheet('Copia de esta configuración', () => {
    const saved = st.meta.deviceSavedAt && st.meta.deviceSavedAt >= (D.u || 0);
    return [
      h('p', {}, saved ? `✓ Guardada en Drive el ${fmtDateTime(st.meta.deviceSavedAt)}.` : 'Se guardará en Drive en la próxima sincronización.'),
      h('p', { class: 'muted' }, 'Cada vez que cambias un ajuste de este móvil se guarda en Drive › Inventario Casa › Copias de seguridad. En un móvil nuevo, recupérala desde aquí.'),
      h('button', { class: 'btn primary block', onclick: restoreDeviceConfig }, 'Recuperar una configuración guardada'),
      h('button', { class: 'btn block', onclick: () => download(`ajustes-${D.name.replace(/[^\w-]+/g, '_')}.json`,
        JSON.stringify({ app: 'inventario-casa', kind: 'device-settings', savedAt: new Date().toISOString(), device: D.name, settings: D }, null, 1)) }, 'Descargar en un archivo'),
      h('button', { class: 'btn block', onclick: async () => {
        const f = await pickFile('application/json,.json');
        if (!f) return;
        try {
          const j = JSON.parse(await f.text());
          if (j?.kind !== 'device-settings') throw new Error('No es un archivo de configuración');
          if (!confirm(`¿Aplicar la configuración de «${j.device}» a este móvil?`)) return;
          applyDevice(j.settings);
          toast('Configuración aplicada');
          closeAll();
        } catch (e) { toast('No se pudo: ' + e.message); }
      } }, 'Cargar desde un archivo'),
      h('button', { class: 'btn danger block', onclick: () => {
        if (!confirm('¿Volver a los valores de fábrica en este móvil? (Los datos no se tocan, solo los ajustes de este móvil)')) return;
        resetDevice();
        toast('Ajustes restablecidos');
        closeAll();
      } }, 'Restablecer valores de fábrica'),
    ];
  }, { live: true });
}

function openLists() {
  openSheet('Listas de la compra', () => [
    h('p', { class: 'muted' }, '«General» recibe todo lo que no tenga otra lista asignada.'),
    h('div', { class: 'list' }, st.lists().map((l) => {
      const n = st.alive(S.items).filter((it) => it.listId === l.id && !it.done && !it.dismissed).length;
      return h('div', { class: 'row' },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, l.name), h('div', { class: 'row-sub' }, `${n} pendiente${n === 1 ? '' : 's'}`)),
        h('button', { class: 'btn small', onclick: () => { const v = prompt('Nuevo nombre', l.name); if (v && v.trim()) st.putList({ ...l, name: v.trim() }); } }, 'Renombrar'),
        l.id !== GENERAL ? h('button', { class: 'icon-btn', 'aria-label': 'Borrar lista', onclick: () => {
          if (confirm(`¿Borrar la lista «${l.name}»? Lo que tenga pasa a «General».`)) st.deleteList(l.id);
        } }, icon('x')) : null);
    })),
    h('button', { class: 'btn primary block', onclick: () => { const v = prompt('Nombre de la nueva lista'); if (v && v.trim()) st.putList({ id: st.uid(), name: v.trim() }); } }, icon('plus'), 'Nueva lista'),
  ], { live: true });
}

function secAlerts() {
  openSheet('Avisos en el calendario', () => {
    const set = S.settings;
    return [
      h('p', { class: 'muted' }, 'Comunes a los dos móviles, porque van al calendario conjunto «Inventario casa».'),
      field('Avisar de', select([['all', 'Todos los artículos'], ['critical', 'Solo los críticos'], ['off', 'Ninguno']], set.alertsMode,
        { onchange: (e) => st.putSettings({ alertsMode: e.target.value }) })),
      h('div', { class: 'grid2' },
        field('Días antes de caducar', select([1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map((k) => [k, `${k} día${k > 1 ? 's' : ''}`]), set.expiryDays,
          { onchange: (e) => st.putSettings({ expiryDays: +e.target.value }) }), 'Se puede cambiar por artículo'),
        field('Hora del aviso', select(Array.from({ length: 17 }, (_, i) => [i + 6, `${i + 6}:00`]), set.alertHour,
          { onchange: (e) => st.putSettings({ alertHour: +e.target.value }) }))),
      toggle('Avisar cuando algo baje del mínimo', set.stockAlerts !== false, null, (v) => st.putSettings({ stockAlerts: v })),
      st.meta.calError ? h('p', { class: 'err' }, 'Calendario: ' + st.meta.calError) : null,
    ];
  });
}

function secBackups() {
  openSheet('Copias de seguridad', () => {
    const set = S.settings;
    const info = S.backupInfo || {};
    return [
      h('p', { class: 'muted' }, 'Se hacen solas en Drive › Inventario Casa › Copias de seguridad, con todo: artículos, existencias, listas, ubicaciones, etiquetas, tiendas y recetas (las fotos ya están en Drive). La primera copia de cada mes se guarda para siempre.'),
      h('div', { class: 'grid2' },
        field('Frecuencia', select([['1', 'Cada día'], ['3', 'Cada 3 días'], ['7', 'Cada semana']], String(set.backupEveryDays || 1),
          { onchange: (e) => st.putSettings({ backupEveryDays: +e.target.value }) })),
        field('Guardar', select([['15', 'Las 15 últimas'], ['30', 'Las 30 últimas'], ['60', 'Las 60 últimas'], ['120', 'Las 120 últimas']], String(set.backupKeep || 30),
          { onchange: (e) => st.putSettings({ backupKeep: +e.target.value }) }))),
      h('p', {}, info.last ? `Última copia: ${fmtDateTime(info.last)}${info.by ? ' (' + info.by + ')' : ''}` : 'Todavía no hay ninguna copia en Drive.'),
      st.meta.backupError ? h('p', { class: 'err' }, 'Copias: ' + st.meta.backupError) : null,
      h('button', { class: 'btn primary block', onclick: backupNow }, icon('shield'), 'Hacer copia ahora'),
      h('button', { class: 'btn block', onclick: openBackups }, 'Ver copias y restaurar'),
      h('button', { class: 'btn block', onclick: () => readable(S, 'Inventario de casa — ' + new Date().toLocaleDateString('es-ES')) }, 'Crear documento legible'),
      h('span', { class: 'lbl', style: 'display:block;margin-top:14px' }, 'En este móvil (sin conexión)'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => download(`inventario-${st.today()}.json`, JSON.stringify(bk.wrap(S, 'manual'), null, 1)) }, 'Descargar archivo'),
        h('button', { class: 'btn small', onclick: restoreFromFile }, 'Restaurar desde archivo'),
        h('button', { class: 'btn small', onclick: openLocalBackups }, 'Copias del móvil')),
    ];
  }, { live: true });
}

function secAccount() {
  openSheet('Cuenta de Google', () => {
    if (!g.configured()) return h('div', { class: 'note-box' }, 'Falta el «ID de cliente» en config.js. Mientras tanto, todo se guarda solo en este móvil.');
    const connected = !!g.token();
    return [
      h('p', {}, connected ? '✅ Conectada. Los datos se guardan en Drive, carpeta «Inventario Casa».' : 'Sin conectar: los datos solo están en este móvil.'),
      st.meta.lastSync ? h('p', { class: 'muted' }, 'Última sincronización: ' + fmtDateTime(st.meta.lastSync)) : null,
      g.sync.error ? h('p', { class: 'err' }, g.sync.error) : null,
      connected
        ? [h('button', { class: 'btn primary block', onclick: () => g.syncNow() }, 'Sincronizar ahora'),
          h('button', { class: 'btn block', onclick: () => { if (confirm('¿Desconectar? Los datos seguirán en el móvil y en Drive.')) { g.logout(); nav.render(); } } }, 'Desconectar')]
        : h('button', { class: 'btn primary block', onclick: () => g.login() }, 'Conectar con Google'),
      toggle('Reconectar al abrir la app', localStorage.getItem('auto_reconnect') !== '0',
        'Google pide renovar el permiso cada hora; así se hace solo', (v) => localStorage.setItem('auto_reconnect', v ? '1' : '0')),
    ];
  }, { live: true });
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
  return `${n(data.products)} artículos · ${n(data.lists)} listas · ${n(data.locations || {})} ubicaciones · ${n(data.tags || {})} etiquetas · ${n(data.stores || {})} tiendas · ${n(data.recipes || {})} recetas`;
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
