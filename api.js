// =====================================================================
// api.js — cliente Supabase + capa de API (con fallback a MOCK)
// =====================================================================

import { State, isDemoMode } from './state.js';
import { MOCK, nextId } from './mock.js';
import { toast, hashPassword } from './utils.js';

// Cliente Supabase (se inicializa desde initSupabase)
let sb = null;

export function initSupabase() {
  if (isDemoMode()) { sb = null; return; }
  try {
    sb = window.supabase.createClient(State.config.url, State.config.anonKey);
  } catch (e) {
    sb = null;
    toast('Error al conectar con Supabase: ' + e.message, 'error');
  }
}

export function getSupabase() { return sb; }

// Devuelve el tienda_id del usuario actual, o null si es admin Master (ve todo)
function _tid() {
  if (State.user?.rol === 'admin') return null;
  return State.user?.tienda_id || null;
}

// =====================================================================
// API
// =====================================================================
export const API = {
  // -------------------- USUARIOS --------------------
  async listUsers(includeInactive = false) {
    const tid = _tid();
    if (isDemoMode()) {
      return MOCK.usuarios.filter(u =>
        (includeInactive || u.activo) &&
        (!tid || u.tienda_id === tid || u.rol === 'admin')
      );
    }
    let q = sb.from('usuarios').select('*').order('nombre');
    if (!includeInactive) q = q.eq('activo', true);
    if (tid) q = q.or(`tienda_id.eq.${tid},rol.eq.admin`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async findUserByUsername(username) {
    if (isDemoMode()) {
      return MOCK.usuarios.find(u => u.username === username) || null;
    }
    const { data, error } = await sb.from('usuarios').select('*')
      .eq('username', username).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  },

  async createUser({ username, nombre, email, rol, password, tienda_id }) {
    const password_hash = await hashPassword(password);
    if (isDemoMode()) {
      if (MOCK.usuarios.some(u => u.username === username)) {
        throw new Error('Ya existe un usuario con ese username');
      }
      const newUser = {
        id: nextId(MOCK.usuarios),
        username, nombre, email, rol,
        tienda_id: tienda_id || 1,
        activo: true, password_hash
      };
      MOCK.usuarios.push(newUser);
      return newUser;
    }
    const { data, error } = await sb.from('usuarios').insert({
      username, nombre, email, rol,
      tienda_id: tienda_id || 1,
      activo: true, password_hash,
      password_set_at: new Date().toISOString()
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateUser(id, changes) {
    if (isDemoMode()) {
      const u = MOCK.usuarios.find(x => x.id === id);
      if (!u) throw new Error('Usuario no encontrado');
      Object.assign(u, changes);
      return u;
    }
    const { data, error } = await sb.from('usuarios').update(changes)
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async resetUserPassword(id, newPassword) {
    const password_hash = await hashPassword(newPassword);
    return this.updateUser(id, {
      password_hash,
      password_set_at: new Date().toISOString()
    });
  },

  async deactivateUser(id) {
    return this.updateUser(id, { activo: false });
  },

  async activateUser(id) {
    return this.updateUser(id, { activo: true });
  },

  // -------------------- ARTÍCULOS Y POSICIONES --------------------
  async listArticulos() {
    if (isDemoMode()) return MOCK.articulos;
    const { data, error } = await sb.from('articulos').select('*').order('descripcion');
    if (error) throw error;
    return data;
  },

  async listPosiciones() {
    const tid = _tid();
    if (isDemoMode()) {
      const list = tid ? MOCK.posiciones.filter(p => p.tienda_id === tid) : MOCK.posiciones;
      return list;
    }
    let q = sb.from('posiciones').select('id, descripcion, tienda_id, ubicaciones(nombre, tipo)').order('descripcion');
    if (tid) q = q.eq('tienda_id', tid);
    const { data, error } = await q;
    if (error) throw error;
    return data.map(p => ({
      id: p.id, descripcion: p.descripcion,
      ubicacion: p.ubicaciones?.nombre, tipo: p.ubicaciones?.tipo
    }));
  },

  async findArticuloByCode(code) {
    const cleaned = (code || '').trim();
    if (!cleaned) return null;
    if (isDemoMode()) {
      return MOCK.articulos.find(a =>
        a.sku === cleaned || a.codigo_barras === cleaned ||
        a.descripcion.toLowerCase().includes(cleaned.toLowerCase())
      ) || null;
    }
    const { data, error } = await sb.from('articulos').select('*')
      .or(`codigo_barras.eq.${cleaned},sku.eq.${cleaned}`).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  },

  // Búsqueda flexible de artículos por descripción, SKU, código de barras o familia
  async searchArticulos(query, limit = 30) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    if (isDemoMode()) {
      return MOCK.articulos.filter(a =>
        a.descripcion.toLowerCase().includes(q) ||
        (a.sku || '').toLowerCase().includes(q) ||
        (a.codigo_barras || '').includes(q) ||
        (a.familia || '').toLowerCase().includes(q)
      ).slice(0, limit);
    }
    const { data, error } = await sb.from('articulos').select('*')
      .or(`descripcion.ilike.%${q}%,sku.ilike.%${q}%,codigo_barras.ilike.%${q}%,familia.ilike.%${q}%`)
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  // Buscar todas las cajas que contienen un artículo dado
  async findCajasConArticulo(articuloId, includeConsumed = true) {
    const tid = _tid();
    if (isDemoMode()) {
      return MOCK.cajas
        .filter(c => {
          if (!includeConsumed && c.estado === 'vacia') return false;
          if (tid && c.tienda_id !== tid) return false;
          return c.contenido?.some(i => i.articulo_id === articuloId);
        })
        .map(c => {
          const item = c.contenido.find(i => i.articulo_id === articuloId);
          return {
            id: c.id, codigo_caja: c.codigo_caja,
            tipo_caja: c.tipo_caja || 'reutilizable',
            estado: c.estado, fecha_creacion: c.fecha_creacion,
            fecha_consumida: c.fecha_consumida,
            posicion: MOCK.posiciones.find(p => p.id === c.posicion_id),
            cantidad_inicial: item.cantidad_inicial,
            cantidad_actual: item.cantidad_actual,
            contenido: c.contenido,
            unidades_totales: c.contenido.reduce((s, i) => s + i.cantidad_actual, 0)
          };
        })
        .sort((a, b) => b.cantidad_actual - a.cantidad_actual);
    }
    let q = sb.from('caja_contenido').select(`
      cantidad_inicial, cantidad_actual,
      cajas(id, codigo_caja, tipo_caja, tienda_id, estado, fecha_creacion, fecha_consumida,
            posiciones(id, descripcion, ubicaciones(nombre, tipo)),
            caja_contenido(articulo_id, cantidad_inicial, cantidad_actual))
    `).eq('articulo_id', articuloId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || [])
      .filter(row => row.cajas && (includeConsumed || row.cajas.estado !== 'vacia') && (!tid || row.cajas.tienda_id === tid))
      .map(row => ({
        id: row.cajas.id,
        codigo_caja: row.cajas.codigo_caja,
        tipo_caja: row.cajas.tipo_caja || 'reutilizable',
        estado: row.cajas.estado,
        fecha_creacion: row.cajas.fecha_creacion,
        fecha_consumida: row.cajas.fecha_consumida,
        posicion: row.cajas.posiciones ? {
          id: row.cajas.posiciones.id,
          descripcion: row.cajas.posiciones.descripcion,
          ubicacion: row.cajas.posiciones.ubicaciones?.nombre,
          tipo: row.cajas.posiciones.ubicaciones?.tipo
        } : null,
        cantidad_inicial: row.cantidad_inicial,
        cantidad_actual: row.cantidad_actual,
        contenido: row.cajas.caja_contenido,
        unidades_totales: row.cajas.caja_contenido.reduce((s, i) => s + i.cantidad_actual, 0)
      }))
      .sort((a, b) => b.cantidad_actual - a.cantidad_actual);
  },

  // -------------------- CAJAS --------------------
  async listCajas(includeConsumed = false) {
    const tid = _tid();
    if (isDemoMode()) {
      return MOCK.cajas
        .filter(c => (includeConsumed || c.estado !== 'vacia') && (!tid || c.tienda_id === tid))
        .map(c => ({
          ...c,
          tipo_caja: c.tipo_caja || 'reutilizable',
          posicion: MOCK.posiciones.find(p => p.id === c.posicion_id),
          unidades_totales: c.contenido.reduce((s, i) => s + i.cantidad_actual, 0)
        }));
    }
    let q = sb.from('cajas').select(`
      id, codigo_caja, tipo_caja, tienda_id, fecha_creacion, fecha_consumida, estado,
      posiciones(id, descripcion, ubicaciones(nombre, tipo)),
      caja_contenido(articulo_id, cantidad_inicial, cantidad_actual,
                     articulos(sku, descripcion, unidades_por_caja))
    `).order('fecha_creacion', { ascending: false });
    if (!includeConsumed) q = q.neq('estado', 'vacia');
    if (tid) q = q.eq('tienda_id', tid);
    const { data: cajas, error } = await q;
    if (error) throw error;
    return cajas.map(c => ({
      id: c.id, codigo_caja: c.codigo_caja,
      tipo_caja: c.tipo_caja || 'reutilizable',
      fecha_creacion: c.fecha_creacion,
      fecha_consumida: c.fecha_consumida,
      estado: c.estado,
      posicion: c.posiciones ? {
        id: c.posiciones.id, descripcion: c.posiciones.descripcion,
        ubicacion: c.posiciones.ubicaciones?.nombre,
        tipo: c.posiciones.ubicaciones?.tipo
      } : null,
      contenido: c.caja_contenido,
      unidades_totales: c.caja_contenido.reduce((s, i) => s + i.cantidad_actual, 0)
    }));
  },

  async getCajaByCode(codigo) {
    const cajas = await this.listCajas(true);
    return cajas.find(c => c.codigo_caja === codigo);
  },

  async createCaja({ codigo_caja, tipo_caja, posicion_id, items, motivo }) {
    const tid = _tid() || State.user?.tienda_id || 1;
    if (isDemoMode()) {
      const newId = nextId(MOCK.cajas);
      const newCaja = {
        id: newId, codigo_caja,
        tipo_caja: tipo_caja || 'reutilizable',
        estado: 'activa', posicion_id, tienda_id: tid,
        fecha_creacion: new Date().toISOString(),
        contenido: items.map(it => ({
          articulo_id: it.articulo_id,
          cantidad_inicial: it.cantidad,
          cantidad_actual: it.cantidad
        }))
      };
      MOCK.cajas.unshift(newCaja);
      const movId = nextId(MOCK.movimientos);
      MOCK.movimientos.unshift({
        id: movId, tipo: 'crear_caja', caja_id: newId,
        articulo_id: null, cantidad: null,
        posicion_destino_id: posicion_id,
        usuario_id: State.user.id,
        motivo: motivo || 'Caja iniciada',
        creado_at: new Date().toISOString()
      });
      items.forEach((it, i) => {
        MOCK.movimientos.unshift({
          id: movId + i + 1, tipo: 'agregar_articulo',
          caja_id: newId, articulo_id: it.articulo_id,
          cantidad: it.cantidad, usuario_id: State.user.id,
          motivo: 'Carga inicial',
          creado_at: new Date().toISOString()
        });
      });
      return newCaja;
    }
    const { data: caja, error } = await sb.from('cajas').insert({
      codigo_caja, posicion_id, tienda_id: tid,
      tipo_caja: tipo_caja || 'reutilizable',
      creada_por: State.user.id, estado: 'activa'
    }).select().single();
    if (error) throw error;
    if (items.length) {
      const { error: e2 } = await sb.from('caja_contenido').insert(
        items.map(it => ({
          caja_id: caja.id, articulo_id: it.articulo_id,
          cantidad_inicial: it.cantidad, cantidad_actual: it.cantidad
        }))
      );
      if (e2) throw e2;
    }
    await sb.from('movimientos').insert({
      tipo: 'crear_caja', caja_id: caja.id,
      posicion_destino_id: posicion_id,
      usuario_id: State.user.id,
      motivo: motivo || 'Caja iniciada'
    });
    if (items.length) {
      await sb.from('movimientos').insert(items.map(it => ({
        tipo: 'agregar_articulo', caja_id: caja.id,
        articulo_id: it.articulo_id, cantidad: it.cantidad,
        usuario_id: State.user.id, motivo: 'Carga inicial'
      })));
    }
    return caja;
  },

  async consumirCaja(cajaId, motivo) {
    const ahora = new Date().toISOString();
    if (isDemoMode()) {
      const caja = MOCK.cajas.find(c => c.id === cajaId);
      if (caja) { caja.estado = 'vacia'; caja.fecha_consumida = ahora; }
      MOCK.movimientos.unshift({
        id: nextId(MOCK.movimientos), tipo: 'consumir_caja', caja_id: cajaId,
        articulo_id: null, cantidad: null, usuario_id: State.user.id,
        motivo: motivo || 'Caja vacía — marcada como consumida', creado_at: ahora
      });
      return true;
    }
    const { error } = await sb.from('cajas').update({
      estado: 'vacia', fecha_consumida: ahora, consumida_por: State.user.id
    }).eq('id', cajaId);
    if (error) throw error;
    await sb.from('movimientos').insert({
      tipo: 'consumir_caja', caja_id: cajaId,
      usuario_id: State.user.id,
      motivo: motivo || 'Caja vacía — marcada como consumida'
    });
    return true;
  },

  // -------------------- MOVIMIENTOS --------------------
  async listMovimientos(limit = 50) {
    const tid = _tid();
    if (isDemoMode()) {
      return MOCK.movimientos
        .filter(m => {
          if (!tid) return true;
          const caja = MOCK.cajas.find(c => c.id === m.caja_id);
          return !caja || caja.tienda_id === tid;
        })
        .slice(0, limit)
        .map(m => ({
          ...m,
          caja: MOCK.cajas.find(c => c.id === m.caja_id),
          articulo: MOCK.articulos.find(a => a.id === m.articulo_id),
          usuario: MOCK.usuarios.find(u => u.id === m.usuario_id)
        }));
    }
    let cajaIds = null;
    if (tid) {
      const { data: tc } = await sb.from('cajas').select('id').eq('tienda_id', tid);
      cajaIds = (tc || []).map(c => c.id);
      if (!cajaIds.length) return [];
    }
    let q = sb.from('movimientos').select(`
      *, cajas(codigo_caja), articulos(sku, descripcion), usuarios(nombre, username)
    `).order('creado_at', { ascending: false }).limit(limit);
    if (cajaIds) q = q.in('caja_id', cajaIds);
    const { data, error } = await q;
    if (error) throw error;
    return data.map(m => ({
      ...m, caja: m.cajas, articulo: m.articulos, usuario: m.usuarios
    }));
  },

  async createMovimiento(mov) {
    if (isDemoMode()) {
      const newId = nextId(MOCK.movimientos);
      MOCK.movimientos.unshift({ ...mov, id: newId, creado_at: new Date().toISOString() });
      if (mov.tipo === 'reducir' || mov.tipo === 'aumentar') {
        const caja = MOCK.cajas.find(c => c.id === mov.caja_id);
        const item = caja?.contenido.find(i => i.articulo_id === mov.articulo_id);
        if (item) {
          if (mov.tipo === 'reducir') item.cantidad_actual = Math.max(0, item.cantidad_actual - mov.cantidad);
          else item.cantidad_actual += mov.cantidad;
        }
      } else if (mov.tipo === 'trasladar_caja') {
        const caja = MOCK.cajas.find(c => c.id === mov.caja_id);
        if (caja) caja.posicion_id = mov.posicion_destino_id;
      }
      return { id: newId };
    }
    // Sin conexión: encolar para sincronizar después
    if (!navigator.onLine) {
      const { enqueue } = await import('./queue.js');
      enqueue({ ...mov });
      return { pending: true };
    }
    const { data, error } = await sb.from('movimientos').insert(mov).select().single();
    if (error) throw error;
    if (mov.tipo === 'reducir' || mov.tipo === 'aumentar') {
      const { data: cc } = await sb.from('caja_contenido')
        .select('cantidad_actual').eq('caja_id', mov.caja_id).eq('articulo_id', mov.articulo_id).single();
      if (cc) {
        const newQty = mov.tipo === 'reducir'
          ? Math.max(0, cc.cantidad_actual - mov.cantidad)
          : cc.cantidad_actual + mov.cantidad;
        await sb.from('caja_contenido').update({
          cantidad_actual: newQty, ultima_modificacion: new Date().toISOString()
        }).eq('caja_id', mov.caja_id).eq('articulo_id', mov.articulo_id);
      }
    } else if (mov.tipo === 'trasladar_caja') {
      await sb.from('cajas').update({ posicion_id: mov.posicion_destino_id }).eq('id', mov.caja_id);
    }
    return data;
  },

  async listMovimientosByCaja(cajaId) {
    if (isDemoMode()) {
      return MOCK.movimientos.filter(m => m.caja_id === cajaId).map(m => ({
        ...m,
        articulo: MOCK.articulos.find(a => a.id === m.articulo_id),
        usuario: MOCK.usuarios.find(u => u.id === m.usuario_id)
      }));
    }
    const { data, error } = await sb.from('movimientos').select(`
      *, articulos(sku, descripcion), usuarios(nombre, username)
    `).eq('caja_id', cajaId).order('creado_at', { ascending: false });
    if (error) throw error;
    return data.map(m => ({ ...m, articulo: m.articulos, usuario: m.usuarios }));
  },

  // -------------------- TIENDAS --------------------
  async listTiendas() {
    if (isDemoMode()) return MOCK.tiendas;
    const { data, error } = await sb.from('tiendas').select('*').order('nombre');
    if (error) throw error;
    return data;
  },

  async updateTienda(id, fields) {
    if (isDemoMode()) {
      const t = MOCK.tiendas.find(x => x.id === id);
      if (t) Object.assign(t, fields);
      return t;
    }
    const { data, error } = await sb.from('tiendas').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // -------------------- UBICACIONES (Bodega → Pasillo → Estante) ----------
  async listBodegas(tiendaId = null) {
    if (isDemoMode()) return tiendaId ? MOCK.bodegas.filter(b => b.tienda_id === tiendaId) : MOCK.bodegas;
    let q = sb.from('bodegas').select('*').order('nombre');
    if (tiendaId) q = q.eq('tienda_id', tiendaId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async createBodega({ tienda_id, nombre, descripcion = '' }) {
    if (isDemoMode()) {
      const b = { id: nextId(MOCK.bodegas), tienda_id, nombre, descripcion };
      MOCK.bodegas.push(b); return b;
    }
    const { data, error } = await sb.from('bodegas').insert({ tienda_id, nombre, descripcion }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteBodega(id) {
    if (isDemoMode()) {
      const pasillos = MOCK.pasillos.filter(p => p.bodega_id === id).map(p => p.id);
      MOCK.estantes  = MOCK.estantes.filter(e => !pasillos.includes(e.pasillo_id));
      MOCK.pasillos  = MOCK.pasillos.filter(p => p.bodega_id !== id);
      MOCK.bodegas   = MOCK.bodegas.filter(b => b.id !== id);
      return;
    }
    const { error } = await sb.from('bodegas').delete().eq('id', id);
    if (error) throw error;
  },

  async listPasillos(bodegaId = null) {
    if (isDemoMode()) return bodegaId ? MOCK.pasillos.filter(p => p.bodega_id === bodegaId) : MOCK.pasillos;
    let q = sb.from('pasillos').select('*').order('nombre');
    if (bodegaId) q = q.eq('bodega_id', bodegaId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async createPasillo({ bodega_id, nombre }) {
    if (isDemoMode()) {
      const p = { id: nextId(MOCK.pasillos), bodega_id, nombre };
      MOCK.pasillos.push(p); return p;
    }
    const { data, error } = await sb.from('pasillos').insert({ bodega_id, nombre }).select().single();
    if (error) throw error;
    return data;
  },

  async deletePasillo(id) {
    if (isDemoMode()) {
      MOCK.estantes = MOCK.estantes.filter(e => e.pasillo_id !== id);
      MOCK.pasillos = MOCK.pasillos.filter(p => p.id !== id);
      return;
    }
    const { error } = await sb.from('pasillos').delete().eq('id', id);
    if (error) throw error;
  },

  async listEstantes(pasilloId = null) {
    if (isDemoMode()) return pasilloId ? MOCK.estantes.filter(e => e.pasillo_id === pasilloId) : MOCK.estantes;
    let q = sb.from('estantes').select('*').order('nombre');
    if (pasilloId) q = q.eq('pasillo_id', pasilloId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async createEstante({ pasillo_id, nombre }) {
    if (isDemoMode()) {
      const e = { id: nextId(MOCK.estantes), pasillo_id, nombre };
      MOCK.estantes.push(e); return e;
    }
    const { data, error } = await sb.from('estantes').insert({ pasillo_id, nombre }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteEstante(id) {
    if (isDemoMode()) { MOCK.estantes = MOCK.estantes.filter(e => e.id !== id); return; }
    const { error } = await sb.from('estantes').delete().eq('id', id);
    if (error) throw error;
  },

  // -------------------- ARTÍCULOS (CRUD admin) --------------------
  async createArticulo({ codigo_barras, sku, descripcion, familia, unidades_por_caja }) {
    if (isDemoMode()) {
      if (MOCK.articulos.some(a => a.sku === sku)) throw new Error('Ya existe un artículo con ese SKU');
      const newArt = {
        id: nextId(MOCK.articulos), codigo_barras, sku, descripcion,
        familia, unidades_por_caja: unidades_por_caja || null, activo: true
      };
      MOCK.articulos.push(newArt);
      return newArt;
    }
    const { data, error } = await sb.from('articulos').insert({
      codigo_barras, sku, descripcion, familia,
      unidades_por_caja: unidades_por_caja || null, activo: true
    }).select().single();
    if (error) throw error;
    return data;
  },

  // -------------------- ALERTAS DE STOCK --------------------
  async getLowStockAlerts(threshold = 10, tiendaId = null) {
    // listCajas ya aplica el filtro de tienda automáticamente según el rol
    const [cajas, arts] = await Promise.all([this.listCajas(false), this.listArticulos()]);
    const filtered = tiendaId
      ? cajas.filter(c => c.tienda_id === tiendaId || c.posicion?.tienda_id === tiendaId)
      : cajas;
    const stock = {};
    for (const c of filtered) {
      for (const item of (c.contenido || [])) {
        stock[item.articulo_id] = (stock[item.articulo_id] || 0) + item.cantidad_actual;
      }
    }
    return arts
      .filter(a => a.activo !== false)
      .map(a => ({ ...a, stock_total: stock[a.id] || 0 }))
      .filter(a => a.stock_total < threshold)
      .sort((a, b) => a.stock_total - b.stock_total);
  },

  async updateArticulo(id, changes) {
    if (isDemoMode()) {
      const a = MOCK.articulos.find(x => x.id === id);
      if (!a) throw new Error('Artículo no encontrado');
      Object.assign(a, changes);
      return a;
    }
    const { data, error } = await sb.from('articulos').update(changes)
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // -------------------- TURNOS Y HORARIOS --------------------
  async listTurnos() {
    if (isDemoMode()) return MOCK.turnos;
    const { data, error } = await sb.from('turnos').select('*').order('hora_inicio');
    if (error) throw error;
    return data;
  },

  // Devuelve los 7 días de la semana que empieza en fechaInicio (YYYY-MM-DD lunes)
  async getHorarioSemana(usuarioId, fechaInicio) {
    const turnos = await this.listTurnos();
    const days = [];
    const start = new Date(fechaInicio + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const fecha = d.toISOString().slice(0, 10);
      if (isDemoMode()) {
        const h = MOCK.horarios.find(h => h.usuario_id === usuarioId && h.fecha === fecha);
        days.push({
          fecha,
          asignado: !!h,
          diaLibre: h ? h.turno_id === null : false,
          turno: h && h.turno_id ? turnos.find(t => t.id === h.turno_id) || null : null
        });
      } else {
        const { data } = await sb.from('horarios')
          .select('*, turnos(*)').eq('usuario_id', usuarioId).eq('fecha', fecha).maybeSingle();
        days.push({
          fecha,
          asignado: !!data,
          diaLibre: data ? data.turno_id === null : false,
          turno: data?.turnos || null
        });
      }
    }
    return days;
  },

  async setHorarioDia(usuarioId, fecha, turnoId) {
    if (isDemoMode()) {
      const idx = MOCK.horarios.findIndex(h => h.usuario_id === usuarioId && h.fecha === fecha);
      if (turnoId === 'libre') {
        if (idx !== -1) MOCK.horarios[idx].turno_id = null;
        else MOCK.horarios.push({ id: nextId(MOCK.horarios), usuario_id: usuarioId, fecha, turno_id: null });
      } else if (turnoId === 'ninguno') {
        if (idx !== -1) MOCK.horarios.splice(idx, 1);
      } else {
        if (idx !== -1) MOCK.horarios[idx].turno_id = turnoId;
        else MOCK.horarios.push({ id: nextId(MOCK.horarios), usuario_id: usuarioId, fecha, turno_id: turnoId });
      }
      return true;
    }
    if (turnoId === 'ninguno') {
      await sb.from('horarios').delete().eq('usuario_id', usuarioId).eq('fecha', fecha);
    } else {
      await sb.from('horarios').upsert({
        usuario_id: usuarioId,
        fecha,
        turno_id: turnoId === 'libre' ? null : turnoId
      }, { onConflict: 'usuario_id,fecha' });
    }
    return true;
  },

  // Devuelve el turno asignado para HOY, null si es día libre, undefined si no hay asignación
  async checkTurnoHoy(usuarioId) {
    const hoy = new Date().toISOString().slice(0, 10);
    if (isDemoMode()) {
      const h = MOCK.horarios.find(h => h.usuario_id === usuarioId && h.fecha === hoy);
      if (!h) return undefined;
      if (h.turno_id === null) return null;
      return MOCK.turnos.find(t => t.id === h.turno_id) || undefined;
    }
    const { data } = await sb.from('horarios')
      .select('*, turnos(*)').eq('usuario_id', usuarioId).eq('fecha', hoy).maybeSingle();
    if (!data) return undefined;
    if (data.turno_id === null) return null;
    return data.turnos || undefined;
  }
};
