// Fusión «a tres bandas»: combina el cambio de este móvil (l) y el del otro (r) a partir de la última
// versión que tenían los dos en común (b). Así no se pierde ninguno de los dos.
// - Lo que solo cambió un lado, se queda con ese cambio.
// - Existencias (lots): se suman las diferencias de cada lado (uno gasta 1 y el otro añade 3 → +2).
// - Listas con «id» (platos del menú, marcas, opciones…): se combinan elemento a elemento.
// - Objetos (categorías de una receta, ajustes…): campo a campo.
// - Si los dos cambiaron lo mismo de forma distinta, gana el cambio más reciente.

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const round = (n) => Math.round((+n || 0) * 100) / 100;

export function eq(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a == b;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
  }
  return false;
}

const idArray = (x) => Array.isArray(x) && x.every((e) => isObj(e) && e.id !== undefined && e.id !== null);
// Listas de valores sueltos sin repetir (etiquetas, opciones de un grupo…): se combinan como conjuntos.
// Las que tienen orden propio (pasos, consejos…) no: si las cambian los dos, gana el cambio más reciente.
const ORDERED = new Set(['steps', 'tips', 'pairings', 'notes', 'text']);
const setArray = (x) => Array.isArray(x) && x.every((e) => typeof e === 'string' || typeof e === 'number') && new Set(x).size === x.length;

export function merge3(l, r, b, preferR, key = '') {
  if (eq(l, b)) return r;
  if (eq(r, b)) return l;
  if (eq(l, r)) return l;
  if (key === 'lots' && (Array.isArray(l) || Array.isArray(r))) return mergeLots(l || [], r || [], Array.isArray(b) ? b : []);
  if ((idArray(l) || l === undefined) && (idArray(r) || r === undefined) && (l || r)) return mergeById(l || [], r || [], idArray(b) ? b : [], preferR);
  if (!ORDERED.has(key) && setArray(l) && setArray(r) && (b === undefined || setArray(b))) {
    const bs = new Set(b || []);
    const gone = new Set([...bs].filter((x) => !l.includes(x) || !r.includes(x)));
    return [...new Set([...l, ...r])].filter((x) => !gone.has(x));
  }
  if (isObj(l) && isObj(r)) {
    const bb = isObj(b) ? b : {};
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(bb)])) {
      const v = merge3(l[k], r[k], bb[k], preferR, k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return preferR ? r : l;
}

function mergeById(l, r, b, preferR) {
  const L = new Map(l.map((x) => [x.id, x]));
  const R = new Map(r.map((x) => [x.id, x]));
  const B = new Map(b.map((x) => [x.id, x]));
  const ids = [...new Set([...l.map((x) => x.id), ...r.map((x) => x.id)])];
  const out = [];
  for (const id of ids) {
    const li = L.get(id);
    const ri = R.get(id);
    const bi = B.get(id);
    if (bi) {
      if (!li && !ri) continue;
      if (!li) { if (!eq(ri, bi)) out.push(ri); continue; }       // quitado aquí: se va, salvo que allí lo cambiaran
      if (!ri) { if (!eq(li, bi)) out.push(li); continue; }
      out.push(merge3(li, ri, bi, preferR));
    } else {
      out.push(li && ri ? merge3(li, ri, {}, preferR) : li || ri);
    }
  }
  return out;
}

// Existencias: la cantidad de cada lote es la de antes más lo que cambió cada lado.
function mergeLots(l, r, b) {
  const L = new Map(l.map((x) => [x.id, x]));
  const R = new Map(r.map((x) => [x.id, x]));
  const B = new Map(b.map((x) => [x.id, x]));
  const ids = [...new Set([...l.map((x) => x.id), ...r.map((x) => x.id), ...b.map((x) => x.id)])];
  const out = [];
  const short = [];
  for (const id of ids) {
    const li = L.get(id);
    const ri = R.get(id);
    const bi = B.get(id);
    if (!bi) { if (li || ri) out.push(li || ri); continue; }
    const bq = +bi.qty || 0;
    const qty = round(bq + ((+li?.qty || 0) - bq) + ((+ri?.qty || 0) - bq));
    if (qty < 0) short.push({ bi, n: -qty, dl: bq - (+li?.qty || 0), dr: bq - (+ri?.qty || 0) });
    if (qty <= 0) continue;
    const strip = (x) => { if (!x) return { ...bi, qty: undefined }; const { qty: _, ...rest } = x; return rest; };
    const fields = merge3(strip(li), strip(ri), strip(bi), false);
    out.push({ ...fields, id, qty });
  }
  // Si a un lote le quitaron entre los dos más de lo que tenía, lo más probable es que uno lo cambiara de sitio
  // (sale de aquí y aparece igual en otro lote) y el otro gastara: lo gastado se descuenta del lote al que se movió.
  const same = (a, x) => (a.variantId || null) === (x.variantId || null) && (a.expiry || null) === (x.expiry || null);
  for (const d of short) {
    for (const x of out) {
      if (d.n <= 0) break;
      if (!same(d.bi, x)) continue;
      const bq = +B.get(x.id)?.qty || 0;
      const incL = (+L.get(x.id)?.qty || 0) - bq;
      const incR = (+R.get(x.id)?.qty || 0) - bq;
      const moved = Math.max(incL > 0 && incL <= d.dl ? incL : 0, incR > 0 && incR <= d.dr ? incR : 0);
      const take = Math.min(d.n, moved, +x.qty || 0);
      if (take > 0) { x.qty = round(+x.qty - take); d.n = round(d.n - take); }
    }
  }
  // Junta los lotes que hayan quedado iguales (mismo formato, caducidad y sitio).
  const joined = [];
  for (const x of out.filter((o) => +o.qty > 0)) {
    const same = joined.find((o) => (o.variantId || null) === (x.variantId || null) && (o.expiry || null) === (x.expiry || null)
      && (o.locationId || null) === (x.locationId || null));
    if (same) same.qty = round(+same.qty + +x.qty); else joined.push({ ...x });
  }
  return joined;
}

// Un registro cambiado en los dos lados desde la versión común.
export function mergeRecord(l, r, b) {
  const preferR = (+r.u || 0) > (+l.u || 0);
  if (!b || l.del || r.del || b.del) return preferR ? r : l;
  const out = merge3(l, r, b, preferR);
  out.id = l.id ?? r.id;
  out.u = Math.max(+l.u || 0, +r.u || 0) + 1;
  return out;
}
