// public/js/movimientos.js
// GASTOS y COMPRAS: registrar, listar y solicitar / autorizar / rechazar anulaciones.
// Requiere comun.js cargado antes.

let MOV_ES_DUENO = false;

const MODULOS = {
  gastos: {
    vacio: 'No hay gastos registrados en este período.',
    exito: 'Gasto registrado correctamente.',
    campos: { descripcion: 'gasto-descripcion', valor: 'gasto-valor' },
    columnas: [
      { titulo: 'Descripción', celda: (r) => escaparHtml(r.descripcion) },
      { titulo: 'Valor', celda: (r) => formatoPesos(r.valor) },
    ],
  },
  prestamos: {
    vacio: 'No hay préstamos registrados en este período.',
    exito: 'Préstamo registrado correctamente.',
    campos: { trabajador_id: 'prestamo-trabajador', valor: 'prestamo-valor' },
    columnas: [
      { titulo: 'Trabajador', celda: (r) => escaparHtml(r.trabajador_nombre) },
      { titulo: 'Valor', celda: (r) => formatoPesos(r.valor) },
    ],
  },
  compras: {
    vacio: 'No hay compras registradas en este período.',
    exito: 'Compra registrada correctamente.',
    campos: {
      proveedor: 'compra-proveedor',
      descripcion: 'compra-descripcion',
      numero_factura: 'compra-factura',
      valor: 'compra-valor',
    },
    columnas: [
      { titulo: 'Proveedor', celda: (r) => escaparHtml(r.proveedor) },
      { titulo: 'Qué se compró', celda: (r) => escaparHtml(r.descripcion) },
      { titulo: 'Factura', celda: (r) => escaparHtml(r.numero_factura || '—') },
      { titulo: 'Valor', celda: (r) => formatoPesos(r.valor) },
    ],
  },
};

function iniciarMovimientos(esDueno) {
  MOV_ES_DUENO = esDueno;

  Object.keys(MODULOS).forEach((nombre) => {
    const form = document.getElementById(`form-${nombre}`);
    if (!form) return; // esta pantalla no tiene ese módulo (ej.: la cajera no ve compras)

    form.addEventListener('submit', (e) => registrarMovimiento(e, nombre));

    const desde = document.getElementById(`${nombre}-desde`);
    if (desde) {
      desde.value = fechaLocalISO();
      document.getElementById(`${nombre}-hasta`).value = fechaLocalISO();
      document.getElementById(`btn-buscar-${nombre}`)
        .addEventListener('click', () => recargarMovimientos(nombre));
    }
  });

  return Promise.all(Object.keys(MODULOS).map((n) => recargarMovimientos(n)));
}

async function actualizarTotalGastosHoy() {
  const el = document.getElementById('total-gastos-hoy');
  if (!el) return;
  const { ok, data } = await api('/api/gastos/hoy');
  if (ok) el.textContent = formatoPesos(data.total_hoy);
}

async function recargarMovimientos(nombre) {
  const contenedor = document.getElementById(`tabla-${nombre}`);
  if (!contenedor) return;

  let url = `/api/${nombre}/hoy`;
  if (MOV_ES_DUENO) {
    const desde = document.getElementById(`${nombre}-desde`).value;
    const hasta = document.getElementById(`${nombre}-hasta`).value;
    url = `/api/${nombre}?desde=${desde}&hasta=${hasta}`;
  }

  const { ok, data } = await api(url);
  if (!ok) {
    contenedor.innerHTML = `<div class="mensaje-error">${escaparHtml(data.error || 'No fue posible cargar la información.')}</div>`;
    return;
  }

  const registros = data.registros;
  const resumen = document.getElementById(`resumen-${nombre}`);
  if (resumen) {
    const activos = registros.filter((r) => r.estado !== 'anulada');
    const suma = activos.reduce((s, r) => s + r.valor, 0);
    resumen.textContent = `${activos.length} registros activos por un total de ${formatoPesos(suma)}`;
    resumen.classList.toggle('oculto', registros.length === 0);
  }

  contenedor.innerHTML = tablaMovimientos(nombre, registros, MOV_ES_DUENO);

  if (nombre === 'gastos') await actualizarTotalGastosHoy();
  if (nombre === 'prestamos') {
    await actualizarResumenTrabajadores();
    await cargarTrabajadoresParaPrestamo();
  }
}

function tablaMovimientos(nombre, registros, conFecha) {
  const modulo = MODULOS[nombre];
  if (registros.length === 0) {
    return `<div class="texto-vacio">${modulo.vacio}</div>`;
  }

  const encabezado =
    `<th>${conFecha ? 'Fecha y hora' : 'Hora'}</th>` +
    modulo.columnas.map((c) => `<th>${c.titulo}</th>`).join('') +
    '<th>Registró</th><th>Estado</th><th></th>';

  const filas = registros.map((r) => {
    const claseFila = r.estado === 'anulada' ? 'fila-anulada'
      : r.estado === 'anulacion_solicitada' ? 'fila-pendiente' : '';

    const motivo = r.estado !== 'activa' && r.anulacion_motivo_solicitud
      ? `<div class="nota-motivo">Motivo: ${escaparHtml(r.anulacion_motivo_solicitud)}` +
        (r.anulacion_solicitada_por_nombre ? ` — Pidió: ${escaparHtml(r.anulacion_solicitada_por_nombre)}` : '') +
        `</div>` : '';

    let acciones = '';
    if (r.estado === 'activa') {
      acciones = `<button class="btn btn-peligro btn-chico" onclick="accionAnulacion('${nombre}','solicitar',${r.id})">Solicitar anulación</button>`;
    } else if (r.estado === 'anulacion_solicitada' && MOV_ES_DUENO) {
      acciones = `
        <div class="fila-acciones">
          <button class="btn btn-acento btn-chico" onclick="accionAnulacion('${nombre}','autorizar',${r.id})">Autorizar</button>
          <button class="btn btn-secundario btn-chico" onclick="accionAnulacion('${nombre}','rechazar',${r.id})">Rechazar</button>
        </div>`;
    }

    return `
      <tr class="${claseFila}">
        <td>${conFecha ? formatoFechaHora(r.fecha_hora) : formatoHora(r.fecha_hora)}</td>
        ${modulo.columnas.map((c) => `<td>${c.celda(r)}</td>`).join('')}
        <td>${escaparHtml(r.usuario_nombre)}</td>
        <td><span class="etiqueta-estado estado-${r.estado}">${ETIQUETAS_ESTADO[r.estado]}</span>${motivo}</td>
        <td>${acciones}</td>
      </tr>`;
  }).join('');

  return `<div class="tabla-scroll"><table><thead><tr>${encabezado}</tr></thead><tbody>${filas}</tbody></table></div>`;
}

async function registrarMovimiento(e, nombre) {
  e.preventDefault();
  const form = e.target;
  const boton = form.querySelector('button[type="submit"]');
  if (boton.disabled) return; // evita registrar dos veces por doble clic
  boton.disabled = true;

  try {
    const modulo = MODULOS[nombre];
    const mensaje = document.getElementById(`mensaje-${nombre}`);
    mensaje.className = 'oculto';

    const cuerpo = {};
    Object.entries(modulo.campos).forEach(([clave, id]) => {
      cuerpo[clave] = document.getElementById(id).value;
    });

    const { ok, data } = await api(`/api/${nombre}`, 'POST', cuerpo);
    if (!ok) {
      mensaje.textContent = data.error || 'No fue posible guardar el registro.';
      mensaje.className = 'mensaje-error';
      return;
    }

    mensaje.textContent = modulo.exito;
    mensaje.className = 'mensaje-exito';
    form.reset();
    await recargarMovimientos(nombre);
  } finally {
    boton.disabled = false;
  }
}

async function accionAnulacion(nombre, accion, id) {
  let cuerpo = {};

  if (accion === 'solicitar') {
    const motivo = prompt('¿Por qué se debe anular este registro?');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Debes escribir un motivo para poder solicitar la anulación.'); return; }
    cuerpo = { motivo };
  } else if (accion === 'autorizar') {
    if (!confirm('¿Autorizar la anulación? El registro original quedará siempre en el historial.')) return;
  } else {
    const motivo_rechazo = prompt('(Opcional) ¿Por qué se rechaza esta solicitud?');
    if (motivo_rechazo === null) return;
    cuerpo = { motivo_rechazo };
  }

  const { ok, data } = await api(`/api/${nombre}/${id}/${accion}-anulacion`, 'POST', cuerpo);
  if (!ok) { alert(data.error || 'No fue posible completar la acción.'); return; }
  await recargarMovimientos(nombre);
}

// ---------------------------------------------------------------
// Resumen de pagos de hoy (pago diario, prestado y saldo por trabajador)
// y el selector de trabajador del formulario de prestamos.
// ---------------------------------------------------------------

async function actualizarResumenTrabajadores() {
  const contenedor = document.getElementById('tabla-resumen-trabajadores');
  if (!contenedor) return;

  const { ok, data } = await api('/api/trabajadores/resumen-hoy');
  if (!ok) {
    contenedor.innerHTML = `<div class="mensaje-error">${escaparHtml(data.error || 'No fue posible cargar el resumen.')}</div>`;
    return;
  }

  const resumen = data.resumen;
  if (resumen.length === 0) {
    contenedor.innerHTML = '<div class="texto-vacio">Aún no hay trabajadores activos. El dueño puede crearlos en la pestaña Trabajadores.</div>';
    return;
  }

  contenedor.innerHTML = `<div class="tabla-scroll"><table><thead><tr>
      <th>Trabajador</th><th>Pago diario</th><th>Prestado hoy</th><th>Saldo por pagar</th>
    </tr></thead><tbody>
    ${resumen.map((t) => `
      <tr class="${t.saldo_por_pagar <= 0 ? 'fila-saldo-agotado' : ''}">
        <td>${escaparHtml(t.nombre)}</td>
        <td>${formatoPesos(t.pago_diario)}</td>
        <td>${formatoPesos(t.prestado_hoy)}</td>
        <td>${formatoPesos(t.saldo_por_pagar)}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

async function cargarTrabajadoresParaPrestamo() {
  const select = document.getElementById('prestamo-trabajador');
  if (!select) return;

  const { ok, data } = await api('/api/trabajadores');
  if (!ok) return;

  const seleccionActual = select.value;
  select.innerHTML = '<option value="">Selecciona un trabajador…</option>' +
    data.trabajadores.map((t) =>
      `<option value="${t.id}">${escaparHtml(t.nombre)} (pago diario ${formatoPesos(t.pago_diario)})</option>`
    ).join('');

  if ([...select.options].some((o) => o.value === seleccionActual)) select.value = seleccionActual;
}
