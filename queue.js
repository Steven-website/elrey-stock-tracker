// =====================================================================
// queue.js — cola de movimientos pendientes cuando no hay conexión
// =====================================================================

const KEY = 'elrey_pending_movs';

export function enqueue(mov) {
  const q = _load();
  q.push({
    ...mov,
    _qid: `q${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    _queued: new Date().toISOString()
  });
  _save(q);
}

export function getQueue() {
  return _load();
}

export function getPendingCount() {
  return _load().length;
}

export function dequeue(qid) {
  _save(_load().filter(m => m._qid !== qid));
}

export function clearQueue() {
  localStorage.removeItem(KEY);
}

function _load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function _save(q) {
  localStorage.setItem(KEY, JSON.stringify(q));
}
