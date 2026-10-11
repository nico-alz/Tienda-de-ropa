// database/db.js
// Configura la base de datos SQLite del almacen "Todo a 10.000".
// Se guarda en un solo archivo (almacen.db) en esta misma carpeta.

const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // SQLite integrado en Node.js (desde v22.5+), no requiere compilar nada
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'almacen.db');
const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });

// Buena practica recomendada para SQLite en apps de un solo servidor
db.exec('PRAGMA journal_mode = WAL;');

// ---------------------------------------------------------------------
// Esquema de tablas
// ---------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_usuario  TEXT UNIQUE NOT NULL,
    nombre_completo TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    rol             TEXT NOT NULL CHECK (rol IN ('dueno', 'cajera')),
    activo          INTEGER NOT NULL DEFAULT 1,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS productos (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT UNIQUE NOT NULL,
    activo  INTEGER NOT NULL DEFAULT 1,
    genero  TEXT NOT NULL DEFAULT 'unisex' CHECK (genero IN ('hombre', 'mujer', 'unisex'))
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id                 INTEGER REFERENCES productos(id),
    producto_nombre             TEXT NOT NULL,
    cantidad                    INTEGER NOT NULL DEFAULT 1,
    valor_total                 INTEGER NOT NULL,
    forma_pago                  TEXT NOT NULL CHECK (forma_pago IN ('efectivo', 'transferencia', 'otro')),
    usuario_id                  INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nombre              TEXT NOT NULL,
    fecha_hora                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    estado                      TEXT NOT NULL DEFAULT 'activa'
                                  CHECK (estado IN ('activa', 'anulacion_solicitada', 'anulada')),
    anulacion_motivo_solicitud  TEXT,
    anulacion_solicitada_por    INTEGER REFERENCES usuarios(id),
    anulacion_solicitada_nombre_cajero TEXT,
    anulacion_solicitada_en     TEXT,
    anulacion_autorizada_por    INTEGER REFERENCES usuarios(id),
    anulacion_autorizada_en     TEXT,
    anulacion_motivo_rechazo    TEXT
  );

  CREATE TABLE IF NOT EXISTS gastos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    descripcion                 TEXT NOT NULL,
    valor                       INTEGER NOT NULL,
    usuario_id                  INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nombre              TEXT NOT NULL,
    fecha_hora                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    estado                      TEXT NOT NULL DEFAULT 'activa'
                                  CHECK (estado IN ('activa', 'anulacion_solicitada', 'anulada')),
    anulacion_motivo_solicitud  TEXT,
    anulacion_solicitada_por    INTEGER REFERENCES usuarios(id),
    anulacion_solicitada_nombre_cajero TEXT,
    anulacion_solicitada_en     TEXT,
    anulacion_autorizada_por    INTEGER REFERENCES usuarios(id),
    anulacion_autorizada_en     TEXT,
    anulacion_motivo_rechazo    TEXT
  );

  CREATE TABLE IF NOT EXISTS compras (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor                   TEXT NOT NULL,
    descripcion                 TEXT NOT NULL,
    numero_factura              TEXT,
    valor                       INTEGER NOT NULL,
    usuario_id                  INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nombre              TEXT NOT NULL,
    fecha_hora                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    estado                      TEXT NOT NULL DEFAULT 'activa'
                                  CHECK (estado IN ('activa', 'anulacion_solicitada', 'anulada')),
    anulacion_motivo_solicitud  TEXT,
    anulacion_solicitada_por    INTEGER REFERENCES usuarios(id),
    anulacion_solicitada_nombre_cajero TEXT,
    anulacion_solicitada_en     TEXT,
    anulacion_autorizada_por    INTEGER REFERENCES usuarios(id),
    anulacion_autorizada_en     TEXT,
    anulacion_motivo_rechazo    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (fecha_hora);
  CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos (fecha_hora);
  CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras (fecha_hora);

  CREATE TABLE IF NOT EXISTS trabajadores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT NOT NULL,
    pago_diario  INTEGER NOT NULL DEFAULT 60000,
    activo       INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS prestamos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajador_id               INTEGER NOT NULL REFERENCES trabajadores(id),
    trabajador_nombre           TEXT NOT NULL,
    valor                       INTEGER NOT NULL,
    usuario_id                  INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nombre              TEXT NOT NULL,
    fecha_hora                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    estado                      TEXT NOT NULL DEFAULT 'activa'
                                  CHECK (estado IN ('activa', 'anulacion_solicitada', 'anulada')),
    anulacion_motivo_solicitud  TEXT,
    anulacion_solicitada_por    INTEGER REFERENCES usuarios(id),
    anulacion_solicitada_nombre_cajero TEXT,
    anulacion_solicitada_en     TEXT,
    anulacion_autorizada_por    INTEGER REFERENCES usuarios(id),
    anulacion_autorizada_en     TEXT,
    anulacion_motivo_rechazo    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_prestamos_fecha ON prestamos (fecha_hora);
`);

// ---------------------------------------------------------------------
// Migracion: si la base de datos ya existia desde antes de la columna
// "genero" en productos, se agrega ahora sin perder los productos que
// el dueno ya tenia guardados (quedan como "unisex" por defecto).
// ---------------------------------------------------------------------
const columnasProductos = db.prepare("PRAGMA table_info(productos)").all().map((c) => c.name);
if (!columnasProductos.includes('genero')) {
  db.exec("ALTER TABLE productos ADD COLUMN genero TEXT NOT NULL DEFAULT 'unisex'");
}

// ---------------------------------------------------------------------
// Migracion: columna para guardar el nombre del cajero que solicita una
// anulacion (ahora que solo existe un perfil compartido, ya no alcanza
// con saber quien tenia la sesion iniciada).
// ---------------------------------------------------------------------
for (const tabla of ['ventas', 'gastos', 'compras', 'prestamos']) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
  if (!columnas.includes('anulacion_solicitada_nombre_cajero')) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN anulacion_solicitada_nombre_cajero TEXT`);
  }
}

// ---------------------------------------------------------------------
// Datos iniciales: un usuario dueno por defecto, solo si no existe nadie
// ---------------------------------------------------------------------
const totalUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;

if (totalUsuarios === 0) {
  const hash = bcrypt.hashSync('cambiar123', 10);
  db.prepare(`
    INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol)
    VALUES (?, ?, ?, 'dueno')
  `).run('admin', 'Administrador', hash);

  console.log('----------------------------------------------------');
  console.log('Se creo un usuario administrador por defecto:');
  console.log('  Usuario:    admin');
  console.log('  Contrasena: cambiar123');
  console.log('Por favor inicia sesion y cambia esta contrasena.');
  console.log('----------------------------------------------------');
}

// ---------------------------------------------------------------------
// Catalogo inicial de productos: las prendas que siempre hay en la tienda,
// solo si el catalogo esta vacio (para no duplicar ni pisar lo que el
// dueno ya haya agregado por su cuenta).
// ---------------------------------------------------------------------
const totalProductos = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n;

if (totalProductos === 0) {
  const PRODUCTOS_INICIALES = [
    ['Boxer', 'hombre'], ['Camiseta', 'hombre'], ['Pantaloneta hombre', 'hombre'],
    ['Pantaloneta niño', 'hombre'], ['Buzos', 'hombre'], ['Camibuzos', 'hombre'],
    ['Body', 'mujer'], ['Camiseta corta', 'mujer'], ['Leggins', 'mujer'], ['Pijama mujer', 'mujer'],
    ['Brasieres', 'mujer'], ['Ropa interior (tangas/cacheteros)', 'mujer'], ['Salidas de baño', 'mujer'],
    ['Conjuntos deportivos', 'mujer'], ['Enterizos', 'mujer'],
    ['Pijama niño/a', 'unisex'], ['Sudaderas', 'unisex'],
  ];
  const insertarProducto = db.prepare('INSERT OR IGNORE INTO productos (nombre, genero) VALUES (?, ?)');
  for (const [nombre, genero] of PRODUCTOS_INICIALES) insertarProducto.run(nombre, genero);
}

module.exports = db;
