// =====================================================================
// scanner.js — escáner con dos backends:
//   1. BarcodeDetector nativo (iOS Safari 17+, Chrome) — sin dependencias
//   2. html5-qrcode desde CDN como fallback para navegadores viejos
// =====================================================================

import { toast, feedback } from './utils.js';

let _scanner   = null;     // instancia de Html5Qrcode (fallback)
let _native    = null;     // { stream, video, raf } cuando usamos BarcodeDetector
let _onScanCb  = null;
let _libPromise = null;

export function isActive() { return !!_scanner || !!_native; }

// Carga (o re-intenta cargar) html5-qrcode si no está disponible.
// iOS Safari a veces falla la carga inicial del CDN — re-intentamos al iniciar.
const _LIB_URLS = [
  './html5-qrcode.min.js',                    // vendorizado por GitHub Actions — mismo origen
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

// ── Backend 1: BarcodeDetector nativo (iOS 17+, Chrome) ──────────────
async function startNative(elementId, onScan) {
  const container = document.getElementById(elementId);
  if (!container) throw new Error('Contenedor no encontrado');

  // Sin lista de formatos: iOS/Chrome usan todos los que soportan nativamente.
  // Pasar formatos no soportados tiraría una excepción acá.
  let detector;
  try {
    detector = new window.BarcodeDetector();
  } catch (e) {
    throw new Error('BarcodeDetector no soportado: ' + (e?.message || e));
  }

  // getUserMedia DEBE invocarse en este tick (mismo gesture context iOS Safari)
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } }, audio: false
  });

  container.innerHTML = '';
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  container.appendChild(video);
  video.srcObject = stream;
  await video.play();

  _native = { stream, video, raf: 0, stop: false };
  _onScanCb = onScan;

  const tick = async () => {
    if (!_native || _native.stop) return;
    try {
      const codes = await detector.detect(video);
      if (codes && codes.length) {
        const decoded = codes[0].rawValue;
        feedback('ok');
        const cb = _onScanCb;
        stopScanner();
        if (cb) cb(decoded);
        return;
      }
    } catch (_) { /* ignorar errores transitorios */ }
    _native.raf = requestAnimationFrame(tick);
  };
  tick();
}

// ── Backend 2: html5-qrcode (fallback CDN) ────────────────────────────
async function startFallback(elementId, onScan, options) {
  await ensureLib();
  _onScanCb = onScan;
  _scanner = new window.Html5Qrcode(elementId, { verbose: false });
  await _scanner.start(
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
    () => {}
  );
}

export async function startScanner(elementId, onScan, options = {}) {
  if (_scanner || _native) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Tu navegador no permite acceso a la cámara', 'error');
    return;
  }

  // Preferir BarcodeDetector nativo si existe (sin dependencia de internet)
  if ('BarcodeDetector' in window) {
    try {
      await startNative(elementId, onScan);
      return;
    } catch (e) {
      _native = null;
      const msg = String(e?.message || e || '');
      if (/permission|notallowed|denied/i.test(msg)) {
        toast('Permití el acceso a la cámara en Ajustes › Safari', 'error');
        return;
      }
      console.warn('BarcodeDetector falló, intentando fallback:', msg);
      // continuamos al fallback
    }
  }

  // Fallback: html5-qrcode desde CDN
  try {
    await startFallback(elementId, onScan, options);
  } catch (e) {
    _scanner = null;
    const msg = String(e?.message || e || '');
    if (/permission|notallowed|denied/i.test(msg)) {
      toast('Permití el acceso a la cámara en Ajustes › Safari', 'error');
    } else if (/notfound|no.*camera/i.test(msg)) {
      toast('No se detectó cámara en el dispositivo', 'error');
    } else if (/cargar|html5-qrcode/i.test(msg)) {
      toast('Tu iPhone no soporta el escáner nativo. Actualizá iOS o usá ingreso manual.', 'error');
    } else {
      toast('No se pudo iniciar la cámara: ' + msg, 'error');
    }
  }
}

export function stopScanner() {
  if (_native) {
    _native.stop = true;
    if (_native.raf) cancelAnimationFrame(_native.raf);
    if (_native.stream) _native.stream.getTracks().forEach(t => t.stop());
    if (_native.video) _native.video.srcObject = null;
    _native = null;
  }
  if (_scanner) {
    try { _scanner.stop().then(() => _scanner.clear()).catch(()=>{}); } catch(e) {}
    _scanner = null;
  }
  _onScanCb = null;
}
