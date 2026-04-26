// =====================================================================
// scanner.js — envoltura mínima sobre html5-qrcode
// =====================================================================

import { toast, feedback } from './utils.js';

let _scanner = null;
let _onScanCb = null;

export function isActive() { return !!_scanner; }

export function startScanner(elementId, onScan, options = {}) {
  if (_scanner) return; // ya hay uno activo
  if (!window.Html5Qrcode) { toast('Cámara no disponible aquí', 'error'); return; }

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
    toast('No se pudo iniciar la cámara: ' + e, 'error');
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
