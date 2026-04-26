// =====================================================================
// mock.js — datos demo cuando no hay Supabase configurado
// Las contraseñas iniciales están hardcodeadas para el demo:
//   SSEGURA   / admin123    (admin)
//   MROJAS    / super123    (supervisor)
//   JMARTINEZ / oper123     (operario)
//   CCONTADOR / cont123     (contador)
//   AUDITOR   / audit123    (auditor)
// =====================================================================

import { hashPassword } from './utils.js';

export const MOCK = {
  tiendas: [
    { id: 1, codigo: 'A01', nombre: 'Alajuela Centro' }
  ],
  usuarios: [
    { id: 1, username: 'SSEGURA',   nombre: 'Steven Segura',   email: 'ssegura@almaceneselrey.com',   rol: 'admin',      tienda_id: 1, activo: true, password_hash: '' },
    { id: 2, username: 'MROJAS',    nombre: 'María Rojas',     email: 'mrojas@almaceneselrey.com',    rol: 'supervisor', tienda_id: 1, activo: true, password_hash: '' },
    { id: 3, username: 'JMARTINEZ', nombre: 'Juan Martínez',   email: 'jmartinez@almaceneselrey.com', rol: 'operario',   tienda_id: 1, activo: true, password_hash: '' },
    { id: 4, username: 'CCONTADOR', nombre: 'Carlos Contador', email: 'ccontador@almaceneselrey.com', rol: 'contador',   tienda_id: 1, activo: true, password_hash: '' },
    { id: 5, username: 'AUDITOR',   nombre: 'Ana Auditora',    email: 'aauditora@almaceneselrey.com', rol: 'auditor',    tienda_id: 1, activo: true, password_hash: '' }
  ],
  posiciones: [
    { id: 1, descripcion: 'P1-E1-N1', ubicacion: 'Corona',     tipo: 'corona' },
    { id: 2, descripcion: 'P1-E2-N1', ubicacion: 'Corona',     tipo: 'corona' },
    { id: 3, descripcion: 'P3-E2-N2', ubicacion: 'Bodega 1',   tipo: 'bodega' },
    { id: 4, descripcion: 'P5-E1-N1', ubicacion: 'Bodega 1',   tipo: 'bodega' },
    { id: 5, descripcion: 'V1-E1-N1', ubicacion: 'Exhibición', tipo: 'exhibicion' }
  ],
  articulos: [
    { id: 1, sku: 'CAN-001', codigo_barras: '7501234500011', descripcion: 'Candil LED 60W blanco',     familia: 'Iluminación', unidades_por_caja: 20 },
    { id: 2, sku: 'CAN-002', codigo_barras: '7501234500028', descripcion: 'Candil LED 40W cálido',     familia: 'Iluminación', unidades_por_caja: 24 },
    { id: 3, sku: 'CAN-003', codigo_barras: '7501234500035', descripcion: 'Candil LED solar exterior', familia: 'Iluminación', unidades_por_caja: 12 },
    { id: 4, sku: 'BOM-001', codigo_barras: '7501234500042', descripcion: 'Bombillo halógeno 100W',    familia: 'Iluminación', unidades_por_caja: 50 },
    { id: 5, sku: 'EXT-001', codigo_barras: '7501234500059', descripcion: 'Extensión eléctrica 3 m',   familia: 'Eléctrico',   unidades_por_caja: null }
  ],
  cajas: [
    {
      id: 1, codigo_caja: 'ELRY-A01-CJ-A7B2K9M4', tipo_caja: 'producto', estado: 'activa',
      posicion_id: 1, fecha_creacion: '2026-04-10T08:30:00Z',
      contenido: [
        { articulo_id: 1, cantidad_inicial: 20, cantidad_actual: 1 },
        { articulo_id: 2, cantidad_inicial: 10, cantidad_actual: 7 }
      ]
    },
    {
      id: 2, codigo_caja: 'ELRY-A01-CJ-B3D5F7H1', tipo_caja: 'producto', estado: 'activa',
      posicion_id: 3, fecha_creacion: '2026-04-15T11:20:00Z',
      contenido: [
        { articulo_id: 3, cantidad_inicial: 30, cantidad_actual: 30 },
        { articulo_id: 4, cantidad_inicial: 15, cantidad_actual: 12 }
      ]
    },
    {
      id: 3, codigo_caja: 'ELRY-A01-CJ-X9Y8Z7W6', tipo_caja: 'reutilizable', estado: 'activa',
      posicion_id: 5, fecha_creacion: '2026-04-20T09:00:00Z',
      contenido: [
        { articulo_id: 5, cantidad_inicial: 25, cantidad_actual: 18 }
      ]
    }
  ],
  movimientos: [
    { id: 7, tipo: 'reducir',    caja_id: 3, articulo_id: 5,   cantidad: 7,    usuario_id: 3, motivo: 'Venta',                   creado_at: '2026-04-25T14:32:00Z' },
    { id: 6, tipo: 'crear_caja', caja_id: 3, articulo_id: null,cantidad: null, usuario_id: 2, motivo: 'Reposición exhibición',   creado_at: '2026-04-20T09:00:00Z' },
    { id: 5, tipo: 'reducir',    caja_id: 2, articulo_id: 4,   cantidad: 3,    usuario_id: 2, motivo: 'Venta',                   creado_at: '2026-04-22T16:10:00Z' },
    { id: 4, tipo: 'crear_caja', caja_id: 2, articulo_id: null,cantidad: null, usuario_id: 1, motivo: 'Recepción de proveedor',  creado_at: '2026-04-15T11:20:00Z' },
    { id: 3, tipo: 'reducir',    caja_id: 1, articulo_id: 2,   cantidad: 3,    usuario_id: 3, motivo: 'Venta',                   creado_at: '2026-04-19T10:05:00Z' },
    { id: 2, tipo: 'reducir',    caja_id: 1, articulo_id: 1,   cantidad: 19,   usuario_id: 3, motivo: 'Venta',                   creado_at: '2026-04-18T15:42:00Z' },
    { id: 1, tipo: 'crear_caja', caja_id: 1, articulo_id: null,cantidad: null, usuario_id: 1, motivo: 'Recepción de proveedor',  creado_at: '2026-04-10T08:30:00Z' }
  ]
};

// Mapa de contraseñas iniciales del demo (en claro). Se hashea al iniciar.
const _DEFAULT_PASSWORDS = {
  SSEGURA:   'admin123',
  MROJAS:    'super123',
  JMARTINEZ: 'oper123',
  CCONTADOR: 'cont123',
  AUDITOR:   'audit123'
};

// Llamar UNA vez al arrancar la app para hashear las contraseñas demo
export async function initMockPasswords() {
  for (const [u, p] of Object.entries(_DEFAULT_PASSWORDS)) {
    const user = MOCK.usuarios.find(x => x.username === u);
    if (user && !user.password_hash) {
      user.password_hash = await hashPassword(p);
    }
  }
}

// Helper: próximo ID en una colección
export function nextId(collection) {
  return Math.max(0, ...collection.map(x => x.id || 0)) + 1;
}
