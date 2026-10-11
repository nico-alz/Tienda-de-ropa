// routes/ventas.js
const express = require('express');
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');
const { CODIGO_ANULACION } = require('../config');

const router = express.Router();

// Trae cada venta junto con el nombre de quien solicito / autorizo la anulacion
const CONSULTA_BASE = `
  SELECT t.*,
         us.nombre_completo AS anulacion_solicitada_por_nombre,
         ua.nombre_completo AS anulacion_autorizada_por_nombre
  FROM ventas t
  LEFT JOIN usuarios us ON us.id = t.anulacion_solicitada_por
  LEFT JOIN usuarios ua ON ua.id = t.anulacion_autorizada_por`;

// Todas las rutas de ventas requieren sesion iniciada
router.use(requireLogin);

// -----------------------------------------------------------------
// POST /api/ventas  -> registrar una venta nueva
// -----------------------------------------------------------------
router.post('/', (req, res) => {
  const { producto_id, producto_nombre, cantidad, valor_total, forma_pago } = req.body;

  const nombreProducto = (producto_nombre || '').trim();
  const cantidadNum = Number(cantidad);
  const valorNum = Number(valor_total);

  if (!nombreProducto) {
    return res.status(400).json({ error: 'Indica el producto vendido.' });
  }
  if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un numero mayor a 0.' });
  }
  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    return res.status(400).json({ error: 'El valor de la venta debe ser mayor a 0.' });
  }
  if (!['efectivo', 'transferencia', 'otro'].includes(forma_pago)) {
    return res.status(400).json({ error: 'La forma de pago no es valida.' });
  }

  const usuario = req.session.usuario;

  const resultado = db.prepare(`
    INSERT INTO ventas (producto_id, producto_nombre, cantidad, valor_total, forma_pago, usuario_id, usuario_nombre)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    producto_id || null,
    nombreProducto,
    cantidadNum,
    valorNum,
    forma_pago,
    usuario.id,
    usuario.nombre_completo
  );

  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ venta });
});

// -----------------------------------------------------------------
// GET /api/ventas/hoy  -> ventas del dia de hoy (todas, para la caja)
// -----------------------------------------------------------------
router.get('/hoy', (req, res) => {
  const ventas = db.prepare(`
    ${CONSULTA_BASE}
    WHERE date(t.fecha_hora) = date('now', 'localtime')
    ORDER BY t.fecha_hora DESC, t.id DESC
  `).all();

  const totalActivas = ventas
    .filter(v => v.estado !== 'anulada')
    .reduce((suma, v) => suma + v.valor_total, 0);

  res.json({ ventas, total_hoy: totalActivas });
});

// -----------------------------------------------------------------
// GET /api/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  -> historial
// -----------------------------------------------------------------
router.get('/', (req, res) => {
  const desde = req.query.desde || '0001-01-01';
  const hasta = req.query.hasta || '9999-12-31';

  const ventas = db.prepare(`
    ${CONSULTA_BASE}
    WHERE date(t.fecha_hora) BETWEEN date(?) AND date(?)
    ORDER BY t.fecha_hora DESC, t.id DESC
  `).all(desde, hasta);

  res.json({ ventas });
});

// -----------------------------------------------------------------
// POST /api/ventas/:id/solicitar-anulacion  -> pide anular, con motivo y nombre del cajero
// -----------------------------------------------------------------
router.post('/:id/solicitar-anulacion', (req, res) => {
  const { motivo, nombre_cajero } = req.body;
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debes indicar el motivo de la anulacion.' });
  }
  if (!nombre_cajero || !nombre_cajero.trim()) {
    return res.status(400).json({ error: 'Debes indicar el nombre del cajero que la solicita.' });
  }

  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
  if (venta.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta venta ya fue anulada.' });
  }

  db.prepare(`
    UPDATE ventas
    SET estado = 'anulacion_solicitada',
        anulacion_motivo_solicitud = ?,
        anulacion_solicitada_por = ?,
        anulacion_solicitada_nombre_cajero = ?,
        anulacion_solicitada_en = datetime('now', 'localtime')
    WHERE id = ?
  `).run(motivo.trim(), req.session.usuario.id, nombre_cajero.trim(), venta.id);

  const actualizada = db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id);
  res.json({ venta: actualizada });
});

// -----------------------------------------------------------------
// POST /api/ventas/:id/autorizar-anulacion  -> requiere el codigo de anulacion
// -----------------------------------------------------------------
router.post('/:id/autorizar-anulacion', (req, res) => {
  const codigo = String((req.body || {}).codigo || '').trim();
  if (codigo !== CODIGO_ANULACION) {
    return res.status(403).json({ error: 'Código incorrecto.' });
  }

  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
  if (venta.estado !== 'anulacion_solicitada') {
    return res.status(400).json({ error: 'Esta venta no tiene una anulacion pendiente.' });
  }

  db.prepare(`
    UPDATE ventas
    SET estado = 'anulada',
        anulacion_autorizada_por = ?,
        anulacion_autorizada_en = datetime('now', 'localtime')
    WHERE id = ?
  `).run(req.session.usuario.id, venta.id);

  const actualizada = db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id);
  res.json({ venta: actualizada });
});

// -----------------------------------------------------------------
// POST /api/ventas/:id/rechazar-anulacion -> no se autoriza, vuelve a activa (sin codigo)
// -----------------------------------------------------------------
router.post('/:id/rechazar-anulacion', (req, res) => {
  const { motivo_rechazo } = req.body;
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
  if (venta.estado !== 'anulacion_solicitada') {
    return res.status(400).json({ error: 'Esta venta no tiene una anulacion pendiente.' });
  }

  db.prepare(`
    UPDATE ventas
    SET estado = 'activa',
        anulacion_motivo_rechazo = ?
    WHERE id = ?
  `).run((motivo_rechazo || '').trim() || null, venta.id);

  const actualizada = db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id);
  res.json({ venta: actualizada });
});

module.exports = router;
