// =====================================================================
// auth.js — login, logout y helpers de roles
// =====================================================================

import { State, Storage } from './state.js';
import { API } from './api.js';
import { hashPassword } from './utils.js';
import { logEvent } from './audit.js';

// ---- Helpers de geolocalización ----
function _haversineMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function _checkUbicacion(lat, lng, radio) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve({ ok: true, motivo: 'no-gps' }); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = _haversineMetros(pos.coords.latitude, pos.coords.longitude, lat, lng);
        resolve({ ok: dist <= radio, dist, radio });
      },
      () => resolve({ ok: true, motivo: 'denegado' }),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

// Intenta autenticar al usuario contra el password_hash almacenado
export async function login(username, password) {
  const cleanU = (username || '').trim().toUpperCase();
  if (!cleanU || !password) {
    throw new Error('Ingresá usuario y contraseña');
  }
  const user = await API.findUserByUsername(cleanU);
  if (!user || !user.activo || (user.acceso_hasta && new Date() >= new Date(user.acceso_hasta)) || !user.password_hash) {
    logEvent('login_fail', { username: cleanU, detalles: 'Credenciales inválidas' });
    throw new Error('Usuario o contraseña incorrectos');
  }
  const inputHash = await hashPassword(password);
  if (inputHash !== user.password_hash) {
    logEvent('login_fail', { username: cleanU, detalles: 'Contraseña incorrecta' });
    throw new Error('Usuario o contraseña incorrectos');
  }

  // Verificar rango de ubicación para operario y contador
  const ROLES_UBICACION = ['operario', 'contador'];
  if (ROLES_UBICACION.includes(user.rol)) {
    const tienda = await API.getTiendaById(user.tienda_id);
    const isDemoMode = !State.config.url || !State.config.anonKey;
    if (tienda?.lat && tienda?.lng) {
      const radio = tienda.radio_metros ?? 300;
      const ub = await _checkUbicacion(tienda.lat, tienda.lng, radio);
      if (!ub.ok) {
        if (!isDemoMode) {
          logEvent('login_fail', { username: cleanU, detalles: `Fuera de rango: ${ub.dist}m` });
          throw new Error(`Estás a ${ub.dist} m de la tienda. Solo podés ingresar dentro de un radio de ${ub.radio} m.`);
        }
        State.ubicacionAviso = { tipo: 'warn', texto: `Fuera de rango: ${ub.dist} m de la tienda (máx ${ub.radio} m). En producción el acceso estaría bloqueado.` };
      } else if (ub.dist !== undefined) {
        State.ubicacionAviso = { tipo: 'ok', texto: `Ubicación verificada · a ${ub.dist} m de la tienda` };
      } else {
        State.ubicacionAviso = null;
      }
    } else {
      State.ubicacionAviso = null;
    }
  } else {
    State.ubicacionAviso = null;
  }

  // Actualizar último login (best-effort)
  try {
    await API.updateUser(user.id, { ultimo_login: new Date().toISOString() });
  } catch (e) { /* no bloqueante */ }
  logEvent('login_ok', { username: user.username });
  // Guardar sesión
  State.user = user;
  Storage.set('user', user);
  return user;
}

export function logout() {
  logEvent('logout', { username: State.user?.username });
  State.user = null;
  Storage.remove('user');
}

// Helpers de rol
export function isAdmin()             { return State.user?.rol === 'admin'; }
export function isAdminTienda()       { return State.user?.rol === 'admin_tienda'; }
export function isJefeInventario()    { return ['admin', 'jefe_inventario'].includes(State.user?.rol); }
export function canManageStoreUsers() { return ['admin', 'admin_tienda'].includes(State.user?.rol); }
export function isSupervisor()  { return ['admin', 'admin_tienda', 'supervisor', 'jefe_inventario'].includes(State.user?.rol); }
export function isContador()    { return ['admin', 'admin_tienda', 'supervisor', 'jefe_inventario', 'contador'].includes(State.user?.rol); }
export function isAuditor()     { return ['admin', 'auditor'].includes(State.user?.rol); }
export function canExport()     { return !['operario', 'contador'].includes(State.user?.rol); }

// Validación de username (alfanumérico, sin espacios)
export function isValidUsername(u) {
  return /^[A-Z][A-Z0-9_]{2,29}$/.test((u || '').toUpperCase());
}

// Validación de contraseña (mínimo 6 chars)
export function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}
