// =====================================================================
// views.js — vistas principales (login, shell, scan, cajas, mov, mas)
// =====================================================================

import { State, Storage } from './state.js';
import { API } from './api.js';
import { ICON, $, escapeHtml, fmtDate, toast } from './utils.js';
import { login, logout, isAdmin, isAdminTienda } from './auth.js';
import { startScanner, stopScanner, isActive as scannerActive } from './scanner.js';
import { render } from './main.js';

// =====================================================================
// LOGIN — con usuario + contraseña
// =====================================================================
export function renderLogin() {
  const wrap = $(`<div class="fullscreen"></div>`);
  const isDemoMode = !State.config.url || !State.config.anonKey;

  wrap.innerHTML = `
    <div class="brand-large">
      <div class="mark">ER</div>
      <h1>Inventario El Rey</h1>
      <p>// piloto · trazabilidad por caja</p>
    </div>

    ${isDemoMode ? `
      <div class="banner banner-warn" style="margin-bottom: 16px; border:1px solid; padding: 12px;">
        ${ICON.warn}
        <span>Estás en <strong>modo demo</strong> con datos simulados.
          <a href="#" id="link-config" style="color:var(--accent); text-decoration:underline;">Conectar Supabase</a>
        </span>
      </div>
    ` : ''}

    <label class="label">Usuario</label>
    <input class="input mono" id="login-user" placeholder="ej. SSEGURA" autocapitalize="characters" autocomplete="username" spellcheck="false" />

    <label class="label" style="margin-top:14px;">Contraseña</label>
    <input class="input" type="password" id="login-pass" placeholder="••••••••" autocomplete="current-password" />

    <div id="login-error" style="color:var(--danger); font-size:13px; margin-top:10px; min-height:18px;"></div>

    <button class="btn btn-primary btn-block" id="btn-login" style="margin-top:8px;">
      ${ICON.lock} Entrar
    </button>

    ${isDemoMode ? `
      <div style="margin-top:20px; padding:12px; background:var(--surface-2); border:1px solid var(--border); font-size:11px; line-height:1.6; color:var(--muted); font-family:var(--font-mono);">
        <div style="color:var(--accent); font-weight:600; margin-bottom:6px;">// USUARIOS DEMO</div>
        SSEGURA / admin123 &nbsp; <span style="color:var(--muted-2);">(admin)</span><br>
        MROJAS / super123 &nbsp; <span style="color:var(--muted-2);">(supervisor)</span><br>
        JMARTINEZ / oper123 &nbsp; <span style="color:var(--muted-2);">(operario)</span><br>
        CCONTADOR / cont123 &nbsp; <span style="color:var(--muted-2);">(contador)</span><br>
        AUDITOR / audit123 &nbsp; <span style="color:var(--muted-2);">(auditor)</span>
      </div>
    ` : ''}

    <button class="btn btn-ghost btn-block" id="btn-config-bottom" style="margin-top:16px;">
      ${ICON.settings} Configurar conexión Supabase
    </button>
  `;

  const userIn = wrap.querySelector('#login-user');
  const passIn = wrap.querySelector('#login-pass');
  const errEl  = wrap.querySelector('#login-error');
  const btn    = wrap.querySelector('#btn-login');

  const submit = async () => {
    errEl.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Verificando…';
    try {
      await login(userIn.value, passIn.value);
      State.view = 'scan';
      render();
    } catch (e) {
      errEl.textContent = e.message;
      btn.disabled = false;
      btn.innerHTML = `${ICON.lock} Entrar`;
    }
  };

  btn.onclick = submit;
  passIn.onkeydown = e => { if (e.key === 'Enter') submit(); };
  userIn.onkeydown = e => { if (e.key === 'Enter') passIn.focus(); };

  wrap.querySelector('#btn-config-bottom').onclick = () => { State.modal = 'config'; render(); };
  wrap.querySelector('#link-config')?.addEventListener('click', e => {
    e.preventDefault(); State.modal = 'config'; render();
  });

  return wrap;
}

// =====================================================================
// SHELL — topbar + main + bottom nav
// =====================================================================
export function renderShell() {
  const wrap = $(`<div style="display:contents;"></div>`);

  const top = $(`
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">ER</div>
        <div>
          <div class="brand-name">Inventario</div>
          <div class="brand-sub">// El Rey · Piloto</div>
        </div>
      </div>
      <div class="user-chip">
        <span class="dot"></span>
        <span>${escapeHtml(State.user.username)}</span>
      </div>
    </header>
  `);
  wrap.appendChild(top);

  const main = $(`<main></main>`);
  if (State.view === 'scan')        main.appendChild(renderScanView());
  else if (State.view === 'buscar') main.appendChild(renderBuscarView());
  else if (State.view === 'cajas')  main.appendChild(renderCajasView());
  else if (State.view === 'mov')    main.appendChild(renderMovView());
  else if (State.view === 'mas')    main.appendChild(renderMasView());
  wrap.appendChild(main);

  const nav = $(`
    <nav class="tabs">
      <button data-v="scan"   class="${State.view==='scan'?'active':''}">${ICON.scan}<span>Escanear</span></button>
      <button data-v="buscar" class="${State.view==='buscar'?'active':''}">${ICON.search}<span>Buscar</span></button>
      <button data-v="cajas"  class="${State.view==='cajas'?'active':''}">${ICON.box}<span>Cajas</span></button>
      <button data-v="mov"    class="${State.view==='mov'?'active':''}">${ICON.list}<span>Mov.</span></button>
      <button data-v="mas"    class="${State.view==='mas'?'active':''}">${ICON.more}<span>Más</span></button>
    </nav>
  `);
  nav.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      if (scannerActive() && b.dataset.v !== 'scan') stopScanner();
      State.view = b.dataset.v;
      render();
    };
  });
  wrap.appendChild(nav);

  return wrap;
}

// =====================================================================
// SCAN VIEW
// =====================================================================
export async function handleCodeScanned(code) {
  const cleaned = (code || '').trim();
  if (!cleaned) return;
  toast('Código leído: ' + cleaned, 'success');
  try {
    const caja = await API.getCajaByCode(cleaned);
    if (!caja) {
      toast('Caja no encontrada en el sistema', 'error');
      render();
      return;
    }
    State.cache.currentBox = caja;
    State.modal = 'box';
    render();
  } catch (e) {
    toast(e.message, 'error');
    render();
  }
}

export function renderScanView() {
  const wrap = $(`<div></div>`);
  wrap.innerHTML = `
    <div class="scan-hero">
      <div class="scan-hero-inner">
        <div class="scan-idle">
          ${ICON.scan}
          <div>
            <h3 style="font-size:15px; margin-bottom:4px;">Listo para escanear</h3>
            <p>Apuntá la cámara al código QR de una caja</p>
          </div>
          <button class="btn btn-primary" id="btn-start-scan">Iniciar cámara</button>
        </div>
      </div>
    </div>

    <div class="scan-input-row">
      <input type="text" class="input mono" id="manual-code" placeholder="O ingresá el código a mano…" autocomplete="off" />
      <button class="btn" id="btn-manual">${ICON.check}</button>
    </div>

    <div class="section" style="padding-top:0; padding-bottom:0;">
      <button class="btn btn-block" id="btn-create-from-scan">
        ${ICON.add} Crear caja nueva
      </button>
    </div>

    <div class="section">
      <div class="section-title">Recientes <small id="rec-count"></small></div>
      <div id="recent-list" class="stack">
        <div class="empty"><div class="loader"></div></div>
      </div>
    </div>
  `;

  const inp = wrap.querySelector('#manual-code');
  const submit = () => {
    const v = inp.value.trim();
    if (v) handleCodeScanned(v);
  };
  wrap.querySelector('#btn-manual').onclick = submit;
  inp.onkeydown = e => { if (e.key === 'Enter') submit(); };

  wrap.querySelector('#btn-start-scan').onclick = () => {
    const hero = document.querySelector('.scan-hero-inner');
    if (hero) {
      hero.innerHTML = '<div id="qr-reader"></div><div class="scan-overlay"><div class="scan-frame"><span></span><span></span><div class="scan-line"></div></div></div>';
    }
    startScanner('qr-reader', handleCodeScanned);
  };

  wrap.querySelector('#btn-create-from-scan').onclick = () => {
    if (scannerActive()) stopScanner();
    State.cache.newBox = null;
    State.modal = 'create';
    render();
  };

  API.listCajas().then(cajas => {
    const list = wrap.querySelector('#recent-list');
    wrap.querySelector('#rec-count').textContent = `${cajas.length} cajas activas`;
    list.innerHTML = '';
    cajas.slice(0, 5).forEach(c => list.appendChild(cajaListItem(c)));
  }).catch(e => {
    wrap.querySelector('#recent-list').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });

  return wrap;
}

// Item de lista de cajas (reusable)
export function cajaListItem(caja) {
  const lowStock = caja.contenido?.some(i => i.cantidad_actual <= 1);
  const item = $(`
    <button class="list-item" style="text-align:left; width:100%;">
      <div class="icon-box">${ICON.box}</div>
      <div class="grow">
        <div class="mono truncate" style="font-size:12px; color:var(--accent);">${escapeHtml(caja.codigo_caja)}</div>
        <div class="meta">
          <span>${escapeHtml(caja.posicion?.ubicacion || 'Sin ubicar')}</span>
          ${caja.posicion?.descripcion ? `<span>${escapeHtml(caja.posicion.descripcion)}</span>` : ''}
          ${lowStock ? '<span class="pill pill-warn">stock bajo</span>' : ''}
        </div>
      </div>
      <div class="qty">
        <div class="qty-big">${caja.unidades_totales}</div>
        <div class="qty-sub">unidades</div>
      </div>
    </button>
  `);
  item.onclick = () => {
    State.cache.currentBox = caja;
    State.modal = 'box';
    render();
  };
  return item;
}

// =====================================================================
// CAJAS VIEW
// =====================================================================
export function renderCajasView() {
  const wrap = $(`<div></div>`);
  if (typeof State.cache.showConsumed !== 'boolean') State.cache.showConsumed = false;

  wrap.innerHTML = `
    <div class="section" style="padding-bottom:0;">
      <div style="display:flex; gap:8px;">
        <div style="position:relative; flex:1;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--muted);">${ICON.search}</span>
          <input class="input mono" id="search-cajas" placeholder="Buscar…" style="padding-left:42px;" />
        </div>
        <button class="btn btn-primary" id="btn-new-caja" style="white-space:nowrap;">
          ${ICON.add} <span style="font-size:13px;">Nueva</span>
        </button>
      </div>
      <div style="display:flex; gap:0; margin-top:10px; border:1px solid var(--border-2);">
        <button class="btn btn-sm ${!State.cache.showConsumed ? 'btn-primary' : 'btn-ghost'}" data-filter="active" style="flex:1; border:0; min-height:36px;">Activas</button>
        <button class="btn btn-sm ${State.cache.showConsumed ? 'btn-primary' : 'btn-ghost'}" data-filter="consumed" style="flex:1; border:0; border-left:1px solid var(--border-2); min-height:36px;">Consumidas</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">${State.cache.showConsumed ? 'Cajas consumidas' : 'Cajas activas'} <small id="cajas-count"></small></div>
      <div id="cajas-list" class="stack">
        <div class="empty"><div class="loader"></div></div>
      </div>
    </div>
  `;

  let allCajas = [];
  const renderList = (filter = '') => {
    const list = wrap.querySelector('#cajas-list');
    const q = filter.toLowerCase().trim();
    const filtered = !q ? allCajas : allCajas.filter(c =>
      c.codigo_caja.toLowerCase().includes(q) ||
      c.posicion?.ubicacion?.toLowerCase().includes(q) ||
      c.posicion?.descripcion?.toLowerCase().includes(q)
    );
    wrap.querySelector('#cajas-count').textContent = `${filtered.length} resultado${filtered.length===1?'':'s'}`;
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = `<div class="empty">${ICON.empty}<h3>${State.cache.showConsumed ? 'Sin cajas consumidas' : 'Sin cajas activas'}</h3><p>${State.cache.showConsumed ? 'Cuando consumas cajas aparecerán acá' : 'Tocá Nueva para crear la primera'}</p></div>`;
      return;
    }
    filtered.forEach(c => list.appendChild(cajaListItem(c)));
  };

  API.listCajas(State.cache.showConsumed).then(cajas => {
    allCajas = State.cache.showConsumed ? cajas.filter(c => c.estado === 'vacia') : cajas;
    renderList();
  }).catch(e => {
    wrap.querySelector('#cajas-list').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });

  wrap.querySelector('#search-cajas').addEventListener('input', e => renderList(e.target.value));
  wrap.querySelectorAll('[data-filter]').forEach(b => {
    b.onclick = () => {
      State.cache.showConsumed = b.dataset.filter === 'consumed';
      render();
    };
  });
  wrap.querySelector('#btn-new-caja').onclick = () => {
    State.cache.newBox = null;
    State.modal = 'create';
    render();
  };

  return wrap;
}

// =====================================================================
// MOVIMIENTOS VIEW
// =====================================================================
export function renderMovView() {
  const wrap = $(`<div></div>`);
  wrap.innerHTML = `
    <div class="section">
      <div class="section-title">Últimos movimientos <small id="mov-count"></small></div>
      <div id="mov-list" class="stack">
        <div class="empty"><div class="loader"></div></div>
      </div>
    </div>
  `;
  API.listMovimientos(50).then(movs => {
    const list = wrap.querySelector('#mov-list');
    wrap.querySelector('#mov-count').textContent = `${movs.length} eventos`;
    list.innerHTML = '';
    if (!movs.length) {
      list.innerHTML = `<div class="empty">${ICON.empty}<h3>Sin movimientos</h3><p>Todavía no hay actividad</p></div>`;
      return;
    }
    movs.forEach(m => list.appendChild(movListItem(m)));
  }).catch(e => {
    wrap.querySelector('#mov-list').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });
  return wrap;
}

function movListItem(m) {
  const cls = m.tipo === 'reducir' ? 'reducir'
            : m.tipo === 'aumentar' ? 'aumentar'
            : m.tipo === 'crear_caja' ? 'crear'
            : m.tipo === 'trasladar_caja' ? 'trasladar' : '';
  const icon = m.tipo === 'reducir' ? ICON.minus
            : m.tipo === 'aumentar' ? ICON.plus
            : m.tipo === 'crear_caja' ? ICON.box
            : m.tipo === 'trasladar_caja' ? ICON.move
            : ICON.list;
  const verb = m.tipo === 'reducir' ? 'Salida'
            : m.tipo === 'aumentar' ? 'Reposición'
            : m.tipo === 'crear_caja' ? 'Caja creada'
            : m.tipo === 'trasladar_caja' ? 'Traslado'
            : m.tipo;
  const detalle = m.articulo
    ? `${m.cantidad ?? ''} × ${escapeHtml(m.articulo.descripcion)}`
    : (m.motivo || '');
  return $(`
    <div class="list-item">
      <div class="icon-box">
        <span class="mov-icon-${cls}" style="display:flex;">${icon}</span>
      </div>
      <div class="grow">
        <div style="font-weight:500; font-size:13px;">
          ${verb} <span style="color:var(--muted); font-weight:400;">${detalle ? '· ' + detalle : ''}</span>
        </div>
        <div class="meta">
          <span class="mono">${escapeHtml(m.caja?.codigo_caja || '—').slice(-12)}</span>
          <span>${escapeHtml(m.usuario?.nombre || m.usuario?.username || '—')}</span>
          ${m.motivo ? `<span>${escapeHtml(m.motivo)}</span>` : ''}
        </div>
      </div>
      <div class="qty qty-sub">${fmtDate(m.creado_at)}</div>
    </div>
  `);
}

// =====================================================================
// MÁS — admin ve panel completo, el resto ve vista simple
// =====================================================================
export function renderMasView() {
  if (isAdmin())       return renderAdminMasView();
  if (isAdminTienda()) return renderAdminTiendaMasView();
  return renderUserMasView();
}

function renderUserMasView() {
  const wrap = $(`<div></div>`);
  const demo = !State.config.url || !State.config.anonKey;

  wrap.innerHTML = `
    <div class="section">
      <div class="section-title">Sesión</div>
      <div class="card">
        <div style="font-weight:600;">${escapeHtml(State.user.nombre)}</div>
        <div class="meta mono" style="font-size:12px; color:var(--muted); margin-top:4px;">
          ${escapeHtml(State.user.username)} · ${escapeHtml(State.user.rol)}
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Conexión</div>
      <button class="setting-row" id="cfg-sup" style="width:100%; text-align:left;">
        ${ICON.database}
        <div class="grow">
          <div style="font-weight:500;">Supabase</div>
          <div class="meta mono" style="font-size:11px;">
            ${demo ? 'Modo demo · sin conexión' : 'Conectado · ' + State.config.url.replace(/^https?:\/\//, '')}
          </div>
        </div>
        <span class="pill pill-${demo ? 'warn' : 'success'}">${demo ? 'demo' : 'live'}</span>
      </button>
    </div>
    <div class="section">
      <div class="section-title">Equipo</div>
      <div id="team-list" class="stack"><div class="empty"><div class="loader"></div></div></div>
    </div>
    <div class="section">
      <button class="btn btn-danger btn-block" id="btn-logout">${ICON.logout} Cerrar sesión</button>
    </div>
    <div class="section" style="text-align:center; color:var(--muted); font-size:11px; padding-top:16px;">
      <div class="mono">// inventario el rey · v0.3.0</div>
    </div>
  `;

  wrap.querySelector('#cfg-sup').onclick    = () => { State.modal = 'config'; render(); };
  wrap.querySelector('#btn-logout').onclick = () => { if (!confirm('¿Cerrar sesión?')) return; logout(); render(); };

  API.listUsers().then(users => {
    const list = wrap.querySelector('#team-list');
    list.innerHTML = '';
    users.forEach(u => list.appendChild($(`
      <div class="list-item">
        <div class="icon-box">${ICON.user}</div>
        <div class="grow">
          <div style="font-weight:500;">${escapeHtml(u.nombre)}</div>
          <div class="meta"><span class="mono">${escapeHtml(u.username)}</span></div>
        </div>
        <span class="pill pill-${rolColor(u.rol)}">${rolLabel(u.rol)}</span>
      </div>
    `)));
  }).catch(() => {});

  return wrap;
}

function renderAdminMasView() {
  const wrap = $(`<div></div>`);
  const demo = !State.config.url || !State.config.anonKey;

  wrap.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-header-title">${ICON.shield} Panel de administración</div>
        <div class="admin-header-sub">${escapeHtml(State.user.nombre)} · ${escapeHtml(State.user.username)}</div>
      </div>
      ${demo ? '<span class="pill pill-warn">demo</span>' : '<span class="pill pill-success">live</span>'}
    </div>

    <div class="section">
      <div class="section-title">Resumen general</div>
      <div class="kpi-grid" id="kpi-grid">
        <div class="kpi-card" style="grid-column:1/-1; justify-content:center;">
          <div class="loader"></div>
        </div>
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-title">Módulos</div>
      <div class="admin-modules">
        <button class="admin-module" id="mod-articulos">
          ${ICON.package}
          <span>Artículos</span>
          <small>Catálogo de productos</small>
        </button>
        <button class="admin-module" id="mod-tiendas">
          ${ICON.pin}
          <span>Tiendas</span>
          <small>Sucursales y stock</small>
        </button>
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-title">
        Usuarios <span class="pill pill-warn" style="margin-left:6px;">${ICON.shield} admin</span>
      </div>
      <button class="btn btn-primary btn-block" id="btn-new-user" style="margin-bottom:8px;">
        ${ICON.add} Crear usuario nuevo
      </button>
      <div id="admin-users" class="stack">
        <div class="empty"><div class="loader"></div></div>
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-title">Sistema</div>
      <button class="setting-row" id="cfg-supabase" style="width:100%; text-align:left; margin-bottom:4px;">
        ${ICON.database}
        <div class="grow">
          <div style="font-weight:500;">Supabase</div>
          <div class="meta mono" style="font-size:11px;">
            ${demo ? 'Modo demo · sin conexión real' : 'Conectado · ' + State.config.url.replace(/^https?:\/\//, '')}
          </div>
        </div>
        <span class="pill pill-${demo ? 'warn' : 'success'}">${demo ? 'demo' : 'live'}</span>
      </button>
      <button class="btn btn-danger btn-block" id="btn-logout" style="margin-top:8px;">
        ${ICON.logout} Cerrar sesión
      </button>
    </div>

    <div class="section" style="text-align:center; color:var(--muted); font-size:11px; padding-top:16px;">
      <div class="mono">// inventario el rey · v0.3.0</div>
      <div style="margin-top:4px;">Piloto interno · panel admin</div>
    </div>
  `;

  // KPIs — carga asíncrona
  const hoy = new Date().toDateString();
  Promise.all([
    API.listCajas(false),
    API.listCajas(true),
    API.listMovimientos(300),
    API.listUsers(false),
    API.listArticulos()
  ]).then(([activas, todas, movs, usuarios, arts]) => {
    const totalUnidades = activas.reduce((s, c) => s + (c.unidades_totales || 0), 0);
    const stockBajo     = activas.filter(c => (c.unidades_totales || 0) <= 5).length;
    const movsHoy       = movs.filter(m => new Date(m.creado_at).toDateString() === hoy).length;
    const consumidas    = todas.filter(c => c.estado === 'vacia').length;
    wrap.querySelector('#kpi-grid').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-val">${activas.length}</div>
        <div class="kpi-label">Cajas activas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${totalUnidades}</div>
        <div class="kpi-label">Unidades totales</div>
      </div>
      <div class="kpi-card ${stockBajo > 0 ? 'kpi-warn' : ''}">
        <div class="kpi-val">${stockBajo}</div>
        <div class="kpi-label">Stock bajo</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${movsHoy}</div>
        <div class="kpi-label">Movimientos hoy</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${usuarios.length}</div>
        <div class="kpi-label">Usuarios activos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${arts.length}</div>
        <div class="kpi-label">Artículos</div>
      </div>
    `;
  }).catch(() => {
    wrap.querySelector('#kpi-grid').innerHTML =
      `<div class="kpi-card" style="grid-column:1/-1;"><div class="kpi-label">Error al cargar estadísticas</div></div>`;
  });

  // Lista de usuarios
  API.listUsers(true).then(users => {
    const list = wrap.querySelector('#admin-users');
    list.innerHTML = '';
    users.forEach(u => list.appendChild(adminUserItem(u)));
  }).catch(e => {
    wrap.querySelector('#admin-users').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });

  wrap.querySelector('#mod-articulos').onclick  = () => { State.modal = 'articulos';  render(); };
  wrap.querySelector('#mod-tiendas').onclick     = () => { State.modal = 'tiendas';    render(); };
  wrap.querySelector('#btn-new-user').onclick    = () => { State.cache.editingUser = null; State.modal = 'createUser'; render(); };
  wrap.querySelector('#cfg-supabase').onclick    = () => { State.modal = 'config';     render(); };
  wrap.querySelector('#btn-logout').onclick      = () => { if (!confirm('¿Cerrar sesión?')) return; logout(); render(); };

  return wrap;
}

// =====================================================================
// MÁS — vista Admin Tienda: dashboard de su tienda + gestión de usuarios
// =====================================================================
function renderAdminTiendaMasView() {
  const wrap = $(`<div></div>`);
  const myTiendaId = State.user.tienda_id;

  wrap.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-header-title">${ICON.shield} <span id="at-tienda-nombre">Mi tienda</span></div>
        <div class="admin-header-sub">${escapeHtml(State.user.nombre)} · ${escapeHtml(State.user.username)}</div>
      </div>
      <span class="pill pill-accent">Admi Tienda</span>
    </div>

    <div class="section">
      <div class="section-title">Resumen de tu tienda</div>
      <div class="kpi-grid" id="at-kpi-grid">
        <div class="kpi-card" style="grid-column:1/-1; text-align:center;">
          <div class="loader"></div>
        </div>
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-title">Usuarios de tu tienda</div>
      <div id="at-users" class="stack">
        <div class="empty"><div class="loader"></div></div>
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-title">Sesión</div>
      <div class="setting-row" style="pointer-events:none;">
        ${ICON.user}
        <div class="grow">
          <div style="font-weight:500;">${escapeHtml(State.user.nombre)}</div>
          <div class="meta mono" style="font-size:11px;">${escapeHtml(State.user.username)} · Admi Tienda</div>
        </div>
      </div>
      <button class="btn btn-danger btn-block" id="at-logout" style="margin-top:8px;">
        ${ICON.logout} Cerrar sesión
      </button>
    </div>
  `;

  // Nombre de la tienda
  API.listTiendas().then(tiendas => {
    const t = tiendas.find(x => x.id === myTiendaId);
    if (t) wrap.querySelector('#at-tienda-nombre').textContent = t.nombre;
  });

  // KPIs filtrados por tienda
  const hoy = new Date().toDateString();
  Promise.all([
    API.listCajas(false),
    API.listCajas(true),
    API.listMovimientos(500),
    API.listUsers(false)
  ]).then(([activas, todas, movs, usuarios]) => {
    const inTienda = c => (c.tienda_id === myTiendaId) || (c.posicion?.tienda_id === myTiendaId);
    const misActivas   = activas.filter(inTienda);
    const misConsumed  = todas.filter(c => inTienda(c) && c.estado === 'vacia');
    const totalUnid    = misActivas.reduce((s, c) => s + (c.unidades_totales || 0), 0);
    const stockBajo    = misActivas.filter(c => (c.unidades_totales || 0) <= 5).length;
    const misMovsHoy   = movs.filter(m => {
      const caja = activas.find(c => c.id === m.caja_id) || todas.find(c => c.id === m.caja_id);
      return caja && inTienda(caja) && new Date(m.creado_at).toDateString() === hoy;
    }).length;
    const misUsuarios  = usuarios.filter(u => u.tienda_id === myTiendaId).length;

    wrap.querySelector('#at-kpi-grid').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-val">${misActivas.length}</div>
        <div class="kpi-label">Cajas activas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${totalUnid}</div>
        <div class="kpi-label">Unidades</div>
      </div>
      <div class="kpi-card ${stockBajo > 0 ? 'kpi-warn' : ''}">
        <div class="kpi-val">${stockBajo}</div>
        <div class="kpi-label">Stock bajo</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${misMovsHoy}</div>
        <div class="kpi-label">Mov. hoy</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${misUsuarios}</div>
        <div class="kpi-label">Usuarios</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${misConsumed.length}</div>
        <div class="kpi-label">Cajas vacías</div>
      </div>
    `;
  }).catch(() => {
    wrap.querySelector('#at-kpi-grid').innerHTML =
      `<div class="kpi-card" style="grid-column:1/-1;"><div class="kpi-label">Error al cargar estadísticas</div></div>`;
  });

  // Lista de usuarios (supervisores + operarios + contadores + auditores de la tienda)
  API.listUsers(true).then(users => {
    const list = wrap.querySelector('#at-users');
    const filtered = users.filter(u =>
      u.tienda_id === myTiendaId &&
      u.id !== State.user.id &&
      u.rol !== 'admin' &&
      u.rol !== 'admin_tienda'
    );
    list.innerHTML = '';
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty"><h3>Sin usuarios</h3><p>No hay usuarios en tu tienda para gestionar.</p></div>`;
      return;
    }
    filtered.forEach(u => list.appendChild(adminUserItem(u)));
  }).catch(e => {
    wrap.querySelector('#at-users').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });

  wrap.querySelector('#at-logout').onclick = () => {
    if (!confirm('¿Cerrar sesión?')) return;
    logout(); render();
  };

  return wrap;
}

function rolLabel(rol) {
  const map = {
    admin: 'Master', admin_tienda: 'Admi Tienda',
    supervisor: 'Supervisor', operario: 'Operario',
    contador: 'Contador', auditor: 'Auditor'
  };
  return map[rol] || rol;
}

function rolColor(rol) {
  return rol === 'admin' ? 'warn'
       : rol === 'admin_tienda' ? 'accent'
       : rol === 'supervisor' ? 'info'
       : rol === 'auditor' ? 'danger'
       : rol === 'contador' ? 'success'
       : 'muted';
}

function adminUserItem(u) {
  const item = $(`
    <button class="list-item" style="text-align:left; width:100%; ${u.activo ? '' : 'opacity:0.5;'}">
      <div class="icon-box">${ICON.user}</div>
      <div class="grow">
        <div style="font-weight:500;">${escapeHtml(u.nombre)} ${!u.activo ? '<span style="color:var(--muted); font-weight:400; font-size:11px;">(inactivo)</span>' : ''}</div>
        <div class="meta">
          <span class="mono">${escapeHtml(u.username)}</span>
          <span>${escapeHtml(u.email || '—')}</span>
        </div>
      </div>
      <span class="pill pill-${rolColor(u.rol)}">${rolLabel(u.rol)}</span>
    </button>
  `);
  item.onclick = () => {
    State.cache.editingUser = u;
    State.modal = 'editUser';
    render();
  };
  return item;
}

// =====================================================================
// BUSCAR PRODUCTOS — vista de búsqueda por SKU/descripción/código de barras
// =====================================================================
export function renderBuscarView() {
  const wrap = $(`<div></div>`);

  // Estado local de la vista (persistido en cache para mantener al cambiar pestañas)
  if (!State.cache.buscar) {
    State.cache.buscar = {
      query: '',
      selected: null,        // artículo seleccionado
      cajas: null,           // cajas que lo contienen
      showConsumed: false    // toggle de filtro
    };
  }
  const bs = State.cache.buscar;

  wrap.innerHTML = `
    <div class="section" style="padding-bottom:8px;">
      <div style="display:flex; gap:8px;">
        <div style="position:relative; flex:1;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--muted);">${ICON.search}</span>
          <input class="input mono" id="buscar-input" placeholder="Producto, SKU o código de barras…"
            value="${escapeHtml(bs.query)}" style="padding-left:42px;" autocomplete="off" />
        </div>
        <button class="btn" id="btn-scan-buscar" title="Escanear código de barras">${ICON.barcode}</button>
      </div>
      <div style="font-size:11px; color:var(--muted); margin-top:6px; font-family:var(--font-mono);">
        // tip: tocá un producto para ver en qué cajas está
      </div>
    </div>

    <div id="buscar-content" class="section" style="padding-top:0;">
      <div class="empty" style="padding:30px 16px;">
        ${ICON.package}
        <h3 style="margin-top:8px;">Buscá un producto</h3>
        <p>Encontrá en qué cajas está y cuántas unidades hay disponibles</p>
      </div>
    </div>
  `;

  const input = wrap.querySelector('#buscar-input');
  const content = wrap.querySelector('#buscar-content');

  // Si ya hay un artículo seleccionado en cache, mostrarlo
  if (bs.selected && bs.cajas) {
    content.innerHTML = '';
    content.appendChild(renderProductoDetalle(bs.selected, bs.cajas));
  } else if (bs.query) {
    // Re-ejecutar búsqueda si había query
    runSearch(bs.query, content);
  }

  // Búsqueda con debounce
  let searchTimer = null;
  input.addEventListener('input', e => {
    bs.query = e.target.value;
    bs.selected = null;
    bs.cajas = null;
    clearTimeout(searchTimer);
    if (!bs.query.trim()) {
      content.innerHTML = `
        <div class="empty" style="padding:30px 16px;">
          ${ICON.package}
          <h3 style="margin-top:8px;">Buscá un producto</h3>
          <p>Encontrá en qué cajas está y cuántas unidades hay disponibles</p>
        </div>
      `;
      return;
    }
    content.innerHTML = `<div class="empty"><div class="loader"></div></div>`;
    searchTimer = setTimeout(() => runSearch(bs.query, content), 250);
  });

  wrap.querySelector('#btn-scan-buscar').onclick = () => {
    State.cache.buscar.scanMode = true;
    State.modal = 'scanForSearch';
    render();
  };

  return wrap;
}

// Ejecuta la búsqueda y pinta resultados
async function runSearch(query, container) {
  try {
    const articulos = await API.searchArticulos(query);
    container.innerHTML = '';
    if (!articulos.length) {
      container.innerHTML = `
        <div class="empty" style="padding:30px 16px;">
          ${ICON.empty}
          <h3>Sin resultados</h3>
          <p>No encontré productos para "${escapeHtml(query)}"</p>
        </div>
      `;
      return;
    }
    const list = $(`<div class="stack"></div>`);
    articulos.forEach(a => list.appendChild(productoListItem(a)));
    container.appendChild(list);
  } catch (e) {
    container.innerHTML = `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// Item de lista de producto (resultado de búsqueda)
function productoListItem(art) {
  const item = $(`
    <button class="list-item" style="text-align:left; width:100%;">
      <div class="icon-box">${ICON.package}</div>
      <div class="grow">
        <div style="font-weight:500; font-size:13px;">${escapeHtml(art.descripcion)}</div>
        <div class="meta">
          <span class="mono">${escapeHtml(art.sku || '—')}</span>
          ${art.familia ? `<span>${escapeHtml(art.familia)}</span>` : ''}
          ${art.unidades_por_caja ? `<span>${art.unidades_por_caja}/caja</span>` : ''}
        </div>
      </div>
      <div style="color:var(--muted);">›</div>
    </button>
  `);
  item.onclick = async () => {
    State.cache.buscar.selected = art;
    try {
      State.cache.buscar.cajas = await API.findCajasConArticulo(art.id, true);
      render();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };
  return item;
}

// Detalle de producto con todas sus cajas
function renderProductoDetalle(art, cajas) {
  const wrap = $(`<div></div>`);
  const bs = State.cache.buscar;

  // Filtrar según toggle
  const cajasFiltered = bs.showConsumed
    ? cajas
    : cajas.filter(c => c.estado !== 'vacia');

  const totalActivo = cajas
    .filter(c => c.estado !== 'vacia')
    .reduce((s, c) => s + (c.cantidad_actual || 0), 0);

  const cajasActivas = cajas.filter(c => c.estado !== 'vacia').length;
  const cajasConsumidas = cajas.filter(c => c.estado === 'vacia').length;

  wrap.innerHTML = `
    <button class="btn btn-sm btn-ghost" id="back-to-search" style="margin-bottom:12px;">
      ← Volver a resultados
    </button>

    <div class="box-header" style="margin-bottom:14px;">
      <div style="font-weight:600; font-size:15px; margin-bottom:4px;">${escapeHtml(art.descripcion)}</div>
      <div class="meta mono" style="font-size:11px; color:var(--muted);">
        <span>${escapeHtml(art.sku || '—')}</span>
        ${art.codigo_barras ? `<span>${escapeHtml(art.codigo_barras)}</span>` : ''}
        ${art.familia ? `<span>${escapeHtml(art.familia)}</span>` : ''}
      </div>
      <div style="margin-top:14px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center;">
        <div style="padding:10px; background:var(--surface-2); border:1px solid var(--border);">
          <div style="font-size:20px; font-weight:700; color:var(--accent); font-family:var(--font-mono);">${totalActivo}</div>
          <div style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">Disponible</div>
        </div>
        <div style="padding:10px; background:var(--surface-2); border:1px solid var(--border);">
          <div style="font-size:20px; font-weight:700; font-family:var(--font-mono);">${cajasActivas}</div>
          <div style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">Cajas activas</div>
        </div>
        <div style="padding:10px; background:var(--surface-2); border:1px solid var(--border);">
          <div style="font-size:20px; font-weight:700; color:var(--muted); font-family:var(--font-mono);">${cajasConsumidas}</div>
          <div style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">Consumidas</div>
        </div>
      </div>
    </div>

    ${cajasConsumidas > 0 ? `
      <div style="display:flex; gap:0; margin-bottom:12px; border:1px solid var(--border-2);">
        <button class="btn btn-sm ${!bs.showConsumed ? 'btn-primary' : 'btn-ghost'}" data-toggle="active" style="flex:1; border:0; min-height:34px; font-size:12px;">Activas (${cajasActivas})</button>
        <button class="btn btn-sm ${bs.showConsumed ? 'btn-primary' : 'btn-ghost'}" data-toggle="all" style="flex:1; border:0; border-left:1px solid var(--border-2); min-height:34px; font-size:12px;">Todas (${cajas.length})</button>
      </div>
    ` : ''}

    <div class="section-title" style="padding:0 0 8px;">
      ${bs.showConsumed ? 'Todas las cajas' : 'Cajas con stock'}
      <small>${cajasFiltered.length} resultado${cajasFiltered.length===1?'':'s'}</small>
    </div>

    <div id="cajas-de-producto" class="stack"></div>
  `;

  const list = wrap.querySelector('#cajas-de-producto');
  if (!cajasFiltered.length) {
    list.innerHTML = `
      <div class="empty" style="padding:24px 16px;">
        ${ICON.empty}
        <p>${bs.showConsumed ? 'Este producto no tiene cajas registradas' : 'No hay cajas activas con este producto'}</p>
      </div>
    `;
  } else {
    cajasFiltered.forEach(c => list.appendChild(cajaConProductoItem(c)));
  }

  wrap.querySelector('#back-to-search').onclick = () => {
    State.cache.buscar.selected = null;
    State.cache.buscar.cajas = null;
    render();
  };

  wrap.querySelectorAll('[data-toggle]').forEach(b => {
    b.onclick = () => {
      bs.showConsumed = b.dataset.toggle === 'all';
      render();
    };
  });

  return wrap;
}

// Item de caja con info del artículo destacada (cantidad de ESE producto en la caja)
function cajaConProductoItem(caja) {
  const isConsumed = caja.estado === 'vacia';
  const lowStock = !isConsumed && caja.cantidad_actual <= 1;
  const consumida = caja.cantidad_inicial - caja.cantidad_actual;
  const item = $(`
    <button class="list-item" style="text-align:left; width:100%; ${isConsumed ? 'opacity:0.55;' : ''}">
      <div class="icon-box">${ICON.box}</div>
      <div class="grow">
        <div class="mono truncate" style="font-size:12px; color:var(--accent);">${escapeHtml(caja.codigo_caja)}</div>
        <div class="meta">
          <span>${escapeHtml(caja.posicion?.ubicacion || 'Sin ubicar')}</span>
          ${caja.posicion?.descripcion ? `<span>${escapeHtml(caja.posicion.descripcion)}</span>` : ''}
          ${isConsumed ? '<span class="pill pill-muted">consumida</span>' : ''}
          ${lowStock ? '<span class="pill pill-warn">stock bajo</span>' : ''}
        </div>
      </div>
      <div class="qty">
        <div class="qty-big" style="${isConsumed ? 'color:var(--muted);' : ''}">${caja.cantidad_actual}</div>
        <div class="qty-sub">de ${caja.cantidad_inicial}${consumida > 0 && !isConsumed ? ' · -' + consumida : ''}</div>
      </div>
    </button>
  `);
  item.onclick = () => {
    State.cache.currentBox = caja;
    State.modal = 'box';
    render();
  };
  return item;
}
