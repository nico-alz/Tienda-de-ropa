// routes/compras.js
// Compras del almacen (ropa, bolsas, elementos para el negocio).
// Las registran el dueno y las cajeras (el historial por fechas es solo del dueno).
const crearRouterMovimientos = require('./movimientos');

module.exports = crearRouterMovimientos({
  tabla: 'compras',
  leerCampos(body) {
    const proveedor = String(body.proveedor || '').trim();
    const descripcion = String(body.descripcion || '').trim();
    const numeroFactura = String(body.numero_factura || '').trim() || null;
    const valor = Number(body.valor);
    if (!proveedor) return { error: 'Escribe el nombre del proveedor.' };
    if (!descripcion) return { error: 'Escribe que se compro.' };
    if (!Number.isInteger(valor) || valor <= 0) {
      return { error: 'El valor debe ser un numero entero mayor a 0 (sin puntos ni comas).' };
    }
    return { campos: { proveedor, descripcion, numero_factura: numeroFactura, valor } };
  },
});
