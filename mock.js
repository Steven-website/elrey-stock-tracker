// =====================================================================
// mock.js — datos demo cuando no hay Supabase configurado
// Credenciales demo:
//   SSEGURA      / admin123    (admin)
//   MROJAS       / super123    (supervisor · Alajuela)
//   JMARTINEZ    / oper123     (operario   · Alajuela)
//   CCONTADOR    / cont123     (contador   · Alajuela)
//   AUDITOR      / audit123    (auditor    · Alajuela)
//   HGOMEZ       / super456    (supervisor · Heredia)
//   KLOPEZ       / oper456     (operario   · Heredia)
//   LADMIN       / tienda123   (admin_tienda · Alajuela)
//   JINVENTARIO  / jinv123     (jefe_inventario · todas las tiendas)
// =====================================================================

import { hashPassword } from './utils.js';

export const MOCK = {
  tiendas: [
    { id: 1, codigo: 'A01', nombre: 'Alajuela Centro', activa: true, lat: 10.0162, lng: -84.2151, radio_metros: 300 },
    { id: 2, codigo: 'H01', nombre: 'Heredia',         activa: true, lat:  9.9981, lng: -84.1170, radio_metros: 300 }
  ],

  usuarios: [
    { id: 1, username: 'SSEGURA',   nombre: 'Steven Segura',    email: 'ssegura@almaceneselrey.com',    rol: 'admin',      tienda_id: 1, activo: true,  password_hash: '' },
    { id: 2, username: 'MROJAS',    nombre: 'María Rojas',      email: 'mrojas@almaceneselrey.com',     rol: 'supervisor', tienda_id: 1, activo: true,  password_hash: '' },
    { id: 3, username: 'JMARTINEZ', nombre: 'Juan Martínez',    email: 'jmartinez@almaceneselrey.com',  rol: 'operario',   tienda_id: 1, activo: true,  password_hash: '' },
    { id: 4, username: 'CCONTADOR', nombre: 'Carlos Contador',  email: 'ccontador@almaceneselrey.com',  rol: 'contador',   tienda_id: 1, activo: true,  password_hash: '' },
    { id: 5, username: 'AUDITOR',   nombre: 'Ana Auditora',     email: 'aauditora@almaceneselrey.com',  rol: 'auditor',    tienda_id: 1, activo: true,  password_hash: '' },
    { id: 6, username: 'HGOMEZ',    nombre: 'Hugo Gómez',       email: 'hgomez@almaceneselrey.com',     rol: 'supervisor', tienda_id: 2, activo: true,  password_hash: '' },
    { id: 7, username: 'KLOPEZ',    nombre: 'Karina López',     email: 'klopez@almaceneselrey.com',     rol: 'operario',   tienda_id: 2, activo: true,  password_hash: '' },
    { id: 8, username: 'LADMIN',      nombre: 'Laura Admin',      email: 'ladmin@almaceneselrey.com',      rol: 'admin_tienda',    tienda_id: 1,    activo: true, password_hash: '' },
    { id: 9, username: 'JINVENTARIO', nombre: 'Jorge Inventario', email: 'jinventario@almaceneselrey.com', rol: 'jefe_inventario', tienda_id: null, activo: true, password_hash: '' }
  ],

  posiciones: [
    // Alajuela Centro
    { id: 1, descripcion: 'P1-E1-N1', ubicacion: 'Bodega A01',    tipo: 'bodega',     tienda_id: 1, estante_id: 1 },
    { id: 2, descripcion: 'P1-E2-N1', ubicacion: 'Bodega A01',    tipo: 'bodega',     tienda_id: 1, estante_id: 2 },
    { id: 3, descripcion: 'P2-E1-N1', ubicacion: 'Corona A01',    tipo: 'corona',     tienda_id: 1, estante_id: 4 },
    { id: 4, descripcion: 'V1-E1-N1', ubicacion: 'Exhibición A01',tipo: 'exhibicion', tienda_id: 1, estante_id: 6 },
    // Heredia
    { id: 5, descripcion: 'P1-E1-N1', ubicacion: 'Bodega H01',    tipo: 'bodega',     tienda_id: 2, estante_id: 7 },
    { id: 6, descripcion: 'P2-E1-N1', ubicacion: 'Corona H01',    tipo: 'corona',     tienda_id: 2, estante_id: 9 }
  ],

  bodegas: [
    { id: 1, tienda_id: 1, nombre: 'Bodega Central',  descripcion: 'Bodega principal de la tienda' },
    { id: 2, tienda_id: 1, nombre: 'Exhibición',      descripcion: 'Área de exhibición al cliente' },
    { id: 3, tienda_id: 2, nombre: 'Bodega Norte',    descripcion: 'Bodega principal Heredia' }
  ],

  pasillos: [
    { id: 1, bodega_id: 1, nombre: 'Pasillo A' },
    { id: 2, bodega_id: 1, nombre: 'Pasillo B' },
    { id: 3, bodega_id: 2, nombre: 'Exhibición 1' },
    { id: 4, bodega_id: 3, nombre: 'Pasillo A' },
    { id: 5, bodega_id: 3, nombre: 'Pasillo B' }
  ],

  estantes: [
    // Alajuela · Bodega Central · Pasillo A
    { id: 1, pasillo_id: 1, nombre: 'A-01' },
    { id: 2, pasillo_id: 1, nombre: 'A-02' },
    { id: 3, pasillo_id: 1, nombre: 'A-03' },
    // Alajuela · Bodega Central · Pasillo B
    { id: 4, pasillo_id: 2, nombre: 'B-01' },
    { id: 5, pasillo_id: 2, nombre: 'B-02' },
    // Alajuela · Exhibición · Exhibición 1
    { id: 6, pasillo_id: 3, nombre: 'E-01' },
    // Heredia · Bodega Norte · Pasillo A
    { id: 7, pasillo_id: 4, nombre: 'A-01' },
    { id: 8, pasillo_id: 4, nombre: 'A-02' },
    // Heredia · Bodega Norte · Pasillo B
    { id: 9, pasillo_id: 5, nombre: 'B-01' }
  ],

  articulos: [
    // Iluminación (4)
    { id: 1,  sku: 'CAN-001', codigo_barras: '7501234500012', descripcion: 'Candil LED 60W blanco',           familia: 'Iluminación', unidades_por_caja: 20,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-can001/400/400' },
    { id: 2,  sku: 'CAN-002', codigo_barras: '7501234500029', descripcion: 'Candil LED 40W cálido',           familia: 'Iluminación', unidades_por_caja: 24,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-can002/400/400' },
    { id: 3,  sku: 'CAN-003', codigo_barras: '7501234500036', descripcion: 'Candil LED solar exterior',       familia: 'Iluminación', unidades_por_caja: 12,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-can003/400/400' },
    { id: 4,  sku: 'BOM-001', codigo_barras: '7501234500043', descripcion: 'Bombillo halógeno 100W',          familia: 'Iluminación', unidades_por_caja: 50,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-bom001/400/400' },
    // Eléctrico (3)
    { id: 5,  sku: 'EXT-001', codigo_barras: '7501234500050', descripcion: 'Extensión eléctrica 3 m',         familia: 'Eléctrico',   unidades_por_caja: null, activo: true, imagen_url: 'https://picsum.photos/seed/elrey-ext001/400/400' },
    { id: 6,  sku: 'TOM-001', codigo_barras: '7501234500067', descripcion: 'Tomacorriente doble polarizado',  familia: 'Eléctrico',   unidades_por_caja: 10,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-tom001/400/400' },
    { id: 7,  sku: 'INT-001', codigo_barras: '7501234500074', descripcion: 'Interruptor sencillo',            familia: 'Eléctrico',   unidades_por_caja: 24,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-int001/400/400' },
    // Plomería (2)
    { id: 8,  sku: 'PEG-001', codigo_barras: '7501234500081', descripcion: 'Pegamento PVC 250 ml',            familia: 'Plomería',    unidades_por_caja: 12,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-peg001/400/400' },
    { id: 9,  sku: 'TUB-001', codigo_barras: '7501234500098', descripcion: 'Tubo PVC 1/2" × 3 m',            familia: 'Plomería',    unidades_por_caja: 10,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-tub001/400/400' },
    // Ferretería (1)
    { id: 10, sku: 'LIJ-001', codigo_barras: '7501234500104', descripcion: 'Lija de agua grano 120',          familia: 'Ferretería',  unidades_por_caja: 50,   activo: true, imagen_url: 'https://picsum.photos/seed/elrey-lij001/400/400' }
  ],

  cajas: [
    // ── Alajuela Centro ──────────────────────────────────────────────────
    // 5 cajas demo · cada caja con 2 productos para simulaciones multi-rol
    {
      id: 1, codigo_caja: 'ELRY-A01-CJ-A7B2K9M4', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 1, tienda_id: 1, fecha_creacion: '2026-04-10T08:30:00Z',
      contenido: [
        { articulo_id: 1, cantidad_inicial: 20, cantidad_actual: 20 },  // CAN-001 · 7501234500012
        { articulo_id: 2, cantidad_inicial: 24, cantidad_actual: 24 }   // CAN-002 · 7501234500029
      ]
    },
    {
      id: 2, codigo_caja: 'ELRY-A01-CJ-B3D5F7H1', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 3, tienda_id: 1, fecha_creacion: '2026-04-15T11:20:00Z',
      contenido: [
        { articulo_id: 6, cantidad_inicial: 10, cantidad_actual: 10 },  // TOM-001 · 7501234500067
        { articulo_id: 7, cantidad_inicial: 24, cantidad_actual: 24 }   // INT-001 · 7501234500074
      ]
    },
    {
      id: 3, codigo_caja: 'ELRY-A01-CJ-X9Y8Z7W6', tipo_caja: 'reutilizable', estado: 'activa',
      posicion_id: 4, tienda_id: 1, fecha_creacion: '2026-04-20T09:00:00Z',
      contenido: [
        { articulo_id: 5,  cantidad_inicial: 15, cantidad_actual: 15 }, // EXT-001 · 7501234500050
        { articulo_id: 10, cantidad_inicial: 50, cantidad_actual: 50 }  // LIJ-001 · 7501234500104
      ]
    },
    // ── Heredia ──────────────────────────────────────────────────────────
    {
      id: 4, codigo_caja: 'ELRY-H01-CJ-C4E6G8J2', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 5, tienda_id: 2, fecha_creacion: '2026-04-12T10:00:00Z',
      contenido: [
        { articulo_id: 3, cantidad_inicial: 12, cantidad_actual: 12 },  // CAN-003 · 7501234500036
        { articulo_id: 4, cantidad_inicial: 50, cantidad_actual: 50 }   // BOM-001 · 7501234500043
      ]
    },
    {
      id: 5, codigo_caja: 'ELRY-H01-CJ-D7F9H1K3', tipo_caja: 'producto',    estado: 'activa',
      posicion_id: 5, tienda_id: 2, fecha_creacion: '2026-04-18T14:30:00Z',
      contenido: [
        { articulo_id: 8, cantidad_inicial: 12, cantidad_actual: 12 },  // PEG-001 · 7501234500081
        { articulo_id: 9, cantidad_inicial: 10, cantidad_actual: 10 }   // TUB-001 · 7501234500098
      ]
    }
  ],

  // ── Conteo de inventario ─────────────────────────────────────────────
  tareas_conteo: [
    {
      id: 1, nombre: 'Conteo Familia Iluminación',
      tienda_id: 1, creado_por: 2, asignado_a: 4,
      estado: 'activa', creado_at: '2026-04-26T08:00:00Z'
    }
  ],

  tarea_articulos: [
    { id: 1, tarea_id: 1, articulo_id: 1 },
    { id: 2, tarea_id: 1, articulo_id: 2 },
    { id: 3, tarea_id: 1, articulo_id: 3 },
    { id: 4, tarea_id: 1, articulo_id: 4 }
  ],

  conteo_registros: [],

  movimientos: [
    { id: 5, tipo: 'crear_caja', caja_id: 5, articulo_id: null, cantidad: null, usuario_id: 6, motivo: 'Recepción proveedor H01', creado_at: '2026-04-18T14:30:00Z' },
    { id: 4, tipo: 'crear_caja', caja_id: 4, articulo_id: null, cantidad: null, usuario_id: 6, motivo: 'Recepción proveedor H01', creado_at: '2026-04-12T10:00:00Z' },
    { id: 3, tipo: 'crear_caja', caja_id: 3, articulo_id: null, cantidad: null, usuario_id: 2, motivo: 'Reposición exhibición',   creado_at: '2026-04-20T09:00:00Z' },
    { id: 2, tipo: 'crear_caja', caja_id: 2, articulo_id: null, cantidad: null, usuario_id: 1, motivo: 'Recepción de proveedor',  creado_at: '2026-04-15T11:20:00Z' },
    { id: 1, tipo: 'crear_caja', caja_id: 1, articulo_id: null, cantidad: null, usuario_id: 1, motivo: 'Recepción de proveedor',  creado_at: '2026-04-10T08:30:00Z' }
  ]
};

const _DEFAULT_PASSWORDS = {
  SSEGURA:     'admin123',
  MROJAS:      'super123',
  JMARTINEZ:   'oper123',
  CCONTADOR:   'cont123',
  AUDITOR:     'audit123',
  HGOMEZ:      'super456',
  KLOPEZ:      'oper456',
  LADMIN:      'tienda123',
  JINVENTARIO: 'jinv123'
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
