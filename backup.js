// Copias de seguridad: automáticas en Drive, configuración de cada móvil y documento legible.
import * as st from './store.js';
import { D } from './device.js';
import { kvGet } from './db.js';
import { DRIVE, DRIVE_UP, api, multipartCreate, findOrCreateFolder, ensureFolder, AuthError } from './google.js';

const BACKUP_FOLDER = 'Copias de seguridad';
const DOC_MIME = 'application/vnd.google-apps.document';

export const REASONS = {
  auto: 'Automática',
  manual: 'Hecha a mano',
  'antes-de-actualizar': 'Antes de actualizar la app',
  'antes-de-restaurar': 'Antes de restaurar otra copia',
};

export async function backupFolder() {
  const m = st.meta;
  if (m.backupFolderId) {
    try {
      const f = await api(`${DRIVE}/files/${m.backupFolderId}?fields=id,trashed`);
      if (!f.trashed) return m.backupFolderId;
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }
  m.backupFolderId = await findOrCreateFolder(BACKUP_FOLDER, await ensureFolder());
  m.deviceFileId = null;
  return m.backupFolderId;
}

function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${st.ymd(d)}_${z(d.getHours())}${z(d.getMinutes())}`;
}

export function wrap(data, reason) {
  return { app: 'inventario-casa', kind: 'backup', schema: data.v || 1, createdAt: new Date().toISOString(), device: D?.name || '', reason, data };
}

// Acepta una copia (formato con envoltorio) o un estado suelto (exportaciones antiguas).
export function unwrap(j) {
  if (j?.kind === 'backup' && j.data?.products) return j.data;
  if (j?.products && j?.lists) return j;
  throw new Error('No es una copia de esta app');
}

export async function createBackup(reason = 'auto', data = st.S) {
  const folder = await backupFolder();
  const prefix = reason === 'auto' ? 'copia' : 'copia-' + reason;
  const name = `${prefix}-${stamp()}.json`;
  await multipartCreate(
    { name, parents: [folder], mimeType: 'application/json', description: `${REASONS[reason] || reason} · ${D?.name || ''}` },
    new Blob([JSON.stringify(wrap(data, reason))], { type: 'application/json' }),
  );
  if (data === st.S) st.S.backupInfo = { last: Date.now(), by: D?.name || '', u: Date.now() };
  return name;
}

export async function listBackupFolder() {
  const folder = await backupFolder();
  const files = [];
  let pageToken;
  do {
    const q = new URLSearchParams({
      q: `'${folder}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,createdTime,modifiedTime,size,description,mimeType,webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: '200',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await api(`${DRIVE}/files?` + q);
    files.push(...(r.files || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return files;
}

export async function readJSONFile(id) {
  const r = await api(`${DRIVE}/files/${id}?alt=media`);
  return typeof r === 'string' ? JSON.parse(r) : r;
}

// Conserva las N copias automáticas más recientes y la primera de cada mes (para siempre).
// Las copias hechas a mano y las especiales no se borran nunca. Lo que sobra va a la papelera de Drive.
async function prune() {
  const keep = +st.S.settings.backupKeep || 30;
  const files = (await listBackupFolder()).filter((f) => /^copia-\d{4}-\d{2}-\d{2}_/.test(f.name));
  const keepIds = new Set(files.slice(0, keep).map((f) => f.id));
  const months = new Set();
  [...files].reverse().forEach((f) => {
    const m = f.name.slice(6, 13);
    if (!months.has(m)) { months.add(m); keepIds.add(f.id); }
  });
  for (const f of files) {
    if (keepIds.has(f.id)) continue;
    await api(`${DRIVE}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}

// Se llama en cada sincronización.
export async function runBackups() {
  const m = st.meta;
  if (m.pendingUpgradeBackup) {
    const old = await kvGet('state-before-v' + st.SCHEMA);
    if (old) await createBackup('antes-de-actualizar', old);
    m.pendingUpgradeBackup = false;
  }
  if ((D.u || 0) > (m.deviceSavedAt || 0)) await saveDeviceConfig();
  const every = (+st.S.settings.backupEveryDays || 1) * 864e5;
  if (Date.now() - (st.S.backupInfo?.last || 0) >= every - 3600e3) {
    await createBackup('auto');
    await prune();
  }
}

// ── Configuración de cada móvil ──
export async function saveDeviceConfig() {
  const m = st.meta;
  const folder = await backupFolder();
  const body = JSON.stringify({ app: 'inventario-casa', kind: 'device-settings', savedAt: new Date().toISOString(), device: D.name, settings: D });
  if (m.deviceFileId) {
    try {
      await api(`${DRIVE_UP}/files/${m.deviceFileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      await api(`${DRIVE}/files/${m.deviceFileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: D.name }) });
    } catch (e) {
      if (e instanceof AuthError) throw e;
      if (e.status === 404) m.deviceFileId = null; else throw e;
    }
  }
  if (!m.deviceFileId) {
    const f = await multipartCreate(
      { name: `ajustes-movil-${D.id}.json`, parents: [folder], mimeType: 'application/json', description: D.name },
      new Blob([body], { type: 'application/json' }),
    );
    m.deviceFileId = f.id;
  }
  m.deviceSavedAt = Date.now();
}

export async function listDeviceConfigs() {
  return (await listBackupFolder()).filter((f) => f.name.startsWith('ajustes-movil-'));
}

// ── Documento legible ──
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function readableHTML(data, title) {
  const alive = (o) => Object.values(o || {}).filter((x) => !x.del);
  const locs = data.locations || {};
  const lpath = (id) => {
    const parts = [];
    let l = locs[id];
    let g = 0;
    while (l && !l.del && g++ < 10) { parts.unshift(l.name + (l.reserve ? ' (reserva)' : '')); l = locs[l.parentId]; }
    return parts.join(' › ');
  };
  const legacy = (p) => [p.room, p.furniture, p.shelf].filter(Boolean).join(' › ');
  const habitual = (p) => (p.locationId ? lpath(p.locationId) : legacy(p));
  const unit = (u) => st.UNITS[u || 'ud'] || u;
  const prods = alive(data.products).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));

  // Existencias agrupadas por el sitio donde están
  const groups = new Map();
  for (const p of prods) {
    const lots = (p.lots || []).filter((l) => +l.qty > 0);
    if (!lots.length) {
      const k = habitual(p) || 'Sin ubicación';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ p, qty: 0 });
    }
    for (const l of lots) {
      const k = (l.locationId !== undefined ? lpath(l.locationId) : habitual(p)) || 'Sin ubicación';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ p, qty: l.qty, brand: (p.variants || []).find((v) => v.id === l.variantId)?.brand, expiry: l.expiry });
    }
  }
  const keys = [...groups.keys()].sort((a, b) => (a === 'Sin ubicación') - (b === 'Sin ubicación') || a.localeCompare(b, 'es'));
  const td = (s) => `<td>${esc(s)}</td>`;
  let out = `<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>`;
  out += `<h1>${esc(title)}</h1><p>Generado el ${esc(new Date().toLocaleString('es-ES'))}. ${prods.length} artículos.</p>`;

  out += '<h2>Qué hay y dónde</h2>';
  for (const k of keys) {
    out += `<h3>${esc(k)}</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>Artículo</th><th>Marca</th><th>Cantidad</th><th>Caduca</th></tr>`;
    for (const r of groups.get(k)) out += `<tr>${td(r.p.name)}${td(r.brand || '')}${td(st.fmtNum(r.qty) + ' ' + unit(r.p.unit))}${td(r.expiry ? st.fmtDate(r.expiry) : '')}</tr>`;
    out += '</table>';
  }

  const lists = alive(data.lists).sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : a.name.localeCompare(b.name, 'es')));
  out += '<h2>Listas de la compra</h2>';
  for (const l of lists) {
    const its = alive(data.items).filter((it) => it.listId === l.id && !it.done && !it.dismissed);
    out += `<h3>${esc(l.name)}</h3>`;
    if (!its.length) { out += '<p>(vacía)</p>'; continue; }
    out += '<ul>' + its.map((it) => {
      const p = byId[it.productId];
      return `<li>${esc(p ? p.name : it.name)}${it.qty ? ' — ' + esc(st.fmtNum(it.qty) + ' ' + unit(p?.unit)) : ''}</li>`;
    }).join('') + '</ul>';
  }

  out += '<h2>Fichas de los artículos</h2><table border="1" cellpadding="4" cellspacing="0"><tr><th>Artículo</th><th>Categoría</th><th>Ubicación habitual</th><th>Mínimo</th><th>Reponer hasta</th><th>Marcas (código)</th><th>Notas</th></tr>';
  for (const p of prods) {
    const marcas = (p.variants || []).map((v) => `${v.fav ? '★ ' : ''}${v.brand || 'sin nombre'}${v.barcode ? ' (' + v.barcode + ')' : ''}`).join('; ');
    out += `<tr>${td(p.name)}${td(p.category)}${td(habitual(p))}${td(p.restock === false ? 'no se repone' : p.min || '')}${td(p.target || '')}${td(marcas)}${td(p.notes)}</tr>`;
  }
  out += '</table>';

  const tree = alive(locs);
  if (tree.length) {
    const kids = (pid) => tree.filter((l) => (l.parentId || null) === pid).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name, 'es'));
    const ul = (pid) => {
      const k = kids(pid);
      return k.length ? '<ul>' + k.map((l) => `<li>${esc(l.name)}${l.reserve ? ' (reserva)' : ''}${ul(l.id)}</li>`).join('') + '</ul>' : '';
    };
    out += '<h2>Ubicaciones</h2>' + ul(null);
  }
  return out + '</body></html>';
}

// Crea un documento de Google Docs con el contenido de unos datos (actuales o de una copia).
export async function makeReadableDoc(data, title) {
  const folder = await backupFolder();
  return multipartCreate(
    { name: title, parents: [folder], mimeType: DOC_MIME },
    new Blob([readableHTML(data, title)], { type: 'text/html' }),
    'id,webViewLink',
  );
}
