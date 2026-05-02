// =====================================================================
// main.js — punto de entrada de la aplicación
// =====================================================================

import { State, Storage, isDemoMode } from './state.js';
import { API, initSupabase } from './api.js';
import { getQueue, dequeue, getPendingCount } from './queue.js';
import { initMockPasswords } from './mock.js';
import { isGithubMode, loadFromGithub, startAutoSync } from './githubBackend.js';
import { stopScanner } from './scanner.js';
import { $ } from './utils.js';
import { logEvent } from './audit.js';
import {
  renderLogin, renderShell
} from './views.js';
import {
  renderBoxModal, renderConfigModal,
  renderReduceModal, renderIncreaseModal,
  renderMoveModal, renderHistoryModal,
  renderCreateBoxModal, renderScanProductModal,
  renderPrintQRModal,
  renderCreateUserModal, renderEditUserModal,
  renderScanForSearchModal,
  renderScanProductInBoxModal,
  renderArticulosModal, renderCreateArticuloModal, renderEditArticuloModal,
  renderTiendasModal, renderAuditModal,
  renderMoverLoteModal,
  renderConteoBoxModal, renderConteoCrearCajaModal
} from './modals.js';

// =====================================================================
// RENDER (función central)
// =====================================================================
export function render() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  if (!State.user) {
    root.appendChild(renderLogin());
  } else {
    root.appendChild(renderShell());
  }

  if (State.modal) {
    const map = {
      box:           renderBoxModal,
      config:        renderConfigModal,
      reduce:        renderReduceModal,
      increase:      renderIncreaseModal,
      move:          renderMoveModal,
      history:       renderHistoryModal,
      create:        renderCreateBoxModal,
      scanProduct:   renderScanProductModal,
      print:         renderPrintQRModal,
      scanProductInBox: renderScanProductInBoxModal,
      createUser:      renderCreateUserModal,
      editUser:        renderEditUserModal,
      scanForSearch:   renderScanForSearchModal,
      articulos:       renderArticulosModal,
      createArticulo:  renderCreateArticuloModal,
      editArticulo:    renderEditArticuloModal,
      tiendas:         renderTiendasModal,
      audit:           renderAuditModal,
      moverLote:       renderMoverLoteModal,
      conteoBox:       renderConteoBoxModal,
      conteoCrearCaja: renderConteoCrearCajaModal
    };
    const renderer = map[State.modal];
    if (renderer) root.appendChild(renderer());
  }

  if (isDemoMode()) {
    root.appendChild($(`<div class="demo-badge">Modo demo</div>`));
  }
}

// =====================================================================
// SYNC QUEUE — envía movimientos pendientes al volver la conexión
// =====================================================================
export function getPendingBadge() { return getPendingCount(); }

async function syncQueue() {
  if (isDemoMode()) return;
  const queue = getQueue();
  if (!queue.length) return;

  const { toast } = await import('./utils.js');
  toast(`Sincronizando ${queue.length} movimiento${queue.length > 1 ? 's' : ''} pendiente${queue.length > 1 ? 's' : ''}…`, 'info');

  let ok = 0, fail = 0;
  for (const mov of queue) {
    const { _qid, _queued, ...movData } = mov;
    try {
      await API.createMovimiento(movData);
      dequeue(_qid);
      ok++;
    } catch {
      fail++;
    }
  }

  if (ok)   toast(`${ok} movimiento${ok > 1 ? 's' : ''} sincronizado${ok > 1 ? 's' : ''} ✓`, 'success');
  if (fail) toast(`${fail} movimiento${fail > 1 ? 's' : ''} fallaron — revisar en Mov.`, 'error');
  render();
}

// =====================================================================
// INACTIVIDAD — cierra sesión si el usuario no interactúa
// =====================================================================
let _inactivityTimer = null;

export function resetInactivityTimer() {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  if (!State.user) return;
  const minutes = State.config.inactivityMinutes ?? 10;
  if (!minutes) return; // 0 = nunca
  _inactivityTimer = setTimeout(() => {
    forceLogout('Sesión cerrada por inactividad — volvé a ingresar', 'logout_inactividad');
  }, minutes * 60_000);
}

function startInactivityWatch() {
  ['click', 'touchstart', 'keydown', 'scroll', 'mousemove'].forEach(ev =>
    document.addEventListener(ev, resetInactivityTimer, { passive: true })
  );
  resetInactivityTimer();
}

// =====================================================================
// SESSION CHECK — revoca acceso si el usuario fue desactivado o venció su límite
// =====================================================================
function forceLogout(message, auditTipo = 'logout_revocado') {
  if (_inactivityTimer) { clearTimeout(_inactivityTimer); _inactivityTimer = null; }
  logEvent(auditTipo, { username: State.user?.username });
  State.user = null;
  State.modal = null;
  Storage.remove('user');
  render();
  import('./utils.js').then(m => m.toast(message, 'error'));
}

async function checkSession() {
  if (!State.user) return;
  try {
    const fresh = await API.findUserByUsername(State.user.username);
    if (!fresh || !fresh.activo) {
      forceLogout('Tu acceso fue desactivado por el administrador');
      return;
    }
    if (fresh.acceso_hasta && new Date() >= new Date(fresh.acceso_hasta)) {
      forceLogout('Tu período de acceso ha expirado');
    }
  } catch (_) { /* ignorar errores de red */ }
}

// =====================================================================
// BOOT
// =====================================================================
// Refresh forzado al menos cada 24h: borra caches y recarga la app fresca.
const DAILY_REFRESH_KEY = 'elrey_last_refresh';
const DAILY_REFRESH_MS  = 24 * 60 * 60 * 1000;

async function _hardRefresh() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => {})));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (_) { /* best-effort */ }
  Storage.set(DAILY_REFRESH_KEY, Date.now());
  location.reload();
}

function setupDailyRefresh() {
  const last = parseInt(Storage.get(DAILY_REFRESH_KEY) || '0');
  if (!last) {
    Storage.set(DAILY_REFRESH_KEY, Date.now());
    return; // primera vez, no recargar
  }
  const due = (Date.now() - last) >= DAILY_REFRESH_MS;
  if (due) { _hardRefresh(); return; }

  // Re-evaluar al volver a la pestaña y cada hora
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const t = parseInt(Storage.get(DAILY_REFRESH_KEY) || '0');
      if ((Date.now() - t) >= DAILY_REFRESH_MS) _hardRefresh();
    }
  });
  setInterval(() => {
    const t = parseInt(Storage.get(DAILY_REFRESH_KEY) || '0');
    if ((Date.now() - t) >= DAILY_REFRESH_MS) _hardRefresh();
  }, 60 * 60 * 1000); // cada hora
}

async function boot() {
  // Refresh diario forzado (limpia caches al menos cada 24 h)
  setupDailyRefresh();

  // Si hay backend GitHub configurado, descargar el JSON y poblar MOCK
  if (isGithubMode()) {
    try {
      await loadFromGithub();
      console.log('[github] datos cargados desde GitHub');
    } catch (e) {
      console.error('[github] no se pudo cargar:', e.message);
    }
  }

  // Inicializar contraseñas demo (hash) si estamos en modo demo
  // (no sobrescribe hashes ya seteados desde GitHub)
  await initMockPasswords();

  // Conectar a Supabase si hay configuración
  initSupabase();

  // Auto-sync periódico al GitHub (commit en cada cambio detectado)
  if (isGithubMode()) startAutoSync(8000);

  // Render inicial
  render();

  // Verificación de sesión cada 45 segundos
  setInterval(checkSession, 45_000);

  // Vigilancia de inactividad
  startInactivityWatch();

  // Eventos globales
  window.addEventListener('online',  async () => {
    import('./utils.js').then(m => m.toast('Conectado a internet', 'success'));
    await syncQueue();
  });
  window.addEventListener('offline', () => import('./utils.js').then(m => m.toast('Sin conexión — los movimientos se guardarán localmente', 'warn')));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopScanner(); return; }
    checkSession(); // verificar al regresar a la pestaña
  });
}

boot().catch(e => {
  console.error('Error al arrancar:', e);
  document.getElementById('app').innerHTML = `
    <div style="padding:40px 20px; text-align:center; color:#888;">
      <h2 style="color:#f5b800; margin-bottom:8px;">Error al iniciar</h2>
      <p style="font-family:monospace; font-size:13px;">${e.message}</p>
    </div>
  `;
});
