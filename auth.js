// =====================================================================
// auth.js — login, logout y helpers de roles
// =====================================================================

import { State, Storage } from './state.js';
import { API } from './api.js';
import { hashPassword } from './utils.js';
import { logEvent } from './audit.js';

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
export function canManageStoreUsers() { return ['admin', 'admin_tienda'].includes(State.user?.rol); }
export function isSupervisor()  { return ['admin', 'admin_tienda', 'supervisor'].includes(State.user?.rol); }
export function isContador()    { return ['admin', 'admin_tienda', 'supervisor', 'contador'].includes(State.user?.rol); }
export function isAuditor()     { return ['admin', 'auditor'].includes(State.user?.rol); }
export function canExport()     { return State.user?.rol !== 'operario'; }

// Validación de username (alfanumérico, sin espacios)
export function isValidUsername(u) {
  return /^[A-Z][A-Z0-9_]{2,29}$/.test((u || '').toUpperCase());
}

// Validación de contraseña (mínimo 6 chars)
export function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}
