// =====================================================================
// modals.js — todos los modales de la aplicación
// =====================================================================

import { State, Storage } from './state.js';
import { API, initSupabase } from './api.js';
import { MOCK } from './mock.js';
import { ICON, $, escapeHtml, fmtDate, fmtDateTime, toast, generateBoxCode, feedback } from './utils.js';
import { isValidUsername, isValidPassword, isAdminTienda } from './auth.js';
import { startScanner, stopScanner } from './scanner.js';
import { render } from './main.js';
import { logEvent, getAuditLog, clearAuditLog, AUDIT_TIPO } from './audit.js';

// =====================================================================
// HELPERS
// =====================================================================
export function modalShell(title, bodyHtml, footerHtml = '') {
  const m = $(`
    <div class="modal-backdrop">
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="close" id="modal-close">${ICON.close}</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `);
  m.querySelector('#modal-close').onclick = () => closeModal();
  m.onclick = e => { if (e.target === m) closeModal(); };
  return m;
}

export function closeModal() {
  State.modal = null;
  State.cache.currentBox = null;
  render();
}

// Convierte ISO UTC → string para input datetime-local en hora Costa Rica (UTC-6)
function utcToCRInput(iso) {
  if (!iso) return '';
  const cr = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  return cr.toISOString().slice(0, 16);
}

// Convierte string de datetime-local (hora CR) → ISO UTC
function crInputToUtc(local) {
  if (!local) return null;
  return new Date(local + ':00-06:00').toISOString();
}

// Formatea fecha ISO en hora Costa Rica legible
function formatCRTime(iso) {
  return new Date(iso).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// =====================================================================
// CAJA: detalle
// =====================================================================
export function renderBoxModal() {
  const c = State.cache.currentBox;
  if (!c) { closeModal(); return $(`<div></div>`); }

  const isEmpty = (c.unidades_totales || 0) === 0;
  const isConsumed = c.estado === 'vacia';
  const tipoCaja = c.tipo_caja || 'reutilizable';

  let bodyHtml = `
    <div class="box-header">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
        <div class="box-code grow truncate">${escapeHtml(c.codigo_caja)}</div>
        <span class="pill pill-${tipoCaja === 'producto' ? 'info' : 'muted'}">${tipoCaja === 'producto' ? 'producto' : 'reutilizable'}</span>
      </div>
      <div class="box-loc">
        ${ICON.pin}
        <span>${escapeHtml(c.posicion?.ubicacion || 'Sin ubicar')} ${c.posicion?.descripcion ? '· ' + escapeHtml(c.posicion.descripcion) : ''}</span>
      </div>
      <div class="meta" style="margin-top:10px; font-family:var(--font-mono); font-size:11px; color:var(--muted);">
        <span>creada ${fmtDate(c.fecha_creacion)}</span>
        ${isConsumed ? `<span class="pill pill-warn" style="margin-left:8px;">consumida ${fmtDate(c.fecha_consumida)}</span>` : ''}
      </div>
    </div>

    ${isEmpty && !isConsumed ? `
      <div class="banner banner-warn" style="border:1px solid; padding:12px; margin-bottom:12px; display:flex; flex-direction:column; gap:10px; align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${ICON.warn}<strong>Esta caja está vacía</strong>
        </div>
        <div style="font-size:12px; line-height:1.5;">
          Marcala como <strong>consumida</strong> para sacarla del inventario activo. Los datos quedan guardados para análisis de consumo.
        </div>
        <button class="btn btn-sm btn-primary" id="btn-consume" style="width:100%;">
          ${ICON.check} Marcar como consumida
        </button>
      </div>
    ` : ''}

    ${isConsumed ? `
      <div class="banner banner-info" style="border:1px solid; padding:10px 14px; margin-bottom:12px;">
        ${ICON.info}<span>Esta caja ya fue consumida. Su historial queda en la base para análisis.</span>
      </div>
    ` : ''}

    <div class="section-title" style="padding:0 0 8px;">Contenido</div>
    ${!isConsumed ? `
      <button class="btn btn-block" id="btn-scan-prod-in-box" style="margin-bottom:10px;">
        ${ICON.scan} Escanear producto para reducir/reponer
      </button>
    ` : ''}
    <div id="contenido-list">
  `;

  // Operario solo ve los productos que escanea (no la lista completa)
  const esOperario = State.user?.rol === 'operario';
  if (esOperario && !isConsumed) {
    bodyHtml += `
      <div class="empty" style="padding:20px 8px;">
        ${ICON.scan}
        <p style="font-size:12px; color:var(--muted); margin-top:6px;">
          Escaneá un producto para verlo y operar sobre él.
        </p>
      </div>
    `;
  }

  c.contenido?.forEach(item => {
    if (esOperario && !isConsumed) return; // saltear para operario en cajas activas
    const art = MOCK.articulos.find(a => a.id === item.articulo_id) || item.articulos || { descripcion: 'Artículo ' + item.articulo_id, sku: '—' };
    const consumida = item.cantidad_inicial - item.cantidad_actual;
    const standardHint = (tipoCaja === 'producto' && art.unidades_por_caja && art.unidades_por_caja !== item.cantidad_inicial)
      ? ` · estándar ${art.unidades_por_caja}` : '';
    bodyHtml += `
      <div class="qty-row">
        <div class="qty-row-top">
          <div class="grow">
            <div class="qty-row-name">${escapeHtml(art.descripcion)}</div>
            <div class="qty-row-sku">${escapeHtml(art.sku || '—')}${standardHint}</div>
          </div>
        </div>
        <div class="qty-row-numbers">
          <div><small>Inicial</small><strong>${item.cantidad_inicial}</strong></div>
          <div class="consumidas"><small>Consumido</small><strong>${consumida}</strong></div>
          <div class="restantes"><small>Restante</small><strong>${item.cantidad_actual}</strong></div>
        </div>
        ${!isConsumed ? `
          <div class="actions-grid">
            <button class="btn btn-sm btn-danger" data-act="reduce" data-art="${item.articulo_id}">${ICON.minus} Reducir</button>
            <button class="btn btn-sm btn-success" data-act="increase" data-art="${item.articulo_id}">${ICON.plus} Reponer</button>
          </div>
        ` : ''}
      </div>
    `;
  });

  bodyHtml += `</div>`;

  const footerHtml = isConsumed
    ? `<button class="btn btn-block" id="btn-history">${ICON.history} Ver historial</button>`
    : `<div style="display:flex; flex-direction:column; gap:8px; width:100%;">
         <div style="display:flex; gap:8px;">
           <button class="btn grow" id="btn-print-box">${ICON.qr} Imprimir</button>
           <button class="btn grow" id="btn-move">${ICON.move} Mover</button>
           <button class="btn grow" id="btn-history">${ICON.history} Historial</button>
         </div>
         <button class="btn btn-danger btn-block" id="btn-destroy">${ICON.trash || '✕'} Destruir caja</button>
       </div>`;

  const modal = modalShell('Detalle de caja', bodyHtml, footerHtml);

  modal.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => {
      State.cache.currentArticleId = parseInt(b.dataset.art);
      State.modal = b.dataset.act === 'reduce' ? 'reduce' : 'increase';
      render();
    };
  });
  modal.querySelector('#btn-move')?.addEventListener('click', () => { State.modal = 'move'; render(); });
  modal.querySelector('#btn-history').onclick = () => { State.modal = 'history'; render(); };
  modal.querySelector('#btn-print-box')?.addEventListener('click', () => {
    State.cache.printCode = c.codigo_caja;
    State.modal = 'print';
    render();
  });

  modal.querySelector('#btn-destroy')?.addEventListener('click', async () => {
    // Doble validación
    const total = c.unidades_totales || 0;
    if (!confirm(
      `⚠️ ¿Destruir la caja ${c.codigo_caja}?\n\n` +
      `Tiene ${total} unidad${total !== 1 ? 'es' : ''} en su contenido.\n` +
      `Esta acción borra la caja del sistema.`
    )) return;
    const conf = prompt(
      `Para confirmar, escribí exactamente:\n\nDESTRUIR`
    );
    if (conf?.trim().toUpperCase() !== 'DESTRUIR') {
      toast('Confirmación incorrecta — caja NO destruida', 'warn');
      return;
    }
    try {
      await API.destruirCaja(c.id, `Destruida por ${State.user.username}`);
      toast('Caja destruida', 'success');
      closeModal();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  });

  modal.querySelector('#btn-scan-prod-in-box')?.addEventListener('click', () => {
    State.modal = 'scanProductInBox';
    render();
  });

  modal.querySelector('#btn-consume')?.addEventListener('click', async () => {
    if (!confirm('¿Marcar esta caja como consumida?\n\nQueda en la base para análisis de consumo, pero ya no aparecerá en la lista activa.')) return;
    try {
      await API.consumirCaja(c.id);
      toast('Caja marcada como consumida', 'success');
      closeModal();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  });

  return modal;
}

// =====================================================================
// REDUCIR / AUMENTAR cantidad
// =====================================================================
export function renderReduceModal() { return renderQtyModal('reducir'); }
export function renderIncreaseModal() { return renderQtyModal('aumentar'); }

function renderQtyModal(tipo) {
  const c = State.cache.currentBox;
  const artId = State.cache.currentArticleId;
  const item = c?.contenido?.find(i => i.articulo_id === artId);
  const art = MOCK.articulos.find(a => a.id === artId) || item?.articulos || { descripcion: 'Artículo' };
  const isReduce = tipo === 'reducir';
  const verb = isReduce ? 'Reducir' : 'Reponer';
  const max = isReduce ? item.cantidad_actual : item.cantidad_inicial - item.cantidad_actual;

  const bodyHtml = `
    <div class="box-header" style="display:flex; gap:12px; align-items:center;">
      ${art.imagen_url ? `<img src="${escapeHtml(art.imagen_url)}" alt="" style="width:64px; height:64px; object-fit:cover; border-radius:8px; flex-shrink:0;" onerror="this.style.display='none'" />` : ''}
      <div style="min-width:0; flex:1;">
        <div class="qty-row-name" style="margin-bottom:4px;">${escapeHtml(art.descripcion)}</div>
        <div class="meta mono" style="font-size:11px; color:var(--muted);">
          ${escapeHtml(art.sku || '—')} · ${isReduce ? 'Disponible' : 'Capacidad libre'}: <strong style="color:var(--accent);">${isReduce ? item.cantidad_actual : max}</strong>
        </div>
      </div>
    </div>

    <label class="label" style="margin-top:12px;">Cantidad a ${tipo}</label>
    <input type="number" inputmode="numeric" pattern="[0-9]*"
      id="qty-input" value="1" min="1" max="${max}"
      class="input"
      style="font-size:32px; text-align:center; font-weight:700; padding:14px;" />
  `;

  const footerHtml = `
    <button class="btn grow" id="cancel-act">Cancelar</button>
    <button class="btn btn-primary grow" id="confirm-act">Confirmar ${verb}</button>
  `;

  const modal = modalShell(verb + ' unidades', bodyHtml, footerHtml);

  const input = modal.querySelector('#qty-input');
  setTimeout(() => { input.focus(); input.select(); }, 80);

  modal.querySelector('#cancel-act').onclick = () => { State.modal = 'box'; render(); };
  modal.querySelector('#confirm-act').onclick = async () => {
    const cantidad = Math.max(1, Math.min(max, parseInt(input.value || '1')));
    const motivo = isReduce ? 'Venta' : 'Reposición desde proveedor';
    try {
      const result = await API.createMovimiento({
        tipo, caja_id: c.id, articulo_id: artId,
        cantidad, motivo, notas: '', usuario_id: State.user.id
      });
      if (result?.pending) {
        // Sin conexión — actualizar estado local para que la UI refleje el cambio
        if (item) {
          if (tipo === 'reducir') item.cantidad_actual = Math.max(0, item.cantidad_actual - cantidad);
          else item.cantidad_actual += cantidad;
        }
        feedback('ok');
        toast(`Sin señal · ${verb.toLowerCase()} guardado, se enviará al reconectar`, 'warn');
      } else {
        toast(`${verb} ${cantidad} unidades · OK`, 'success');
        const updated = await API.getCajaByCode(c.codigo_caja);
        if (updated) State.cache.currentBox = updated;
      }
      State.modal = 'box';
      render();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };

  return modal;
}

// =====================================================================
// MOVER caja
// =====================================================================
export function renderMoveModal() {
  const c = State.cache.currentBox;
  const bodyHtml = `
    <div class="box-header">
      <div class="qty-row-name" style="margin-bottom:4px;">Mover caja</div>
      <div class="meta mono" style="font-size:11px; color:var(--muted);">${escapeHtml(c.codigo_caja)}</div>
      <div style="margin-top:8px; font-size:13px;">
        Desde: <strong>${escapeHtml(c.posicion?.ubicacion || '—')}${c.posicion?.descripcion ? ' · ' + escapeHtml(c.posicion.descripcion) : ''}</strong>
      </div>
    </div>
    <label class="label">Nueva ubicación</label>
    <select class="select" id="new-pos">
      <option value="">— Selecciona —</option>
    </select>
    <label class="label" style="margin-top:16px;">Nota rápida (opcional)</label>
    <div class="note-chips" id="note-chips">
      ${['Reorganización', 'Temporada', 'Solicitud encargado', 'Más espacio', 'Corrección'].map(n =>
        `<button class="note-chip" data-note="${n}">${n}</button>`
      ).join('')}
    </div>
  `;
  const footerHtml = `
    <button class="btn grow" id="cancel-move">Cancelar</button>
    <button class="btn btn-primary grow" id="confirm-move">Confirmar traslado</button>
  `;

  const modal = modalShell('Trasladar caja', bodyHtml, footerHtml);

  API.listPosiciones().then(positions => {
    const sel = modal.querySelector('#new-pos');
    positions.filter(p => p.id !== c.posicion?.id).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.ubicacion} · ${p.descripcion}`;
      sel.appendChild(opt);
    });
  });

  modal.querySelectorAll('.note-chip').forEach(btn => {
    btn.onclick = () => {
      const active = btn.classList.contains('active');
      modal.querySelectorAll('.note-chip').forEach(b => b.classList.remove('active'));
      if (!active) btn.classList.add('active');
    };
  });

  modal.querySelector('#cancel-move').onclick = () => { State.modal = 'box'; render(); };
  modal.querySelector('#confirm-move').onclick = async () => {
    const newPosId = parseInt(modal.querySelector('#new-pos').value);
    if (!newPosId) { toast('Selecciona una ubicación', 'error'); return; }
    const notas = modal.querySelector('.note-chip.active')?.dataset.note || '';
    try {
      await API.createMovimiento({
        tipo: 'trasladar_caja', caja_id: c.id,
        posicion_origen_id: c.posicion?.id, posicion_destino_id: newPosId,
        usuario_id: State.user.id, notas
      });
      toast('Caja trasladada · OK', 'success');
      const updated = await API.getCajaByCode(c.codigo_caja);
      State.cache.currentBox = updated;
      State.modal = 'box';
      render();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  return modal;
}

// =====================================================================
// HISTORIAL
// =====================================================================
export function renderHistoryModal() {
  const c = State.cache.currentBox;
  const bodyHtml = `
    <div class="box-header" style="margin-bottom:12px;">
      <div class="qty-row-name" style="margin-bottom:4px;">Historial</div>
      <div class="meta mono" style="font-size:11px; color:var(--muted);">${escapeHtml(c.codigo_caja)}</div>
    </div>
    <div id="hist-list"><div class="empty"><div class="loader"></div></div></div>
  `;
  const modal = modalShell('Historial de caja', bodyHtml,
    `<button class="btn btn-block" id="back-history">Volver</button>`);
  modal.querySelector('#back-history').onclick = () => { State.modal = 'box'; render(); };

  API.listMovimientosByCaja(c.id).then(movs => {
    const list = modal.querySelector('#hist-list');
    list.innerHTML = '';
    if (!movs.length) {
      list.innerHTML = `<div class="empty"><h3>Sin historial</h3></div>`; return;
    }
    movs.forEach(m => {
      const cls = m.tipo === 'reducir' ? 'reducir'
                : m.tipo === 'aumentar' ? 'aumentar'
                : m.tipo === 'crear_caja' ? 'crear'
                : m.tipo === 'trasladar_caja' ? 'trasladar' : '';
      const verb = m.tipo === 'reducir' ? 'Salida'
                : m.tipo === 'aumentar' ? 'Reposición'
                : m.tipo === 'crear_caja' ? 'Caja creada'
                : m.tipo === 'trasladar_caja' ? 'Traslado'
                : m.tipo;
      const detail = m.articulo
        ? `<strong>${m.cantidad ?? ''}</strong> × ${escapeHtml(m.articulo.descripcion)}${m.articulo.sku ? ` <span class="mono" style="font-size:11px; color:var(--muted);">${escapeHtml(m.articulo.sku)}</span>` : ''}`
        : (m.motivo || '');
      list.appendChild($(`
        <div class="history-item">
          <div class="history-dot ${cls}"></div>
          <div class="history-text">
            <div><strong>${verb}</strong> ${detail ? '· ' + detail : ''}</div>
            <div class="history-time">
              ${escapeHtml(m.usuario?.nombre || '—')} · ${fmtDateTime(m.creado_at)}
              ${m.motivo ? ' · ' + escapeHtml(m.motivo) : ''}
              ${m.notas ? `<div style="margin-top:2px; font-style:italic; color:var(--text-2);">"${escapeHtml(m.notas)}"</div>` : ''}
            </div>
          </div>
        </div>
      `));
    });
  });

  return modal;
}

// =====================================================================
// CONFIG SUPABASE
// =====================================================================
export function renderConfigModal() {
  const isDemoMode = !State.config.url || !State.config.anonKey;
  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.5;">
      Conectá tu propio Supabase para guardar datos reales. Si no conectás nada, la app sigue funcionando con datos de demo.
    </p>
    <label class="label">URL del proyecto</label>
    <input class="input mono" id="cfg-url" placeholder="https://xxxxx.supabase.co"
      value="${escapeHtml(State.config.url || '')}" />
    <label class="label" style="margin-top:14px;">Anon / Public key</label>
    <textarea class="textarea mono" id="cfg-key" rows="3" placeholder="eyJhbGciOiJIUzI1NiIs...">${escapeHtml(State.config.anonKey || '')}</textarea>
    <div class="banner banner-info" style="margin-top:16px; border:1px solid;">
      ${ICON.info}
      <span>Tu URL y key se guardan únicamente en este dispositivo (localStorage). Nunca se envían a otro servidor.</span>
    </div>
  `;
  const footerHtml = `
    ${!isDemoMode ? '<button class="btn btn-danger grow" id="cfg-clear">Desconectar</button>' : ''}
    <button class="btn btn-primary grow" id="cfg-save">Guardar y conectar</button>
  `;
  const modal = modalShell('Configurar Supabase', bodyHtml, footerHtml);
  modal.querySelector('#cfg-save').onclick = () => {
    const url = modal.querySelector('#cfg-url').value.trim();
    const anonKey = modal.querySelector('#cfg-key').value.trim();
    if (!url || !anonKey) { toast('Completá URL y key', 'error'); return; }
    State.config = { url, anonKey };
    Storage.set('config', State.config);
    initSupabase();
    toast('Conectado a Supabase', 'success');
    closeModal();
  };
  modal.querySelector('#cfg-clear')?.addEventListener('click', () => {
    State.config = { url: '', anonKey: '' };
    Storage.remove('config');
    initSupabase();
    toast('Desconectado · modo demo', 'info');
    closeModal();
  });
  return modal;
}

// =====================================================================
// CREAR CAJA
// =====================================================================
export function renderCreateBoxModal() {
  if (!State.cache.newBox) {
    State.cache.newBox = {
      step: 1,
      codigo: generateBoxCode(),
      tipo_caja: 'producto',
      posicion_id: null,
      items: [],
      motivo: 'Recepción de proveedor'
    };
  }
  const nb = State.cache.newBox;
  if (!nb.step) nb.step = 1;
  const TOTAL_STEPS = 4;

  const stepHeader = `
    <div class="wizard-steps">
      ${[1,2,3,4].map(n => `
        <div class="wizard-step-dot ${nb.step >= n ? 'done' : ''} ${nb.step === n ? 'active' : ''}">${n}</div>
        ${n < 4 ? `<div class="wizard-step-line ${nb.step > n ? 'done' : ''}"></div>` : ''}
      `).join('')}
    </div>
    <div class="wizard-step-label">
      Paso ${nb.step} de ${TOTAL_STEPS} · ${
        nb.step === 1 ? 'Tipo y código' :
        nb.step === 2 ? 'Imprimir QR' :
        nb.step === 3 ? 'Escanear productos' :
        'Ubicación destino'
      }
    </div>
  `;

  let body, footer;

  // ── PASO 1: tipo + código ─────────────────────────────────────────
  if (nb.step === 1) {
    const isProducto = nb.tipo_caja === 'producto';
    body = `
      ${stepHeader}
      <p style="font-size:13px; color:var(--muted); margin-bottom:14px; text-align:center;">
        Vas a crear una caja nueva en 4 pasos:<br>
        <span style="font-size:11px;">1) Elegís tipo · 2) Imprimís QR · 3) Cargás productos · 4) Ubicación</span>
      </p>

      <div class="section-title" style="padding:0 0 8px;">¿Qué tipo de caja es?</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:18px;">
        <button class="btn ${isProducto ? 'btn-primary' : ''}" data-tipo="producto" style="flex-direction:column; padding:14px; min-height:auto; gap:4px; text-align:center;">
          ${ICON.box}
          <div style="font-size:13px; font-weight:600;">Caja del producto</div>
          <div style="font-size:10px; opacity:0.7; font-weight:400;">la que trae el proveedor</div>
        </button>
        <button class="btn ${!isProducto ? 'btn-primary' : ''}" data-tipo="reutilizable" style="flex-direction:column; padding:14px; min-height:auto; gap:4px; text-align:center;">
          ${ICON.box}
          <div style="font-size:13px; font-weight:600;">Caja reutilizable</div>
          <div style="font-size:10px; opacity:0.7; font-weight:400;">caja propia de bodega</div>
        </button>
      </div>

      <div class="section-title" style="padding:0 0 8px;">Código único de esta caja</div>
      <div class="box-header" style="margin-bottom:12px;">
        <div class="box-code mono" id="new-codigo">${escapeHtml(nb.codigo)}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:6px;">
          La app lo generó solo. En el siguiente paso vas a poder imprimirlo como QR.
        </div>
        <button class="btn btn-sm btn-block" id="btn-regen" style="margin-top:10px;">
          ${ICON.refresh} Generar otro código
        </button>
      </div>
    `;
    footer = `
      <button class="btn grow" id="wiz-cancel">Cancelar</button>
      <button class="btn btn-primary grow" id="wiz-next">Siguiente →</button>
    `;
  }

  // ── PASO 2: imprimir QR ───────────────────────────────────────────
  else if (nb.step === 2) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&ecc=M&data=${encodeURIComponent(nb.codigo)}`;
    body = `
      ${stepHeader}
      <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">
        Imprimí este QR y pegalo en la caja antes de continuar.
      </p>
      <div style="background:#fff; padding:18px; display:flex; flex-direction:column; align-items:center; gap:10px; border:1px solid var(--border); border-radius:12px;">
        <img src="${qrUrl}" width="200" height="200" alt="${escapeHtml(nb.codigo)}" style="display:block;" />
        <div class="mono" style="font-size:13px; font-weight:700; color:#000;">${escapeHtml(nb.codigo)}</div>
      </div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn grow" id="wiz-copy">${ICON.copy || '📋'} Copiar código</button>
        <button class="btn grow" id="wiz-fullprint">Imprimir</button>
      </div>
      <div style="margin-top:14px; padding:12px; border:1px dashed var(--border); border-radius:10px; background:var(--surface-2);">
        <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">
          ✓ Verificá la etiqueta impresa
        </div>
        <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">
          Apuntá la cámara al QR que acabás de pegar en la caja para confirmar que se lee bien.
        </div>
        <button class="btn btn-block btn-primary" id="wiz-verify-scan">
          ${ICON.scan} Escanear QR de la caja
        </button>
      </div>
    `;
    footer = `
      <button class="btn btn-block" id="wiz-back">← Atrás</button>
    `;
  }

  // ── PASO 3: productos ─────────────────────────────────────────────
  else if (nb.step === 3) {
    body = `
      ${stepHeader}
      <div class="section-title" style="padding:0 0 8px;">
        Productos de la caja <small id="items-count" style="color:var(--accent); font-weight:700;">${nb.items.length}</small>
      </div>
      <div id="items-list" style="margin-bottom:10px;">
        ${nb.items.length === 0 ? `
          <div class="empty" style="padding:20px; border:1px dashed var(--border-2); border-radius:10px;">
            ${ICON.box}
            <p style="margin-top:8px; font-size:13px;">Escaneá productos para agregarlos</p>
          </div>
        ` : nb.items.map((it, idx) => `
          <div class="qty-row">
            <div class="qty-row-top">
              <div class="grow">
                <div class="qty-row-name">${escapeHtml(it.articulo.descripcion)}</div>
                <div class="qty-row-sku mono">${escapeHtml(it.articulo.sku || '—')}</div>
              </div>
              <button class="btn btn-sm btn-danger" data-rm="${idx}" style="padding:6px 10px;">${ICON.trash || '✕'}</button>
            </div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:10px;">
              <small style="font-size:10px; color:var(--muted); text-transform:uppercase;">Cantidad</small>
              <input type="number" inputmode="numeric" pattern="[0-9]*" class="input mono" data-edit-qty="${idx}" value="${it.cantidad}" min="1" style="width:90px; padding:8px; font-size:14px; text-align:center;" />
              <small style="color:var(--muted); font-size:12px;">unidades</small>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-block btn-primary" id="btn-scan-prod" style="margin-bottom:8px;">
        ${ICON.scan} Escanear producto
      </button>
      <button class="btn btn-block btn-ghost" id="btn-pick-prod">
        ${ICON.list} Seleccionar manualmente
      </button>
    `;
    footer = `
      <button class="btn grow" id="wiz-back">← Atrás</button>
      <button class="btn btn-primary grow" id="wiz-next" ${nb.items.length === 0 ? 'disabled' : ''}>Siguiente →</button>
    `;
  }

  // ── PASO 4: ubicación + crear ─────────────────────────────────────
  else if (nb.step === 4) {
    body = `
      ${stepHeader}
      <div class="section-title" style="padding:0 0 8px;">¿Dónde se guarda esta caja?</div>
      <div id="new-pos-list" class="lote-pos-grid">
        <div class="empty" style="padding:24px 0;"><div class="loader"></div></div>
      </div>
      <input type="hidden" id="new-pos" value="${nb.posicion_id || ''}" />

      <div class="section-title" style="padding:14px 0 6px;">Resumen</div>
      <div style="font-size:12px; color:var(--muted); background:var(--surface-2); padding:10px 12px; border-radius:10px;">
        <div><strong style="color:var(--text);">Código:</strong> <span class="mono">${escapeHtml(nb.codigo)}</span></div>
        <div><strong style="color:var(--text);">Tipo:</strong> ${nb.tipo_caja}</div>
        <div><strong style="color:var(--text);">Productos:</strong> ${nb.items.length} (${nb.items.reduce((s, it) => s + it.cantidad, 0)} unidades)</div>
      </div>
    `;
    footer = `
      <button class="btn grow" id="wiz-back">← Atrás</button>
      <button class="btn btn-primary grow" id="wiz-create">${ICON.check} Crear caja</button>
    `;
  }

  const modal = modalShell('Iniciar caja nueva', body, footer);

  // ── Handlers comunes ──
  modal.querySelector('#wiz-cancel')?.addEventListener('click', () => {
    if (confirm('¿Descartar la caja en progreso?')) {
      State.cache.newBox = null;
      closeModal();
    }
  });
  modal.querySelector('#wiz-back')?.addEventListener('click', () => {
    nb.step = Math.max(1, nb.step - 1);
    render();
  });

  // ── Paso 1 ──
  if (nb.step === 1) {
    modal.querySelectorAll('[data-tipo]').forEach(b => {
      b.onclick = () => { nb.tipo_caja = b.dataset.tipo; render(); };
    });
    modal.querySelector('#btn-regen').onclick = () => {
      nb.codigo = generateBoxCode();
      modal.querySelector('#new-codigo').textContent = nb.codigo;
      toast('Código regenerado', 'info');
    };
    modal.querySelector('#wiz-next').onclick = () => { nb.step = 2; render(); };
  }

  // ── Paso 2 ──
  if (nb.step === 2) {
    modal.querySelector('#wiz-copy').onclick = () => {
      navigator.clipboard?.writeText(nb.codigo).then(
        () => toast('Código copiado', 'success'),
        () => toast('No se pudo copiar', 'error')
      );
    };
    modal.querySelector('#wiz-fullprint').onclick = () => {
      State.cache.printCode = nb.codigo;
      State.cache.printReturnTo = 'create';
      State.modal = 'print';
      render();
    };
    // wiz-next no existe en paso 2: la única forma de avanzar es escaneando el QR
    modal.querySelector('#wiz-verify-scan').onclick = async () => {
      try {
        const { startScanner: ss, stopScanner: stp } = await import('./scanner.js');
        // Crear contenedor temporal y abrir escáner full-screen rápido
        const overlay = document.createElement('div');
        overlay.id = 'wiz-verify-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
          <div style="color:#fff;font-size:14px;margin-bottom:10px;">Apuntá al QR que pegaste</div>
          <div id="wiz-verify-reader" style="width:100%;max-width:360px;height:360px;background:#000;border-radius:14px;overflow:hidden;position:relative;"></div>
          <button class="btn" id="wiz-verify-cancel" style="margin-top:14px;background:#fff;color:#000;">Cancelar</button>
        `;
        document.body.appendChild(overlay);
        const cleanup = () => { stp(); overlay.remove(); };
        overlay.querySelector('#wiz-verify-cancel').onclick = cleanup;
        ss('wiz-verify-reader', (decoded) => {
          cleanup();
          if (decoded.trim() === nb.codigo) {
            toast('✓ Verificado — pasando a productos', 'success');
            nb.step = 3; render();
          } else {
            toast(`⚠ El QR escaneado no coincide (${decoded.slice(0,12)}…)`, 'error');
          }
        });
      } catch (e) {
        toast('Error al abrir cámara: ' + e.message, 'error');
      }
    };
  }

  // ── Paso 3 ──
  if (nb.step === 3) {
    modal.querySelectorAll('[data-edit-qty]').forEach(inp => {
      inp.onchange = e => {
        const idx = parseInt(e.target.dataset.editQty);
        const v = Math.max(1, parseInt(e.target.value) || 1);
        nb.items[idx].cantidad = v;
        e.target.value = v;
      };
    });
    modal.querySelectorAll('[data-rm]').forEach(b => {
      b.onclick = () => {
        const idx = parseInt(b.dataset.rm);
        nb.items.splice(idx, 1);
        render();
      };
    });
    modal.querySelector('#btn-scan-prod').onclick = () => {
      State.modal = 'scanProduct'; render();
    };
    modal.querySelector('#btn-pick-prod').onclick = async () => {
      const articulos = await API.listArticulos();
      const sku = prompt('Ingresá el SKU o código del producto:\n\n' +
        articulos.slice(0, 10).map(a => `${a.sku} · ${a.descripcion}`).join('\n'));
      if (!sku) return;
      const found = articulos.find(a =>
        a.sku === sku.trim() || a.codigo_barras === sku.trim() ||
        a.descripcion.toLowerCase().includes(sku.trim().toLowerCase())
      );
      if (!found) { toast('No encontré ese producto', 'error'); return; }
      addProductToNewBox(found);
    };
    modal.querySelector('#wiz-next').onclick = () => {
      if (!nb.items.length) { toast('Agregá al menos un producto', 'warn'); return; }
      nb.step = 4; render();
    };
  }

  // ── Paso 4 ──
  if (nb.step === 4) {
    API.listPosiciones().then(positions => {
      const list = modal.querySelector('#new-pos-list');
      const hidden = modal.querySelector('#new-pos');
      if (!list) return;
      if (!positions.length) {
        list.innerHTML = `<div class="empty" style="padding:14px 0;"><p>Sin ubicaciones disponibles</p></div>`;
        return;
      }
      list.innerHTML = positions.map(p => `
        <button class="lote-pos-card ${nb.posicion_id === p.id ? 'selected' : ''}" data-pid="${p.id}">
          <div class="lote-pos-icon">${ICON.pin}</div>
          <div class="lote-pos-text">
            <div class="lote-pos-name">${escapeHtml(p.ubicacion || '—')}</div>
            <div class="lote-pos-desc mono">${escapeHtml(p.descripcion || '')}</div>
          </div>
        </button>
      `).join('');
      list.querySelectorAll('.lote-pos-card').forEach(btn => {
        btn.onclick = () => {
          list.querySelectorAll('.lote-pos-card').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          hidden.value = btn.dataset.pid;
          nb.posicion_id = parseInt(btn.dataset.pid);
        };
      });
    });

    modal.querySelector('#wiz-create').onclick = async () => {
      if (!nb.posicion_id) { toast('Seleccioná una ubicación', 'error'); return; }
      try {
        await API.createCaja({
          codigo_caja: nb.codigo,
          tipo_caja: nb.tipo_caja,
          posicion_id: nb.posicion_id,
          items: nb.items.map(it => ({ articulo_id: it.articulo.id, cantidad: it.cantidad })),
          motivo: nb.motivo
        });
        toast('Caja creada · ' + nb.codigo, 'success');
        State.cache.printCode = nb.codigo;
        State.cache.newBox = null;
        State.modal = 'print';
        render();
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    };
  }

  return modal;
}

function addProductToNewBox(articulo) {
  const nb = State.cache.newBox;
  const isProducto = nb.tipo_caja === 'producto';
  const sugerida = isProducto && articulo.unidades_por_caja ? articulo.unidades_por_caja : 1;
  const promptMsg = isProducto && articulo.unidades_por_caja
    ? `Cantidad recibida de "${articulo.descripcion}":\n\nCapacidad estándar: ${articulo.unidades_por_caja} unidades\n(podés editar si el proveedor trajo menos)`
    : `Cantidad de "${articulo.descripcion}" en la caja:`;
  const cantidad = parseInt(prompt(promptMsg, String(sugerida)));
  if (!cantidad || cantidad < 1) return;
  const existing = nb.items.find(it => it.articulo.id === articulo.id);
  if (existing) existing.cantidad += cantidad;
  else nb.items.push({ articulo, cantidad });
  toast(`Agregado: ${cantidad} × ${articulo.descripcion}`, 'success');
  State.modal = 'create';
  render();
}

// =====================================================================
// ESCANEAR PRODUCTO (sub-modal)
// =====================================================================
export function renderScanProductModal() {
  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">
      Apuntá la cámara al código de barras del producto.
    </p>
    <div class="scan-hero" style="margin:0;">
      <div class="scan-hero-inner" id="prod-scan-host">
        <div id="prod-qr-reader"></div>
        <div class="scan-overlay">
          <div class="scan-frame">
            <span></span><span></span>
            <div class="scan-line"></div>
          </div>
        </div>
      </div>
    </div>
    <label class="label" style="margin-top:16px;">O ingresá el código a mano</label>
    <div style="display:flex; gap:8px;">
      <input class="input mono" id="prod-manual" placeholder="SKU o código de barras" />
      <button class="btn" id="prod-manual-btn">${ICON.check}</button>
    </div>
  `;
  const footerHtml = `<button class="btn btn-block" id="prod-cancel">Volver</button>`;
  const modal = modalShell('Escanear producto', bodyHtml, footerHtml);

  setTimeout(() => {
    startScanner('prod-qr-reader', handleProductScanned, {
      qrbox: { width: 240, height: 160 }
    });
  }, 100);

  modal.querySelector('#prod-manual-btn').onclick = () => {
    const v = modal.querySelector('#prod-manual').value.trim();
    if (v) { stopScanner(); handleProductScanned(v); }
  };
  modal.querySelector('#prod-manual').onkeydown = e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v) { stopScanner(); handleProductScanned(v); }
    }
  };
  modal.querySelector('#prod-cancel').onclick = () => {
    stopScanner();
    State.modal = 'create';
    render();
  };

  return modal;
}

async function handleProductScanned(code) {
  try {
    const articulo = await API.findArticuloByCode(code);
    if (!articulo) {
      toast(`No encontré el producto "${code}"`, 'error');
      State.modal = 'create';
      render();
      return;
    }
    addProductToNewBox(articulo);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    State.modal = 'create';
    render();
  }
}

// =====================================================================
// ESCANEAR PRODUCTO DENTRO DE UNA CAJA — abre Reducir/Reponer
// =====================================================================
export function renderScanProductInBoxModal() {
  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">
      Apuntá la cámara al código de barras del producto que querés reducir o reponer.
    </p>
    <div class="scan-hero" style="margin:0;">
      <div class="scan-hero-inner">
        <div id="prod-in-box-reader"></div>
        <div class="scan-overlay">
          <div class="scan-frame">
            <span></span><span></span>
            <div class="scan-line"></div>
          </div>
        </div>
      </div>
    </div>
    <label class="label" style="margin-top:16px;">O ingresá el código a mano</label>
    <div style="display:flex; gap:8px;">
      <input class="input mono" id="pib-manual" placeholder="SKU o código de barras" />
      <button class="btn" id="pib-manual-btn">${ICON.check}</button>
    </div>
  `;
  const footerHtml = `<button class="btn btn-block" id="pib-cancel">Volver</button>`;
  const modal = modalShell('Escanear producto', bodyHtml, footerHtml);

  setTimeout(() => {
    startScanner('prod-in-box-reader', handleProductInBoxScanned, {
      qrbox: { width: 240, height: 160 }
    });
  }, 100);

  modal.querySelector('#pib-manual-btn').onclick = () => {
    const v = modal.querySelector('#pib-manual').value.trim();
    if (v) { stopScanner(); handleProductInBoxScanned(v); }
  };
  modal.querySelector('#pib-manual').onkeydown = e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v) { stopScanner(); handleProductInBoxScanned(v); }
    }
  };
  modal.querySelector('#pib-cancel').onclick = () => {
    stopScanner();
    State.modal = 'box';
    render();
  };

  return modal;
}

async function handleProductInBoxScanned(code) {
  const caja = State.cache.currentBox;
  if (!caja) { closeModal(); return; }

  let articulo;
  try {
    articulo = await API.findArticuloByCode(code);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    State.modal = 'box'; render(); return;
  }
  if (!articulo) {
    toast(`No encontré el producto "${code}"`, 'error');
    State.modal = 'box'; render(); return;
  }

  // Verificar que el artículo esté dentro de la caja actual
  const item = (caja.contenido || []).find(it => it.articulo_id === articulo.id);
  if (!item) {
    toast(`"${articulo.descripcion}" no está en esta caja`, 'error');
    State.modal = 'box'; render(); return;
  }

  // Pregunta rápida: reducir o reponer
  State.cache.currentArticleId = articulo.id;
  const accion = confirm(
    `${articulo.descripcion}\nRestante: ${item.cantidad_actual}\n\nAceptar = REDUCIR\nCancelar = REPONER`
  );
  State.modal = accion ? 'reduce' : 'increase';
  render();
}



// =====================================================================
// GENERAR CAJAS EN LOTE — escanea producto + cantidad de cajas + imprime Zebra
// =====================================================================
export function renderBatchGenerateModal() {
  if (!State.cache.batchGen) {
    State.cache.batchGen = { articulo: null, numCajas: 1, cantPorCaja: 1, posicionId: null, positions: [] };
  }
  const bg = State.cache.batchGen;

  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">
      Escaneá un producto y decí cuántas cajas iguales querés generar. La app va a crear las cajas y enviar todas las etiquetas a la Zebra.
    </p>

    <div class="section-title" style="padding:0 0 8px;">1 · Producto</div>
    <div id="bg-prod-box" style="margin-bottom:14px;">
      ${bg.articulo ? `
        <div class="qty-row">
          <div class="qty-row-top">
            <div class="grow">
              <div class="qty-row-name">${escapeHtml(bg.articulo.descripcion)}</div>
              <div class="qty-row-sku mono">${escapeHtml(bg.articulo.sku || '—')} · ${escapeHtml(bg.articulo.codigo_barras || '')}</div>
            </div>
            <button class="btn btn-sm" id="bg-rescan">Cambiar</button>
          </div>
        </div>
      ` : `
        <button class="btn btn-block btn-primary" id="bg-scan-prod">${ICON.scan} Escanear producto</button>
        <button class="btn btn-block btn-ghost" id="bg-pick-prod" style="margin-top:6px;">${ICON.list} Seleccionar manual</button>
      `}
    </div>

    <div class="section-title" style="padding:0 0 8px;">2 · Cantidades</div>
    <label class="label">¿Cuántas cajas?</label>
    <input type="number" inputmode="numeric" pattern="[0-9]*" id="bg-num" class="input" min="1" max="200" value="${bg.numCajas}" style="font-size:24px; text-align:center; font-weight:700;" />
    <label class="label" style="margin-top:12px;">Unidades por caja</label>
    <input type="number" inputmode="numeric" pattern="[0-9]*" id="bg-cant" class="input" min="1" value="${bg.cantPorCaja}" style="font-size:18px; text-align:center; font-weight:600;" />

    <div class="section-title" style="padding:14px 0 8px;">3 · Ubicación</div>
    <div id="bg-pos-list" class="lote-pos-grid">
      <div class="empty" style="padding:18px 0;"><div class="loader"></div></div>
    </div>
  `;

  const footerHtml = `
    <button class="btn grow" id="bg-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="bg-go">${ICON.qr} Generar e imprimir</button>
  `;
  const modal = modalShell('Generar cajas en lote', bodyHtml, footerHtml);

  const numIn  = modal.querySelector('#bg-num');
  const cantIn = modal.querySelector('#bg-cant');
  numIn.oninput  = e => { bg.numCajas    = Math.max(1, parseInt(e.target.value) || 1); };
  cantIn.oninput = e => { bg.cantPorCaja = Math.max(1, parseInt(e.target.value) || 1); };

  modal.querySelector('#bg-scan-prod')?.addEventListener('click', () => {
    State.cache.scanProductReturnTo = 'batchGenerate';
    State.modal = 'scanProductForBatch';
    render();
  });
  modal.querySelector('#bg-rescan')?.addEventListener('click', () => {
    bg.articulo = null;
    State.modal = 'batchGenerate';
    render();
  });
  modal.querySelector('#bg-pick-prod')?.addEventListener('click', async () => {
    const arts = await API.listArticulos();
    const txt = prompt('SKU o código de barras:\n\n' +
      arts.slice(0, 12).map(a => `${a.sku} · ${a.descripcion}`).join('\n'));
    if (!txt) return;
    const found = arts.find(a =>
      a.sku === txt.trim() || a.codigo_barras === txt.trim() ||
      a.descripcion.toLowerCase().includes(txt.trim().toLowerCase())
    );
    if (!found) { toast('No encontré ese producto', 'error'); return; }
    bg.articulo = found;
    if (found.unidades_por_caja) bg.cantPorCaja = found.unidades_por_caja;
    State.modal = 'batchGenerate'; render();
  });

  // Cargar ubicaciones
  API.listPosiciones().then(positions => {
    const list = modal.querySelector('#bg-pos-list');
    if (!positions.length) {
      list.innerHTML = `<div class="empty"><p>Sin ubicaciones</p></div>`; return;
    }
    list.innerHTML = positions.map(p => `
      <button class="lote-pos-card ${bg.posicionId === p.id ? 'selected' : ''}" data-pid="${p.id}">
        <div class="lote-pos-icon">${ICON.pin}</div>
        <div class="lote-pos-text">
          <div class="lote-pos-name">${escapeHtml(p.ubicacion || '—')}</div>
          <div class="lote-pos-desc mono">${escapeHtml(p.descripcion || '')}</div>
        </div>
      </button>
    `).join('');
    list.querySelectorAll('.lote-pos-card').forEach(btn => {
      btn.onclick = () => {
        list.querySelectorAll('.lote-pos-card').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        bg.posicionId = parseInt(btn.dataset.pid);
      };
    });
  });

  modal.querySelector('#bg-cancel').onclick = () => {
    State.cache.batchGen = null;
    closeModal();
  };

  modal.querySelector('#bg-go').onclick = async () => {
    if (!bg.articulo) { toast('Escaneá o seleccioná un producto', 'error'); return; }
    if (!bg.posicionId) { toast('Elegí una ubicación', 'error'); return; }
    if (bg.numCajas < 1) { toast('Cantidad de cajas inválida', 'error'); return; }
    if (!confirm(`¿Generar ${bg.numCajas} caja${bg.numCajas !== 1 ? 's' : ''} con ${bg.cantPorCaja} ${bg.articulo.descripcion}?\n\nSe imprimirán todas en la Zebra.`)) return;

    const btn = modal.querySelector('#bg-go');
    btn.disabled = true;

    const codes = [];
    for (let i = 0; i < bg.numCajas; i++) {
      btn.textContent = `Creando caja ${i+1}/${bg.numCajas}…`;
      const codigo = generateBoxCode();
      try {
        await API.createCaja({
          codigo_caja: codigo,
          tipo_caja: 'producto',
          posicion_id: bg.posicionId,
          items: [{ articulo_id: bg.articulo.id, cantidad: bg.cantPorCaja }],
          motivo: 'Generación en lote'
        });
        codes.push(codigo);
      } catch (e) {
        toast(`Error en caja ${i+1}: ${e.message}`, 'error');
      }
    }

    // Imprimir cada una en Zebra (best-effort)
    btn.textContent = 'Enviando a Zebra…';
    const endpoint = State.config.zebraUrl || 'http://localhost:9100';
    let zebraOk = 0, zebraFail = 0;
    let device = null;
    try {
      const r = await fetch(endpoint + '/available');
      const json = await r.json();
      device = json?.printer?.[0] || json?.devices?.[0] || json?.printers?.[0];
    } catch (_) { device = null; }

    for (const code of codes) {
      const zpl = [
        '^XA','^PW400','^LL240','^LH0,0',
        '^FO80,20^BQN,2,5^FDLA,' + code + '^FS',
        '^FO20,200^A0N,22,22^FB360,1,0,C,0^FD' + code + '^FS',
        '^XZ'
      ].join('\n');
      if (!device) { zebraFail++; continue; }
      try {
        await fetch(endpoint + '/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device, data: zpl })
        });
        zebraOk++;
      } catch (_) { zebraFail++; }
    }

    if (zebraOk === codes.length) {
      toast(`✓ ${codes.length} cajas creadas e impresas`, 'success');
    } else if (zebraOk > 0) {
      toast(`${codes.length} cajas creadas · ${zebraOk} impresas, ${zebraFail} fallaron`, 'warn');
    } else {
      toast(`${codes.length} cajas creadas. Zebra no respondió — los códigos quedaron guardados.`, 'warn');
    }

    State.cache.batchGen = null;
    closeModal();
  };

  return modal;
}

// Modal espejo de scanProduct pero que vuelve a batchGenerate al leer
export function renderScanProductForBatchModal() {
  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">
      Apuntá la cámara al código de barras del producto.
    </p>
    <div class="scan-hero" style="margin:0;">
      <div class="scan-hero-inner">
        <div id="bg-prod-reader"></div>
        <div class="scan-overlay">
          <div class="scan-frame"><span></span><span></span><div class="scan-line"></div></div>
        </div>
      </div>
    </div>
    <label class="label" style="margin-top:14px;">O ingresá el código a mano</label>
    <div style="display:flex; gap:8px;">
      <input class="input mono" id="bg-prod-manual" placeholder="SKU o código de barras" />
      <button class="btn" id="bg-prod-manual-btn">${ICON.check}</button>
    </div>
  `;
  const footerHtml = `<button class="btn btn-block" id="bg-prod-cancel">Volver</button>`;
  const modal = modalShell('Escanear producto', bodyHtml, footerHtml);

  const handle = async (code) => {
    stopScanner();
    const art = await API.findArticuloByCode(code);
    if (!art) { toast(`No encontré "${code}"`, 'error'); State.modal = 'batchGenerate'; render(); return; }
    if (!State.cache.batchGen) State.cache.batchGen = { articulo: null, numCajas: 1, cantPorCaja: 1, posicionId: null };
    State.cache.batchGen.articulo = art;
    if (art.unidades_por_caja) State.cache.batchGen.cantPorCaja = art.unidades_por_caja;
    State.modal = 'batchGenerate';
    render();
  };
  setTimeout(() => startScanner('bg-prod-reader', handle, { qrbox: { width: 240, height: 160 } }), 100);

  modal.querySelector('#bg-prod-manual-btn').onclick = () => {
    const v = modal.querySelector('#bg-prod-manual').value.trim();
    if (v) handle(v);
  };
  modal.querySelector('#bg-prod-manual').onkeydown = e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) handle(v); }
  };
  modal.querySelector('#bg-prod-cancel').onclick = () => { stopScanner(); State.modal = 'batchGenerate'; render(); };

  return modal;
}

// =====================================================================
// MOVER LOTE — modal de confirmación de traslado masivo
// =====================================================================
export function renderMoverLoteModal() {
  const lote = State.cache.loteBoxes || [];
  const bodyHtml = `
    <div style="font-size:13px; color:var(--text-2); margin-bottom:12px;">
      <strong style="color:var(--text);">${lote.length} caja${lote.length !== 1 ? 's' : ''}</strong> se trasladarán a la nueva ubicación:
    </div>
    <div style="max-height:130px; overflow-y:auto; border:1px solid var(--border); border-radius:10px; padding:8px 12px; margin-bottom:16px; background:var(--surface);">
      ${lote.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-2);">
          <span class="mono" style="font-size:12px; color:var(--accent);">${escapeHtml(c.codigo_caja)}</span>
          <span style="font-size:11px; color:var(--muted);">${escapeHtml(c.posicion?.ubicacion || '—')}</span>
        </div>
      `).join('')}
    </div>
    <label class="label">Nueva ubicación</label>
    <div id="lote-pos-list" class="lote-pos-grid">
      <div class="empty" style="padding:24px 0;"><div class="loader"></div></div>
    </div>
    <input type="hidden" id="lote-new-pos" value="" />
  `;
  const footerHtml = `
    <button class="btn grow" id="lote-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="lote-confirm">Mover ${lote.length} cajas</button>
  `;
  const modal = modalShell(`Mover ${lote.length} caja${lote.length !== 1 ? 's' : ''}`, bodyHtml, footerHtml);

  API.listPosiciones().then(positions => {
    const list = modal.querySelector('#lote-pos-list');
    const hidden = modal.querySelector('#lote-new-pos');
    if (!list) return;
    if (!positions.length) {
      list.innerHTML = `<div class="empty" style="padding:14px 0;"><p>Sin ubicaciones disponibles</p></div>`;
      return;
    }
    list.innerHTML = positions.map(p => `
      <button class="lote-pos-card" data-pid="${p.id}">
        <div class="lote-pos-icon">${ICON.pin}</div>
        <div class="lote-pos-text">
          <div class="lote-pos-name">${escapeHtml(p.ubicacion || '—')}</div>
          <div class="lote-pos-desc mono">${escapeHtml(p.descripcion || '')}</div>
        </div>
      </button>
    `).join('');
    list.querySelectorAll('.lote-pos-card').forEach(btn => {
      btn.onclick = () => {
        list.querySelectorAll('.lote-pos-card').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        hidden.value = btn.dataset.pid;
      };
    });
  });

  modal.querySelector('#lote-cancel').onclick = () => { State.modal = null; render(); };

  modal.querySelector('#lote-confirm').onclick = async () => {
    const newPosId = parseInt(modal.querySelector('#lote-new-pos').value);
    if (!newPosId) { toast('Seleccioná una ubicación', 'error'); return; }
    const notas = '';
    const btn = modal.querySelector('#lote-confirm');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    try {
      for (const caja of lote) {
        await API.createMovimiento({
          tipo: 'trasladar_caja', caja_id: caja.id,
          posicion_origen_id: caja.posicion?.id,
          posicion_destino_id: newPosId,
          usuario_id: State.user.id, notas
        });
      }
      toast(`${lote.length} caja${lote.length !== 1 ? 's' : ''} movida${lote.length !== 1 ? 's' : ''} ✓`, 'success');
      State.cache.loteBoxes = [];
      State.modal = null;
      State.view = 'scan';
      render();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = `Mover ${lote.length} cajas`;
    }
  };
  return modal;
}

// =====================================================================
// IMPRIMIR QR
// =====================================================================
export function renderPrintQRModal() {
  const code = State.cache.printCode;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=M&data=${encodeURIComponent(code)}`;
  const bodyHtml = `
    <div class="banner banner-info" style="border:1px solid; margin-bottom:16px;">
      ${ICON.info}<span>Caja creada · imprimí este QR y pegalo en la caja física</span>
    </div>
    <div style="background:#fff; padding:24px; display:flex; flex-direction:column; align-items:center; gap:12px; border:1px solid var(--border);">
      <img src="${qrUrl}" width="280" height="280" alt="${escapeHtml(code)}"
           style="display:block; image-rendering:pixelated;"
           onerror="this.style.display='none'; document.getElementById('qr-fallback').style.display='flex';" />
      <div id="qr-fallback" style="display:none; width:280px; height:280px; align-items:center; justify-content:center; border:2px dashed #ccc; border-radius:8px; font-size:13px; color:#999; text-align:center; padding:16px;">
        Sin conexión · usá el código de texto para imprimir el QR
      </div>
      <div style="font-family:var(--font-mono); font-size:14px; font-weight:600; color:#000; text-align:center; letter-spacing:-0.01em;">
        ${escapeHtml(code)}
      </div>
    </div>
    <div style="background:var(--surface-2); padding:14px; margin-top:12px; font-size:12px; line-height:1.6; color:var(--text-2);">
      <strong style="color:var(--accent);">Cómo imprimir:</strong><br>
      <strong>A) Imprimir directo</strong> — botón "Imprimir": elegí cualquier impresora (AirPrint, Bluetooth, USB, oficina).<br>
      <strong>B) Zebra (almacén)</strong> — botón "Zebra": envía ZPL directo a la impresora si tenés <em>Zebra Browser Print</em> instalado en la PC, o al endpoint de red. También podés copiar el ZPL.<br>
      <strong>C) Etiquetadora chica</strong> (Phomemo, Brother, Niimbot) — tomá screenshot, abrila en la app de tu impresora.
    </div>
  `;
  const footerHtml = `
    <div style="display:flex; flex-direction:column; gap:6px; width:100%;">
      <div style="display:flex; gap:6px;">
        <button class="btn grow" id="copy-code">Copiar código</button>
        <button class="btn grow" id="print-zebra">${ICON.qr || '🖨'} Zebra (ZPL)</button>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn grow" id="print-now">${ICON.qr || '🖨'} Imprimir</button>
        <button class="btn btn-primary grow" id="done-print">Listo</button>
      </div>
    </div>
  `;
  const modal = modalShell('QR de la caja', bodyHtml, footerHtml);

  // ── ZPL para Zebra (etiqueta 50×30 mm a 203 dpi = ~400×240 dots) ──
  const buildZPL = (txt) => {
    const safe = String(txt).replace(/[^\x20-\x7E]/g, '');
    return [
      '^XA',
      '^PW400',          // ancho ~50mm @ 203dpi
      '^LL240',          // largo ~30mm
      '^LH0,0',
      // QR centrado
      '^FO80,20^BQN,2,5^FDLA,' + safe + '^FS',
      // Texto debajo del QR
      '^FO20,200^A0N,22,22^FB360,1,0,C,0^FD' + safe + '^FS',
      '^XZ'
    ].join('\n');
  };

  modal.querySelector('#copy-code').onclick = () => {
    navigator.clipboard?.writeText(code).then(
      () => toast('Código copiado', 'success'),
      () => toast('No se pudo copiar', 'error')
    );
  };

  modal.querySelector('#print-zebra').onclick = async () => {
    const zpl = buildZPL(code);
    const endpoint = State.config.zebraUrl || 'http://localhost:9100';
    const btn = modal.querySelector('#print-zebra');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Enviando…';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(endpoint + '/available', { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('Browser Print no responde');
      const json = await r.json();
      const dev = json?.printer?.[0] || json?.devices?.[0] || json?.printers?.[0];
      if (!dev) throw new Error('No hay impresora Zebra conectada');
      const r2 = await fetch(endpoint + '/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: dev, data: zpl })
      });
      if (!r2.ok) throw new Error('Falló el envío a la Zebra');
      toast('✓ Enviado a Zebra', 'success');
    } catch (e) {
      toast('No se pudo imprimir: instalá Zebra Browser Print en la PC del almacén (gratis en zebra.com)', 'error');
      console.error('[Zebra]', e);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  modal.querySelector('#print-now').onclick = () => {
    // Abre una ventana imprimible con sólo el QR + código (cualquier impresora)
    const w = window.open('', '_blank');
    if (!w) { toast('Permití ventanas emergentes para imprimir', 'warn'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(code)}</title>
<style>
  @page { size: 50mm 30mm; margin: 0; }
  @media print { @page { size: 50mm 30mm; margin: 0; } body { margin: 0; } }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; font-family: -apple-system, sans-serif; }
  img { width: 80%; max-width: 220px; height: auto; image-rendering: pixelated; }
  .code { font-family: ui-monospace, 'Courier New', monospace; font-size: 9pt; font-weight: 700; margin-top: 4px; }
</style></head><body>
  <img src="${qrUrl}" alt="${escapeHtml(code)}" />
  <div class="code">${escapeHtml(code)}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`);
    w.document.close();
  };
  modal.querySelector('#done-print').onclick = () => {
    State.cache.printCode = null;
    closeModal();
    if (State.user?.rol !== 'operario') State.view = 'cajas';
    render();
  };
  return modal;
}

// =====================================================================
// CREAR USUARIO (admin)
// =====================================================================
export function renderCreateUserModal() {
  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">
      Solo los administradores pueden crear usuarios nuevos.
    </p>

    <label class="label">Username</label>
    <input class="input mono" id="u-username" placeholder="ej. JPEREZ" autocapitalize="characters" maxlength="30" />

    <label class="label" style="margin-top:12px;">Nombre completo</label>
    <input class="input" id="u-nombre" placeholder="Juan Pérez" />

    <label class="label" style="margin-top:12px;">Email (opcional)</label>
    <input class="input" type="email" id="u-email" placeholder="jperez@almaceneselrey.com" />

    <label class="label" style="margin-top:12px;">Rol</label>
    <select class="select" id="u-rol">
      <option value="operario">Operario — escanear, mover, reducir, reponer</option>
      <option value="contador">Contador — conteos de inventario</option>
      <option value="auditor">Auditor — auditorías y verificación</option>
      <option value="supervisor">Supervisor — todo excepto admin</option>
      <option value="jefe_inventario">Jefe Inventario — supervisión de conteos, todas las tiendas</option>
      <option value="admin_tienda">Admi Tienda — gestiona usuarios de su tienda</option>
      <option value="admin">Master — acceso total</option>
    </select>

    <label class="label" style="margin-top:12px;">Contraseña inicial</label>
    <input class="input" type="password" id="u-pass" placeholder="mínimo 6 caracteres" />
    <div style="font-size:11px; color:var(--muted); margin-top:4px;">
      El usuario podrá cambiarla después.
    </div>

    <div id="u-error" style="color:var(--danger); font-size:13px; margin-top:10px; min-height:18px;"></div>
  `;
  const footerHtml = `
    <button class="btn grow" id="u-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="u-save">Crear usuario</button>
  `;
  const modal = modalShell('Crear usuario nuevo', bodyHtml, footerHtml);

  const errEl = modal.querySelector('#u-error');
  modal.querySelector('#u-cancel').onclick = () => { State.modal = null; State.view = 'mas'; render(); };
  modal.querySelector('#u-save').onclick = async () => {
    errEl.textContent = '';
    const username = modal.querySelector('#u-username').value.trim().toUpperCase();
    const nombre   = modal.querySelector('#u-nombre').value.trim();
    const email    = modal.querySelector('#u-email').value.trim();
    const rol      = modal.querySelector('#u-rol').value;
    const password = modal.querySelector('#u-pass').value;

    if (!isValidUsername(username)) {
      errEl.textContent = 'Username inválido (3-30 caracteres, empieza con letra, sin espacios)';
      return;
    }
    if (!nombre) { errEl.textContent = 'Ingresá el nombre completo'; return; }
    if (!isValidPassword(password)) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }

    try {
      await API.createUser({
        username, nombre, email, rol, password,
        tienda_id: State.user.tienda_id
      });
      logEvent('usuario_creado', { username: State.user.username, detalles: username });
      toast(`Usuario ${username} creado`, 'success');
      State.modal = null; State.view = 'mas'; render();
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

  return modal;
}

// =====================================================================
// EDITAR USUARIO (admin)
// =====================================================================
export function renderEditUserModal() {
  const u = State.cache.editingUser;
  if (!u) { closeModal(); return $(`<div></div>`); }
  const isSelf = u.id === State.user.id;
  const editorIsAdminTienda = isAdminTienda();

  // admin_tienda no puede editar a otros admin o admin_tienda
  if (editorIsAdminTienda && (u.rol === 'admin' || u.rol === 'admin_tienda')) {
    closeModal();
    return $(`<div></div>`);
  }

  // Vista reducida para admin_tienda: solo activar/desactivar
  if (editorIsAdminTienda) {
    const bodyHtml = `
      <div class="box-header" style="margin-bottom:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div>
            <div style="font-weight:600; font-size:16px;">${escapeHtml(u.nombre)}</div>
            <div class="meta mono" style="font-size:12px; color:var(--muted); margin-top:2px;">
              ${escapeHtml(u.username)} · ${escapeHtml(u.rol)}
            </div>
          </div>
          <span class="pill pill-${u.activo ? 'success' : 'muted'}">${u.activo ? 'activo' : 'inactivo'}</span>
        </div>
      </div>
      <button class="btn btn-block ${u.activo ? 'btn-danger' : 'btn-success'}" id="at-toggle">
        ${u.activo ? `${ICON.lock} Desactivar usuario` : `${ICON.check} Reactivar usuario`}
      </button>
      <div id="at-error" style="color:var(--danger); font-size:13px; margin-top:10px; min-height:18px;"></div>
    `;
    const footerHtml = `<button class="btn btn-block" id="at-cancel">Cerrar</button>`;
    const modal = modalShell('Gestionar acceso', bodyHtml, footerHtml);
    modal.querySelector('#at-cancel').onclick = () => { State.modal = null; State.view = 'mas'; render(); };
    modal.querySelector('#at-toggle').onclick = async () => {
      const errEl = modal.querySelector('#at-error');
      const action = u.activo ? 'desactivar' : 'reactivar';
      if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${u.nombre}?`)) return;
      try {
        if (u.activo) await API.deactivateUser(u.id);
        else await API.activateUser(u.id);
        logEvent(u.activo ? 'usuario_desactivado' : 'usuario_activado',
          { username: State.user.username, detalles: u.username });
        toast(`Usuario ${u.activo ? 'desactivado' : 'reactivado'}`, 'success');
        State.modal = null; State.view = 'mas'; render();
      } catch (e) { errEl.textContent = e.message; }
    };
    return modal;
  }

  const bodyHtml = `
    <div class="box-header" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div>
          <div style="font-weight:600; font-size:16px;">${escapeHtml(u.nombre)}</div>
          <div class="meta mono" style="font-size:12px; color:var(--muted); margin-top:2px;">
            ${escapeHtml(u.username)} · ${escapeHtml(u.email || 'sin email')}
          </div>
        </div>
        <span class="pill pill-${u.activo ? 'success' : 'muted'}">${u.activo ? 'activo' : 'inactivo'}</span>
      </div>
    </div>

    <label class="label">Rol</label>
    <select class="select" id="e-rol" ${isSelf ? 'disabled' : ''}>
      <option value="operario"        ${u.rol==='operario'?'selected':''}>Operario</option>
      <option value="contador"        ${u.rol==='contador'?'selected':''}>Contador</option>
      <option value="auditor"         ${u.rol==='auditor'?'selected':''}>Auditor</option>
      <option value="supervisor"      ${u.rol==='supervisor'?'selected':''}>Supervisor</option>
      <option value="jefe_inventario" ${u.rol==='jefe_inventario'?'selected':''}>Jefe Inventario</option>
      <option value="admin_tienda"    ${u.rol==='admin_tienda'?'selected':''}>Admi Tienda</option>
      <option value="admin"           ${u.rol==='admin'?'selected':''}>Master</option>
    </select>
    ${isSelf ? '<div style="font-size:11px; color:var(--muted); margin-top:4px;">No podés cambiar tu propio rol</div>' : ''}

    <div class="divider"></div>

    <label class="label">Resetear contraseña</label>
    <div style="display:flex; gap:8px;">
      <input class="input" type="text" id="e-newpass" placeholder="nueva contraseña (mín. 6)" />
      <button class="btn" id="e-reset">${ICON.refresh}</button>
    </div>
    <div style="font-size:11px; color:var(--muted); margin-top:4px;">
      Comunicale la nueva contraseña al usuario.
    </div>

    <div class="divider"></div>

    <label class="label">Límite de acceso (hora Costa Rica)</label>
    <div style="font-size:11px; color:var(--muted); margin-bottom:6px;" id="e-acceso-status">
      ${u.acceso_hasta
        ? `Expira: <strong style="color:var(--warn)">${formatCRTime(u.acceso_hasta)}</strong>`
        : 'Sin límite — acceso indefinido'}
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <input class="input" type="datetime-local" id="e-acceso-hasta"
             value="${utcToCRInput(u.acceso_hasta)}" style="flex:1;" />
      <button class="btn" id="e-clear-acceso" title="Quitar límite" style="flex-shrink:0;">${ICON.close}</button>
    </div>
    <div style="font-size:11px; color:var(--muted); margin-top:4px;">
      Al llegar esa fecha/hora el sistema cierra la sesión automáticamente.
    </div>

    <div class="divider"></div>

    ${!isSelf ? `
      <button class="btn btn-block ${u.activo ? 'btn-danger' : 'btn-success'}" id="e-toggle">
        ${u.activo ? `${ICON.lock} Desactivar usuario` : `${ICON.check} Reactivar usuario`}
      </button>
    ` : ''}

    <div id="e-error" style="color:var(--danger); font-size:13px; margin-top:10px; min-height:18px;"></div>
  `;
  const footerHtml = `
    <button class="btn grow" id="e-cancel">Cerrar</button>
    <button class="btn btn-primary grow" id="e-save">Guardar cambios</button>
  `;
  const modal = modalShell('Editar usuario', bodyHtml, footerHtml);

  const errEl = modal.querySelector('#e-error');
  modal.querySelector('#e-cancel').onclick = () => { State.modal = null; State.view = 'mas'; render(); };

  modal.querySelector('#e-clear-acceso').onclick = () => {
    modal.querySelector('#e-acceso-hasta').value = '';
    modal.querySelector('#e-acceso-status').innerHTML = 'Sin límite — acceso indefinido';
  };

  modal.querySelector('#e-reset').onclick = async () => {
    errEl.textContent = '';
    const newPass = modal.querySelector('#e-newpass').value;
    if (!isValidPassword(newPass)) { errEl.textContent = 'Mínimo 6 caracteres'; return; }
    try {
      await API.resetUserPassword(u.id, newPass);
      logEvent('pwd_reset', { username: State.user.username, detalles: u.username });
      toast(`Contraseña reseteada para ${u.username}`, 'success');
      modal.querySelector('#e-newpass').value = '';
    } catch (e) { errEl.textContent = e.message; }
  };

  modal.querySelector('#e-toggle')?.addEventListener('click', async () => {
    const action = u.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${u.nombre}?`)) return;
    try {
      if (u.activo) await API.deactivateUser(u.id);
      else await API.activateUser(u.id);
      logEvent(u.activo ? 'usuario_desactivado' : 'usuario_activado',
        { username: State.user.username, detalles: u.username });
      toast(`Usuario ${action === 'desactivar' ? 'desactivado' : 'reactivado'}`, 'success');
      State.modal = null; State.view = 'mas'; render();
    } catch (e) { errEl.textContent = e.message; }
  });

  modal.querySelector('#e-save').onclick = async () => {
    errEl.textContent = '';
    const changes = {};
    const newRol = modal.querySelector('#e-rol').value;
    if (!isSelf && newRol !== u.rol) changes.rol = newRol;

    const inputVal = modal.querySelector('#e-acceso-hasta').value;
    const newAcceso = inputVal ? crInputToUtc(inputVal) : null;
    const oldAcceso = u.acceso_hasta || null;
    if (newAcceso !== oldAcceso) changes.acceso_hasta = newAcceso;

    if (Object.keys(changes).length === 0) {
      toast('No hay cambios para guardar', 'info');
      return;
    }
    try {
      await API.updateUser(u.id, changes);
      toast('Usuario actualizado', 'success');
      State.modal = null; State.view = 'mas'; render();
    } catch (e) { errEl.textContent = e.message; }
  };

  return modal;
}

// =====================================================================
// ESCANEAR PARA BUSCAR — escanea código de barras y va al detalle
// =====================================================================
export function renderScanForSearchModal() {
  const bodyHtml = `
    <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">
      Apuntá la cámara al código de barras del producto que querés buscar.
    </p>
    <div class="scan-hero" style="margin:0;">
      <div class="scan-hero-inner">
        <div id="search-qr-reader"></div>
        <div class="scan-overlay">
          <div class="scan-frame">
            <span></span><span></span>
            <div class="scan-line"></div>
          </div>
        </div>
      </div>
    </div>
    <label class="label" style="margin-top:16px;">O ingresá el código a mano</label>
    <div style="display:flex; gap:8px;">
      <input class="input mono" id="search-manual" placeholder="SKU o código de barras" />
      <button class="btn" id="search-manual-btn">${ICON.check}</button>
    </div>
  `;
  const footerHtml = `<button class="btn btn-block" id="search-cancel">Volver</button>`;
  const modal = modalShell('Escanear producto', bodyHtml, footerHtml);

  setTimeout(() => {
    startScanner('search-qr-reader', handleSearchScanned, {
      qrbox: { width: 240, height: 160 }
    });
  }, 100);

  modal.querySelector('#search-manual-btn').onclick = () => {
    const v = modal.querySelector('#search-manual').value.trim();
    if (v) { stopScanner(); handleSearchScanned(v); }
  };
  modal.querySelector('#search-manual').onkeydown = e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v) { stopScanner(); handleSearchScanned(v); }
    }
  };
  modal.querySelector('#search-cancel').onclick = () => {
    stopScanner();
    State.modal = null;
    render();
  };

  return modal;
}

async function handleSearchScanned(code) {
  try {
    const articulo = await API.findArticuloByCode(code);
    if (!articulo) {
      feedback('error');
      toast(`No encontré el producto "${code}"`, 'error');
      State.modal = null;
      render();
      return;
    }
    // Cargar las cajas del producto y mostrarlo en la vista de búsqueda
    const cajas = await API.findCajasConArticulo(articulo.id, true);
    State.cache.buscar = State.cache.buscar || {};
    State.cache.buscar.query = articulo.descripcion;
    State.cache.buscar.selected = articulo;
    State.cache.buscar.cajas = cajas;
    State.cache.buscar.showConsumed = false;
    State.modal = null;
    State.view = 'buscar';
    toast(`${articulo.descripcion} · ${cajas.length} caja(s)`, 'success');
    render();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    State.modal = null;
    render();
  }
}

// =====================================================================
// GESTIÓN DE ARTÍCULOS (admin)
// =====================================================================
export function renderArticulosModal() {
  const bodyHtml = `
    <div id="arts-list">
      <div class="empty"><div class="loader"></div></div>
    </div>
  `;
  const footerHtml = `
    <button class="btn btn-primary grow" id="btn-new-art">${ICON.add} Nuevo artículo</button>
    <button class="btn grow" id="btn-close-arts">Cerrar</button>
  `;
  const modal = modalShell('Artículos', bodyHtml, footerHtml);

  API.listArticulos().then(arts => {
    const list = modal.querySelector('#arts-list');
    list.innerHTML = '';
    if (!arts.length) {
      list.innerHTML = `<div class="empty">${ICON.empty}<h3>Sin artículos</h3></div>`;
      return;
    }
    // Agrupar por familia
    const familias = [...new Set(arts.map(a => a.familia || 'Sin familia'))].sort();
    familias.forEach(fam => {
      const grupo = arts.filter(a => (a.familia || 'Sin familia') === fam);
      const header = $(`<div class="section-title" style="padding:12px 16px 6px; background:var(--surface-2); border-bottom:1px solid var(--border);">${escapeHtml(fam)} <small>${grupo.length}</small></div>`);
      list.appendChild(header);
      grupo.forEach(a => {
        const row = $(`
          <button class="list-item" style="text-align:left; width:100%; ${!a.activo ? 'opacity:0.5;' : ''}">
            <div class="icon-box">${ICON.package}</div>
            <div class="grow">
              <div style="font-weight:500; font-size:13px;">${escapeHtml(a.descripcion)}</div>
              <div class="meta">
                <span class="mono">${escapeHtml(a.sku || '—')}</span>
                ${a.unidades_por_caja ? `<span>${a.unidades_por_caja}/caja</span>` : ''}
                ${!a.activo ? '<span class="pill pill-muted">inactivo</span>' : ''}
              </div>
            </div>
            <span style="color:var(--muted);">›</span>
          </button>
        `);
        row.onclick = () => { State.cache.editingArticulo = a; State.modal = 'editArticulo'; render(); };
        list.appendChild(row);
      });
    });
  }).catch(e => {
    modal.querySelector('#arts-list').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });

  modal.querySelector('#btn-new-art').onclick    = () => { State.modal = 'createArticulo'; render(); };
  modal.querySelector('#btn-close-arts').onclick = () => closeModal();
  return modal;
}

// =====================================================================
// CREAR ARTÍCULO (admin)
// =====================================================================
export function renderCreateArticuloModal() {
  const bodyHtml = `
    <label class="label">SKU <span style="color:var(--danger);">*</span></label>
    <input class="input mono" id="a-sku" placeholder="ej. CAN-010" autocapitalize="characters" />

    <label class="label" style="margin-top:12px;">Descripción <span style="color:var(--danger);">*</span></label>
    <input class="input" id="a-desc" placeholder="ej. Candil LED 75W blanco" />

    <label class="label" style="margin-top:12px;">Familia / Categoría</label>
    <input class="input" id="a-familia" placeholder="ej. Iluminación, Eléctrico, Plomería…" list="familias-list" />
    <datalist id="familias-list">
      <option value="Iluminación">
      <option value="Eléctrico">
      <option value="Plomería">
      <option value="Ferretería">
      <option value="Herramientas">
    </datalist>

    <label class="label" style="margin-top:12px;">Código de barras (opcional)</label>
    <input class="input mono" id="a-barras" placeholder="ej. 7501234500011" inputmode="numeric" />

    <label class="label" style="margin-top:12px;">Unidades por caja (opcional)</label>
    <input class="input" id="a-upc" type="number" min="1" placeholder="ej. 24" inputmode="numeric" />

    <div id="a-error" style="color:var(--danger); font-size:13px; margin-top:10px; min-height:18px;"></div>
  `;
  const footerHtml = `
    <button class="btn grow" id="a-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="a-save">Crear artículo</button>
  `;
  const modal = modalShell('Nuevo artículo', bodyHtml, footerHtml);
  const errEl = modal.querySelector('#a-error');

  modal.querySelector('#a-cancel').onclick = () => { State.modal = 'articulos'; render(); };
  modal.querySelector('#a-save').onclick   = async () => {
    errEl.textContent = '';
    const sku            = modal.querySelector('#a-sku').value.trim().toUpperCase();
    const descripcion    = modal.querySelector('#a-desc').value.trim();
    const familia        = modal.querySelector('#a-familia').value.trim();
    const codigo_barras  = modal.querySelector('#a-barras').value.trim() || null;
    const upc            = parseInt(modal.querySelector('#a-upc').value) || null;

    if (!sku)        { errEl.textContent = 'El SKU es obligatorio'; return; }
    if (!descripcion){ errEl.textContent = 'La descripción es obligatoria'; return; }

    try {
      await API.createArticulo({ sku, descripcion, familia, codigo_barras, unidades_por_caja: upc });
      toast(`Artículo ${sku} creado`, 'success');
      State.modal = 'articulos';
      render();
    } catch (e) { errEl.textContent = e.message; }
  };
  return modal;
}

// =====================================================================
// EDITAR ARTÍCULO (admin)
// =====================================================================
export function renderEditArticuloModal() {
  const a = State.cache.editingArticulo;
  if (!a) { closeModal(); return $(`<div></div>`); }

  const bodyHtml = `
    <div class="box-header" style="margin-bottom:16px;">
      <div style="font-weight:600; font-size:15px;">${escapeHtml(a.descripcion)}</div>
      <div class="meta mono" style="margin-top:4px; font-size:11px; color:var(--muted);">
        ${escapeHtml(a.sku || '—')} ${a.codigo_barras ? '· ' + escapeHtml(a.codigo_barras) : ''}
      </div>
    </div>

    <label class="label">Descripción</label>
    <input class="input" id="ea-desc" value="${escapeHtml(a.descripcion)}" />

    <label class="label" style="margin-top:12px;">Familia / Categoría</label>
    <input class="input" id="ea-familia" value="${escapeHtml(a.familia || '')}" list="ea-familias-list" />
    <datalist id="ea-familias-list">
      <option value="Iluminación">
      <option value="Eléctrico">
      <option value="Plomería">
      <option value="Ferretería">
      <option value="Herramientas">
    </datalist>

    <label class="label" style="margin-top:12px;">Unidades por caja</label>
    <input class="input" id="ea-upc" type="number" min="1" value="${a.unidades_por_caja || ''}" placeholder="— sin definir —" inputmode="numeric" />

    <label class="label" style="margin-top:12px;">Código de barras</label>
    <input class="input mono" id="ea-barras" value="${escapeHtml(a.codigo_barras || '')}" inputmode="numeric" />

    <div style="margin-top:16px;">
      <button class="btn btn-block ${a.activo ? 'btn-danger' : 'btn-ghost'}" id="ea-toggle">
        ${a.activo ? `${ICON.lock} Desactivar artículo` : `${ICON.check} Reactivar artículo`}
      </button>
    </div>

    <div id="ea-error" style="color:var(--danger); font-size:13px; margin-top:10px; min-height:18px;"></div>
  `;
  const footerHtml = `
    <button class="btn grow" id="ea-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="ea-save">Guardar cambios</button>
  `;
  const modal = modalShell('Editar artículo', bodyHtml, footerHtml);
  const errEl = modal.querySelector('#ea-error');

  modal.querySelector('#ea-cancel').onclick = () => { State.modal = 'articulos'; render(); };

  modal.querySelector('#ea-toggle').onclick = async () => {
    const accion = a.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} este artículo?`)) return;
    try {
      await API.updateArticulo(a.id, { activo: !a.activo });
      toast(`Artículo ${a.activo ? 'desactivado' : 'reactivado'}`, 'success');
      State.modal = 'articulos';
      render();
    } catch (e) { errEl.textContent = e.message; }
  };

  modal.querySelector('#ea-save').onclick = async () => {
    errEl.textContent = '';
    const changes = {
      descripcion:      modal.querySelector('#ea-desc').value.trim(),
      familia:          modal.querySelector('#ea-familia').value.trim(),
      unidades_por_caja: parseInt(modal.querySelector('#ea-upc').value) || null,
      codigo_barras:    modal.querySelector('#ea-barras').value.trim() || null
    };
    if (!changes.descripcion) { errEl.textContent = 'La descripción es obligatoria'; return; }
    try {
      await API.updateArticulo(a.id, changes);
      toast('Artículo actualizado', 'success');
      State.modal = 'articulos';
      render();
    } catch (e) { errEl.textContent = e.message; }
  };
  return modal;
}

// =====================================================================
// TIENDAS / SUCURSALES (admin)
// =====================================================================
export function renderTiendasModal() {
  const bodyHtml = `
    <div id="tiendas-list">
      <div class="empty"><div class="loader"></div></div>
    </div>
  `;
  const footerHtml = `<button class="btn btn-block" id="btn-close-tiendas">Cerrar</button>`;
  const modal = modalShell('Tiendas / Sucursales', bodyHtml, footerHtml);

  Promise.all([API.listTiendas(), API.listCajas(false), API.listUsers(true)]).then(([tiendas, cajas, usuarios]) => {
    const list = modal.querySelector('#tiendas-list');
    list.innerHTML = '';
    tiendas.forEach(t => {
      const cajasT    = cajas.filter(c => c.tienda_id === t.id);
      const unidades  = cajasT.reduce((s, c) => s + (c.unidades_totales || 0), 0);
      const usuariosT = usuarios.filter(u => u.tienda_id === t.id);
      const stockBajo = cajasT.filter(c => (c.unidades_totales || 0) <= 5).length;

      const card = $(`
        <div class="tienda-card">
          <div class="tienda-card-header">
            <div>
              <div style="font-weight:600; font-size:14px;">${escapeHtml(t.nombre)}</div>
              <div class="meta mono" style="font-size:11px; margin-top:2px;">
                <span>${escapeHtml(t.codigo)}</span>
                <span class="pill pill-${t.activa ? 'success' : 'muted'}" style="margin-left:4px;">
                  ${t.activa ? 'activa' : 'inactiva'}
                </span>
              </div>
            </div>
          </div>
          <div class="tienda-kpis">
            <div class="tienda-kpi">
              <div class="tienda-kpi-val">${cajasT.length}</div>
              <div class="tienda-kpi-label">Cajas</div>
            </div>
            <div class="tienda-kpi">
              <div class="tienda-kpi-val">${unidades}</div>
              <div class="tienda-kpi-label">Unidades</div>
            </div>
            <div class="tienda-kpi ${stockBajo > 0 ? 'tienda-kpi-warn' : ''}">
              <div class="tienda-kpi-val">${stockBajo}</div>
              <div class="tienda-kpi-label">Stock bajo</div>
            </div>
            <div class="tienda-kpi">
              <div class="tienda-kpi-val">${usuariosT.length}</div>
              <div class="tienda-kpi-label">Usuarios</div>
            </div>
          </div>
          ${cajasT.length ? `
            <div style="padding:10px 14px 0; font-size:11px; color:var(--muted); font-family:var(--font-mono);">
              // últimas cajas activas
            </div>
            <div class="stack" style="padding:6px 14px 10px; gap:3px;">
              ${cajasT.slice(0, 3).map(c => `
                <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
                  <span class="mono" style="color:var(--accent); font-size:11px;">${escapeHtml(c.codigo_caja.slice(-10))}</span>
                  <span style="color:var(--muted);">${escapeHtml(c.posicion?.ubicacion || '—')}</span>
                  <span style="margin-left:auto; font-family:var(--font-mono); font-weight:600;">${c.unidades_totales}</span>
                </div>
              `).join('')}
              ${cajasT.length > 3 ? `<div style="font-size:11px; color:var(--muted-2);">+${cajasT.length - 3} más…</div>` : ''}
            </div>
          ` : `<div style="padding:10px 14px; font-size:12px; color:var(--muted);">Sin cajas activas</div>`}
          <div class="tienda-ubicacion-row" id="ub-row-${t.id}">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 14px; border-top:1px solid var(--border); gap:8px;">
              <div style="font-size:11px; color:var(--muted);">
                ${ICON.pin}
                ${t.lat && t.lng
                  ? `<span style="font-family:var(--font-mono);">${t.lat}, ${t.lng}</span> · <strong>${t.radio_metros ?? 300} m</strong>`
                  : `<span style="color:var(--muted-2);">Sin rango configurado</span>`}
              </div>
              <button class="btn btn-sm" data-edit-ub="${t.id}" style="font-size:11px; padding:4px 10px;">Editar</button>
            </div>
            <div id="ub-form-${t.id}" style="display:none; padding:10px 14px; gap:8px; flex-direction:column; border-top:1px solid var(--border);">
              <div style="display:grid; grid-template-columns:1fr 1fr 80px; gap:6px;">
                <div>
                  <label class="label" style="font-size:10px; margin-bottom:3px;">Latitud</label>
                  <input class="input" id="ub-lat-${t.id}" type="number" step="0.0001" placeholder="10.0162" value="${t.lat ?? ''}">
                </div>
                <div>
                  <label class="label" style="font-size:10px; margin-bottom:3px;">Longitud</label>
                  <input class="input" id="ub-lng-${t.id}" type="number" step="0.0001" placeholder="-84.2151" value="${t.lng ?? ''}">
                </div>
                <div>
                  <label class="label" style="font-size:10px; margin-bottom:3px;">Radio (m)</label>
                  <input class="input" id="ub-radio-${t.id}" type="number" min="50" max="2000" placeholder="300" value="${t.radio_metros ?? 300}">
                </div>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="btn grow" data-cancel-ub="${t.id}">Cancelar</button>
                <button class="btn btn-primary grow" data-save-ub="${t.id}">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      `);
      list.appendChild(card);
    });
  }).catch(e => {
    modal.querySelector('#tiendas-list').innerHTML =
      `<div class="empty"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  });

  // Delegación de eventos para editar ubicación de cada tienda
  modal.querySelector('#tiendas-list').addEventListener('click', async (e) => {
    const editBtn   = e.target.closest('[data-edit-ub]');
    const cancelBtn = e.target.closest('[data-cancel-ub]');
    const saveBtn   = e.target.closest('[data-save-ub]');
    if (editBtn) {
      const id = editBtn.dataset.editUb;
      const form = modal.querySelector(`#ub-form-${id}`);
      if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    }
    if (cancelBtn) {
      const id = cancelBtn.dataset.cancelUb;
      const form = modal.querySelector(`#ub-form-${id}`);
      if (form) form.style.display = 'none';
    }
    if (saveBtn) {
      const id = parseInt(saveBtn.dataset.saveUb);
      const lat   = parseFloat(modal.querySelector(`#ub-lat-${id}`).value);
      const lng   = parseFloat(modal.querySelector(`#ub-lng-${id}`).value);
      const radio = parseInt(modal.querySelector(`#ub-radio-${id}`).value) || 300;
      if (isNaN(lat) || isNaN(lng)) { toast('Ingresá coordenadas válidas', 'error'); return; }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { toast('Coordenadas fuera de rango', 'error'); return; }
      saveBtn.disabled = true;
      try {
        await API.updateTienda(id, { lat, lng, radio_metros: radio });
        toast('Rango de ubicación actualizado ✓', 'success');
        modal.querySelector(`#ub-form-${id}`).style.display = 'none';
      } catch (err) {
        toast('Error al guardar: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    }
  });

  modal.querySelector('#btn-close-tiendas').onclick = () => closeModal();
  return modal;
}

// =====================================================================
// AUDITORÍA DE SESIONES
// =====================================================================
export function renderAuditModal() {
  const events = getAuditLog(150);

  const bodyHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <span style="font-size:12px; color:var(--muted);">${events.length} evento${events.length !== 1 ? 's' : ''} en este dispositivo</span>
      <button class="btn" id="clear-audit" style="font-size:11px; padding:4px 10px;">${ICON.trash} Limpiar</button>
    </div>
    <div id="audit-list" class="stack" style="max-height:62vh; overflow-y:auto; gap:4px;">
      ${events.length ? '' : '<div class="empty" style="padding:20px 0;"><p>Sin eventos registrados todavía</p></div>'}
    </div>
  `;
  const footerHtml = `<button class="btn btn-block" id="audit-close">Cerrar</button>`;
  const modal = modalShell(`${ICON.shield} Auditoría de sesiones`, bodyHtml, footerHtml);

  const list = modal.querySelector('#audit-list');
  events.forEach(ev => {
    const meta = AUDIT_TIPO[ev.tipo] || { label: ev.tipo, color: 'muted' };
    list.appendChild($(`
      <div class="audit-item">
        <span class="pill pill-${meta.color} audit-pill">${meta.label}</span>
        <span class="audit-user mono">${escapeHtml(ev.username || '—')}</span>
        ${ev.detalles ? `<span class="audit-detail">${escapeHtml(ev.detalles)}</span>` : ''}
        <span class="audit-time">${fmtDate(ev.creado_at)}</span>
      </div>
    `));
  });

  modal.querySelector('#clear-audit').onclick = () => {
    if (!confirm('¿Eliminar todos los eventos del log local?')) return;
    clearAuditLog();
    toast('Log de auditoría limpiado', 'success');
    closeModal();
  };
  modal.querySelector('#audit-close').onclick = () => closeModal();

  return modal;
}

// =====================================================================
// CONTEO: registrar conteo de caja existente
// =====================================================================
export function renderConteoBoxModal() {
  const target = State.cache.conteoTarget;
  if (!target) { closeModal(); return $(`<div></div>`); }
  const { tarea_id, caja, art } = target;

  const bodyHtml = `
    <div class="box-header" style="margin-bottom:16px;">
      <div class="box-code" style="font-size:13px;">${escapeHtml(caja.codigo_caja)}</div>
      <div class="box-loc">
        ${ICON.pin}
        <span>${escapeHtml(caja.posicion?.ubicacion || 'Sin ubicar')}${caja.posicion?.descripcion ? ' · ' + escapeHtml(caja.posicion.descripcion) : ''}</span>
      </div>
    </div>

    <div style="background:var(--surface-2); border:1px solid var(--border); padding:12px 14px; margin-bottom:16px;">
      <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">Artículo a contar</div>
      <div style="font-weight:600; font-size:13px;">${escapeHtml(art.descripcion)}</div>
      <div style="font-size:11px; color:var(--accent); font-family:var(--font-mono);">${escapeHtml(art.sku)}</div>
    </div>

    <div class="banner banner-info" style="border:1px solid; margin-bottom:16px; font-size:12px; padding:10px 12px;">
      ${ICON.info}
      <span>Contá físicamente las unidades de este artículo en esta caja. <strong>No se muestra el sistema</strong> para evitar sesgo.</span>
    </div>

    <label class="label">Cantidad física contada</label>
    <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
      <button class="btn btn-sm" id="cnt-minus" style="width:44px; height:44px; font-size:20px; padding:0;">−</button>
      <input type="number" class="input mono" id="cnt-qty" min="0" value="0"
        style="flex:1; font-size:24px; font-weight:700; text-align:center; padding:10px;" />
      <button class="btn btn-sm" id="cnt-plus" style="width:44px; height:44px; font-size:20px; padding:0;">+</button>
    </div>
  `;

  const footerHtml = `
    <button class="btn grow" id="cnt-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="cnt-ok">${ICON.check} Registrar conteo</button>
  `;

  const modal = modalShell('Registrar conteo', bodyHtml, footerHtml);

  const qtyEl = modal.querySelector('#cnt-qty');
  modal.querySelector('#cnt-minus').onclick = () => { const v = parseInt(qtyEl.value)||0; if (v > 0) qtyEl.value = v - 1; };
  modal.querySelector('#cnt-plus').onclick  = () => { qtyEl.value = (parseInt(qtyEl.value)||0) + 1; };

  modal.querySelector('#cnt-cancel').onclick = () => closeModal();

  modal.querySelector('#cnt-ok').onclick = async () => {
    const qty = parseInt(qtyEl.value);
    if (isNaN(qty) || qty < 0) { toast('Ingresá una cantidad válida', 'error'); return; }
    const btn = modal.querySelector('#cnt-ok');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    try {
      await API.registrarConteo({
        tarea_id, caja_id: caja.id, articulo_id: art.id, cantidad_fisica: qty
      });
      feedback('ok');
      toast(`Conteo registrado: ${qty} u. ✓`, 'success');
      State.cache.conteoTarget = null;
      closeModal();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `${ICON.check} Registrar conteo`;
      toast('Error: ' + e.message, 'error');
    }
  };

  return modal;
}

// =====================================================================
// CONTEO: crear caja nueva durante conteo
// =====================================================================
export function renderConteoCrearCajaModal() {
  const nc = State.cache.conteoNuevaCaja;
  if (!nc) { closeModal(); return $(`<div></div>`); }

  if (!nc.codigo) {
    API.listTiendas().then(ts => {
      const t = ts.find(x => x.id === nc.tienda_id);
      nc.codigo = generateBoxCode(t?.codigo || 'A01');
      render();
    });
    return modalShell('Crear caja en conteo', '<div class="empty"><div class="loader"></div></div>');
  }

  const bodyHtml = `
    <div style="background:var(--surface-2); border:1px solid var(--border); padding:12px 14px; margin-bottom:16px;">
      <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">Artículo</div>
      <div style="font-weight:600; font-size:13px;">${escapeHtml(nc.art.descripcion)}</div>
      <div style="font-size:11px; color:var(--accent); font-family:var(--font-mono);">${escapeHtml(nc.art.sku)}</div>
    </div>

    <label class="label">Código de la caja</label>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
      <div class="box-code grow" id="cc-codigo" style="font-size:12px;">${escapeHtml(nc.codigo)}</div>
      <button class="btn btn-sm btn-ghost" id="cc-regen" title="Nuevo código">${ICON.refresh}</button>
    </div>

    <label class="label">Ubicación donde se encuentra</label>
    <select class="select" id="cc-pos" style="margin-bottom:16px;">
      <option value="">— Selecciona la ubicación —</option>
    </select>

    <label class="label">Cantidad física contada</label>
    <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
      <button class="btn btn-sm" id="cc-minus" style="width:44px; height:44px; font-size:20px; padding:0;">−</button>
      <input type="number" class="input mono" id="cc-qty" min="1" value="1"
        style="flex:1; font-size:24px; font-weight:700; text-align:center; padding:10px;" />
      <button class="btn btn-sm" id="cc-plus" style="width:44px; height:44px; font-size:20px; padding:0;">+</button>
    </div>
  `;

  const footerHtml = `
    <button class="btn grow" id="cc-cancel">Cancelar</button>
    <button class="btn btn-primary grow" id="cc-ok">${ICON.add} Crear y registrar</button>
  `;

  const modal = modalShell('Crear caja en conteo', bodyHtml, footerHtml);

  API.listPosiciones().then(positions => {
    const sel = modal.querySelector('#cc-pos');
    positions.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.ubicacion} · ${p.descripcion}`;
      if (nc.posicion_id === p.id) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  modal.querySelector('#cc-regen').onclick = () => {
    API.listTiendas().then(ts => {
      const t = ts.find(x => x.id === nc.tienda_id);
      nc.codigo = generateBoxCode(t?.codigo || 'A01');
      modal.querySelector('#cc-codigo').textContent = nc.codigo;
    });
  };

  const qtyEl = modal.querySelector('#cc-qty');
  modal.querySelector('#cc-minus').onclick = () => { const v = parseInt(qtyEl.value)||1; if (v > 1) qtyEl.value = v - 1; };
  modal.querySelector('#cc-plus').onclick  = () => { qtyEl.value = (parseInt(qtyEl.value)||0) + 1; };

  modal.querySelector('#cc-cancel').onclick = () => closeModal();

  modal.querySelector('#cc-ok').onclick = async () => {
    const posId = parseInt(modal.querySelector('#cc-pos').value);
    const qty   = parseInt(qtyEl.value);
    if (!posId)        { toast('Seleccioná una ubicación', 'error'); return; }
    if (!qty || qty < 1) { toast('Ingresá una cantidad válida', 'error'); return; }
    const btn = modal.querySelector('#cc-ok');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    try {
      const caja = await API.createCaja({
        codigo_caja: nc.codigo,
        tipo_caja:   'reutilizable',
        posicion_id: posId,
        items:       [{ articulo_id: nc.art.id, cantidad: qty }],
        motivo:      'Creación en conteo de inventario'
      });
      await API.registrarConteo({
        tarea_id:       nc.tarea_id,
        caja_id:        caja.id,
        articulo_id:    nc.art.id,
        cantidad_fisica: qty
      });
      feedback('ok');
      toast(`Caja creada y conteo registrado ✓`, 'success');
      State.cache.conteoNuevaCaja = null;
      closeModal();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `${ICON.add} Crear y registrar`;
      toast('Error: ' + e.message, 'error');
    }
  };

  return modal;
}
