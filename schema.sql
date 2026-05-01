-- =====================================================================
-- SCHEMA: Sistema de Inventario por Ubicación - Piloto El Rey
-- Para ejecutar en Supabase SQL Editor
-- Datos demo: 2 tiendas, 9 usuarios, 10 productos, 5 cajas (2 productos c/u)
-- =====================================================================

-- Limpieza opcional (descomentar para empezar de cero)
-- DROP TABLE IF EXISTS conteo_registros CASCADE;
-- DROP TABLE IF EXISTS tarea_articulos CASCADE;
-- DROP TABLE IF EXISTS tareas_conteo CASCADE;
-- DROP TABLE IF EXISTS alertas CASCADE;
-- DROP TABLE IF EXISTS movimientos CASCADE;
-- DROP TABLE IF EXISTS caja_contenido CASCADE;
-- DROP TABLE IF EXISTS cajas CASCADE;
-- DROP TABLE IF EXISTS posiciones CASCADE;
-- DROP TABLE IF EXISTS estantes CASCADE;
-- DROP TABLE IF EXISTS pasillos CASCADE;
-- DROP TABLE IF EXISTS bodegas CASCADE;
-- DROP TABLE IF EXISTS ubicaciones CASCADE;
-- DROP TABLE IF EXISTS articulos CASCADE;
-- DROP TABLE IF EXISTS usuarios CASCADE;
-- DROP TABLE IF EXISTS tiendas CASCADE;

-- =====================================================================
-- TABLAS PRINCIPALES
-- =====================================================================

CREATE TABLE tiendas (
  id            SERIAL PRIMARY KEY,
  codigo        TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  activa        BOOLEAN DEFAULT TRUE,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  radio_metros  INTEGER DEFAULT 300,
  creada_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usuarios (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  email           TEXT,
  rol             TEXT NOT NULL CHECK (rol IN (
                    'admin', 'admin_tienda', 'jefe_inventario',
                    'supervisor', 'operario', 'contador', 'auditor'
                  )),
  tienda_id       INTEGER REFERENCES tiendas(id),
  password_hash   TEXT,                         -- SHA-256 hex
  password_set_at TIMESTAMPTZ,
  ultimo_login    TIMESTAMPTZ,
  acceso_hasta    TIMESTAMPTZ,
  activo          BOOLEAN DEFAULT TRUE,
  creado_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Jerarquía Bodega → Pasillo → Estante (admin de ubicaciones)
CREATE TABLE bodegas (
  id          SERIAL PRIMARY KEY,
  tienda_id   INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  UNIQUE(tienda_id, nombre)
);

CREATE TABLE pasillos (
  id         SERIAL PRIMARY KEY,
  bodega_id  INTEGER NOT NULL REFERENCES bodegas(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  UNIQUE(bodega_id, nombre)
);

CREATE TABLE estantes (
  id          SERIAL PRIMARY KEY,
  pasillo_id  INTEGER NOT NULL REFERENCES pasillos(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  UNIQUE(pasillo_id, nombre)
);

-- Ubicaciones lógicas (corona / bodega / exhibición) — usadas por posiciones
CREATE TABLE ubicaciones (
  id        SERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  tipo      TEXT NOT NULL CHECK (tipo IN ('corona', 'bodega', 'exhibicion')),
  nombre    TEXT NOT NULL,
  UNIQUE(tienda_id, nombre)
);

CREATE TABLE posiciones (
  id            SERIAL PRIMARY KEY,
  tienda_id     INTEGER REFERENCES tiendas(id),
  ubicacion_id  INTEGER REFERENCES ubicaciones(id),
  estante_id    INTEGER REFERENCES estantes(id),
  descripcion   TEXT NOT NULL,
  qr_code       TEXT UNIQUE
);

CREATE TABLE articulos (
  id                 SERIAL PRIMARY KEY,
  codigo_barras      TEXT UNIQUE,
  sku                TEXT UNIQUE,
  descripcion        TEXT NOT NULL,
  familia            TEXT,
  unidad_medida      TEXT DEFAULT 'unidad',
  unidades_por_caja  INTEGER,
  imagen_url         TEXT,
  activo             BOOLEAN DEFAULT TRUE
);

CREATE TABLE cajas (
  id              SERIAL PRIMARY KEY,
  codigo_caja     TEXT NOT NULL UNIQUE,
  tipo_caja       TEXT NOT NULL DEFAULT 'reutilizable'
                  CHECK (tipo_caja IN ('producto', 'reutilizable')),
  posicion_id     INTEGER REFERENCES posiciones(id),
  tienda_id       INTEGER REFERENCES tiendas(id),
  estado          TEXT NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa','vacia','transito','archivada')),
  creada_por      INTEGER REFERENCES usuarios(id),
  fecha_creacion  TIMESTAMPTZ DEFAULT NOW(),
  fecha_consumida TIMESTAMPTZ,
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

-- Conteo de inventario
CREATE TABLE tareas_conteo (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL,
  tienda_id    INTEGER NOT NULL REFERENCES tiendas(id),
  creado_por   INTEGER REFERENCES usuarios(id),
  asignado_a   INTEGER REFERENCES usuarios(id),
  estado       TEXT NOT NULL DEFAULT 'activa'
               CHECK (estado IN ('activa','pendiente_revision','completada','cancelada')),
  creado_at    TIMESTAMPTZ DEFAULT NOW(),
  enviado_at   TIMESTAMPTZ
);

CREATE TABLE tarea_articulos (
  id          SERIAL PRIMARY KEY,
  tarea_id    INTEGER NOT NULL REFERENCES tareas_conteo(id) ON DELETE CASCADE,
  articulo_id INTEGER NOT NULL REFERENCES articulos(id),
  UNIQUE(tarea_id, articulo_id)
);

CREATE TABLE conteo_registros (
  id               SERIAL PRIMARY KEY,
  tarea_id         INTEGER NOT NULL REFERENCES tareas_conteo(id) ON DELETE CASCADE,
  caja_id          INTEGER REFERENCES cajas(id),
  articulo_id      INTEGER NOT NULL REFERENCES articulos(id),
  cantidad_fisica  INTEGER NOT NULL CHECK (cantidad_fisica >= 0),
  usuario_id       INTEGER REFERENCES usuarios(id),
  contado_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tarea_id, caja_id, articulo_id)
);

-- =====================================================================
-- ÍNDICES
-- =====================================================================
CREATE INDEX idx_cajas_codigo      ON cajas(codigo_caja);
CREATE INDEX idx_cajas_posicion    ON cajas(posicion_id);
CREATE INDEX idx_cajas_tienda      ON cajas(tienda_id);
CREATE INDEX idx_contenido_caja    ON caja_contenido(caja_id);
CREATE INDEX idx_movimientos_caja  ON movimientos(caja_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(creado_at DESC);
CREATE INDEX idx_alertas_estado    ON alertas(estado, prioridad);

-- =====================================================================
-- DATOS DEMO
-- =====================================================================

-- Tiendas
INSERT INTO tiendas (id, codigo, nombre, lat, lng, radio_metros) VALUES
  (1, 'A01', 'Alajuela Centro', 10.0162, -84.2151, 300),
  (2, 'H01', 'Heredia',          9.9981, -84.1170, 300);
SELECT setval(pg_get_serial_sequence('tiendas','id'), 2);

-- Usuarios (9): hashes SHA-256 de las contraseñas demo
INSERT INTO usuarios (id, username, nombre, email, rol, tienda_id, password_hash) VALUES
  (1, 'SSEGURA',     'Steven Segura',    'ssegura@almaceneselrey.com',     'admin',           1,    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'), -- admin123
  (2, 'MROJAS',      'María Rojas',      'mrojas@almaceneselrey.com',      'supervisor',      1,    '4e4c56e4a15f89f05c2f4c72613da2a18c9665d4f0d6acce16415eb06f9be776'), -- super123
  (3, 'JMARTINEZ',   'Juan Martínez',    'jmartinez@almaceneselrey.com',   'operario',        1,    '13a93f9a5502e71eed80a806f87bc4424e03e6b0d90acd513ea9d561c853b738'), -- oper123
  (4, 'CCONTADOR',   'Carlos Contador',  'ccontador@almaceneselrey.com',   'contador',        1,    '1c11a11a7ec81e9a11e258ba6191885e10ec0a16d67c1bf499838376111e6313'), -- cont123
  (5, 'AUDITOR',     'Ana Auditora',     'aauditora@almaceneselrey.com',   'auditor',         1,    '0b26f7caa1c2e5e3f11adfd22f47403ed214a1d4451117a18ea726b451a3aa61'), -- audit123
  (6, 'HGOMEZ',      'Hugo Gómez',       'hgomez@almaceneselrey.com',      'supervisor',      2,    '17d7465cef4df57c9b831579f6c2d1872074911e6265fd037d551463f4c9dcc6'), -- super456
  (7, 'KLOPEZ',      'Karina López',     'klopez@almaceneselrey.com',      'operario',        2,    '29093164efff44e1c0ba8c4c1883eeaf7b88603813d6f088afd0d197cfcb9383'), -- oper456
  (8, 'LADMIN',      'Laura Admin',      'ladmin@almaceneselrey.com',      'admin_tienda',    1,    'bc09903a75a3cb59eb581499f980185a601510204b2487b5a0b2e8ded82ffe9a'), -- tienda123
  (9, 'JINVENTARIO', 'Jorge Inventario', 'jinventario@almaceneselrey.com', 'jefe_inventario', NULL, 'b1fddb43a8f6841630c46741e64d2a1f7b29a4d6e82365ab32f085bdd35517ec'); -- jinv123
SELECT setval(pg_get_serial_sequence('usuarios','id'), 9);

-- Bodegas / pasillos / estantes (jerarquía admin)
INSERT INTO bodegas (id, tienda_id, nombre, descripcion) VALUES
  (1, 1, 'Bodega Central', 'Bodega principal de la tienda'),
  (2, 1, 'Exhibición',     'Área de exhibición al cliente'),
  (3, 2, 'Bodega Norte',   'Bodega principal Heredia');
SELECT setval(pg_get_serial_sequence('bodegas','id'), 3);

INSERT INTO pasillos (id, bodega_id, nombre) VALUES
  (1, 1, 'Pasillo A'), (2, 1, 'Pasillo B'),
  (3, 2, 'Exhibición 1'),
  (4, 3, 'Pasillo A'), (5, 3, 'Pasillo B');
SELECT setval(pg_get_serial_sequence('pasillos','id'), 5);

INSERT INTO estantes (id, pasillo_id, nombre) VALUES
  (1, 1, 'A-01'), (2, 1, 'A-02'), (3, 1, 'A-03'),
  (4, 2, 'B-01'), (5, 2, 'B-02'),
  (6, 3, 'E-01'),
  (7, 4, 'A-01'), (8, 4, 'A-02'),
  (9, 5, 'B-01');
SELECT setval(pg_get_serial_sequence('estantes','id'), 9);

-- Ubicaciones lógicas
INSERT INTO ubicaciones (id, tienda_id, tipo, nombre) VALUES
  (1, 1, 'bodega',     'Bodega A01'),
  (2, 1, 'corona',     'Corona A01'),
  (3, 1, 'exhibicion', 'Exhibición A01'),
  (4, 2, 'bodega',     'Bodega H01'),
  (5, 2, 'corona',     'Corona H01');
SELECT setval(pg_get_serial_sequence('ubicaciones','id'), 5);

-- Posiciones (P{n}-E{n}-N{n})
INSERT INTO posiciones (id, tienda_id, ubicacion_id, estante_id, descripcion) VALUES
  (1, 1, 1, 1, 'P1-E1-N1'),
  (2, 1, 1, 2, 'P1-E2-N1'),
  (3, 1, 2, 4, 'P2-E1-N1'),
  (4, 1, 3, 6, 'V1-E1-N1'),
  (5, 2, 4, 7, 'P1-E1-N1'),
  (6, 2, 5, 9, 'P2-E1-N1');
SELECT setval(pg_get_serial_sequence('posiciones','id'), 6);

-- Artículos (10)
INSERT INTO articulos (id, codigo_barras, sku, descripcion, familia, unidades_por_caja) VALUES
  (1,  '7501234500012', 'CAN-001', 'Candil LED 60W blanco',           'Iluminación', 20),
  (2,  '7501234500029', 'CAN-002', 'Candil LED 40W cálido',           'Iluminación', 24),
  (3,  '7501234500036', 'CAN-003', 'Candil LED solar exterior',       'Iluminación', 12),
  (4,  '7501234500043', 'BOM-001', 'Bombillo halógeno 100W',          'Iluminación', 50),
  (5,  '7501234500050', 'EXT-001', 'Extensión eléctrica 3 m',         'Eléctrico',   NULL),
  (6,  '7501234500067', 'TOM-001', 'Tomacorriente doble polarizado',  'Eléctrico',   10),
  (7,  '7501234500074', 'INT-001', 'Interruptor sencillo',            'Eléctrico',   24),
  (8,  '7501234500081', 'PEG-001', 'Pegamento PVC 250 ml',            'Plomería',    12),
  (9,  '7501234500098', 'TUB-001', 'Tubo PVC 1/2" × 3 m',             'Plomería',    10),
  (10, '7501234500104', 'LIJ-001', 'Lija de agua grano 120',          'Ferretería',  50);
SELECT setval(pg_get_serial_sequence('articulos','id'), 10);

-- Cajas (5) — 1 código de caja con 2 productos cada una
INSERT INTO cajas (id, codigo_caja, tipo_caja, posicion_id, tienda_id, estado, creada_por, fecha_creacion) VALUES
  (1, 'ELRY-A01-CJ-A7B2K9M4', 'producto',     1, 1, 'activa', 1, '2026-04-10T08:30:00Z'),
  (2, 'ELRY-A01-CJ-B3D5F7H1', 'producto',     3, 1, 'activa', 1, '2026-04-15T11:20:00Z'),
  (3, 'ELRY-A01-CJ-X9Y8Z7W6', 'reutilizable', 4, 1, 'activa', 2, '2026-04-20T09:00:00Z'),
  (4, 'ELRY-H01-CJ-C4E6G8J2', 'producto',     5, 2, 'activa', 6, '2026-04-12T10:00:00Z'),
  (5, 'ELRY-H01-CJ-D7F9H1K3', 'producto',     5, 2, 'activa', 6, '2026-04-18T14:30:00Z');
SELECT setval(pg_get_serial_sequence('cajas','id'), 5);

-- Contenido (5 cajas × 2 productos = 10 entradas)
INSERT INTO caja_contenido (caja_id, articulo_id, cantidad_inicial, cantidad_actual) VALUES
  (1, 1,  20, 20), (1, 2,  24, 24),   -- Caja 1: CAN-001 + CAN-002
  (2, 6,  10, 10), (2, 7,  24, 24),   -- Caja 2: TOM-001 + INT-001
  (3, 5,  15, 15), (3, 10, 50, 50),   -- Caja 3: EXT-001 + LIJ-001
  (4, 3,  12, 12), (4, 4,  50, 50),   -- Caja 4: CAN-003 + BOM-001
  (5, 8,  12, 12), (5, 9,  10, 10);   -- Caja 5: PEG-001 + TUB-001

-- Movimientos iniciales (creación de caja)
INSERT INTO movimientos (tipo, caja_id, posicion_destino_id, usuario_id, motivo, creado_at) VALUES
  ('crear_caja', 1, 1, 1, 'Recepción de proveedor',  '2026-04-10T08:30:00Z'),
  ('crear_caja', 2, 3, 1, 'Recepción de proveedor',  '2026-04-15T11:20:00Z'),
  ('crear_caja', 3, 4, 2, 'Reposición exhibición',   '2026-04-20T09:00:00Z'),
  ('crear_caja', 4, 5, 6, 'Recepción proveedor H01', '2026-04-12T10:00:00Z'),
  ('crear_caja', 5, 5, 6, 'Recepción proveedor H01', '2026-04-18T14:30:00Z');

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
