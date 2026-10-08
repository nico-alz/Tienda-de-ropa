// routes/pendientes.js
// Todas las solicitudes de anulacion que esperan la decision del dueno
// (ventas, gastos y compras), sin importar de que dia sean.
const express = require('express');
const db = require('../database/db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireRole('dueno'));

// Valores fijos escritos en el codigo (nada de esto viene del usuario)
const ORIGENES = [
  { tipo: 'venta',    recurso: 'ventas',    detalle: "t.producto_nombre || ' (x' || t.cantidad || ')'", valor: 't.valor_total' },
  { tipo: 'gasto',    recurso: 'gastos',    detalle: 't.descripcion',                                    valor: 't.valor' },
  { tipo: 'compra',   recurso: 'compras',   detalle: "t.proveedor || ' - ' || t.descripcion",           valor: 't.valor' },
  { tipo: 'prestamo', recurso: 'prestamos', detalle: "'Préstamo a ' || t.trabajador_nombre",            valor: 't.valor' },
];

router.get('/', (req, res) => {
  let pendientes = [];
  for (const o of ORIGENES) {
    const filas = db.prepare(`
      SELECT '${o.tipo}' AS tipo, '${o.recurso}' AS recurso, t.id,
             ${o.detalle} AS detalle, ${o.valor} AS valor,
             t.usuario_nombre, t.fecha_hora,
             t.anulacion_motivo_solicitud, t.anulacion_solicitada_en,
             us.nombre_completo AS solicitada_por
      FROM ${o.recurso} t
      LEFT JOIN usuarios us ON us.id = t.anulacion_solicitada_por
      WHERE t.estado = 'anulacion_solicitada'
    `).all();
    pendientes = pendientes.concat(filas);
  }
  // las mas antiguas primero
  pendientes.sort((a, b) => String(a.anulacion_solicitada_en).localeCompare(String(b.anulacion_solicitada_en)));
  res.json({ pendientes });
});

module.exports = router;
