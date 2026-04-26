// =====================================================================
// views.js — vistas principales (login, shell, scan, cajas, mov, mas)
// =====================================================================

import { State, Storage } from './state.js';
import { API } from './api.js';
import { ICON, $, escapeHtml, fmtDate, toast, feedback } from './utils.js';
import { login, logout, isAdmin, isAdminTienda, canExport } from './auth.js';
import { getPendingCount } from './queue.js';
import { startScanner, stopScanner, isActive as scannerActive } from './scanner.js';
import { render, resetInactivityTimer } from './main.js';
import { getAuditLog, clearAuditLog, AUDIT_TIPO } from './audit.js';

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

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const top = $(`
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">ER</div>
        <div>
          <div class="brand-name">Inventario</div>
          <div class="brand-sub">// El Rey · Piloto</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button id="btn-theme" class="btn-theme" title="${isDark ? 'Modo claro' : 'Modo oscuro'}">${isDark ? ICON.sun : ICON.moon}</button>
        <div class="user-chip">
          <span class="dot"></span>
          <span>${escapeHtml(State.user.username)}</span>
        </div>
        <button id="btn-logout-top" class="btn-logout-top" title="Cerrar sesión">${ICON.logout}</button>
      </div>
    </header>
  `);
  wrap.appendChild(top);

  top.querySelector('#btn-theme').onclick = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const metaTheme = document.getElementById('meta-theme-color');
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('elrey_theme', 'light');
      if (metaTheme) metaTheme.content = '#f0f2f5';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('elrey_theme', 'dark');
      if (metaTheme) metaTheme.content = '#0f172a';
    }
    render();
  };

  top.querySelector('#btn-logout-top').onclick = () => {
    if (!confirm('¿Cerrar sesión?')) return;
    logout();
    render();
  };

  // Admin Master solo ve vistas administrativas
  const adminOnly = isAdmin();
  if (adminOnly && State.view !== 'mov' && State.view !== 'mas') {
    State.view = 'mas';
  }

  const main = $(`<main></main>`);
  if (!adminOnly && State.view === 'scan')        main.appendChild(renderScanView());
  else if (!adminOnly && State.view === 'buscar') main.appendChild(renderBuscarView());
  else if (!adminOnly && State.view === 'cajas')  main.appendChild(renderCajasView());
  else if (!adminOnly && State.view === 'perfil') main.appendChild(renderPerfilView());
  else if (State.view === 'mov')                  main.appendChild(renderMovView());
  else if (State.view === 'mas')                  main.appendChild(renderMasView());
  wrap.appendChild(main);

  const pending = getPendingCount();
  const nav = adminOnly
    ? $(`
      <nav class="tabs">
        <button data-v="mov"    class="${State.view==='mov'?'active':''}">${ICON.list}<span>Movimientos</span>${pending > 0 ? `<span class="nav-badge">${pending}</span>` : ''}</button>
        <button data-v="mas"    class="${State.view==='mas'?'active':''}">${ICON.shield}<span>Admin</span></button>
        <button class="nav-logout" id="nav-logout-btn">${ICON.logout}<span>Cerrar sesión</span></button>
      </nav>
    `)
    : $(`
      <nav class="tabs">
        <button data-v="scan"   class="${State.view==='scan'  ?'active':''}">${ICON.scan}<span>Escanear</span></button>
        <button data-v="buscar" class="${State.view==='buscar' ?'active':''}">${ICON.search}<span>Buscar</span></button>
        <button data-v="cajas"  class="${State.view==='cajas'  ?'active':''}">${ICON.box}<span>Cajas</span></button>
        <button data-v="mov"    class="${State.view==='mov'    ?'active':''}">${ICON.list}<span>Mov.</span>${pending > 0 ? `<span class="nav-badge">${pending}</span>` : ''}</button>
        <button data-v="perfil" class="${State.view==='perfil' ?'active':''}">${ICON.user}<span>Perfil</span></button>
        <button class="nav-logout" id="nav-logout-btn">${ICON.logout}<span>Cerrar sesión</span></button>
      </nav>
    `);
  nav.querySelectorAll('button[data-v]').forEach(b => {
    b.onclick = () => {
      if (scannerActive() && b.dataset.v !== 'scan') stopScanner();
      State.view = b.dataset.v;
      render();
    };
  });

  nav.querySelector('#nav-logout-btn').onclick = () => {
    if (!confirm('¿Cerrar sesión?')) return;
    logout();
    render();
  };

  // Badge de alertas stock en pestaña Más (async, no bloquea render)
  API.getLowStockAlerts(State.config.stockMinimo ?? 10).then(alerts => {
    if (alerts.length > 0) {
      const masBtn = nav.querySelector('[data-v="mas"]');
      if (masBtn && !masBtn.querySelector('.nav-badge-warn')) {
        const b = document.createElement('span');
        b.className = 'nav-badge nav-badge-warn';
        b.textContent = alerts.length;
        masBtn.appendChild(b);
      }
    }
  }).catch(() => {});

  wrap.appendChild(nav);

  return wrap;
}

// =====================================================================
// SCAN VIEW
// =====================================================================
export async function handleCodeScanned(code) {
  const cleaned = (code || '').trim();
  if (!cleaned) return;
  try {
    const caja = await API.getCajaByCode(cleaned);
    if (!caja) {
      feedback('error');
      toast('Caja no encontrada en el sistema', 'error');
      render();
      return;
    }
    State.cache.currentBox = caja;
    State.modal = 'box';
    render();
  } catch (e) {
    feedback('error');
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
// EXCEL EXPORT
// =====================================================================
function exportToExcel(movs) {
  if (!movs || !movs.length) return;
  if (!window.XLSX) { toast('SheetJS no cargó — verificá tu conexión', 'error'); return; }

  const toCR = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    // UTC-6 for Costa Rica
    const cr = new Date(d.getTime() - 6 * 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${cr.getUTCFullYear()}-${pad(cr.getUTCMonth()+1)}-${pad(cr.getUTCDate())} ${pad(cr.getUTCHours())}:${pad(cr.getUTCMinutes())}`;
  };

  const tipoLabel = t =>
    t === 'reducir' ? 'Salida'
    : t === 'aumentar' ? 'Entrada'
    : t === 'crear_caja' ? 'Crear caja'
    : t === 'trasladar_caja' ? 'Traslado'
    : t || '';

  const rows = movs.map(m => ({
    'Fecha/Hora (CR)': toCR(m.creado_at),
    'Tipo':            tipoLabel(m.tipo),
    'Caja':            m.caja?.codigo || m.caja_id || '',
    'SKU':             m.articulo?.sku || '',
    'Artículo':        m.articulo?.nombre || '',
    'Cantidad':        m.cantidad ?? '',
    'Usuario':         m.usuario?.username || '',
    'Motivo':          m.motivo || '',
    'Notas':           m.notas || ''
  }));

  const ws = window.XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 28 }, { wch: 9  }, { wch: 14 }, { wch: 18 }, { wch: 22 }
  ];

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fname = `movimientos_${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}.xlsx`;
  window.XLSX.writeFile(wb, fname);
  toast(`Exportado: ${fname}`, 'success');
}

// =====================================================================
// MOVIMIENTOS VIEW
// =====================================================================
export function renderMovView() {
  const soloMios = State.user?.rol === 'operario';
  if (!soloMios && !State.cache.movFilter) State.cache.movFilter = 'all';
  const hoy = new Date().toDateString();
  const wrap = $(`<div></div>`);

  wrap.innerHTML = `
    <div class="section" style="padding-bottom:8px;">
      <div style="display:flex; align-items:center; gap:6px;">
        ${soloMios ? '' : `
        <div class="mov-filter-bar" style="flex:1;">
          <button class="mov-filter-btn ${State.cache.movFilter === 'all' ? 'active' : ''}" data-f="all">
            ${ICON.list} Todos
          </button>
          <button class="mov-filter-btn ${State.cache.movFilter === 'mine' ? 'active' : ''}" data-f="mine">
            ${ICON.user} Mis movimientos hoy
          </button>
        </div>
        `}
        ${canExport() ? `
          <button class="btn btn-excel" id="btn-export" title="Exportar a Excel" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2.5M13.5 13H16M8 17h2.5M13.5 17H16M10.5 13v4"/></svg>
            Excel
          </button>
        ` : ''}
      </div>
    </div>
    <div class="section" style="padding-top:0;">
      <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span id="mov-title">${soloMios ? 'Mis movimientos' : 'Cargando…'}</span>
        <small id="mov-count" style="font-weight:400; color:var(--muted); font-size:10px;"></small>
      </div>
      <div id="mov-summary" style="display:none; margin-bottom:10px;"></div>
      <div id="mov-list" class="stack">
        <div class="empty"><div class="loader"></div></div>
      </div>
    </div>
  `;

  let allMovs = [];
  let currentFiltered = [];

  function applyFilter() {
    const f = soloMios ? 'mine' : State.cache.movFilter;
    const filtered = f === 'mine'
      ? allMovs.filter(m =>
          (soloMios || new Date(m.creado_at).toDateString() === hoy) &&
          (m.usuario_id === State.user.id || m.usuario?.username === State.user.username)
        )
      : allMovs;

    if (!soloMios) {
      wrap.querySelector('#mov-title').textContent =
        f === 'mine' ? 'Mis movimientos de hoy' : 'Últimos movimientos';
    }
    wrap.querySelector('#mov-count').textContent = `${filtered.length} eventos`;

    const summary = wrap.querySelector('#mov-summary');
    if (f === 'mine' && filtered.length > 0) {
      const salidas  = filtered.filter(m => m.tipo === 'reducir').reduce((s, m) => s + (m.cantidad || 0), 0);
      const entradas = filtered.filter(m => m.tipo === 'aumentar').reduce((s, m) => s + (m.cantidad || 0), 0);
      const cajas    = filtered.filter(m => m.tipo === 'crear_caja').length;
      summary.style.display = 'flex';
      summary.innerHTML = `
        <div class="mov-summary-bar">
          <div class="mov-summary-item"><span class="mov-summary-val" style="color:var(--danger);">${salidas}</span><span class="mov-summary-lbl">salidas</span></div>
          <div class="mov-summary-item"><span class="mov-summary-val" style="color:var(--success);">${entradas}</span><span class="mov-summary-lbl">entradas</span></div>
          <div class="mov-summary-item"><span class="mov-summary-val" style="color:var(--accent);">${cajas}</span><span class="mov-summary-lbl">cajas</span></div>
        </div>
      `;
    } else {
      summary.style.display = 'none';
    }

    currentFiltered = filtered;
    const btnExport = wrap.querySelector('#btn-export');
    if (btnExport) btnExport.disabled = filtered.length === 0;

    const list = wrap.querySelector('#mov-list');
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = `<div class="empty">${ICON.empty}<h3>Sin movimientos</h3><p>No tenés movimientos registrados</p></div>`;
      return;
    }
    filtered.forEach(m => list.appendChild(movListItem(m)));
  }

  const btnExport = wrap.querySelector('#btn-export');
  if (btnExport) btnExport.onclick = () => exportToExcel(currentFiltered);

  wrap.querySelectorAll('.mov-filter-btn').forEach(btn => {
    btn.onclick = () => {
      State.cache.movFilter = btn.dataset.f;
      wrap.querySelectorAll('.mov-filter-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.f === State.cache.movFilter)
      );
      applyFilter();
    };
  });

  API.listMovimientos(200).then(movs => {
    allMovs = movs;
    applyFilter();
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

function renderPerfilView() {
  const u    = State.user;
  const demo = !State.config.url || !State.config.anonKey;
  const initial = (u.nombre || u.username || '?').charAt(0).toUpperCase();

  const tiendaNombre = (() => {
    try {
      const { MOCK } = window._MOCK || {};
      return null; // se resuelve async abajo
    } catch (_) { return null; }
  })();

  const wrap = $(`<div class="perfil-wrap"></div>`);
  wrap.innerHTML = `
    <div class="perfil-hero">
      <div class="perfil-avatar">${initial}</div>
      <div class="perfil-info">
        <div class="perfil-nombre">${escapeHtml(u.nombre || u.username)}</div>
        <div class="perfil-meta">
          <span class="mono">${escapeHtml(u.username)}</span>
          <span class="pill pill-${rolColor(u.rol)}" style="font-size:10px;">${rolLabel(u.rol)}</span>
        </div>
      </div>
    </div>

    <div class="perfil-cards">
      <div class="perfil-card">
        <div class="perfil-card-lbl">Tienda asignada</div>
        <div class="perfil-card-val" id="perfil-tienda">—</div>
      </div>
      <div class="perfil-card">
        <div class="perfil-card-lbl">Último acceso</div>
        <div class="perfil-card-val" style="font-size:13px;">${u.ultimo_login ? fmtDate(u.ultimo_login) : '—'}</div>
      </div>
    </div>

    <div class="perfil-qr-wrap">
      <div class="perfil-qr-lbl">Mi código QR</div>
      <canvas id="perfil-qr-canvas"></canvas>
      <div class="perfil-qr-sub mono">${escapeHtml(u.username)}</div>
    </div>

    <div class="perfil-actions">
      <button class="perfil-action-btn" id="btn-cfg-pwd">
        ${ICON.lock}
        <div>
          <div style="font-weight:600; font-size:13px;">Cambiar contraseña</div>
          <div style="font-size:11px; color:var(--muted);">Actualizar tu contraseña de acceso</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-left:auto;flex-shrink:0;color:var(--muted-2);"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div style="text-align:center; color:var(--muted-2); font-size:11px; padding:24px 16px 8px; font-family:var(--font-mono);">
      // inventario el rey · v0.3.0
    </div>
  `;

  wrap.querySelector('#btn-cfg-pwd').onclick = () => { State.modal = 'cambiar-password'; render(); };

  // Generar QR del usuario
  setTimeout(() => {
    const canvas = wrap.querySelector('#perfil-qr-canvas');
    if (canvas && window.QRCode) {
      QRCode.toCanvas(canvas, u.username, {
        width: 180, margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' }
      });
    }
  }, 50);

  // Resolver nombre de tienda async
  API.listTiendas().then(tiendas => {
    const t = tiendas.find(x => x.id === u.tienda_id);
    const el = wrap.querySelector('#perfil-tienda');
    if (el) el.textContent = t ? t.nombre : '—';
  }).catch(() => {});

  return wrap;
}

// Carga y pinta alertas de stock bajo en el #alerta-list del wrap
function renderAlertasSection(wrap, tiendaId = null) {
  const threshold = State.config.stockMinimo ?? 10;
  API.getLowStockAlerts(threshold, tiendaId).then(alerts => {
    const list = wrap.querySelector('#alerta-list');
    if (!list) return;
    const badge = wrap.querySelector('#alerta-count');
    if (badge) {
      badge.textContent = alerts.length ? `${alerts.length} artículo${alerts.length > 1 ? 's' : ''}` : '';
      badge.style.display = alerts.length ? '' : 'none';
    }
    list.innerHTML = '';
    if (!alerts.length) {
      list.innerHTML = `<div style="padding:12px 0; text-align:center; color:var(--success); font-size:13px; display:flex; align-items:center; justify-content:center; gap:6px;">${ICON.check} Sin artículos bajo el umbral de ${threshold} unidades</div>`;
      return;
    }
    alerts.forEach(a => {
      const pct = threshold > 0 ? Math.min(100, (a.stock_total / threshold) * 100) : 0;
      const color = a.stock_total === 0 ? 'var(--danger)'
                  : a.stock_total < Math.ceil(threshold / 2) ? '#f59e0b'
                  : 'var(--accent)';
      list.appendChild($(`
        <div class="alerta-item">
          <div class="alerta-meta">
            <span class="alerta-nombre">${escapeHtml(a.descripcion || a.sku || '')}</span>
            <span class="alerta-sku">${escapeHtml(a.sku || '')}</span>
          </div>
          <div class="alerta-right">
            <span class="alerta-qty" style="color:${color};">${a.stock_total}</span>
            <span class="alerta-umbral">/ ${threshold}</span>
          </div>
          <div class="alerta-bar-wrap">
            <div class="alerta-bar" style="width:${pct.toFixed(1)}%; background:${color};"></div>
          </div>
        </div>
      `));
    });
  }).catch(() => {
    const list = wrap.querySelector('#alerta-list');
    if (list) list.innerHTML = `<div class="empty" style="padding:10px 0;"><p>Error al cargar alertas</p></div>`;
  });
}

function renderAdminMasView() {
  const tab  = State.adminTab || 'inicio';
  const demo = !State.config.url || !State.config.anonKey;
  const initial = (State.user.nombre || State.user.username || 'A').charAt(0).toUpperCase();
  const wrap = $(`<div class="admin-panel"></div>`);

  wrap.innerHTML = `
    <div class="dash-hero">
      <div class="dash-hero-left">
        <div class="dash-hero-avatar">${initial}</div>
        <div>
          <div class="dash-hero-title">Panel de administración</div>
          <div class="dash-hero-sub">${escapeHtml(State.user.nombre || State.user.username)} &nbsp;·&nbsp; Master</div>
        </div>
      </div>
      <div class="dash-hero-right">
        <span class="pill pill-${demo ? 'warn' : 'success'}">${demo ? 'Demo' : 'Live'}</span>
        <button class="btn btn-sm dash-logout-btn" id="btn-logout">${ICON.logout} Salir</button>
      </div>
    </div>

    <nav class="ap-tabs">
      <button class="ap-tab ${tab==='inicio'     ?'active':''}" data-tab="inicio">${ICON.list} Inicio</button>
      <button class="ap-tab ${tab==='usuarios'   ?'active':''}" data-tab="usuarios">${ICON.user} Usuarios</button>
      <button class="ap-tab ${tab==='tiendas'    ?'active':''}" data-tab="tiendas">${ICON.pin} Tiendas</button>
      <button class="ap-tab ${tab==='ubicaciones'?'active':''}" data-tab="ubicaciones">${ICON.box} Ubicaciones</button>
      <button class="ap-tab ${tab==='indicadores'?'active':''}" data-tab="indicadores">${ICON.filter} Indicadores</button>
      <button class="ap-tab ${tab==='config'     ?'active':''}" data-tab="config">${ICON.settings} Config.</button>
      <button class="ap-tab ${tab==='auditoria'  ?'active':''}" data-tab="auditoria">${ICON.shield} Auditoría</button>
    </nav>

    <div class="ap-content" id="ap-content"></div>
  `;

  wrap.querySelectorAll('.ap-tab').forEach(btn => {
    btn.onclick = () => { State.adminTab = btn.dataset.tab; render(); };
  });
  wrap.querySelector('#btn-logout').onclick = () => {
    if (!confirm('¿Cerrar sesión?')) return; logout(); render();
  };

  const content = wrap.querySelector('#ap-content');
  switch (tab) {
    case 'inicio':      _apInicio(content);      break;
    case 'usuarios':    _apUsuarios(content);    break;
    case 'tiendas':     _apTiendas(content);     break;
    case 'ubicaciones': _apUbicaciones(content); break;
    case 'indicadores': _apIndicadores(content); break;
    case 'config':      _apConfig(content, demo); break;
    case 'auditoria':   _apAuditoria(content);   break;
  }

  return wrap;
}

// ── Tab: Inicio (KPIs + alertas) ─────────────────────────────────────
function _apInicio(el) {
  el.innerHTML = `
    <div class="dash-kpi-strip" id="kpi-grid">
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:24px;">
        <div class="loader"></div>
      </div>
    </div>
    <div style="padding:12px;">
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.warn} Alertas de stock bajo</div>
          <span id="alerta-count" class="pill pill-danger" style="display:none;"></span>
        </div>
        <div style="padding:12px 16px;">
          <div id="alerta-list"><div class="empty" style="padding:16px 0;"><div class="loader"></div></div></div>
        </div>
      </div>
    </div>
  `;

  const hoy = new Date().toDateString();
  Promise.all([
    API.listCajas(false), API.listCajas(true), API.listMovimientos(300),
    API.listUsers(false), API.listArticulos()
  ]).then(([activas, todas, movs, usuarios]) => {
    const totalUnidades = activas.reduce((s, c) => s + (c.unidades_totales || 0), 0);
    const stockBajo     = activas.filter(c => (c.unidades_totales || 0) <= (State.config.stockMinimo ?? 10)).length;
    const movsHoy       = movs.filter(m => new Date(m.creado_at).toDateString() === hoy).length;
    const consumidas    = todas.filter(c => c.estado === 'vacia').length;
    el.querySelector('#kpi-grid').innerHTML = `
      <div class="dash-kpi-card"><div class="dash-kpi-val">${activas.length}</div><div class="dash-kpi-label">Cajas activas</div></div>
      <div class="dash-kpi-card"><div class="dash-kpi-val">${totalUnidades}</div><div class="dash-kpi-label">Unidades totales</div></div>
      <div class="dash-kpi-card ${stockBajo > 0 ? 'dash-kpi-danger' : ''}"><div class="dash-kpi-val">${stockBajo}</div><div class="dash-kpi-label">Stock bajo</div></div>
      <div class="dash-kpi-card"><div class="dash-kpi-val">${movsHoy}</div><div class="dash-kpi-label">Movimientos hoy</div></div>
      <div class="dash-kpi-card"><div class="dash-kpi-val">${usuarios.length}</div><div class="dash-kpi-label">Usuarios activos</div></div>
      <div class="dash-kpi-card"><div class="dash-kpi-val">${consumidas}</div><div class="dash-kpi-label">Cajas consumidas</div></div>
    `;
  }).catch(() => {
    el.querySelector('#kpi-grid').innerHTML =
      `<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--muted);">Error al cargar estadísticas</div>`;
  });

  renderAlertasSection(el);
}

// ── Tab: Usuarios ─────────────────────────────────────────────────────
function _apUsuarios(el) {
  el.innerHTML = `
    <div style="padding:12px;">
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.user} Usuarios del sistema</div>
          <button class="btn btn-sm btn-primary" id="btn-new-user">${ICON.add} Nuevo</button>
        </div>
        <div id="admin-users" style="padding:8px 16px 14px;">
          <div class="empty"><div class="loader"></div></div>
        </div>
      </div>
    </div>
  `;
  el.querySelector('#btn-new-user').onclick = () => {
    State.cache.editingUser = null; State.modal = 'createUser'; render();
  };
  API.listUsers(true).then(users => {
    const list = el.querySelector('#admin-users');
    list.innerHTML = '';
    users.forEach(u => list.appendChild(adminUserItem(u)));
  }).catch(e => {
    el.querySelector('#admin-users').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });
}

// ── Tab: Tiendas — monitor de salud por sucursal ──────────────────────
function _apTiendas(el) {
  el.innerHTML = `<div style="display:flex;justify-content:center;padding:32px;"><div class="loader"></div></div>`;

  Promise.all([
    API.listTiendas(),
    API.listMovimientos(1000),
    API.listCajas(true),
    API.listUsers(true),
    API.listArticulos()
  ]).then(([tiendas, movs, cajas, users, arts]) => {
    if (!tiendas.length) { el.innerHTML = `<div class="empty" style="padding:40px;"><p>Sin tiendas cargadas desde ERP</p></div>`; return; }

    if (!State.adminTiendaId || !tiendas.find(t => t.id === State.adminTiendaId)) {
      State.adminTiendaId = tiendas[0].id;
    }

    const artMap = Object.fromEntries(arts.map(a => [a.id, a]));

    // ── Selector de tienda ──
    const selectorHtml = tiendas.map(t => `
      <button class="tienda-sel-btn ${t.id === State.adminTiendaId ? 'active' : ''}" data-tid="${t.id}">
        ${escapeHtml(t.nombre)}
      </button>
    `).join('');

    el.innerHTML = `
      <div class="tienda-selector">${selectorHtml}</div>
      <div id="tienda-detail" style="padding:12px;display:flex;flex-direction:column;gap:12px;"></div>
    `;

    el.querySelectorAll('.tienda-sel-btn').forEach(btn => {
      btn.onclick = () => { State.adminTiendaId = parseInt(btn.dataset.tid); _renderTiendaDetail(detail, tiendas, movs, cajas, users, artMap); };
    });

    const detail = el.querySelector('#tienda-detail');
    _renderTiendaDetail(detail, tiendas, movs, cajas, users, artMap);
  }).catch(e => {
    el.innerHTML = `<div class="empty" style="padding:40px;"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });
}

function _renderTiendaDetail(el, tiendas, movs, cajas, users, artMap) {
  const t       = tiendas.find(x => x.id === State.adminTiendaId);
  const cajasT  = cajas.filter(c => c.tienda_id === t.id);
  const usersT  = users.filter(u => u.tienda_id === t.id);
  const cajasIds = new Set(cajasT.map(c => c.id));
  const movsT   = movs.filter(m => cajasIds.has(m.caja_id));

  const ahora   = new Date();
  const hoy     = ahora.toDateString();
  const semana  = new Date(ahora - 7 * 86400000);
  const movsHoy = movsT.filter(m => new Date(m.creado_at).toDateString() === hoy);
  const movsSem = movsT.filter(m => new Date(m.creado_at) >= semana);
  const stockBajoT = cajasT.filter(c => (c.unidades_totales || 0) <= (State.config.stockMinimo ?? 10) && c.estado !== 'vacia');
  const ultimaMov  = movsT.length ? movsT.reduce((a, b) => new Date(a.creado_at) > new Date(b.creado_at) ? a : b) : null;
  const usrsInactivos = usersT.filter(u => {
    const last = movsT.filter(m => m.usuario_id === u.id || m.usuario === u.username);
    return last.length === 0;
  });

  // ── Conteo de movimientos por caja ──
  const movsPorCaja = cajasT.map(c => ({
    caja: c,
    total: movsT.filter(m => m.caja_id === c.id).length
  })).sort((a, b) => b.total - a.total).slice(0, 5);
  const maxCaja = movsPorCaja[0]?.total || 1;

  // ── Conteo de movimientos por producto ──
  const movsPorArt = {};
  movsT.forEach(m => {
    const caja = cajasT.find(c => c.id === m.caja_id);
    if (!caja) return;
    const artId = caja.articulo_id;
    if (!artId) return;
    movsPorArt[artId] = (movsPorArt[artId] || 0) + 1;
  });
  const topArts = Object.entries(movsPorArt)
    .map(([id, total]) => ({ art: artMap[id], total }))
    .filter(x => x.art)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const maxArt = topArts[0]?.total || 1;

  // ── Alertas ──
  const alertas = [];
  if (movsHoy.length === 0 && cajasT.length > 0) alertas.push({ nivel: 'danger', msg: 'Sin actividad hoy' });
  if (usrsInactivos.length) alertas.push({ nivel: 'warn', msg: `${usrsInactivos.length} usuario${usrsInactivos.length>1?'s':''} sin movimientos registrados` });
  if (stockBajoT.length) alertas.push({ nivel: 'warn', msg: `${stockBajoT.length} caja${stockBajoT.length>1?'s':''} con stock bajo` });
  if (!cajasT.length) alertas.push({ nivel: 'danger', msg: 'Sin cajas activas en esta tienda' });

  el.innerHTML = `
    <!-- KPIs -->
    <div class="mon-kpi-strip">
      <div class="mon-kpi"><div class="mon-kpi-val">${movsHoy.length}</div><div class="mon-kpi-lbl">Movs. hoy</div></div>
      <div class="mon-kpi"><div class="mon-kpi-val">${movsSem.length}</div><div class="mon-kpi-lbl">Movs. semana</div></div>
      <div class="mon-kpi"><div class="mon-kpi-val">${usersT.length}</div><div class="mon-kpi-lbl">Usuarios</div></div>
      <div class="mon-kpi"><div class="mon-kpi-val">${cajasT.filter(c=>c.estado!=='vacia').length}</div><div class="mon-kpi-lbl">Cajas activas</div></div>
      <div class="mon-kpi ${stockBajoT.length?'mon-kpi-warn':''}"><div class="mon-kpi-val">${stockBajoT.length}</div><div class="mon-kpi-lbl">Stock bajo</div></div>
    </div>

    <!-- Última actividad -->
    <div class="dash-card">
      <div class="dash-card-header">
        <div class="dash-card-title">${ICON.history} Última actividad</div>
        <span class="pill pill-${alertas.length ? 'danger' : 'success'}" style="font-size:10px;">
          ${alertas.length ? alertas.length + ' alerta' + (alertas.length>1?'s':'') : 'Todo normal'}
        </span>
      </div>
      <div style="padding:10px 16px;">
        <div style="font-size:13px;color:var(--muted);margin-bottom:${alertas.length?'10px':'0'};">
          ${ultimaMov ? `Último movimiento: <strong style="color:var(--text);">${fmtDate(ultimaMov.creado_at)}</strong> por <strong style="color:var(--text);">${escapeHtml(ultimaMov.usuario || '—')}</strong>` : 'Sin movimientos registrados'}
        </div>
        ${alertas.map(a => `
          <div class="mon-alerta mon-alerta-${a.nivel}">${a.nivel === 'danger' ? ICON.warn : ICON.info} ${a.msg}</div>
        `).join('')}
      </div>
    </div>

    <!-- Usuarios -->
    <div class="dash-card">
      <div class="dash-card-header">
        <div class="dash-card-title">${ICON.user} Usuarios asignados (${usersT.length})</div>
      </div>
      <div style="padding:8px 16px 12px;">
        ${usersT.length ? usersT.map(u => {
          const movsU = movsT.filter(m => m.usuario === u.username).length;
          return `<div class="mon-user-row">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text);">${escapeHtml(u.nombre || u.username)}</div>
              <div style="font-size:11px;color:var(--muted);">${escapeHtml(u.rol)} · ${escapeHtml(u.username)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--text);">${movsU}</div>
              <div style="font-size:10px;color:var(--muted);">movimientos</div>
            </div>
          </div>`;
        }).join('') : '<div class="empty" style="padding:12px 0;"><p>Sin usuarios asignados</p></div>'}
      </div>
    </div>

    <!-- Top cajas por movimientos -->
    <div class="dash-card">
      <div class="dash-card-header">
        <div class="dash-card-title">${ICON.box} Top cajas por movimientos</div>
      </div>
      <div style="padding:10px 16px 14px;">
        ${movsPorCaja.length ? movsPorCaja.map(({ caja, total }) => {
          const pct = Math.round((total / maxCaja) * 100);
          const art = artMap[caja.articulo_id];
          return `<div class="mon-bar-row">
            <div class="mon-bar-label">
              <span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(art?.descripcion || caja.codigo_caja)}</span>
              <span style="font-size:10px;color:var(--muted);font-family:var(--font-mono);">${escapeHtml(caja.codigo_caja.slice(-10))}</span>
            </div>
            <div class="mon-bar-wrap"><div class="mon-bar" style="width:${pct}%;"></div></div>
            <span class="mon-bar-val">${total}</span>
          </div>`;
        }).join('') : '<div style="font-size:13px;color:var(--muted);padding:4px 0;">Sin movimientos registrados</div>'}
      </div>
    </div>

    <!-- Top productos por movimientos -->
    <div class="dash-card">
      <div class="dash-card-header">
        <div class="dash-card-title">${ICON.package} Top productos por movimientos</div>
      </div>
      <div style="padding:10px 16px 14px;">
        ${topArts.length ? topArts.map(({ art, total }) => {
          const pct = Math.round((total / maxArt) * 100);
          return `<div class="mon-bar-row">
            <div class="mon-bar-label">
              <span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(art.descripcion || art.sku)}</span>
              <span style="font-size:10px;color:var(--muted);font-family:var(--font-mono);">${escapeHtml(art.sku)}</span>
            </div>
            <div class="mon-bar-wrap"><div class="mon-bar mon-bar-accent" style="width:${pct}%;"></div></div>
            <span class="mon-bar-val">${total}</span>
          </div>`;
        }).join('') : '<div style="font-size:13px;color:var(--muted);padding:4px 0;">Sin datos de productos</div>'}
      </div>
    </div>
  `;

  // Actualizar selector activo
  el.closest('.ap-content')?.querySelectorAll('.tienda-sel-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.tid) === State.adminTiendaId);
  });
}

// ── Tab: Configuración ────────────────────────────────────────────────
function _apConfig(el, demo) {
  el.innerHTML = `
    <div style="padding:12px;display:flex;flex-direction:column;gap:12px;">
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.settings} Parámetros del sistema</div>
        </div>
        <div style="padding:4px 16px 12px;">
          <div class="dash-cfg-row">
            <div>
              <div class="dash-cfg-label">Cierre por inactividad</div>
              <div class="dash-cfg-sub">Aplica a todos los usuarios</div>
            </div>
            <select id="inactivity-sel" class="dash-cfg-select">
              ${[5,10,30].map(m=>`<option value="${m}" ${(State.config.inactivityMinutes??10)===m?'selected':''}>${m} min</option>`).join('')}
              <option value="0" ${(State.config.inactivityMinutes??10)===0?'selected':''}>Nunca</option>
            </select>
          </div>
          <div class="dash-cfg-row">
            <div>
              <div class="dash-cfg-label">Umbral stock bajo (global)</div>
              <div class="dash-cfg-sub">Alerta si stock &lt; X unidades</div>
            </div>
            <input id="stock-min-input" type="number" min="0" max="9999"
              value="${State.config.stockMinimo ?? 10}" class="dash-cfg-input">
          </div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.database} Base de datos</div>
        </div>
        <div style="padding:12px 16px;">
          <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">
            ${demo ? 'Modo demo activo — sin conexión a Supabase' : 'Supabase conectado'}
          </div>
          <button class="btn btn-block" id="cfg-supabase">${ICON.settings} Configurar conexión</button>
        </div>
      </div>
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.user} Sesión activa</div>
        </div>
        <div style="padding:12px 16px;">
          <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">
            Ingresado como <strong style="color:var(--text);">${escapeHtml(State.user.nombre || State.user.username)}</strong>
            &nbsp;·&nbsp; <span class="pill pill-info" style="font-size:10px;">${escapeHtml(State.user.rol)}</span>
          </div>
          <button class="btn btn-danger btn-block" id="btn-logout-config">${ICON.logout} Cerrar sesión</button>
        </div>
      </div>
      <div style="text-align:center;color:var(--muted-2);font-size:11px;font-family:var(--font-mono);padding:4px 0 8px;">
        Inventario El Rey · v0.3.0
      </div>
    </div>
  `;
  el.querySelector('#inactivity-sel').onchange = e => {
    const minutes = parseInt(e.target.value);
    State.config.inactivityMinutes = minutes;
    Storage.set('config', State.config);
    resetInactivityTimer();
    toast(minutes === 0 ? 'Cierre por inactividad desactivado' : `Cierre por inactividad: ${minutes} min`, 'success');
  };
  el.querySelector('#stock-min-input').oninput = e => {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v < 0) return;
    State.config.stockMinimo = v;
    Storage.set('config', State.config);
  };
  el.querySelector('#cfg-supabase').onclick = () => { State.modal = 'config'; render(); };
  el.querySelector('#btn-logout-config').onclick = () => { if (!confirm('¿Cerrar sesión?')) return; logout(); render(); };
}

// ── Tab: Auditoría ────────────────────────────────────────────────────
function _apAuditoria(el) {
  const events = getAuditLog(150);
  el.innerHTML = `
    <div style="padding:12px;">
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.shield} Log de auditoría</div>
          <button class="btn btn-sm" id="clear-audit">${ICON.trash} Limpiar</button>
        </div>
        <div style="padding:8px 12px 12px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
            ${events.length} evento${events.length !== 1 ? 's' : ''} registrado${events.length !== 1 ? 's' : ''}
          </div>
          <div id="audit-list" class="stack" style="gap:4px;">
            ${events.length ? '' : '<div class="empty" style="padding:20px 0;"><p>Sin eventos registrados todavía</p></div>'}
          </div>
        </div>
      </div>
    </div>
  `;
  const list = el.querySelector('#audit-list');
  events.forEach(ev => {
    const meta = AUDIT_TIPO[ev.tipo] || { label: ev.tipo, color: 'muted' };
    list.appendChild($(`
      <div class="audit-item">
        <div class="audit-left">
          <span class="pill pill-${meta.color}" style="font-size:10px;padding:2px 7px;">${meta.label}</span>
          <span class="audit-user">${escapeHtml(ev.username || '—')}</span>
        </div>
        <div class="audit-right">
          <span class="audit-time">${fmtDate(ev.ts)}</span>
        </div>
        ${ev.detalles ? `<div class="audit-detail">${escapeHtml(ev.detalles)}</div>` : ''}
      </div>
    `));
  });
  el.querySelector('#clear-audit').onclick = () => {
    if (!confirm('¿Borrar todo el historial?')) return;
    clearAuditLog();
    _apAuditoria(el);
  };
}

// ── Tab: Ubicaciones (Bodega → Pasillo → Estante) ─────────────────────
function _apUbicaciones(el) {
  el.innerHTML = `<div style="display:flex;justify-content:center;padding:32px;"><div class="loader"></div></div>`;

  Promise.all([API.listTiendas(), API.listBodegas(), API.listPasillos(), API.listEstantes()])
    .then(([tiendas, bodegas, pasillos, estantes]) => {
      if (!tiendas.length) { el.innerHTML = `<div class="empty" style="padding:40px;"><p>Sin tiendas cargadas</p></div>`; return; }

      if (!State.adminTiendaId || !tiendas.find(t => t.id === State.adminTiendaId)) {
        State.adminTiendaId = tiendas[0].id;
      }

      const render = () => _renderUbicacionesBody(el, tiendas, bodegas, pasillos, estantes);
      render();
    }).catch(e => {
      el.innerHTML = `<div class="empty" style="padding:40px;"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
    });
}

function _renderUbicacionesBody(el, tiendas, bodegas, pasillos, estantes) {
  const expandedBodegas  = new Set();
  const expandedPasillos = new Set();

  const draw = () => {
    const tid     = State.adminTiendaId;
    const bodT    = bodegas.filter(b => b.tienda_id === tid);
    const tienda  = tiendas.find(t => t.id === tid);

    const selectorHtml = tiendas.map(t => `
      <button class="tienda-sel-btn ${t.id === tid ? 'active' : ''}" data-tid="${t.id}">${escapeHtml(t.nombre)}</button>
    `).join('');

    el.innerHTML = `
      <div class="tienda-selector">${selectorHtml}</div>
      <div style="padding:12px;">
        <div class="dash-card">
          <div class="dash-card-header">
            <div class="dash-card-title">${ICON.box} ${escapeHtml(tienda?.nombre || '')} — Bodegas</div>
            <button class="btn btn-sm btn-primary" id="btn-add-bodega">${ICON.add} Bodega</button>
          </div>
          <div id="ub-tree" style="padding:8px 0;"></div>
        </div>
      </div>
    `;

    el.querySelectorAll('.tienda-sel-btn').forEach(btn => {
      btn.onclick = () => { State.adminTiendaId = parseInt(btn.dataset.tid); draw(); };
    });

    el.querySelector('#btn-add-bodega').onclick = async () => {
      const nombre = prompt('Nombre de la nueva bodega:');
      if (!nombre?.trim()) return;
      const desc = prompt('Descripción (opcional):') || '';
      try {
        const b = await API.createBodega({ tienda_id: tid, nombre: nombre.trim(), descripcion: desc.trim() });
        bodegas.push(b);
        expandedBodegas.add(b.id);
        toast('Bodega creada', 'success');
        draw();
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    };

    const tree = el.querySelector('#ub-tree');

    if (!bodT.length) {
      tree.innerHTML = `<div class="empty" style="padding:20px;"><p>Sin bodegas — agregá una con el botón</p></div>`;
      return;
    }

    bodT.forEach(bodega => {
      const isOpen = expandedBodegas.has(bodega.id);
      const pasB   = pasillos.filter(p => p.bodega_id === bodega.id);
      const totalEst = pasB.reduce((s, p) => s + estantes.filter(e => e.pasillo_id === p.id).length, 0);

      const bodNode = $(`
        <div class="ub-bodega">
          <div class="ub-bodega-hdr" data-bid="${bodega.id}">
            <span class="ub-chevron">${isOpen ? '▼' : '►'}</span>
            <span class="ub-bodega-name">${escapeHtml(bodega.nombre)}</span>
            <span class="ub-bodega-meta">${pasB.length} pasillo${pasB.length!==1?'s':''} · ${totalEst} estante${totalEst!==1?'s':''}</span>
            <div class="ub-bodega-actions">
              <button class="btn btn-sm" data-add-pasillo="${bodega.id}">${ICON.add} Pasillo</button>
              <button class="ub-del-btn" data-del-bodega="${bodega.id}" title="Eliminar bodega">${ICON.trash}</button>
            </div>
          </div>
          ${isOpen ? `<div class="ub-pasillos" data-bid="${bodega.id}"></div>` : ''}
        </div>
      `);

      // Toggle expand
      bodNode.querySelector('.ub-bodega-hdr').onclick = e => {
        if (e.target.closest('button')) return;
        if (isOpen) expandedBodegas.delete(bodega.id); else expandedBodegas.add(bodega.id);
        draw();
      };

      // Add pasillo
      bodNode.querySelector(`[data-add-pasillo]`).onclick = async e => {
        e.stopPropagation();
        const nombre = prompt(`Nuevo pasillo en "${bodega.nombre}":`);
        if (!nombre?.trim()) return;
        try {
          const p = await API.createPasillo({ bodega_id: bodega.id, nombre: nombre.trim() });
          pasillos.push(p);
          expandedBodegas.add(bodega.id);
          expandedPasillos.add(p.id);
          toast('Pasillo creado', 'success');
          draw();
        } catch(e) { toast('Error: ' + e.message, 'error'); }
      };

      // Delete bodega
      bodNode.querySelector(`[data-del-bodega]`).onclick = async e => {
        e.stopPropagation();
        if (!confirm(`¿Eliminar bodega "${bodega.nombre}" y todo su contenido?`)) return;
        try {
          await API.deleteBodega(bodega.id);
          const pasIds = pasillos.filter(p => p.bodega_id === bodega.id).map(p => p.id);
          estantes.splice(0, estantes.length, ...estantes.filter(e => !pasIds.includes(e.pasillo_id)));
          pasillos.splice(0, pasillos.length, ...pasillos.filter(p => p.bodega_id !== bodega.id));
          bodegas.splice(0, bodegas.length, ...bodegas.filter(b => b.id !== bodega.id));
          toast('Bodega eliminada', 'success');
          draw();
        } catch(e) { toast('Error: ' + e.message, 'error'); }
      };

      // Render pasillos if expanded
      if (isOpen) {
        const pasCont = bodNode.querySelector('.ub-pasillos');
        if (!pasB.length) {
          pasCont.innerHTML = `<div style="padding:10px 24px;font-size:12px;color:var(--muted);">Sin pasillos — usá "+ Pasillo" para agregar</div>`;
        } else {
          pasB.forEach(pasillo => {
            const isPasOpen = expandedPasillos.has(pasillo.id);
            const estP      = estantes.filter(e => e.pasillo_id === pasillo.id);

            const pasNode = $(`
              <div class="ub-pasillo">
                <div class="ub-pasillo-hdr" data-pid="${pasillo.id}">
                  <span class="ub-chevron ub-chevron-sm">${isPasOpen ? '▼' : '►'}</span>
                  <span class="ub-pasillo-name">${escapeHtml(pasillo.nombre)}</span>
                  <span class="ub-bodega-meta">${estP.length} estante${estP.length!==1?'s':''}</span>
                  <div class="ub-bodega-actions">
                    <button class="btn btn-sm" data-add-estante="${pasillo.id}">${ICON.add} Estante</button>
                    <button class="ub-del-btn" data-del-pasillo="${pasillo.id}" title="Eliminar pasillo">${ICON.trash}</button>
                  </div>
                </div>
                ${isPasOpen ? `<div class="ub-estantes" data-pid="${pasillo.id}"></div>` : ''}
              </div>
            `);

            // Toggle pasillo
            pasNode.querySelector('.ub-pasillo-hdr').onclick = e => {
              if (e.target.closest('button')) return;
              if (isPasOpen) expandedPasillos.delete(pasillo.id); else expandedPasillos.add(pasillo.id);
              draw();
            };

            // Add estante
            pasNode.querySelector(`[data-add-estante]`).onclick = async e => {
              e.stopPropagation();
              const nombre = prompt(`Nuevo estante en "${pasillo.nombre}" (ej. A-04):`);
              if (!nombre?.trim()) return;
              try {
                const est = await API.createEstante({ pasillo_id: pasillo.id, nombre: nombre.trim() });
                estantes.push(est);
                expandedPasillos.add(pasillo.id);
                toast('Estante creado', 'success');
                draw();
              } catch(e) { toast('Error: ' + e.message, 'error'); }
            };

            // Delete pasillo
            pasNode.querySelector(`[data-del-pasillo]`).onclick = async e => {
              e.stopPropagation();
              if (!confirm(`¿Eliminar pasillo "${pasillo.nombre}" y sus estantes?`)) return;
              try {
                await API.deletePasillo(pasillo.id);
                estantes.splice(0, estantes.length, ...estantes.filter(e => e.pasillo_id !== pasillo.id));
                pasillos.splice(0, pasillos.length, ...pasillos.filter(p => p.id !== pasillo.id));
                toast('Pasillo eliminado', 'success');
                draw();
              } catch(e) { toast('Error: ' + e.message, 'error'); }
            };

            // Render estantes
            if (isPasOpen) {
              const estCont = pasNode.querySelector('.ub-estantes');
              if (!estP.length) {
                estCont.innerHTML = `<div style="padding:8px 32px;font-size:12px;color:var(--muted);">Sin estantes — usá "+ Estante"</div>`;
              } else {
                const chips = estP.map(est => `
                  <span class="ub-estante-chip" data-del-estante="${est.id}">
                    ${escapeHtml(est.nombre)} ${ICON.close}
                  </span>
                `).join('');
                estCont.innerHTML = `<div class="ub-estantes-chips">${chips}</div>`;
                estCont.querySelectorAll('[data-del-estante]').forEach(chip => {
                  chip.onclick = async () => {
                    const id = parseInt(chip.dataset.delEstante);
                    const est = estantes.find(e => e.id === id);
                    if (!confirm(`¿Eliminar estante "${est?.nombre}"?`)) return;
                    try {
                      await API.deleteEstante(id);
                      estantes.splice(0, estantes.length, ...estantes.filter(e => e.id !== id));
                      toast('Estante eliminado', 'success');
                      draw();
                    } catch(e) { toast('Error: ' + e.message, 'error'); }
                  };
                });
              }
            }

            pasCont.appendChild(pasNode);
          });
        }
      }

      tree.appendChild(bodNode);
    });
  };

  draw();
}

// ── Tab: Indicadores globales ─────────────────────────────────────────
function _apIndicadores(el) {
  const period = State.adminIndicPeriod || 7;

  el.innerHTML = `
    <div class="ind-toolbar">
      <span style="font-size:12px;font-weight:600;color:var(--muted);">Período:</span>
      ${[1,7,30].map(d => `
        <button class="ind-period-btn ${period===d?'active':''}" data-days="${d}">
          ${d===1?'Hoy':d===7?'7 días':'30 días'}
        </button>
      `).join('')}
    </div>
    <div style="padding:12px;display:flex;flex-direction:column;gap:12px;">
      <div id="ind-loading" style="display:flex;justify-content:center;padding:32px;"><div class="loader"></div></div>
    </div>
  `;

  el.querySelectorAll('.ind-period-btn').forEach(btn => {
    btn.onclick = () => { State.adminIndicPeriod = parseInt(btn.dataset.days); _apIndicadores(el); };
  });

  const body = el.querySelector('div[style*="padding:12px"]');

  Promise.all([
    API.listMovimientos(2000),
    API.listCajas(true),
    API.listUsers(true),
    API.listTiendas(),
    API.listArticulos()
  ]).then(([movs, cajas, users, tiendas, arts]) => {
    body.querySelector('#ind-loading').remove();

    const ahora  = new Date();
    const desde  = new Date(ahora - period * 86400000);
    const movsPer = movs.filter(m => new Date(m.creado_at) >= desde);
    const artMap  = Object.fromEntries(arts.map(a => [a.id, a]));
    const cajasActivas = cajas.filter(c => c.estado !== 'vacia');

    // ── KPIs globales ──────────────────────────────────────────────────
    const totalUnd   = cajasActivas.reduce((s,c) => s + (c.unidades_totales||0), 0);
    const stockCrit  = cajasActivas.filter(c => (c.unidades_totales||0) <= (State.config.stockMinimo??10)).length;
    const tienActiv  = tiendas.filter(t => t.activa).length;
    const reductions = movsPer.filter(m => m.tipo === 'reduccion').length;
    const increases  = movsPer.filter(m => m.tipo === 'aumento').length;
    const traslados  = movsPer.filter(m => m.tipo === 'traslado').length;

    body.insertAdjacentHTML('beforeend', `
      <div class="mon-kpi-strip" style="grid-template-columns:repeat(4,1fr);">
        <div class="mon-kpi"><div class="mon-kpi-val">${totalUnd.toLocaleString()}</div><div class="mon-kpi-lbl">Unidades totales</div></div>
        <div class="mon-kpi"><div class="mon-kpi-val">${movsPer.length}</div><div class="mon-kpi-lbl">Movimientos</div></div>
        <div class="mon-kpi"><div class="mon-kpi-val">${tienActiv}</div><div class="mon-kpi-lbl">Tiendas activas</div></div>
        <div class="mon-kpi ${stockCrit>0?'mon-kpi-warn':''}"><div class="mon-kpi-val">${stockCrit}</div><div class="mon-kpi-lbl">Stock crítico</div></div>
      </div>
    `);

    // ── Movimientos por día ────────────────────────────────────────────
    const days = [];
    for (let i = Math.min(period, 7) - 1; i >= 0; i--) {
      const d = new Date(ahora - i * 86400000);
      const label = d.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric' });
      const key   = d.toDateString();
      const reds  = movs.filter(m => new Date(m.creado_at).toDateString() === key && m.tipo === 'reduccion').length;
      const aums  = movs.filter(m => new Date(m.creado_at).toDateString() === key && m.tipo === 'aumento').length;
      days.push({ label, reds, aumsCount: aums, total: reds + aums });
    }
    const maxDay = Math.max(1, ...days.map(d => d.total));

    const dayBars = days.map(d => `
      <div class="ind-day-col">
        <div class="ind-day-bars">
          <div class="ind-bar-seg ind-bar-red"  style="height:${Math.round((d.reds/maxDay)*100)}%;" title="Reducciones: ${d.reds}"></div>
          <div class="ind-bar-seg ind-bar-aum"  style="height:${Math.round((d.aumsCount/maxDay)*100)}%;" title="Aumentos: ${d.aumsCount}"></div>
        </div>
        <div class="ind-day-total">${d.total}</div>
        <div class="ind-day-label">${d.label}</div>
      </div>
    `).join('');

    body.insertAdjacentHTML('beforeend', `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.list} Movimientos por día</div>
          <div style="display:flex;gap:10px;font-size:11px;color:var(--muted);align-items:center;">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f87171;margin-right:3px;"></span>Reduc.</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#4ade80;margin-right:3px;"></span>Aum.</span>
          </div>
        </div>
        <div class="ind-day-chart">${dayBars}</div>
      </div>
    `);

    // ── Distribución por tipo ──────────────────────────────────────────
    const total3 = Math.max(1, reductions + increases + traslados);
    const pctRed = Math.round((reductions/total3)*100);
    const pctAum = Math.round((increases/total3)*100);
    const pctTra = 100 - pctRed - pctAum;

    body.insertAdjacentHTML('beforeend', `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.filter} Distribución de movimientos</div>
        </div>
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
          ${[
            { label:'Reducciones', val:reductions, pct:pctRed, color:'#f87171' },
            { label:'Aumentos',    val:increases,  pct:pctAum, color:'#4ade80' },
            { label:'Traslados',   val:traslados,  pct:pctTra, color:'#60a5fa' }
          ].map(r => `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                <span style="font-weight:600;color:var(--text);">${r.label}</span>
                <span style="font-family:var(--font-mono);color:var(--muted);">${r.val} &nbsp;·&nbsp; ${r.pct}%</span>
              </div>
              <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${r.pct}%;background:${r.color};border-radius:4px;transition:width 0.4s;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // ── Top tiendas por actividad ──────────────────────────────────────
    const tienStats = tiendas.map(t => {
      const cajT  = cajas.filter(c => c.tienda_id === t.id);
      const cajIds = new Set(cajT.map(c => c.id));
      const cnt   = movsPer.filter(m => cajIds.has(m.caja_id)).length;
      return { nombre: t.nombre, cnt };
    }).sort((a,b) => b.cnt - a.cnt);
    const maxTienda = Math.max(1, tienStats[0]?.cnt || 1);

    body.insertAdjacentHTML('beforeend', `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.pin} Tiendas por actividad</div>
        </div>
        <div style="padding:10px 16px 14px;">
          ${tienStats.map(t => `
            <div class="mon-bar-row">
              <div class="mon-bar-label"><span style="font-size:13px;font-weight:600;color:var(--text);">${escapeHtml(t.nombre)}</span></div>
              <div class="mon-bar-wrap" style="width:100px;"><div class="mon-bar" style="width:${Math.round((t.cnt/maxTienda)*100)}%;"></div></div>
              <span class="mon-bar-val">${t.cnt}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // ── Top 10 artículos más movidos ───────────────────────────────────
    const movsPorArt = {};
    movsPer.forEach(m => {
      const caja = cajas.find(c => c.id === m.caja_id);
      if (!caja?.articulo_id) return;
      movsPorArt[caja.articulo_id] = (movsPorArt[caja.articulo_id]||0) + 1;
    });
    const topArts = Object.entries(movsPorArt)
      .map(([id,cnt]) => ({ art: artMap[id], cnt }))
      .filter(x => x.art)
      .sort((a,b) => b.cnt - a.cnt)
      .slice(0, 10);
    const maxArt = Math.max(1, topArts[0]?.cnt || 1);

    body.insertAdjacentHTML('beforeend', `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.package} Top artículos más movidos</div>
        </div>
        <div style="padding:10px 16px 14px;">
          ${topArts.length ? topArts.map(({art,cnt}) => `
            <div class="mon-bar-row">
              <div class="mon-bar-label">
                <span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(art.descripcion||art.sku)}</span>
                <span style="font-size:10px;color:var(--muted);font-family:var(--font-mono);">${escapeHtml(art.sku)}</span>
              </div>
              <div class="mon-bar-wrap"><div class="mon-bar mon-bar-accent" style="width:${Math.round((cnt/maxArt)*100)}%;"></div></div>
              <span class="mon-bar-val">${cnt}</span>
            </div>
          `).join('') : '<div style="font-size:13px;color:var(--muted);padding:4px 0;">Sin movimientos en el período</div>'}
        </div>
      </div>
    `);

    // ── Stock crítico global ───────────────────────────────────────────
    const criticos = cajasActivas
      .filter(c => (c.unidades_totales||0) <= (State.config.stockMinimo??10))
      .map(c => ({ caja:c, art: artMap[c.articulo_id], tienda: tiendas.find(t=>t.id===c.tienda_id) }))
      .sort((a,b) => (a.caja.unidades_totales||0) - (b.caja.unidades_totales||0))
      .slice(0, 10);

    body.insertAdjacentHTML('beforeend', `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.warn} Stock crítico global</div>
          <span class="pill pill-danger" style="font-size:10px;">${criticos.length} artículo${criticos.length!==1?'s':''}</span>
        </div>
        <div style="padding:8px 16px 14px;">
          ${criticos.length ? criticos.map(({caja,art,tienda}) => `
            <div class="mon-bar-row">
              <div class="mon-bar-label">
                <span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(art?.descripcion||caja.codigo_caja)}</span>
                <span style="font-size:10px;color:var(--muted);">${escapeHtml(tienda?.nombre||'—')}</span>
              </div>
              <div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:${(caja.unidades_totales||0)===0?'var(--danger)':'var(--warn)'};">
                ${caja.unidades_totales||0}
              </div>
            </div>
          `).join('') : '<div style="font-size:13px;color:var(--success);padding:4px 0;">Sin artículos en stock crítico</div>'}
        </div>
      </div>
    `);

    // ── Usuarios más activos ───────────────────────────────────────────
    const movsPorUser = {};
    movsPer.forEach(m => {
      if (!m.usuario) return;
      movsPorUser[m.usuario] = (movsPorUser[m.usuario]||0) + 1;
    });
    const topUsers = Object.entries(movsPorUser)
      .map(([u,cnt]) => ({ user: users.find(x=>x.username===u)||{username:u,nombre:u}, cnt }))
      .sort((a,b) => b.cnt - a.cnt)
      .slice(0, 7);
    const maxUser = Math.max(1, topUsers[0]?.cnt || 1);

    body.insertAdjacentHTML('beforeend', `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${ICON.user} Usuarios más activos</div>
        </div>
        <div style="padding:10px 16px 14px;">
          ${topUsers.length ? topUsers.map(({user,cnt}) => `
            <div class="mon-bar-row">
              <div class="mon-bar-label">
                <span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(user.nombre||user.username)}</span>
                <span style="font-size:10px;color:var(--muted);font-family:var(--font-mono);">${escapeHtml(user.username)}</span>
              </div>
              <div class="mon-bar-wrap"><div class="mon-bar" style="width:${Math.round((cnt/maxUser)*100)}%;background:#a78bfa;"></div></div>
              <span class="mon-bar-val">${cnt}</span>
            </div>
          `).join('') : '<div style="font-size:13px;color:var(--muted);padding:4px 0;">Sin actividad en el período</div>'}
        </div>
      </div>
      <div style="height:16px;"></div>
    `);

  }).catch(e => {
    body.innerHTML = `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });
}

// ── Tab: Próximamente ─────────────────────────────────────────────────
function _apProximamente(el, icon, titulo, desc) {
  el.innerHTML = `
    <div style="padding:32px 16px;text-align:center;">
      <div style="width:56px;height:56px;border-radius:16px;background:var(--surface);border:1px solid var(--border);
                  display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:var(--muted);">
        ${icon}
      </div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">${titulo}</div>
      <div style="font-size:13px;color:var(--muted);">${desc}</div>
      <div style="margin-top:12px;">
        <span class="pill pill-info" style="font-size:11px;">Próximamente</span>
      </div>
    </div>
  `;
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
      <div class="section-title" style="display:flex; align-items:center; gap:6px;">
        ${ICON.warn} Alertas de stock bajo
        <span id="alerta-count" class="pill pill-danger" style="display:none; margin-left:4px;"></span>
      </div>
      <div id="alerta-list" class="stack">
        <div class="empty"><div class="loader"></div></div>
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

  renderAlertasSection(wrap, myTiendaId);

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
