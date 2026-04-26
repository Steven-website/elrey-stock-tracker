-- =====================================================================
-- SCHEMA: Sistema de Inventario por Ubicación - Piloto El Rey
-- Para ejecutar en Supabase SQL Editor
-- =====================================================================

-- Limpieza opcional (descomentar si querés empezar de cero)
-- DROP TABLE IF EXISTS movimientos CASCADE;
-- DROP TABLE IF EXISTS caja_contenido CASCADE;
-- DROP TABLE IF EXISTS cajas CASCADE;
-- DROP TABLE IF EXISTS posiciones CASCADE;
-- DROP TABLE IF EXISTS ubicaciones CASCADE;
-- DROP TABLE IF EXISTS articulos CASCADE;
-- DROP TABLE IF EXISTS usuarios CASCADE;
-- DROP TABLE IF EXISTS tiendas CASCADE;
-- DROP TABLE IF EXISTS alertas CASCADE;

-- =====================================================================
-- TABLAS PRINCIPALES
-- =====================================================================

CREATE TABLE tiendas (
  id          SERIAL PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  activa      BOOLEAN DEFAULT TRUE,
  creada_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usuarios (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  email           TEXT,
  rol             TEXT NOT NULL CHECK (rol IN ('admin', 'supervisor', 'operario', 'contador', 'auditor')),
  tienda_id       INTEGER REFERENCES tiendas(id),
  password_hash   TEXT,                                    -- SHA-256 hex
  password_set_at TIMESTAMPTZ,
  ultimo_login    TIMESTAMPTZ,
  activo          BOOLEAN DEFAULT TRUE,
  creado_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ubicaciones (
  id          SERIAL PRIMARY KEY,
  tienda_id   INTEGER NOT NULL REFERENCES tiendas(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('corona', 'bodega', 'exhibicion')),
  nombre      TEXT NOT NULL,
  qr_code     TEXT UNIQUE,
  UNIQUE(tienda_id, nombre)
);

CREATE TABLE posiciones (
  id            SERIAL PRIMARY KEY,
  ubicacion_id  INTEGER NOT NULL REFERENCES ubicaciones(id),
  pasillo       TEXT,
  estante       TEXT,
  nivel         TEXT,
  qr_code       TEXT UNIQUE,
  descripcion   TEXT GENERATED ALWAYS AS (
    COALESCE(pasillo, '') || '-' || COALESCE(estante, '') || '-' || COALESCE(nivel, '')
  ) STORED
);

CREATE TABLE articulos (
  id                 SERIAL PRIMARY KEY,
  codigo_barras      TEXT UNIQUE,
  sku                TEXT,
  descripcion        TEXT NOT NULL,
  familia            TEXT,              -- categoría: iluminación, eléctrico, ferretería, etc.
  unidad_medida      TEXT DEFAULT 'unidad',
  unidades_por_caja  INTEGER,           -- capacidad estándar de la caja del proveedor (referencia)
  activo             BOOLEAN DEFAULT TRUE
);

CREATE TABLE cajas (
  id              SERIAL PRIMARY KEY,
  codigo_caja     TEXT NOT NULL UNIQUE,
  tipo_caja       TEXT NOT NULL DEFAULT 'reutilizable'
                  CHECK (tipo_caja IN ('producto', 'reutilizable')),
  posicion_id     INTEGER REFERENCES posiciones(id),
  estado          TEXT NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa','vacia','transito','archivada')),
  creada_por      INTEGER REFERENCES usuarios(id),
  fecha_creacion  TIMESTAMPTZ DEFAULT NOW(),
  fecha_consumida TIMESTAMPTZ,           -- cuándo se marcó como vacía
  consumida_por   INTEGER REFERENCES usuarios(id),
  notas           TEXT
);

CREATE TABLE caja_contenido (
  id                  SERIAL PRIMARY KEY,
  caja_id             INTEGER NOT NULL REFERENCES cajas(id) ON DELETE CASCADE,
  articulo_id         INTEGER NOT NULL REFERENCES articulos(id),
  cantidad_inicial    INTEGER NOT NULL CHECK (cantidad_inicial >= 0),
  cantidad_actual     INTEGER NOT NULL CHECK (cantidad_actual >= 0),
  ultima_modificacion TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(caja_id, articulo_id)
);

CREATE TABLE movimientos (
  id                  BIGSERIAL PRIMARY KEY,
  tipo                TEXT NOT NULL CHECK (tipo IN (
                        'crear_caja','agregar_articulo','reducir',
                        'aumentar','trasladar_caja','transferir_tienda',
                        'recibir','conteo','ajuste','consumir_caja'
                      )),
  caja_id             INTEGER REFERENCES cajas(id),
  articulo_id         INTEGER REFERENCES articulos(id),
  cantidad            INTEGER,
  posicion_origen_id  INTEGER REFERENCES posiciones(id),
  posicion_destino_id INTEGER REFERENCES posiciones(id),
  tienda_origen_id    INTEGER REFERENCES tiendas(id),
  tienda_destino_id   INTEGER REFERENCES tiendas(id),
  usuario_id          INTEGER REFERENCES usuarios(id),
  motivo              TEXT,
  notas               TEXT,
  creado_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alertas (
  id                  SERIAL PRIMARY KEY,
  tipo                TEXT NOT NULL CHECK (tipo IN (
                        'stock_bajo','transferencia_sugerida','caja_inactiva',
                        'inventario_fantasma','conteo_desviado'
                      )),
  prioridad           TEXT NOT NULL DEFAULT 'media'
                      CHECK (prioridad IN ('baja','media','alta','critica')),
  estado              TEXT NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa','atendida','descartada')),
  mensaje             TEXT NOT NULL,
  tienda_origen_id    INTEGER REFERENCES tiendas(id),
  tienda_destino_id   INTEGER REFERENCES tiendas(id),
  articulo_id         INTEGER REFERENCES articulos(id),
  caja_id             INTEGER REFERENCES cajas(id),
  cantidad_sugerida   INTEGER,
  creada_at           TIMESTAMPTZ DEFAULT NOW(),
  atendida_at         TIMESTAMPTZ,
  atendida_por        INTEGER REFERENCES usuarios(id)
);

-- =====================================================================
-- ÍNDICES
-- =====================================================================
CREATE INDEX idx_cajas_codigo      ON cajas(codigo_caja);
CREATE INDEX idx_cajas_posicion    ON cajas(posicion_id);
CREATE INDEX idx_contenido_caja    ON caja_contenido(caja_id);
CREATE INDEX idx_movimientos_caja  ON movimientos(caja_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(creado_at DESC);
CREATE INDEX idx_alertas_estado    ON alertas(estado, prioridad);

-- =====================================================================
-- VISTA ÚTIL: caja con contenido y ubicación
-- =====================================================================
CREATE OR REPLACE VIEW v_cajas_completo AS
SELECT
  c.id, c.codigo_caja, c.estado, c.fecha_creacion,
  t.nombre AS tienda, u.nombre AS ubicacion, u.tipo AS ubicacion_tipo,
  p.descripcion AS posicion,
  COALESCE(SUM(cc.cantidad_actual), 0) AS unidades_totales,
  COUNT(cc.articulo_id) AS articulos_distintos,
  usr.nombre AS creada_por
FROM cajas c
LEFT JOIN posiciones p   ON p.id = c.posicion_id
LEFT JOIN ubicaciones u  ON u.id = p.ubicacion_id
LEFT JOIN tiendas t      ON t.id = u.tienda_id
LEFT JOIN caja_contenido cc ON cc.caja_id = c.id
LEFT JOIN usuarios usr   ON usr.id = c.creada_por
GROUP BY c.id, t.nombre, u.nombre, u.tipo, p.descripcion, usr.nombre;

-- =====================================================================
-- VISTA: cajas consumidas (analytics)
-- Cuántas cajas se consumieron, agrupadas por mes y artículo
-- =====================================================================
CREATE OR REPLACE VIEW v_consumo_cajas AS
SELECT
  DATE_TRUNC('month', c.fecha_consumida) AS mes,
  c.tipo_caja,
  a.id AS articulo_id, a.descripcion AS articulo,
  COUNT(DISTINCT c.id) AS cajas_consumidas,
  SUM(cc.cantidad_inicial) AS unidades_totales
FROM cajas c
JOIN caja_contenido cc ON cc.caja_id = c.id
JOIN articulos a ON a.id = cc.articulo_id
WHERE c.estado = 'vacia' AND c.fecha_consumida IS NOT NULL
GROUP BY DATE_TRUNC('month', c.fecha_consumida), c.tipo_caja, a.id, a.descripcion
ORDER BY mes DESC, unidades_totales DESC;

-- =====================================================================
-- DATOS DE PRUEBA (descomentar para poblar con datos demo)
-- =====================================================================

INSERT INTO tiendas (codigo, nombre) VALUES
  ('A01', 'Alajuela Centro'),
  ('H01', 'Heredia');

-- Hashes SHA-256 reales de las contraseñas demo (cambialos en producción):
INSERT INTO usuarios (username, nombre, email, rol, tienda_id, password_hash) VALUES
  ('SSEGURA',  'Steven Segura',   'ssegura@almaceneselrey.com',   'admin',      1, '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'),  -- admin123
  ('MROJAS',   'María Rojas',     'mrojas@almaceneselrey.com',    'supervisor', 1, '4e4c56e4a15f89f05c2f4c72613da2a18c9665d4f0d6acce16415eb06f9be776'),  -- super123
  ('JMARTINEZ','Juan Martínez',   'jmartinez@almaceneselrey.com', 'operario',   1, '13a93f9a5502e71eed80a806f87bc4424e03e6b0d90acd513ea9d561c853b738'),  -- oper123
  ('CCONTADOR','Carlos Contador', 'ccontador@almaceneselrey.com', 'contador',   1, '1c11a11a7ec81e9a11e258ba6191885e10ec0a16d67c1bf499838376111e6313'),  -- cont123
  ('AUDITOR',  'Ana Auditora',    'aauditora@almaceneselrey.com', 'auditor',    1, '0b26f7caa1c2e5e3f11adfd22f47403ed214a1d4451117a18ea726b451a3aa61'); -- audit123

INSERT INTO ubicaciones (tienda_id, tipo, nombre, qr_code) VALUES
  (1, 'corona',     'Corona',     'ELRY-A01-UB-CORONA'),
  (1, 'bodega',     'Bodega 1',   'ELRY-A01-UB-BOD1'),
  (1, 'exhibicion', 'Exhibición', 'ELRY-A01-UB-EXH');

INSERT INTO posiciones (ubicacion_id, pasillo, estante, nivel, qr_code) VALUES
  (1, 'P1', 'E1', 'N1', 'ELRY-A01-PS-CR-P1E1N1'),
  (1, 'P1', 'E2', 'N1', 'ELRY-A01-PS-CR-P1E2N1'),
  (2, 'P3', 'E2', 'N2', 'ELRY-A01-PS-B1-P3E2N2'),
  (2, 'P5', 'E1', 'N1', 'ELRY-A01-PS-B1-P5E1N1'),
  (3, 'V1', 'E1', 'N1', 'ELRY-A01-PS-EX-V1E1N1');

INSERT INTO articulos (codigo_barras, sku, descripcion, unidades_por_caja) VALUES
  ('7501234500011', 'CAN-001', 'Candil LED 60W blanco',         20),
  ('7501234500028', 'CAN-002', 'Candil LED 40W cálido',         24),
  ('7501234500035', 'CAN-003', 'Candil LED solar exterior',     12),
  ('7501234500042', 'BOM-001', 'Bombillo halógeno 100W',        50),
  ('7501234500059', 'EXT-001', 'Extensión eléctrica 3 m',       NULL);

INSERT INTO cajas (codigo_caja, tipo_caja, posicion_id, creada_por) VALUES
  ('ELRY-A01-CJ-A7B2K9M4', 'producto',     1, 1),
  ('ELRY-A01-CJ-B3D5F7H1', 'producto',     3, 1),
  ('ELRY-A01-CJ-X9Y8Z7W6', 'reutilizable', 5, 2);

INSERT INTO caja_contenido (caja_id, articulo_id, cantidad_inicial, cantidad_actual) VALUES
  (1, 1, 20, 1),    -- Caja 1: 20 candiles, queda 1 (ejemplo del documento)
  (1, 2, 10, 7),
  (2, 3, 30, 30),
  (2, 4, 15, 12),
  (3, 5, 25, 18);

INSERT INTO movimientos (tipo, caja_id, articulo_id, cantidad, posicion_destino_id, usuario_id, motivo) VALUES
  ('crear_caja',  1, NULL, NULL, 1, 1, 'Recepción de proveedor'),
  ('reducir',     1, 1,    19,   NULL, 3, 'Venta'),
  ('reducir',     1, 2,     3,   NULL, 3, 'Venta'),
  ('crear_caja',  2, NULL, NULL, 3, 1, 'Recepción de proveedor'),
  ('reducir',     2, 4,     3,   NULL, 2, 'Venta'),
  ('crear_caja',  3, NULL, NULL, 5, 2, 'Reposición exhibición'),
  ('reducir',     3, 5,     7,   NULL, 3, 'Venta');

INSERT INTO alertas (tipo, prioridad, mensaje, articulo_id, caja_id, cantidad_sugerida) VALUES
  ('stock_bajo', 'alta', 'Caja con 1 unidad de Candil LED 60W — reposición sugerida', 1, 1, 20);

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
