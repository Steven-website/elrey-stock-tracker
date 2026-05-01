// =====================================================================
// scanner.js — envoltura mínima sobre html5-qrcode
// =====================================================================

import { toast, feedback } from './utils.js';

let _scanner = null;
let _onScanCb = null;
let _libPromise = null;

export function isActive() { return !!_scanner; }

// Carga (o re-intenta cargar) html5-qrcode si no está disponible.
// iOS Safari a veces falla la carga inicial del CDN — re-intentamos al iniciar.
const _LIB_URLS = [
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.10/html5-qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.10/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.10/html5-qrcode.min.js'
];

function _loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload  = () => resolve(true);
    s.onerror = () => reject(new Error('load fail: ' + url));
    document.head.appendChild(s);
  });
}

async function ensureLib() {
  if (window.Html5Qrcode) return true;
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    for (const url of _LIB_URLS) {
      try {
        await _loadScript(url);
        if (window.Html5Qrcode) return true;
      } catch (_) { /* probar siguiente CDN */ }
    }
    throw new Error('No se pudo cargar html5-qrcode desde ningún CDN');
  })();
  return _libPromise;
}

export async function startScanner(elementId, onScan, options = {}) {
  if (_scanner) return; // ya hay uno activo

  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Tu navegador no permite acceso a la cámara', 'error');
    return;
  }

  try {
    await ensureLib();
  } catch (e) {
    toast('No se pudo cargar el escáner — revisá tu conexión y recargá', 'error');
    return;
  }

  _onScanCb = onScan;
  _scanner = new window.Html5Qrcode(elementId, { verbose: false });
  _scanner.start(
    { facingMode: 'environment' },
    {
      fps: options.fps || 10,
      qrbox: options.qrbox || { width: 240, height: 240 },
      aspectRatio: options.aspectRatio || 1.0
    },
    (decoded) => {
      feedback('ok');
      const cb = _onScanCb;
      stopScanner();
      if (cb) cb(decoded);
    },
    () => {} // ignorar "no QR encontrado"
  ).catch(e => {
    _scanner = null;
    const msg = String(e?.message || e || '');
    if (/permission|notallowed|denied/i.test(msg)) {
      toast('Permití el acceso a la cámara en Ajustes › Safari', 'error');
    } else if (/notfound|no.*camera/i.test(msg)) {
      toast('No se detectó cámara en el dispositivo', 'error');
    } else {
      toast('No se pudo iniciar la cámara: ' + msg, 'error');
    }
  });
}

export function stopScanner() {
  if (!_scanner) return;
  try {
    _scanner.stop().then(() => _scanner.clear()).catch(()=>{});
  } catch(e) {}
  _scanner = null;
  _onScanCb = null;
}
