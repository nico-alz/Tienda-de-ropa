// routes/gastos.js
// Gastos del almacen (papel, bolsas, aseo, transporte...).
// Los pueden registrar el dueno y las cajeras.
const crearRouterMovimientos = require('./movimientos');

module.exports = crearRouterMovimientos({
  tabla: 'gastos',
  leerCampos(body) {
    const descripcion = String(body.descripcion || '').trim();
    const valor = Number(body.valor);
    if (!descripcion) return { error: 'Escribe en que se gasto el dinero.' };
    if (!Number.isInteger(valor) || valor <= 0) {
      return { error: 'El valor debe ser un numero entero mayor a 0 (sin puntos ni comas).' };
    }
    return { campos: { descripcion, valor } };
  },
});
