// public/js/reportes.js
// Pestaña "Reportes": resumen del período, comparación ventas vs compras
// (con gastos y préstamos), productos más vendidos, y descarga en Excel.
// Solo lectura: no registra nada nuevo, solo muestra lo que ya existe.
// Requiere comun.js cargado antes.

// Colores validados para accesibilidad (daltonismo y contraste) — ver
// referencias de paleta categórica: azul, naranja, aguamarina, amarillo.
const COLOR_VENTAS = '#2a78d6';
const COLOR_COMPRAS = '#eb6834';
const COLOR_GASTOS = '#1baf7a';
const COLOR_PRESTAMOS = '#eda100';
const COLOR_PRODUCTOS = '#2a78d6';

const SERIES_COMPARACION = [
  { clave: 'ventas', etiqueta: 'Ventas', color: COLOR_VENTAS },
  { clave: 'compras', etiqueta: 'Compras', color: COLOR_COMPRAS },
  { clave: 'gastos', etiqueta: 'Gastos', color: COLOR_GASTOS },
  { clave: 'prestamos', etiqueta: 'Préstamos', color: COLOR_PRESTAMOS },
];

let repIniciado = false;
let repAgrupar = 'dia';
let repAgruparElegidoAMano = false;

async function iniciarReportes() {
  if (repIniciado) { await generarReporte(); return; }
  repIniciado = true;

  document.querySelectorAll('.btn-periodo').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelectorAll('.btn-periodo').forEach((b) => b.classList.remove('activo'));
      boton.classList.add('activo');
      const { desde, hasta } = rangoRapido(boton.dataset.periodoRapido);
      document.getElementById('rep-desde').value = desde;
      document.getElementById('rep-hasta').value = hasta;
      repAgruparElegidoAMano = false;
      generarReporte();
    });
  });

  document.querySelectorAll('.btn-agrupar').forEach((boton) => {
    boton.addEventListener('click', () => {
      repAgrupar = boton.dataset.agrupar;
      repAgruparElegidoAMano = true;
      marcarBotonAgrupar();
      cargarGraficoComparacion();
    });
  });

  document.getElementById('btn-generar-reporte').addEventListener('click', () => {
    document.querySelectorAll('.btn-periodo').forEach((b) => b.classList.remove('activo'));
    repAgruparElegidoAMano = false;
    generarReporte();
  });

  document.getElementById('btn-tabla-comparacion').addEventListener('click', () => {
    const tabla = document.getElementById('rep-tabla-comparacion');
    const oculta = tabla.classList.toggle('oculto');
    document.getElementById('btn-tabla-comparacion').textContent = oculta ? 'Ver como tabla' : 'Ocultar tabla';
  });

  document.getElementById('btn-descargar-excel').addEventListener('click', descargarExcel);

  const { desde, hasta } = rangoRapido('mes');
  document.getElementById('rep-desde').value = desde;
  document.getElementById('rep-hasta').value = hasta;
  await generarReporte();
}

// -----------------------------------------------------------------
// Rangos rápidos de fecha (en hora local del computador)
// -----------------------------------------------------------------
function aISO(d) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function rangoRapido(tipo) {
  const hoy = new Date();
  if (tipo === 'hoy') return { desde: aISO(hoy), hasta: aISO(hoy) };

  if (tipo === 'semana') {
    const diaSemana = (hoy.getDay() + 6) % 7; // lunes = 0
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - diaSemana);
    return { desde: aISO(lunes), hasta: aISO(hoy) };
  }

  if (tipo === 'mes') {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde: aISO(primero), hasta: aISO(hoy) };
  }

  // mes anterior
  const primeroAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ultimoAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  return { desde: aISO(primeroAnterior), hasta: aISO(ultimoAnterior) };
}

function diasEntre(desde, hasta) {
  const ms = new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00');
  return Math.max(0, Math.round(ms / 86400000));
}

function agruparAutomatico(desde, hasta) {
  const dias = diasEntre(desde, hasta);
  if (dias <= 14) return 'dia';
  if (dias <= 70) return 'semana';
  return 'mes';
}

function marcarBotonAgrupar() {
  document.querySelectorAll('.btn-agrupar').forEach((b) =>
    b.classList.toggle('activo', b.dataset.agrupar === repAgrupar));
}

// -----------------------------------------------------------------
// Orquesta la carga de las 3 partes del reporte
// -----------------------------------------------------------------
async function generarReporte() {
  const desde = document.getElementById('rep-desde').value;
  const hasta = document.getElementById('rep-hasta').value;
  if (!desde || !hasta) return;

  if (!repAgruparElegidoAMano) repAgrupar = agruparAutomatico(desde, hasta);
  marcarBotonAgrupar();

  document.getElementById('rep-rango-texto').textContent =
    `Mostrando del ${formatoFechaCorta(desde)} al ${formatoFechaCorta(hasta)}`;

  await Promise.all([cargarResumen(), cargarGraficoComparacion(), cargarProductos()]);
}

function formatoFechaCorta(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// -----------------------------------------------------------------
// Tarjetas de resumen
// -----------------------------------------------------------------
async function cargarResumen() {
  const desde = document.getElementById('rep-desde').value;
  const hasta = document.getElementById('rep-hasta').value;
  const contenedor = document.getElementById('rep-tarjetas');

  const { ok, data } = await api(`/api/reportes/resumen?desde=${desde}&hasta=${hasta}`);
  if (!ok) {
    contenedor.innerHTML = `<div class="mensaje-error">${escaparHtml(data.error || 'No fue posible cargar el resumen.')}</div>`;
    return;
  }

  const diferenciaPositiva = data.diferencia_ventas_compras >= 0;

  contenedor.innerHTML = `
    <div class="tarjeta-estadistica">
      <div class="te-etiqueta">Ventas</div>
      <div class="te-valor" style="color:${COLOR_VENTAS}">${formatoPesos(data.ventas.total)}</div>
      <div class="te-detalle">${data.ventas.cantidad} ${data.ventas.cantidad === 1 ? 'venta' : 'ventas'}</div>
    </div>
    <div class="tarjeta-estadistica">
      <div class="te-etiqueta">Compras</div>
      <div class="te-valor" style="color:${COLOR_COMPRAS}">${formatoPesos(data.compras.total)}</div>
      <div class="te-detalle">${data.compras.cantidad} ${data.compras.cantidad === 1 ? 'compra' : 'compras'}</div>
    </div>
    <div class="tarjeta-estadistica">
      <div class="te-etiqueta">Gastos</div>
      <div class="te-valor" style="color:${COLOR_GASTOS}">${formatoPesos(data.gastos.total)}</div>
      <div class="te-detalle">${data.gastos.cantidad} ${data.gastos.cantidad === 1 ? 'gasto' : 'gastos'}</div>
    </div>
    <div class="tarjeta-estadistica">
      <div class="te-etiqueta">Préstamos</div>
      <div class="te-valor" style="color:${COLOR_PRESTAMOS}">${formatoPesos(data.prestamos.total)}</div>
      <div class="te-detalle">${data.prestamos.cantidad} ${data.prestamos.cantidad === 1 ? 'préstamo' : 'préstamos'}</div>
    </div>
    <div class="tarjeta-estadistica tarjeta-diferencia ${diferenciaPositiva ? 'te-positiva' : 'te-negativa'}">
      <div class="te-etiqueta">${diferenciaPositiva ? '▲ Vendió más de lo que compró' : '▼ Compró más de lo que vendió'}</div>
      <div class="te-valor">${formatoPesos(Math.abs(data.diferencia_ventas_compras))}</div>
      <div class="te-detalle">Ventas menos compras del período</div>
    </div>
  `;
}

// -----------------------------------------------------------------
// Gráfico de comparación (barras agrupadas por período)
// -----------------------------------------------------------------
async function cargarGraficoComparacion() {
  const desde = document.getElementById('rep-desde').value;
  const hasta = document.getElementById('rep-hasta').value;
  const contenedorGrafico = document.getElementById('rep-grafico-comparacion');
  const contenedorTabla = document.getElementById('rep-tabla-comparacion');

  const { ok, data } = await api(`/api/reportes/series?desde=${desde}&hasta=${hasta}&agrupar=${repAgrupar}`);
  if (!ok) {
    contenedorGrafico.innerHTML = `<div class="mensaje-error">${escaparHtml(data.error || 'No fue posible cargar el gráfico.')}</div>`;
    return;
  }

  if (data.serie.length === 0) {
    contenedorGrafico.innerHTML = '<div class="texto-vacio">No hay movimientos registrados en este período.</div>';
    contenedorTabla.innerHTML = '';
    return;
  }

  contenedorGrafico.innerHTML = construirGraficoComparacion(data.serie, data.agrupar);
  contenedorTabla.innerHTML = construirTablaComparacion(data.serie);
}

function etiquetaPeriodo(periodo, agrupar) {
  if (agrupar === 'mes') {
    const [anio, mes] = periodo.split('-');
    const d = new Date(Number(anio), Number(mes) - 1, 1);
    return d.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
  }
  if (agrupar === 'semana') {
    const numero = periodo.split('-W')[1];
    return `Sem. ${Number(numero)}`;
  }
  const d = new Date(periodo + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

// Calcula marcas "redondas" para el eje (0, 50.000, 100.000, ...).
function marcasEje(valorMaximo, cantidad = 4) {
  if (valorMaximo <= 0) return [0, 1];
  const pasoBruto = valorMaximo / cantidad;
  const magnitud = 10 ** Math.floor(Math.log10(pasoBruto));
  const residuo = pasoBruto / magnitud;
  let pasoLimpio;
  if (residuo <= 1) pasoLimpio = 1;
  else if (residuo <= 2) pasoLimpio = 2;
  else if (residuo <= 5) pasoLimpio = 5;
  else pasoLimpio = 10;
  pasoLimpio *= magnitud;

  const marcas = [];
  for (let v = 0; v <= valorMaximo + pasoLimpio * 0.001; v += pasoLimpio) marcas.push(Math.round(v));
  return marcas;
}

function construirGraficoComparacion(serie, agrupar) {
  const ANCHO = 900;
  const ALTO = 360;
  const MARGEN = { arriba: 34, derecha: 20, abajo: 46, izquierda: 72 };
  const anchoGrafico = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoGrafico = ALTO - MARGEN.arriba - MARGEN.abajo;

  const valorMaximo = Math.max(1, ...serie.flatMap((p) => SERIES_COMPARACION.map((s) => p[s.clave])));
  const marcas = marcasEje(valorMaximo);
  const topeEje = marcas[marcas.length - 1];
  const escalaY = (valor) => altoGrafico - (valor / topeEje) * altoGrafico;

  const anchoGrupo = anchoGrafico / serie.length;
  const espacioEntreGrupos = Math.min(28, anchoGrupo * 0.3);
  const anchoBarraGrupo = anchoGrupo - espacioEntreGrupos;
  const anchoBarra = Math.min(24, (anchoBarraGrupo - 3 * 2) / 4); // 2px de separacion entre barras
  const anchoRealGrupo = anchoBarra * 4 + 2 * 3;

  let svg = `<svg viewBox="0 0 ${ANCHO} ${ALTO}" class="grafico-svg" role="img" aria-label="Comparación de ventas, compras, gastos y préstamos por período">`;
  svg += `<g transform="translate(${MARGEN.izquierda},${MARGEN.arriba})">`;

  // Líneas de cuadrícula y etiquetas del eje Y
  marcas.forEach((marca) => {
    const y = escalaY(marca);
    svg += `<line x1="0" y1="${y}" x2="${anchoGrafico}" y2="${y}" class="linea-cuadricula" />`;
    svg += `<text x="-10" y="${y + 4}" class="texto-eje" text-anchor="end">${formatoCompactoPesos(marca)}</text>`;
  });

  // Barras por grupo (periodo)
  serie.forEach((punto, i) => {
    const xGrupo = i * anchoGrupo + (anchoGrupo - anchoRealGrupo) / 2;

    SERIES_COMPARACION.forEach((s, j) => {
      const valor = punto[s.clave];
      const x = xGrupo + j * (anchoBarra + 2);
      const alturaBarra = (valor / topeEje) * altoGrafico;
      if (valor > 0) {
        const y = altoGrafico - alturaBarra;
        svg += `<path d="${rutaBarraVertical(x, y, anchoBarra, alturaBarra)}" fill="${s.color}">`
          + `<title>${s.etiqueta} — ${etiquetaPeriodo(punto.periodo, agrupar)}: ${formatoPesos(valor)}</title></path>`;
      }
    });

    const xEtiqueta = i * anchoGrupo + anchoGrupo / 2;
    svg += `<text x="${xEtiqueta}" y="${altoGrafico + 20}" class="texto-eje" text-anchor="middle">${escaparHtml(etiquetaPeriodo(punto.periodo, agrupar))}</text>`;
  });

  svg += `<line x1="0" y1="${altoGrafico}" x2="${anchoGrafico}" y2="${altoGrafico}" class="linea-base" />`;
  svg += '</g></svg>';

  const leyenda = `<div class="leyenda-grafico">${SERIES_COMPARACION.map((s) =>
    `<span class="leyenda-item"><span class="leyenda-punto" style="background:${s.color}"></span>${s.etiqueta}</span>`
  ).join('')}</div>`;

  return leyenda + svg;
}

function rutaBarraVertical(x, y, ancho, alto, radio = 4) {
  const r = Math.min(radio, alto / 2, ancho / 2);
  if (alto <= 0 || ancho <= 0) return '';
  return `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} `
    + `L${x + ancho},${y + alto} L${x},${y + alto} Z`;
}

function formatoCompactoPesos(valor) {
  if (valor >= 1000000) return '$' + (valor / 1000000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + 'M';
  if (valor >= 1000) return '$' + Math.round(valor / 1000).toLocaleString('es-CO') + 'K';
  return formatoPesos(valor);
}

function construirTablaComparacion(serie) {
  const filas = serie.map((p) => `
    <tr>
      <td>${escaparHtml(etiquetaPeriodo(p.periodo, repAgrupar))}</td>
      <td>${formatoPesos(p.ventas)}</td>
      <td>${formatoPesos(p.compras)}</td>
      <td>${formatoPesos(p.gastos)}</td>
      <td>${formatoPesos(p.prestamos)}</td>
    </tr>`).join('');

  return `<div class="tabla-scroll"><table>
    <thead><tr><th>Período</th><th>Ventas</th><th>Compras</th><th>Gastos</th><th>Préstamos</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

// -----------------------------------------------------------------
// Productos más vendidos (barras horizontales)
// -----------------------------------------------------------------
async function cargarProductos() {
  const desde = document.getElementById('rep-desde').value;
  const hasta = document.getElementById('rep-hasta').value;
  const contenedor = document.getElementById('rep-grafico-productos');

  const { ok, data } = await api(`/api/reportes/productos-mas-vendidos?desde=${desde}&hasta=${hasta}&limite=10`);
  if (!ok) {
    contenedor.innerHTML = `<div class="mensaje-error">${escaparHtml(data.error || 'No fue posible cargar los productos.')}</div>`;
    return;
  }

  if (data.productos.length === 0) {
    contenedor.innerHTML = '<div class="texto-vacio">No hay ventas registradas en este período.</div>';
    return;
  }

  contenedor.innerHTML = construirGraficoProductos(data.productos);
}

function construirGraficoProductos(productos) {
  const ANCHO = 900;
  const ALTO_FILA = 38;
  const MARGEN = { arriba: 10, abajo: 10, izquierda: 190, derecha: 110 };
  const alto = productos.length * ALTO_FILA + MARGEN.arriba + MARGEN.abajo;
  const anchoBarras = ANCHO - MARGEN.izquierda - MARGEN.derecha;

  const valorMaximo = Math.max(1, ...productos.map((p) => p.valor_total));

  let svg = `<svg viewBox="0 0 ${ANCHO} ${alto}" class="grafico-svg" role="img" aria-label="Productos más vendidos del período">`;

  productos.forEach((p, i) => {
    const y = MARGEN.arriba + i * ALTO_FILA;
    const alturaBarra = 22;
    const yBarra = y + (ALTO_FILA - alturaBarra) / 2;
    const anchoBarra = Math.max(2, (p.valor_total / valorMaximo) * anchoBarras);

    const nombreCorto = p.producto_nombre.length > 24 ? p.producto_nombre.slice(0, 23) + '…' : p.producto_nombre;

    svg += `<text x="${MARGEN.izquierda - 12}" y="${y + ALTO_FILA / 2 + 5}" class="texto-eje" text-anchor="end">${escaparHtml(nombreCorto)}</text>`;
    svg += `<path d="${rutaBarraHorizontal(MARGEN.izquierda, yBarra, anchoBarra, alturaBarra)}" fill="${COLOR_PRODUCTOS}">`
      + `<title>${escaparHtml(p.producto_nombre)}: ${formatoPesos(p.valor_total)} (${p.cantidad_total} ${p.cantidad_total === 1 ? 'unidad' : 'unidades'})</title></path>`;
    svg += `<text x="${MARGEN.izquierda + anchoBarra + 10}" y="${y + ALTO_FILA / 2 + 5}" class="texto-valor-barra">${formatoPesos(p.valor_total)}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function rutaBarraHorizontal(x, y, ancho, alto, radio = 4) {
  const r = Math.min(radio, alto / 2, ancho / 2);
  if (ancho <= 0 || alto <= 0) return '';
  return `M${x},${y} L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} `
    + `L${x + ancho},${y + alto - r} Q${x + ancho},${y + alto} ${x + ancho - r},${y + alto} `
    + `L${x},${y + alto} Z`;
}

// -----------------------------------------------------------------
// Descarga en Excel
// -----------------------------------------------------------------
async function descargarExcel() {
  const desde = document.getElementById('rep-desde').value;
  const hasta = document.getElementById('rep-hasta').value;
  if (!desde || !hasta) return;

  const boton = document.getElementById('btn-descargar-excel');
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando…';

  try {
    const resp = await fetch(`/api/reportes/excel?desde=${desde}&hasta=${hasta}`);
    if (!resp.ok) {
      let mensaje = 'No fue posible generar el archivo de Excel.';
      try { mensaje = (await resp.json()).error || mensaje; } catch (e) { /* respuesta sin cuerpo */ }
      alert(mensaje);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `reporte-todo-a-10000_${desde}_a_${hasta}.xlsx`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('No fue posible descargar el archivo. Intenta de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}
