// routes/movimientos.js
// Logica compartida por GASTOS y COMPRAS: registrar, consultar y
// solicitar / autorizar / rechazar la anulacion (nunca se borra nada).

const express = require('express');
const db = require('../database/db');
const { requireLogin, requireRole } = require('../middleware/auth');

// "tabla" siempre es un texto fijo escrito en el codigo (nunca viene del usuario).
function crearRouterMovimientos({ tabla, rolesRegistrar, rolesVer, leerCampos }) {
  const router = express.Router();
  router.use(requireLogin);

  // Trae cada registro junto con el nombre de quien solicito / autorizo la anulacion
  const consultaBase = `
    SELECT t.*,
           us.nombre_completo AS anulacion_solicitada_por_nombre,
           ua.nombre_completo AS anulacion_autorizada_por_nombre
    FROM ${tabla} t
    LEFT JOIN usuarios us ON us.id = t.anulacion_solicitada_por
    LEFT JOIN usuarios ua ON ua.id = t.anulacion_autorizada_por`;

  const buscar = (id) => db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(Number(id));

  // POST /  -> registrar
  router.post('/', requireRole(...rolesRegistrar), (req, res) => {
    const { error, campos } = leerCampos(req.body || {});
    if (error) return res.status(400).json({ error });

    const usuario = req.session.usuario;
    const columnas = [...Object.keys(campos), 'usuario_id', 'usuario_nombre'];
    const valores = [...Object.values(campos), usuario.id, usuario.nombre_completo];

    const resultado = db.prepare(
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`
    ).run(...valores);

    res.status(201).json({ registro: buscar(resultado.lastInsertRowid) });
  });

  // GET /hoy  -> registros de hoy + total
  router.get('/hoy', requireRole(...rolesVer), (req, res) => {
    const registros = db.prepare(`
      ${consultaBase}
      WHERE date(t.fecha_hora) = date('now', 'localtime')
      ORDER BY t.fecha_hora DESC, t.id DESC
    `).all();
    const total_hoy = registros
      .filter((r) => r.estado !== 'anulada')
      .reduce((suma, r) => suma + r.valor, 0);
    res.json({ registros, total_hoy });
  });

  // GET /?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  -> historial (solo dueno)
  router.get('/', requireRole('dueno'), (req, res) => {
    const desde = req.query.desde || '0001-01-01';
    const hasta = req.query.hasta || '9999-12-31';
    const registros = db.prepare(`
      ${consultaBase}
      WHERE date(t.fecha_hora) BETWEEN date(?) AND date(?)
      ORDER BY t.fecha_hora DESC, t.id DESC
    `).all(desde, hasta);
    res.json({ registros });
  });

  // POST /:id/solicitar-anulacion
  router.post('/:id/solicitar-anulacion', requireRole(...rolesRegistrar), (req, res) => {
    const motivo = String((req.body || {}).motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debes indicar el motivo de la anulacion.' });

    const registro = buscar(req.params.id);
    if (!registro) return res.status(404).json({ error: 'Registro no encontrado.' });
    if (registro.estado !== 'activa') {
      return res.status(400).json({ error: 'Este registro ya tiene una anulacion solicitada o fue anulado.' });
    }

    db.prepare(`
      UPDATE ${tabla}
      SET estado = 'anulacion_solicitada',
          anulacion_motivo_solicitud = ?,
          anulacion_solicitada_por = ?,
          anulacion_solicitada_en = datetime('now', 'localtime')
      WHERE id = ?
    `).run(motivo, req.session.usuario.id, registro.id);

    res.json({ registro: buscar(registro.id) });
  });

  // POST /:id/autorizar-anulacion (solo dueno)
  router.post('/:id/autorizar-anulacion', requireRole('dueno'), (req, res) => {
    const registro = buscar(req.params.id);
    if (!registro) return res.status(404).json({ error: 'Registro no encontrado.' });
    if (registro.estado !== 'anulacion_solicitada') {
      return res.status(400).json({ error: 'Este registro no tiene una anulacion pendiente.' });
    }

    db.prepare(`
      UPDATE ${tabla}
      SET estado = 'anulada',
          anulacion_autorizada_por = ?,
          anulacion_autorizada_en = datetime('now', 'localtime')
      WHERE id = ?
    `).run(req.session.usuario.id, registro.id);

    res.json({ registro: buscar(registro.id) });
  });

  // POST /:id/rechazar-anulacion (solo dueno) -> vuelve a "activa"
  router.post('/:id/rechazar-anulacion', requireRole('dueno'), (req, res) => {
    const registro = buscar(req.params.id);
    if (!registro) return res.status(404).json({ error: 'Registro no encontrado.' });
    if (registro.estado !== 'anulacion_solicitada') {
      return res.status(400).json({ error: 'Este registro no tiene una anulacion pendiente.' });
    }

    const motivoRechazo = String((req.body || {}).motivo_rechazo || '').trim() || null;
    db.prepare(`
      UPDATE ${tabla}
      SET estado = 'activa', anulacion_motivo_rechazo = ?
      WHERE id = ?
    `).run(motivoRechazo, registro.id);

    res.json({ registro: buscar(registro.id) });
  });

  return router;
}

module.exports = crearRouterMovimientos;
