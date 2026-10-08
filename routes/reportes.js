// routes/reportes.js
// Reportes por periodo para el dueño: resumen de dinero, comparacion de
// compras vs ventas, productos mas vendidos, series para graficar, y
// descarga en Excel con todo el detalle. Todo esto es de solo lectura
// sobre lo que ya se registro en ventas, gastos, compras y prestamos
// (no se captura nada nuevo aqui).

const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../database/db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireRole('dueno'));

const FORMATO_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function leerRango(req) {
  const desde = FORMATO_FECHA_ISO.test(req.query.desde) ? req.query.desde : '0001-01-01';
  const hasta = FORMATO_FECHA_ISO.test(req.query.hasta) ? req.query.hasta : '9999-12-31';
  return { desde, hasta };
}

const ETIQUETAS_ESTADO = { activa: 'Activa', anulacion_solicitada: 'Anulación pendiente', anulada: 'Anulada' };

// "tabla" y "columnaValor" siempre son texto fijo escrito en el codigo
// (nunca vienen del usuario), asi que es seguro usarlos directo en el SQL.
function totalesPeriodo(tabla, columnaValor, desde, hasta) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN estado != 'anulada' THEN ${columnaValor} ELSE 0 END), 0) AS total,
      COUNT(CASE WHEN estado != 'anulada' THEN 1 END) AS cantidad
    FROM ${tabla}
    WHERE date(fecha_hora) BETWEEN date(?) AND date(?)
  `).get(desde, hasta);
}

function registrosPeriodo(tabla, desde, hasta) {
  return db.prepare(`
    SELECT * FROM ${tabla}
    WHERE date(fecha_hora) BETWEEN date(?) AND date(?)
    ORDER BY fecha_hora ASC
  `).all(desde, hasta);
}

function productosMasVendidos(desde, hasta, limite) {
  return db.prepare(`
    SELECT producto_nombre, SUM(cantidad) AS cantidad_total, SUM(valor_total) AS valor_total
    FROM ventas
    WHERE estado != 'anulada' AND date(fecha_hora) BETWEEN date(?) AND date(?)
    GROUP BY producto_nombre
    ORDER BY valor_total DESC
    LIMIT ?
  `).all(desde, hasta, limite);
}

// Formulas de SQLite fijas (no vienen del usuario): agrupar por dia, semana o mes.
const FORMATOS_AGRUPAR = {
  dia: "date(fecha_hora)",
  semana: "strftime('%Y-W%W', fecha_hora)",
  mes: "strftime('%Y-%m', fecha_hora)",
};

function seriePorPeriodo(tabla, columnaValor, desde, hasta, agrupar) {
  const formato = FORMATOS_AGRUPAR[agrupar] || FORMATOS_AGRUPAR.dia;
  const filas = db.prepare(`
    SELECT ${formato} AS periodo, COALESCE(SUM(${columnaValor}), 0) AS total
    FROM ${tabla}
    WHERE estado != 'anulada' AND date(fecha_hora) BETWEEN date(?) AND date(?)
    GROUP BY periodo
    ORDER BY periodo ASC
  `).all(desde, hasta);
  const mapa = {};
  filas.forEach((f) => { mapa[f.periodo] = f.total; });
  return mapa;
}

// -----------------------------------------------------------------
// GET /api/reportes/resumen?desde=&hasta=
// -----------------------------------------------------------------
router.get('/resumen', (req, res) => {
  const { desde, hasta } = leerRango(req);
  const ventas = totalesPeriodo('ventas', 'valor_total', desde, hasta);
  const gastos = totalesPeriodo('gastos', 'valor', desde, hasta);
  const compras = totalesPeriodo('compras', 'valor', desde, hasta);
  const prestamos = totalesPeriodo('prestamos', 'valor', desde, hasta);

  res.json({
    desde, hasta,
    ventas, gastos, compras, prestamos,
    diferencia_ventas_compras: ventas.total - compras.total,
  });
});

// -----------------------------------------------------------------
// GET /api/reportes/productos-mas-vendidos?desde=&hasta=&limite=
// -----------------------------------------------------------------
router.get('/productos-mas-vendidos', (req, res) => {
  const { desde, hasta } = leerRango(req);
  const limite = Math.min(Math.max(Number(req.query.limite) || 10, 1), 100);
  res.json({ productos: productosMasVendidos(desde, hasta, limite) });
});

// -----------------------------------------------------------------
// GET /api/reportes/series?desde=&hasta=&agrupar=dia|semana|mes
// Ventas, compras, gastos y prestamos juntos, periodo por periodo,
// para graficar la comparacion.
// -----------------------------------------------------------------
router.get('/series', (req, res) => {
  const { desde, hasta } = leerRango(req);
  const agrupar = ['dia', 'semana', 'mes'].includes(req.query.agrupar) ? req.query.agrupar : 'dia';

  const ventas = seriePorPeriodo('ventas', 'valor_total', desde, hasta, agrupar);
  const compras = seriePorPeriodo('compras', 'valor', desde, hasta, agrupar);
  const gastos = seriePorPeriodo('gastos', 'valor', desde, hasta, agrupar);
  const prestamos = seriePorPeriodo('prestamos', 'valor', desde, hasta, agrupar);

  const periodos = [...new Set([
    ...Object.keys(ventas), ...Object.keys(compras), ...Object.keys(gastos), ...Object.keys(prestamos),
  ])].sort();

  const serie = periodos.map((p) => ({
    periodo: p,
    ventas: ventas[p] || 0,
    compras: compras[p] || 0,
    gastos: gastos[p] || 0,
    prestamos: prestamos[p] || 0,
  }));

  res.json({ agrupar, serie });
});

// -----------------------------------------------------------------
// GET /api/reportes/excel?desde=&hasta=  -> descarga el reporte completo
// -----------------------------------------------------------------
router.get('/excel', async (req, res) => {
  const { desde, hasta } = leerRango(req);

  const COLOR_ENCABEZADO = 'FF1C2B33';
  const COLOR_TEXTO_ENCABEZADO = 'FFFFFFFF';
  const FORMATO_MONEDA = '"$"#,##0';
  const FORMATO_FECHA = 'dd/mm/yyyy hh:mm';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Todo a 10.000';
  workbook.created = new Date();

  function estilizarFilaEncabezado(fila) {
    fila.font = { bold: true, color: { argb: COLOR_TEXTO_ENCABEZADO } };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
  }

  function hojaDetalle(nombre, columnas, filas) {
    const hoja = workbook.addWorksheet(nombre, { properties: { tabColor: { argb: COLOR_ENCABEZADO } } });
    hoja.columns = columnas;
    filas.forEach((f) => hoja.addRow(f));
    estilizarFilaEncabezado(hoja.getRow(1));
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    return hoja;
  }

  // ---- Resumen ----
  const ventas = totalesPeriodo('ventas', 'valor_total', desde, hasta);
  const gastos = totalesPeriodo('gastos', 'valor', desde, hasta);
  const compras = totalesPeriodo('compras', 'valor', desde, hasta);
  const prestamos = totalesPeriodo('prestamos', 'valor', desde, hasta);

  const hojaResumen = workbook.addWorksheet('Resumen');
  hojaResumen.getColumn(1).width = 30;
  hojaResumen.getColumn(2).width = 22;
  hojaResumen.getColumn(3).width = 20;

  hojaResumen.addRow(['Todo a 10.000 — Reporte del período']).font = { bold: true, size: 14 };
  hojaResumen.addRow([`Del ${desde} al ${hasta}`]);
  hojaResumen.addRow([]);

  estilizarFilaEncabezado(hojaResumen.addRow(['Concepto', 'Cantidad de registros', 'Valor total']));

  [
    ['Ventas', ventas.cantidad, ventas.total],
    ['Gastos', gastos.cantidad, gastos.total],
    ['Compras', compras.cantidad, compras.total],
    ['Préstamos a trabajadores', prestamos.cantidad, prestamos.total],
  ].forEach((fila) => {
    const r = hojaResumen.addRow(fila);
    r.getCell(3).numFmt = FORMATO_MONEDA;
  });

  hojaResumen.addRow([]);
  const filaDiferencia = hojaResumen.addRow(['Ventas menos compras', '', ventas.total - compras.total]);
  filaDiferencia.font = { bold: true };
  filaDiferencia.getCell(3).numFmt = FORMATO_MONEDA;

  hojaResumen.addRow([]);
  hojaResumen.addRow([
    'Los montos anulados no se incluyen en estos totales, pero sí aparecen (marcados) en cada hoja de detalle.',
  ]).font = { italic: true, size: 9, color: { argb: 'FF5B6670' } };

  // ---- Ventas ----
  const hojaVentas = hojaDetalle('Ventas', [
    { header: 'Fecha y hora', key: 'fecha', width: 20 },
    { header: 'Producto', key: 'producto', width: 26 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Valor', key: 'valor', width: 16 },
    { header: 'Forma de pago', key: 'forma_pago', width: 16 },
    { header: 'Registró', key: 'registro', width: 18 },
    { header: 'Estado', key: 'estado', width: 20 },
  ], registrosPeriodo('ventas', desde, hasta).map((v) => ({
    fecha: v.fecha_hora,
    producto: v.producto_nombre,
    cantidad: v.cantidad,
    valor: v.valor_total,
    forma_pago: v.forma_pago,
    registro: v.usuario_nombre,
    estado: ETIQUETAS_ESTADO[v.estado] || v.estado,
  })));
  hojaVentas.getColumn('valor').numFmt = FORMATO_MONEDA;

  // ---- Gastos ----
  const hojaGastos = hojaDetalle('Gastos', [
    { header: 'Fecha y hora', key: 'fecha', width: 20 },
    { header: 'Descripción', key: 'descripcion', width: 30 },
    { header: 'Valor', key: 'valor', width: 16 },
    { header: 'Registró', key: 'registro', width: 18 },
    { header: 'Estado', key: 'estado', width: 20 },
  ], registrosPeriodo('gastos', desde, hasta).map((g) => ({
    fecha: g.fecha_hora,
    descripcion: g.descripcion,
    valor: g.valor,
    registro: g.usuario_nombre,
    estado: ETIQUETAS_ESTADO[g.estado] || g.estado,
  })));
  hojaGastos.getColumn('valor').numFmt = FORMATO_MONEDA;

  // ---- Compras ----
  const hojaCompras = hojaDetalle('Compras', [
    { header: 'Fecha y hora', key: 'fecha', width: 20 },
    { header: 'Proveedor', key: 'proveedor', width: 24 },
    { header: 'Qué se compró', key: 'descripcion', width: 28 },
    { header: 'N.° factura', key: 'factura', width: 16 },
    { header: 'Valor', key: 'valor', width: 16 },
    { header: 'Registró', key: 'registro', width: 18 },
    { header: 'Estado', key: 'estado', width: 20 },
  ], registrosPeriodo('compras', desde, hasta).map((c) => ({
    fecha: c.fecha_hora,
    proveedor: c.proveedor,
    descripcion: c.descripcion,
    factura: c.numero_factura || '',
    valor: c.valor,
    registro: c.usuario_nombre,
    estado: ETIQUETAS_ESTADO[c.estado] || c.estado,
  })));
  hojaCompras.getColumn('valor').numFmt = FORMATO_MONEDA;

  // ---- Préstamos ----
  const hojaPrestamos = hojaDetalle('Préstamos', [
    { header: 'Fecha y hora', key: 'fecha', width: 20 },
    { header: 'Trabajador', key: 'trabajador', width: 24 },
    { header: 'Valor', key: 'valor', width: 16 },
    { header: 'Registró', key: 'registro', width: 18 },
    { header: 'Estado', key: 'estado', width: 20 },
  ], registrosPeriodo('prestamos', desde, hasta).map((p) => ({
    fecha: p.fecha_hora,
    trabajador: p.trabajador_nombre,
    valor: p.valor,
    registro: p.usuario_nombre,
    estado: ETIQUETAS_ESTADO[p.estado] || p.estado,
  })));
  hojaPrestamos.getColumn('valor').numFmt = FORMATO_MONEDA;

  // ---- Productos más vendidos ----
  const hojaProductos = hojaDetalle('Productos más vendidos', [
    { header: 'Producto', key: 'producto', width: 28 },
    { header: 'Cantidad vendida', key: 'cantidad', width: 18 },
    { header: 'Valor vendido', key: 'valor', width: 18 },
  ], productosMasVendidos(desde, hasta, 1000).map((p) => ({
    producto: p.producto_nombre,
    cantidad: p.cantidad_total,
    valor: p.valor_total,
  })));
  hojaProductos.getColumn('valor').numFmt = FORMATO_MONEDA;

  [hojaVentas, hojaGastos, hojaCompras, hojaPrestamos].forEach((h) => { h.getColumn('fecha').numFmt = FORMATO_FECHA; });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="reporte-todo-a-10000_${desde}_a_${hasta}.xlsx"`);
  res.send(Buffer.from(buffer));
});

module.exports = router;
