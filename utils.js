// =====================================================================
// auth.js — login, logout y helpers de roles
// =====================================================================

import { State, Storage } from './state.js';
import { API } from './api.js';
import { hashPassword } from './utils.js';

// Intenta autenticar al usuario contra el password_hash almacenado
export async function login(username, password) {
  const cleanU = (username || '').trim().toUpperCase();
  if (!cleanU || !password) {
    throw new Error('Ingresá usuario y contraseña');
  }
  const user = await API.findUserByUsername(cleanU);
  if (!user) throw new Error('Usuario o contraseña incorrectos');
  if (!user.activo) throw new Error('Este usuario está desactivado');
  if (!user.password_hash) {
    throw new Error('Este usuario no tiene contraseña asignada. Pedile al admin que te configure una.');
  }
  const inputHash = await hashPassword(password);
  if (inputHash !== user.password_hash) {
    throw new Error('Usuario o contraseña incorrectos');
  }
  // Actualizar último login (best-effort)
  try {
    await API.updateUser(user.id, { ultimo_login: new Date().toISOString() });
  } catch (e) { /* no bloqueante */ }
  // Guardar sesión
  State.user = user;
  Storage.set('user', user);
  return user;
}

export function logout() {
  State.user = null;
  Storage.remove('user');
}

// Helpers de rol
export function isAdmin()       { return State.user?.rol === 'admin'; }
export function isSupervisor()  { return ['admin', 'supervisor'].includes(State.user?.rol); }
export function isContador()    { return ['admin', 'supervisor', 'contador'].includes(State.user?.rol); }
export function isAuditor()     { return ['admin', 'auditor'].includes(State.user?.rol); }

// Validación de username (alfanumérico, sin espacios)
export function isValidUsername(u) {
  return /^[A-Z][A-Z0-9_]{2,29}$/.test((u || '').toUpperCase());
}

// Validación de contraseña (mínimo 6 chars)
export function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}
