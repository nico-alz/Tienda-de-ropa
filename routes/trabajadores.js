// routes/trabajadores.js
// Perfiles de los trabajadores y su pago diario.
// Crear, editar el pago diario y activar/desactivar es solo del dueno.
// Consultar la lista y el resumen de hoy lo puede hacer cualquiera con
// sesion iniciada, porque el cajero lo necesita para registrar prestamos.

const express = require('express');
const db = require('../database/db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

const PAGO_DIARIO_POR_DEFECTO = 60000;

const sumaPrestamosHoyStmt = db.prepare(`
  SELECT COALESCE(SUM(valor), 0) AS s FROM prestamos
  WHERE trabajador_id = ? AND estado != 'anulada' AND date(fecha_hora) = date('now', 'localtime')
`);

// GET /api/trabajadores -> trabajadores activos (para el selector de prestamos)
router.get('/', (req, res) => {
  const trabajadores = db.prepare(`
    SELECT id, nombre, pago_diario FROM trabajadores WHERE activo = 1 ORDER BY nombre ASC
  `).all();
  res.json({ trabajadores });
});

// GET /api/trabajadores/resumen-hoy -> pago diario, prestado hoy y saldo de cada trabajador activo
router.get('/resumen-hoy', (req, res) => {
  const trabajadores = db.prepare(`
    SELECT id, nombre, pago_diario FROM trabajadores WHERE activo = 1 ORDER BY nombre ASC
  `).all();

  const resumen = trabajadores.map((t) => {
    const prestado_hoy = sumaPrestamosHoyStmt.get(t.id).s;
    return {
      id: t.id,
      nombre: t.nombre,
      pago_diario: t.pago_diario,
      prestado_hoy,
      saldo_por_pagar: t.pago_diario - prestado_hoy,
    };
  });

  res.json({ resumen });
});

// GET /api/trabajadores/todos -> incluye inactivos (pantalla de administracion, solo dueno)
router.get('/todos', requireRole('dueno'), (req, res) => {
  const trabajadores = db.prepare(`SELECT * FROM trabajadores ORDER BY activo DESC, nombre ASC`).all();
  res.json({ trabajadores });
});

// POST /api/trabajadores -> crear trabajador (solo dueno)
router.post('/', requireRole('dueno'), (req, res) => {
  const nombre = String((req.body || {}).nombre || '').trim();
  const pagoRaw = (req.body || {}).pago_diario;
  const pago_diario = (pagoRaw === undefined || pagoRaw === null || pagoRaw === '')
    ? PAGO_DIARIO_POR_DEFECTO : Number(pagoRaw);

  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre del trabajador.' });
  if (!Number.isInteger(pago_diario) || pago_diario <= 0) {
    return res.status(400).json({ error: 'El pago diario debe ser un numero entero mayor a 0.' });
  }

  const resultado = db.prepare('INSERT INTO trabajadores (nombre, pago_diario) VALUES (?, ?)')
    .run(nombre, pago_diario);
  const trabajador = db.prepare('SELECT * FROM trabajadores WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ trabajador });
});

// PATCH /api/trabajadores/:id/estado -> activar / desactivar (solo dueno)
router.patch('/:id/estado', requireRole('dueno'), (req, res) => {
  const activo = (req.body || {}).activo ? 1 : 0;
  db.prepare('UPDATE trabajadores SET activo = ? WHERE id = ?').run(activo, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/trabajadores/:id/pago-diario -> cambiar el pago diario (solo dueno)
router.patch('/:id/pago-diario', requireRole('dueno'), (req, res) => {
  const pago_diario = Number((req.body || {}).pago_diario);
  if (!Number.isInteger(pago_diario) || pago_diario <= 0) {
    return res.status(400).json({ error: 'El pago diario debe ser un numero entero mayor a 0.' });
  }
  db.prepare('UPDATE trabajadores SET pago_diario = ? WHERE id = ?').run(pago_diario, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
