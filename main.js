// =====================================================================
// main.js — punto de entrada de la aplicación
// =====================================================================

import { State, Storage, isDemoMode } from './state.js';
import { API, initSupabase } from './api.js';
import { initMockPasswords } from './mock.js';
import { stopScanner } from './scanner.js';
import { $ } from './utils.js';
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
  renderArticulosModal, renderCreateArticuloModal, renderEditArticuloModal,
  renderTiendasModal
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
      createUser:      renderCreateUserModal,
      editUser:        renderEditUserModal,
      scanForSearch:   renderScanForSearchModal,
      articulos:       renderArticulosModal,
      createArticulo:  renderCreateArticuloModal,
      editArticulo:    renderEditArticuloModal,
      tiendas:         renderTiendasModal
    };
    const renderer = map[State.modal];
    if (renderer) root.appendChild(renderer());
  }

  if (isDemoMode()) {
    root.appendChild($(`<div class="demo-badge">Modo demo</div>`));
  }
}

// =====================================================================
// SESSION CHECK — revoca acceso si el usuario fue desactivado o venció su límite
// =====================================================================
function forceLogout(message) {
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
async function boot() {
  // Inicializar contraseñas demo (hash) si estamos en modo demo
  await initMockPasswords();

  // Conectar a Supabase si hay configuración
  initSupabase();

  // Render inicial
  render();

  // Verificación de sesión cada 45 segundos
  setInterval(checkSession, 45_000);

  // Eventos globales
  window.addEventListener('online',  () => import('./utils.js').then(m => m.toast('Conectado a internet', 'success')));
  window.addEventListener('offline', () => import('./utils.js').then(m => m.toast('Sin conexión', 'error')));
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
