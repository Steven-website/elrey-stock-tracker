// =====================================================================
// mock.js — datos demo cuando no hay Supabase configurado
// Credenciales demo:
//   SSEGURA   / admin123    (admin)
//   MROJAS    / super123    (supervisor · Alajuela)
//   JMARTINEZ / oper123     (operario  · Alajuela)
//   CCONTADOR / cont123     (contador  · Alajuela)
//   AUDITOR   / audit123    (auditor   · Alajuela)
//   HGOMEZ    / super456    (supervisor· Heredia)
//   KLOPEZ    / oper456     (operario  · Heredia)
// =====================================================================

import { hashPassword } from './utils.js';

export const MOCK = {
  tiendas: [
    { id: 1, codigo: 'A01', nombre: 'Alajuela Centro', activa: true },
    { id: 2, codigo: 'H01', nombre: 'Heredia',         activa: true }
  ],

  usuarios: [
    { id: 1, username: 'SSEGURA',   nombre: 'Steven Segura',    email: 'ssegura@almaceneselrey.com',    rol: 'admin',      tienda_id: 1, activo: true,  password_hash: '' },
    { id: 2, username: 'MROJAS',    nombre: 'María Rojas',      email: 'mrojas@almaceneselrey.com',     rol: 'supervisor', tienda_id: 1, activo: true,  password_hash: '' },
    { id: 3, username: 'JMARTINEZ', nombre: 'Juan Martínez',    email: 'jmartinez@almaceneselrey.com',  rol: 'operario',   tienda_id: 1, activo: true,  password_hash: '' },
    { id: 4, username: 'CCONTADOR', nombre: 'Carlos Contador',  email: 'ccontador@almaceneselrey.com',  rol: 'contador',   tienda_id: 1, activo: true,  password_hash: '' },
    { id: 5, username: 'AUDITOR',   nombre: 'Ana Auditora',     email: 'aauditora@almaceneselrey.com',  rol: 'auditor',    tienda_id: 1, activo: true,  password_hash: '' },
    { id: 6, username: 'HGOMEZ',    nombre: 'Hugo Gómez',       email: 'hgomez@almaceneselrey.com',     rol: 'supervisor', tienda_id: 2, activo: true,  password_hash: '' },
    { id: 7, username: 'KLOPEZ',    nombre: 'Karina López',     email: 'klopez@almaceneselrey.com',     rol: 'operario',   tienda_id: 2, activo: true,  password_hash: '' }
  ],

  posiciones: [
    // Alajuela Centro
    { id: 1, descripcion: 'P1-E1-N1', ubicacion: 'Bodega A01',    tipo: 'bodega',     tienda_id: 1 },
    { id: 2, descripcion: 'P1-E2-N1', ubicacion: 'Bodega A01',    tipo: 'bodega',     tienda_id: 1 },
    { id: 3, descripcion: 'P2-E1-N1', ubicacion: 'Corona A01',    tipo: 'corona',     tienda_id: 1 },
    { id: 4, descripcion: 'V1-E1-N1', ubicacion: 'Exhibición A01',tipo: 'exhibicion', tienda_id: 1 },
    // Heredia
    { id: 5, descripcion: 'P1-E1-N1', ubicacion: 'Bodega H01',    tipo: 'bodega',     tienda_id: 2 },
    { id: 6, descripcion: 'P2-E1-N1', ubicacion: 'Corona H01',    tipo: 'corona',     tienda_id: 2 }
  ],

  articulos: [
    // Iluminación (4)
    { id: 1,  sku: 'CAN-001', codigo_barras: '7501234500011', descripcion: 'Candil LED 60W blanco',           familia: 'Iluminación', unidades_por_caja: 20,   activo: true },
    { id: 2,  sku: 'CAN-002', codigo_barras: '7501234500028', descripcion: 'Candil LED 40W cálido',           familia: 'Iluminación', unidades_por_caja: 24,   activo: true },
    { id: 3,  sku: 'CAN-003', codigo_barras: '7501234500035', descripcion: 'Candil LED solar exterior',       familia: 'Iluminación', unidades_por_caja: 12,   activo: true },
    { id: 4,  sku: 'BOM-001', codigo_barras: '7501234500042', descripcion: 'Bombillo halógeno 100W',          familia: 'Iluminación', unidades_por_caja: 50,   activo: true },
    // Eléctrico (3)
    { id: 5,  sku: 'EXT-001', codigo_barras: '7501234500059', descripcion: 'Extensión eléctrica 3 m',         familia: 'Eléctrico',   unidades_por_caja: null, activo: true },
    { id: 6,  sku: 'TOM-001', codigo_barras: '7501234500066', descripcion: 'Tomacorriente doble polarizado',  familia: 'Eléctrico',   unidades_por_caja: 10,   activo: true },
    { id: 7,  sku: 'INT-001', codigo_barras: '7501234500073', descripcion: 'Interruptor sencillo',            familia: 'Eléctrico',   unidades_por_caja: 24,   activo: true },
    // Plomería (2)
    { id: 8,  sku: 'PEG-001', codigo_barras: '7501234500080', descripcion: 'Pegamento PVC 250 ml',            familia: 'Plomería',    unidades_por_caja: 12,   activo: true },
    { id: 9,  sku: 'TUB-001', codigo_barras: '7501234500097', descripcion: 'Tubo PVC 1/2" × 3 m',            familia: 'Plomería',    unidades_por_caja: 10,   activo: true },
    // Ferretería (1)
    { id: 10, sku: 'LIJ-001', codigo_barras: '7501234500104', descripcion: 'Lija de agua grano 120',          familia: 'Ferretería',  unidades_por_caja: 50,   activo: true }
  ],

  cajas: [
    // ── Alajuela Centro ──────────────────────────────────────────────────
    {
      id: 1, codigo_caja: 'ELRY-A01-CJ-A7B2K9M4', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 1, tienda_id: 1, fecha_creacion: '2026-04-10T08:30:00Z',
      contenido: [
        { articulo_id: 1, cantidad_inicial: 20, cantidad_actual: 1 },
        { articulo_id: 2, cantidad_inicial: 24, cantidad_actual: 17 }
      ]
    },
    {
      id: 2, codigo_caja: 'ELRY-A01-CJ-B3D5F7H1', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 3, tienda_id: 1, fecha_creacion: '2026-04-15T11:20:00Z',
      contenido: [
        { articulo_id: 6, cantidad_inicial: 10, cantidad_actual: 7 },
        { articulo_id: 7, cantidad_inicial: 24, cantidad_actual: 24 }
      ]
    },
    {
      id: 3, codigo_caja: 'ELRY-A01-CJ-X9Y8Z7W6', tipo_caja: 'reutilizable', estado: 'activa',
      posicion_id: 4, tienda_id: 1, fecha_creacion: '2026-04-20T09:00:00Z',
      contenido: [
        { articulo_id: 5,  cantidad_inicial: 15, cantidad_actual: 8 },
        { articulo_id: 10, cantidad_inicial: 50, cantidad_actual: 43 }
      ]
    },
    // ── Heredia ──────────────────────────────────────────────────────────
    {
      id: 4, codigo_caja: 'ELRY-H01-CJ-C4E6G8J2', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 5, tienda_id: 2, fecha_creacion: '2026-04-12T10:00:00Z',
      contenido: [
        { articulo_id: 3, cantidad_inicial: 12, cantidad_actual: 12 },
        { articulo_id: 4, cantidad_inicial: 50, cantidad_actual: 38 }
      ]
    },
    {
      id: 5, codigo_caja: 'ELRY-H01-CJ-D7F9H1K3', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 5, tienda_id: 2, fecha_creacion: '2026-04-18T14:30:00Z',
      contenido: [
        { articulo_id: 8, cantidad_inicial: 12, cantidad_actual: 9 },
        { articulo_id: 9, cantidad_inicial: 10, cantidad_actual: 10 }
      ]
    }
  ],

  movimientos: [
    { id: 12, tipo: 'crear_caja',  caja_id: 5, articulo_id: null, cantidad: null, usuario_id: 6, motivo: 'Recepción proveedor H01',  creado_at: '2026-04-18T14:30:00Z' },
    { id: 11, tipo: 'reducir',     caja_id: 4, articulo_id: 4,   cantidad: 12,   usuario_id: 7, motivo: 'Venta',                    creado_at: '2026-04-25T09:15:00Z' },
    { id: 10, tipo: 'crear_caja',  caja_id: 4, articulo_id: null, cantidad: null, usuario_id: 6, motivo: 'Recepción proveedor H01',  creado_at: '2026-04-12T10:00:00Z' },
    { id: 9,  tipo: 'reducir',     caja_id: 3, articulo_id: 5,   cantidad: 7,    usuario_id: 3, motivo: 'Venta',                    creado_at: '2026-04-26T14:32:00Z' },
    { id: 8,  tipo: 'crear_caja',  caja_id: 3, articulo_id: null, cantidad: null, usuario_id: 2, motivo: 'Reposición exhibición',    creado_at: '2026-04-20T09:00:00Z' },
    { id: 7,  tipo: 'reducir',     caja_id: 2, articulo_id: 6,   cantidad: 3,    usuario_id: 3, motivo: 'Venta',                    creado_at: '2026-04-26T11:10:00Z' },
    { id: 6,  tipo: 'crear_caja',  caja_id: 2, articulo_id: null, cantidad: null, usuario_id: 1, motivo: 'Recepción de proveedor',   creado_at: '2026-04-15T11:20:00Z' },
    { id: 5,  tipo: 'reducir',     caja_id: 1, articulo_id: 2,   cantidad: 7,    usuario_id: 3, motivo: 'Venta',                    creado_at: '2026-04-26T10:05:00Z' },
    { id: 4,  tipo: 'reducir',     caja_id: 1, articulo_id: 2,   cantidad: 3,    usuario_id: 3, motivo: 'Venta',                    creado_at: '2026-04-19T10:05:00Z' },
    { id: 3,  tipo: 'reducir',     caja_id: 1, articulo_id: 1,   cantidad: 10,   usuario_id: 2, motivo: 'Traslado a exhibición',     creado_at: '2026-04-18T15:42:00Z' },
    { id: 2,  tipo: 'reducir',     caja_id: 1, articulo_id: 1,   cantidad: 9,    usuario_id: 3, motivo: 'Venta',                    creado_at: '2026-04-17T09:20:00Z' },
    { id: 1,  tipo: 'crear_caja',  caja_id: 1, articulo_id: null, cantidad: null, usuario_id: 1, motivo: 'Recepción de proveedor',   creado_at: '2026-04-10T08:30:00Z' }
  ]
};

const _DEFAULT_PASSWORDS = {
  SSEGURA:   'admin123',
  MROJAS:    'super123',
  JMARTINEZ: 'oper123',
  CCONTADOR: 'cont123',
  AUDITOR:   'audit123',
  HGOMEZ:    'super456',
  KLOPEZ:    'oper456'
};

export async function initMockPasswords() {
  for (const [u, p] of Object.entries(_DEFAULT_PASSWORDS)) {
    const user = MOCK.usuarios.find(x => x.username === u);
    if (user && !user.password_hash) {
      user.password_hash = await hashPassword(p);
    }
  }
}

export function nextId(collection) {
  return Math.max(0, ...collection.map(x => x.id || 0)) + 1;
}
