// public/js/pendientes.js
// Bandeja unica con TODAS las solicitudes de anulacion pendientes
// (ventas, gastos, compras, prestamos), para que el dueño las apruebe
// o rechace desde un solo lugar. Requiere comun.js cargado antes.

const ETIQUETAS_TIPO_PENDIENTE = { venta: 'Venta', gasto: 'Gasto', compra: 'Compra', prestamo: 'Préstamo' };

async function cargarPendientes() {
  const contenedor = document.getElementById('tabla-pendientes');
  const badge = document.getElementById('contador-pendientes');
  if (!contenedor) return;

  const { ok, data } = await api('/api/pendientes');
  if (!ok) {
    contenedor.innerHTML = `<div class="mensaje-error">${escaparHtml(data.error || 'No fue posible cargar las solicitudes.')}</div>`;
    return;
  }

  const pendientes = data.pendientes;
  if (badge) {
    badge.textContent = pendientes.length;
    badge.classList.toggle('oculto', pendientes.length === 0);
  }

  if (pendientes.length === 0) {
    contenedor.innerHTML = '<div class="texto-vacio">No hay solicitudes de anulación pendientes. 🎉</div>';
    return;
  }

  contenedor.innerHTML = `<div class="tabla-scroll"><table><thead><tr>
      <th>Tipo</th><th>Detalle</th><th>Valor</th><th>Registró</th><th>Fecha</th><th>Motivo</th><th>Pidió</th><th></th>
    </tr></thead><tbody>
    ${pendientes.map((p) => `
      <tr class="fila-pendiente">
        <td>${ETIQUETAS_TIPO_PENDIENTE[p.tipo] || p.tipo}</td>
        <td>${escaparHtml(p.detalle)}</td>
        <td>${formatoPesos(p.valor)}</td>
        <td>${escaparHtml(p.usuario_nombre)}</td>
        <td>${formatoFechaHora(p.fecha_hora)}</td>
        <td>${escaparHtml(p.anulacion_motivo_solicitud || '')}</td>
        <td>${escaparHtml(p.solicitada_por || '')}</td>
        <td>
          <div class="fila-acciones">
            <button class="btn btn-acento btn-chico" onclick="resolverPendiente('${p.recurso}', ${p.id}, 'autorizar')">Autorizar</button>
            <button class="btn btn-secundario btn-chico" onclick="resolverPendiente('${p.recurso}', ${p.id}, 'rechazar')">Rechazar</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

async function resolverPendiente(recurso, id, accion) {
  let cuerpo = {};

  if (accion === 'autorizar') {
    const codigo = prompt('Digite el código para eliminar este registro:');
    if (codigo === null) return;
    cuerpo = { codigo };
  } else {
    const motivo_rechazo = prompt('(Opcional) ¿Por qué se rechaza esta solicitud?');
    if (motivo_rechazo === null) return;
    cuerpo = { motivo_rechazo };
  }

  const { ok, data } = await api(`/api/${recurso}/${id}/${accion}-anulacion`, 'POST', cuerpo);
  if (!ok) { alert(data.error || 'No fue posible completar la acción.'); return; }

  await cargarPendientes();

  // Si la pantalla del modulo correspondiente tambien esta cargada, se refresca.
  if (recurso === 'ventas' && typeof cargarVentasHoy === 'function') {
    await cargarVentasHoy();
  } else if (typeof recargarMovimientos === 'function' && ['gastos', 'compras', 'prestamos'].includes(recurso)) {
    await recargarMovimientos(recurso);
  }
}
