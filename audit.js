// =====================================================================
// audit.js — log de auditoría en localStorage (max 300 entradas)
// =====================================================================

const KEY = 'elrey_audit_log';
const MAX = 300;

export const AUDIT_TIPO = {
  login_ok:             { label: 'Ingreso',       color: 'success' },
  login_fail:           { label: 'Intento fallido', color: 'danger' },
  logout:               { label: 'Salida',         color: 'muted'   },
  logout_inactividad:   { label: 'Inactividad',    color: 'warn'    },
  logout_revocado:      { label: 'Revocado',       color: 'danger'  },
  pwd_reset:            { label: 'Nueva contraseña', color: 'info'  },
  usuario_creado:       { label: 'Usr creado',     color: 'success' },
  usuario_activado:     { label: 'Usr activado',   color: 'success' },
  usuario_desactivado:  { label: 'Usr desactivado', color: 'warn'   }
};

export function logEvent(tipo, { username = '', detalles = '' } = {}) {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tipo,
    username,
    detalles,
    creado_at: new Date().toISOString()
  };
  try {
    const log = _load();
    log.unshift(entry);
    if (log.length > MAX) log.splice(MAX);
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch (_) { /* storage lleno o sandbox — no bloqueante */ }
}

export function getAuditLog(limit = 150) {
  return _load().slice(0, limit);
}

export function clearAuditLog() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

function _load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}
