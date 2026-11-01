// Lector de códigos de barras con la cámara (html5-qrcode, se guarda para usarlo sin conexión).
import { D } from './device.js';

const LIB = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
let libP = null;

function loadLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!libP) {
    libP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = resolve;
      s.onerror = () => { libP = null; reject(new Error('No se pudo cargar el lector (¿sin conexión la primera vez?)')); };
      document.head.append(s);
    });
  }
  return libP;
}

// Abre la cámara a pantalla completa. Devuelve el código leído o null si se cancela.
export function scanBarcode(title = 'Escanea el código de barras') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'scanner';
    wrap.innerHTML = `
      <div class="scanner-top">
        <span>${title}</span>
        <button class="icon-btn light" data-close aria-label="Cerrar">✕</button>
      </div>
      <div id="reader"></div>
      <p class="scanner-msg" hidden></p>
      <form class="scanner-manual">
        <input inputmode="numeric" placeholder="…o escribe el código" autocomplete="off">
        <button class="btn primary">OK</button>
      </form>`;
    document.body.append(wrap);
    let scanner = null;
    let finished = false;

    async function finish(value) {
      if (finished) return;
      finished = true;
      try { if (scanner?.isScanning) await scanner.stop(); } catch {}
      try { scanner?.clear(); } catch {}
      wrap.remove();
      if (value && D?.vibrate !== false) navigator.vibrate?.(60);
      resolve(value || null);
    }

    wrap.querySelector('[data-close]').onclick = () => finish(null);
    wrap.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = wrap.querySelector('input').value.trim();
      if (v) finish(v);
    };

    (async () => {
      try {
        await loadLib();
        if (finished) return;
        const F = window.Html5QrcodeSupportedFormats;
        scanner = new window.Html5Qrcode('reader', {
          verbose: false,
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (w, h) => ({ width: Math.max(160, Math.floor(w * 0.85)), height: Math.max(90, Math.floor(Math.min(h, w) * 0.45)) }),
          },
          (text) => finish(text),
          () => {},
        );
      } catch (e) {
        const m = wrap.querySelector('.scanner-msg');
        m.hidden = false;
        m.textContent = 'No se puede usar la cámara: ' + (e?.message || e) + '. Escribe el código a mano.';
      }
    })();
  });
}
