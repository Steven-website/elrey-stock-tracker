// =====================================================================
// githubBackend.js — persistencia demo en JSON dentro de un repo GitHub
// El navegador descarga el JSON al iniciar (poblando MOCK) y commitea
// el archivo al detectar cambios o al pedido manual del usuario.
// =====================================================================

import { State } from './state.js';
import { MOCK } from './mock.js';

const TABLES = [
  'tiendas', 'usuarios', 'articulos',
  'bodegas', 'pasillos', 'estantes',
  'ubicaciones', 'posiciones',
  'cajas',
  'movimientos',
  'tareas_conteo', 'tarea_articulos', 'conteo_registros'
];

let _fileSha = null;
let _lastSerialized = null;
let _autoTimer = null;

export function isGithubMode() {
  const g = State.config.github;
  return !!(g && g.token && g.owner && g.repo && g.path);
}

function _gh() { return State.config.github; }

function _authHeaders() {
  return {
    'Authorization': `Bearer ${_gh().token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function _contentsUrl() {
  const g = _gh();
  return `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}`;
}

function _serialize() {
  const out = {};
  for (const t of TABLES) out[t] = MOCK[t] || [];
  return out;
}

function _b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function _b64decode(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

// ── Carga inicial ─────────────────────────────────────────────────────
export async function loadFromGithub() {
  if (!isGithubMode()) throw new Error('GitHub no configurado');
  const g = _gh();
  const url = _contentsUrl() + (g.branch ? `?ref=${encodeURIComponent(g.branch)}` : '');
  const r = await fetch(url, { headers: _authHeaders() });

  if (r.status === 404) {
    // Archivo no existe — lo creamos con el MOCK actual
    _fileSha = null;
    await commitToGithub('Inicializar datos demo');
    return { created: true };
  }
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GitHub GET ${r.status}: ${txt.slice(0, 200)}`);
  }
  const json = await r.json();
  _fileSha = json.sha;
  let data;
  try {
    data = JSON.parse(_b64decode(json.content));
  } catch (e) {
    throw new Error('JSON inválido en el archivo de GitHub');
  }
  for (const t of TABLES) {
    if (Array.isArray(data[t])) MOCK[t] = data[t];
  }
  _lastSerialized = JSON.stringify(_serialize());
  return { loaded: true, rows: Object.fromEntries(TABLES.map(t => [t, (MOCK[t] || []).length])) };
}

// ── Commit (escritura) ────────────────────────────────────────────────
export async function commitToGithub(message = 'Actualizar datos demo') {
  if (!isGithubMode()) throw new Error('GitHub no configurado');
  const g = _gh();
  const content = JSON.stringify(_serialize(), null, 2);
  const body = {
    message,
    content: _b64encode(content),
    branch: g.branch || 'main'
  };
  if (_fileSha) body.sha = _fileSha;

  const r = await fetch(_contentsUrl(), {
    method: 'PUT',
    headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    // 409 = sha conflict (alguien escribió antes). Recargar y reintentar 1 vez.
    if (r.status === 409 || r.status === 422) {
      await loadFromGithub();
      // No reintentamos automáticamente para no perder el cambio local en silencio.
      throw new Error('Conflicto: el archivo cambió en GitHub. Volvé a intentar.');
    }
    throw new Error(`GitHub PUT ${r.status}: ${txt.slice(0, 200)}`);
  }
  const json = await r.json();
  _fileSha = json.content?.sha || _fileSha;
  _lastSerialized = JSON.stringify(_serialize());
  return { committed: true, sha: _fileSha };
}

// ── Auto-sync por diff cada N segundos ────────────────────────────────
export function startAutoSync(intervalMs = 8000) {
  if (_autoTimer) clearInterval(_autoTimer);
  _autoTimer = setInterval(async () => {
    if (!isGithubMode() || _lastSerialized === null) return;
    const cur = JSON.stringify(_serialize());
    if (cur === _lastSerialized) return;
    try {
      await commitToGithub('Auto-sync desde la app');
      console.log('[github] auto-sync OK');
    } catch (e) {
      console.warn('[github] auto-sync falló:', e.message);
    }
  }, intervalMs);
}

export function stopAutoSync() {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
}
