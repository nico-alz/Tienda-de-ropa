// public/js/trabajadores.js
// Administración de los perfiles de trabajadores (solo dueño).
// Requiere comun.js cargado antes.

async function cargarTablaTrabajadores() {
  const cuerpo = document.getElementById('cuerpo-tabla-trabajadores');
  if (!cuerpo) return;

  const { ok, data } = await api('/api/trabajadores/todos');
  if (!ok) {
    cuerpo.innerHTML = `<tr><td colspan="4" class="texto-vacio">${escaparHtml(data.error || 'No fue posible cargar los trabajadores.')}</td></tr>`;
    return;
  }

  cuerpo.innerHTML = data.trabajadores.map((t) => `
    <tr>
      <td>${escaparHtml(t.nombre)}</td>
      <td>${formatoPesos(t.pago_diario)}</td>
      <td>${t.activo ? 'Activo' : 'Inactivo'}</td>
      <td>
        <div class="fila-acciones">
          <button class="btn btn-secundario btn-chico" onclick="cambiarPagoDiario(${t.id}, ${t.pago_diario})">Cambiar pago diario</button>
          <button class="btn ${t.activo ? 'btn-peligro' : 'btn-acento'} btn-chico" onclick="cambiarEstadoTrabajador(${t.id}, ${t.activo ? 0 : 1})">
            ${t.activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="texto-vacio">Aún no hay trabajadores registrados.</td></tr>';
}

async function agregarTrabajador() {
  const nombreInput = document.getElementById('t-nombre');
  const pagoInput = document.getElementById('t-pago-diario');
  const nombre = nombreInput.value.trim();
  if (!nombre) { alert('Escribe el nombre del trabajador.'); return; }

  const { ok, data } = await api('/api/trabajadores', 'POST', {
    nombre,
    pago_diario: pagoInput.value || undefined,
  });
  if (!ok) { alert(data.error || 'No fue posible crear el trabajador.'); return; }

  nombreInput.value = '';
  pagoInput.value = '';
  await cargarTablaTrabajadores();
}

async function cambiarEstadoTrabajador(id, nuevoEstado) {
  const { ok, data } = await api(`/api/trabajadores/${id}/estado`, 'PATCH', { activo: nuevoEstado });
  if (!ok) { alert(data.error || 'No fue posible actualizar el trabajador.'); return; }
  await cargarTablaTrabajadores();
}

async function cambiarPagoDiario(id, pagoActual) {
  const nuevo = prompt('Nuevo pago diario para este trabajador:', pagoActual);
  if (nuevo === null) return;
  const { ok, data } = await api(`/api/trabajadores/${id}/pago-diario`, 'PATCH', { pago_diario: nuevo });
  if (!ok) { alert(data.error || 'No fue posible cambiar el pago diario.'); return; }
  await cargarTablaTrabajadores();
}
