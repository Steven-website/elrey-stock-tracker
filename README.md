# Inventario El Rey — PWA piloto

App web progresiva para gestión de inventario por ubicación con escaneo de QR.

**Versión 0.2.0** — refactorizado a arquitectura modular + login con contraseña + gestión de usuarios.

---

## Estructura del proyecto

```
inventario-elrey/
├── index.html                 ← shell HTML mínimo (carga los módulos)
├── styles.css                 ← todos los estilos
├── schema.sql                 ← script para crear tablas en Supabase
├── README.md                  ← este archivo
└── js/
    ├── main.js                ← entrada + router de vistas/modales
    ├── state.js               ← estado global + storage seguro
    ├── utils.js               ← helpers + iconos SVG + hash SHA-256
    ├── mock.js                ← datos demo (con contraseñas hasheadas)
    ├── api.js                 ← cliente Supabase + métodos de API
    ├── auth.js                ← login + helpers de roles
    ├── scanner.js             ← envoltura del scanner QR (cámara)
    ├── views.js               ← vistas principales
    └── modals.js              ← modales (caja, crear, escanear, usuarios, …)
```

Todos los archivos JS son **ES Modules** (`<script type="module">`).

---

## Probar localmente

Por las restricciones CORS del navegador, **necesitás un servidor HTTP local** para abrir la app — no funciona con `file://` por los módulos ES.

**Opción 1 — Python (más rápido):**
```bash
cd inventario-elrey
python3 -m http.server 8080
```
Abrir `http://localhost:8080/`

**Opción 2 — Node:**
```bash
npx serve inventario-elrey
```

**Opción 3 — desde el celular**: subí a GitHub Pages (ver más abajo) y abrí la URL HTTPS.

---

## Roles y usuarios demo

La app trae 5 usuarios precargados en modo demo:

| Usuario     | Contraseña | Rol         | Permisos                          |
| ----------- | ---------- | ----------- | --------------------------------- |
| `SSEGURA`   | `admin123` | admin       | Todo, incluida gestión de usuarios |
| `MROJAS`    | `super123` | supervisor  | Todo excepto gestión de usuarios  |
| `JMARTINEZ` | `oper123`  | operario    | Escanear, mover, reducir, reponer |
| `CCONTADOR` | `cont123`  | contador    | + conteos de inventario           |
| `AUDITOR`   | `audit123` | auditor     | + auditorías y verificación       |

**Solo el rol `admin` puede crear usuarios nuevos** desde la app (pestaña Más → Gestión de usuarios). Otros roles no ven esa sección.

---

## Conectar a tu Supabase

### 1. Crear tablas

En tu proyecto de Supabase → **SQL Editor** → pegá todo el contenido de `schema.sql` → Run.

Esto crea las tablas con datos de prueba **incluyendo los hashes SHA-256 de las contraseñas demo**, así que los mismos usuarios funcionan tanto en demo como en Supabase.

### 2. Conectar la app

1. Abrir la app
2. En login → "Configurar conexión Supabase"
3. Pegar URL del proyecto y anon key
4. Guardar
5. Iniciar sesión con cualquiera de los usuarios demo

> La URL y key se guardan **solo en tu dispositivo** (localStorage). Nunca se envían a otro servidor.

### 3. RLS (Row Level Security)

Para el piloto, la opción más simple es **deshabilitar RLS** en todas las tablas (Database → Tables → cada tabla → RLS → off).

> ⚠️ Aceptable para piloto interno, NO para producción. Cuando escalen a múltiples tiendas, configurar políticas RLS reales.

---

## Desplegar en GitHub Pages

1. Crear repo en GitHub
2. Subir todo el contenido de `inventario-elrey/` (manteniendo la estructura)
3. Settings → Pages → Source: main branch / root
4. Esperar 1-2 minutos
5. Abrir la URL HTTPS desde el celular y agregar a la pantalla de inicio

> HTTPS es **obligatorio** para acceder a la cámara. GitHub Pages te lo da automático.

---

## Login con contraseña

Las contraseñas se hashean con **SHA-256** usando la API nativa del navegador (`crypto.subtle.digest`). El hash se guarda en `usuarios.password_hash` y nunca se envía la contraseña en claro a la base.

> Para producción real, considerá usar **Supabase Auth** en vez de esta autenticación casera. SHA-256 sin salt es suficiente para un piloto interno pero no para datos sensibles a escala.

---

## Funcionalidades actuales

- Login con usuario + contraseña
- Escaneo de QR con cámara del celular
- Detalle de caja: artículos con cantidad inicial, consumida, restante
- Crear caja nueva (caja del producto / reutilizable, código auto-generado, escaneo de productos para llenarla)
- Reducir, reponer, mover caja
- Marcar caja como "consumida" cuando se vacía (sin borrar — queda para análisis)
- Filtro Activas / Consumidas
- Feed de movimientos
- Vista de equipo
- **Gestión de usuarios para admin** (crear, editar rol, resetear contraseña, desactivar)
- Modo demo (sin Supabase, datos simulados)

---

## Roadmap próximas iteraciones

- **Conteo de inventario** (rol contador) — selección por familia / pasillo / menos contado / mayor consumo, con barra de progreso
- **Auditoría** (rol auditor) — muestra aleatoria 1% o verificación de un conteo cerrado
- **Stock lineal** (unidades en exhibición sin estar en caja) — para que el contador sume todas las ubicaciones
- **Alertas automáticas** de transferencia entre tiendas (cuando haya 20 tiendas)
- **Reportes** y exportación a Excel
- **Modo offline real** con cola de sincronización

---

**Autor:** Steven Segura · **Versión:** 0.2.0 · **Fecha:** abril 2026
