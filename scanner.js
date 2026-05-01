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
function ensureLib() {
  if (window.Html5Qrcode) return Promise.resolve(true);
  if (_libPromise) return _libPromise;
  _libPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.10/html5-qrcode.min.js';
    s.onload  = () => resolve(true);
    s.onerror = () => reject(new Error('No se pudo cargar el escáner'));
    document.head.appendChild(s);
  });
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
