// routes/prestamos.js
// Prestamos que se le hacen a un trabajador durante el dia. Se descuentan
// del pago diario de ese trabajador: no se puede prestar mas de lo que
// gana ese mismo dia (sumando todos los prestamos activos de hoy).
const crearRouterMovimientos = require('./movimientos');
const db = require('../database/db');

const formatoPesosServidor = (valor) => '$' + Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 0 });

module.exports = crearRouterMovimientos({
  tabla: 'prestamos',
  rolesRegistrar: ['dueno', 'cajera'],
  rolesVer: ['dueno', 'cajera'],
  leerCampos(body) {
    const trabajador_id = Number(body.trabajador_id);
    const valor = Number(body.valor);

    if (!Number.isInteger(trabajador_id) || trabajador_id <= 0) {
      return { error: 'Selecciona el trabajador.' };
    }
    if (!Number.isInteger(valor) || valor <= 0) {
      return { error: 'El valor debe ser un numero entero mayor a 0 (sin puntos ni comas).' };
    }

    const trabajador = db.prepare('SELECT * FROM trabajadores WHERE id = ? AND activo = 1').get(trabajador_id);
    if (!trabajador) {
      return { error: 'Ese trabajador no existe o esta inactivo.' };
    }

    const prestadoHoy = db.prepare(`
      SELECT COALESCE(SUM(valor), 0) AS s FROM prestamos
      WHERE trabajador_id = ? AND estado != 'anulada' AND date(fecha_hora) = date('now', 'localtime')
    `).get(trabajador_id).s;

    const disponible = trabajador.pago_diario - prestadoHoy;
    if (valor > disponible) {
      return {
        error: disponible <= 0
          ? `Hoy ya se le prestó el máximo a ${trabajador.nombre} (${formatoPesosServidor(trabajador.pago_diario)}).`
          : `Solo se le puede prestar hasta ${formatoPesosServidor(disponible)} más hoy a ${trabajador.nombre}.`,
      };
    }

    return { campos: { trabajador_id, trabajador_nombre: trabajador.nombre, valor } };
  },
});
