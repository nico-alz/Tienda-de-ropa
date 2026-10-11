// public/js/dueno.js
// (usa comun.js y movimientos.js)

// ---------------------------------------------------------------
// Arranque y navegacion entre secciones
// ---------------------------------------------------------------
async function iniciar() {
  const meResp = await fetch('/api/auth/me');
  if (!meResp.ok) { window.location.href = '/login.html'; return; }
  const { usuario } = await meResp.json();

  document.getElementById('texto-usuario').textContent = `${usuario.nombre_completo} · Cajero`;
  document.getElementById('fecha-hoy').textContent =
    new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  document.querySelectorAll('.app-nav button').forEach(boton => {
    boton.addEventListener('click', () => mostrarSeccion(boton.dataset.seccion));
  });

  document.getElementById('btn-salir').addEventListener('click', cerrarSesion);
  document.getElementById('form-venta').addEventListener('submit', registrarVenta);
  document.getElementById('btn-buscar-historial').addEventListener('click', buscarHistorial);
  document.getElementById('btn-agregar-producto').addEventListener('click', agregarProducto);
  document.getElementById('btn-agregar-trabajador').addEventListener('click', agregarTrabajador);
  iniciarAtajosProducto();

  const hoyISO = fechaLocalISO();
  document.getElementById('hist-desde').value = hoyISO;
  document.getElementById('hist-hasta').value = hoyISO;

  await cargarProductos();
  await cargarVentasHoy();
  await cargarPendientes();
  iniciarMovimientos(true);
}

function mostrarSeccion(nombre) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
  document.getElementById(`seccion-${nombre}`).classList.add('activa');

  document.querySelectorAll('.app-nav button').forEach(b => b.classList.remove('activo'));
  document.querySelector(`.app-nav button[data-seccion="${nombre}"]`).classList.add('activo');

  if (nombre === 'productos') cargarProductos(true);
  if (['gastos', 'compras', 'prestamos'].includes(nombre)) recargarMovimientos(nombre);
  if (nombre === 'trabajadores') cargarTablaTrabajadores();
  if (nombre === 'pendientes') cargarPendientes();
  if (nombre === 'reportes') iniciarReportes();
}

// ---------------------------------------------------------------
// Ventas de hoy
// ---------------------------------------------------------------
async function cargarVentasHoy() {
  const resp = await fetch('/api/ventas/hoy');
  if (!resp.ok) return;
  const { ventas, total_hoy } = await resp.json();

  document.getElementById('total-hoy').textContent = formatoPesos(total_hoy);

  const cuerpo = document.getElementById('cuerpo-tabla-ventas');
  const textoVacio = document.getElementById('texto-vacio-ventas');

  if (ventas.length === 0) {
    cuerpo.innerHTML = '';
    textoVacio.classList.remove('oculto');
    return;
  }
  textoVacio.classList.add('oculto');

  cuerpo.innerHTML = ventas.map(v => {
    const claseFila = v.estado === 'anulada' ? 'fila-anulada'
      : v.estado === 'anulacion_solicitada' ? 'fila-pendiente' : '';

    let acciones = '';
    if (v.estado === 'activa') {
      acciones = `<button class="btn btn-peligro btn-chico" onclick="solicitarAnulacion(${v.id})">Solicitar anulación</button>`;
    } else if (v.estado === 'anulacion_solicitada') {
      acciones = `
        <div class="fila-acciones">
          <button class="btn btn-acento btn-chico" onclick="autorizarAnulacion(${v.id})">Autorizar</button>
          <button class="btn btn-secundario btn-chico" onclick="rechazarAnulacion(${v.id})">Rechazar</button>
        </div>
        <div style="font-size:12px;color:var(--color-texto-suave);margin-top:4px;">
          Motivo: ${escaparHtml(v.anulacion_motivo_solicitud || '')}
        </div>`;
    }

    return `
      <tr class="${claseFila}">
        <td>${formatoHora(v.fecha_hora)}</td>
        <td>${escaparHtml(v.producto_nombre)}</td>
        <td>${v.cantidad}</td>
        <td>${formatoPesos(v.valor_total)}</td>
        <td>${v.forma_pago}</td>
        <td>${escaparHtml(v.usuario_nombre)}</td>
        <td><span class="etiqueta-estado estado-${v.estado}">${ETIQUETAS_ESTADO[v.estado]}</span></td>
        <td>${acciones}</td>
      </tr>
    `;
  }).join('');
}

let precioSeleccionado = null;

function elegirPrecio(precio, boton) {
  precioSeleccionado = precio;
  document.querySelectorAll('.btn-precio').forEach(b => b.classList.remove('seleccionado'));
  boton.classList.add('seleccionado');
  actualizarValorTotal();
}

function actualizarValorTotal() {
  if (precioSeleccionado === null) return;
  const cantidad = Number(document.getElementById('cantidad').value) || 1;
  document.getElementById('valor_total').value = precioSeleccionado * cantidad;
}

let registrandoVenta = false;

// Evita que un doble clic registre la misma venta dos veces
async function registrarVenta(e) {
  e.preventDefault();
  if (registrandoVenta) return;
  registrandoVenta = true;
  try {
    await registrarVentaInterno(e);
  } finally {
    registrandoVenta = false;
  }
}

async function registrarVentaInterno(e) {
  e.preventDefault();

  if (precioSeleccionado === null) {
    alert('Elige el precio: $10.000, $15.000 o $20.000.');
    return;
  }

  const cuerpo = {
    producto_nombre: document.getElementById('producto').value,
    cantidad: document.getElementById('cantidad').value,
    valor_total: document.getElementById('valor_total').value,
    forma_pago: document.getElementById('forma_pago').value,
  };

  const resp = await fetch('/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || 'No fue posible registrar la venta.'); return; }

  document.getElementById('form-venta').reset();
  precioSeleccionado = null;
  document.querySelectorAll('.btn-precio').forEach(b => b.classList.remove('seleccionado'));
  limpiarAtajosProducto();
  document.getElementById('cantidad').value = 1;
  await cargarVentasHoy();
  await cargarProductos();
}

async function solicitarAnulacion(ventaId) {
  const motivo = prompt('¿Por qué se debe anular esta venta?');
  if (motivo === null) return;
  if (!motivo.trim()) { alert('Debes escribir un motivo.'); return; }

  const nombre_cajero = prompt('¿Cuál es el nombre del cajero que solicita la anulación?');
  if (nombre_cajero === null) return;
  if (!nombre_cajero.trim()) { alert('Debes escribir el nombre del cajero.'); return; }

  const resp = await fetch(`/api/ventas/${ventaId}/solicitar-anulacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo, nombre_cajero }),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || 'No fue posible enviar la solicitud.'); return; }
  await cargarVentasHoy();
}

async function autorizarAnulacion(ventaId) {
  const codigo = prompt('Digite el código para eliminar la venta:');
  if (codigo === null) return;

  const resp = await fetch(`/api/ventas/${ventaId}/autorizar-anulacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || 'No fue posible autorizar la anulación.'); return; }
  await cargarVentasHoy();
}

async function rechazarAnulacion(ventaId) {
  const motivo_rechazo = prompt('(Opcional) ¿Por qué se rechaza esta solicitud?');
  if (motivo_rechazo === null) return;
  const resp = await fetch(`/api/ventas/${ventaId}/rechazar-anulacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo_rechazo }),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || 'No fue posible rechazar la solicitud.'); return; }
  await cargarVentasHoy();
}

// ---------------------------------------------------------------
// Historial
// ---------------------------------------------------------------
async function buscarHistorial() {
  const desde = document.getElementById('hist-desde').value;
  const hasta = document.getElementById('hist-hasta').value;

  const resp = await fetch(`/api/ventas?desde=${desde}&hasta=${hasta}`);
  if (!resp.ok) return;
  const { ventas } = await resp.json();

  const cuerpo = document.getElementById('cuerpo-tabla-historial');
  const textoVacio = document.getElementById('texto-vacio-historial');
  const resumen = document.getElementById('resumen-historial');

  if (ventas.length === 0) {
    cuerpo.innerHTML = '';
    textoVacio.classList.remove('oculto');
    resumen.classList.add('oculto');
    return;
  }
  textoVacio.classList.add('oculto');

  const totalActivas = ventas.filter(v => v.estado !== 'anulada').reduce((s, v) => s + v.valor_total, 0);
  const cantidadActivas = ventas.filter(v => v.estado !== 'anulada').length;
  resumen.classList.remove('oculto');
  resumen.textContent = `${cantidadActivas} ventas activas por un total de ${formatoPesos(totalActivas)}`;

  cuerpo.innerHTML = ventas.map(v => {
    const claseFila = v.estado === 'anulada' ? 'fila-anulada' : '';
    return `
      <tr class="${claseFila}">
        <td>${formatoFechaHora(v.fecha_hora)}</td>
        <td>${escaparHtml(v.producto_nombre)}</td>
        <td>${v.cantidad}</td>
        <td>${formatoPesos(v.valor_total)}</td>
        <td>${v.forma_pago}</td>
        <td>${escaparHtml(v.usuario_nombre)}</td>
        <td><span class="etiqueta-estado estado-${v.estado}">${ETIQUETAS_ESTADO[v.estado]}</span></td>
      </tr>
    `;
  }).join('');
}

// ---------------------------------------------------------------
// Productos
// ---------------------------------------------------------------
async function cargarProductos(paraTabla) {
  const resp = await fetch('/api/productos');
  if (!resp.ok) return;
  const { productos } = await resp.json();

  const datalist = document.getElementById('lista-productos');
  if (datalist) datalist.innerHTML = productos.map(p => `<option value="${escaparHtml(p.nombre)}">`).join('');

  pintarAtajosProducto(productos);

  const ETIQUETAS_GENERO = { hombre: 'Hombre', mujer: 'Mujer', unisex: 'Hombre y Mujer' };

  if (paraTabla) {
    document.getElementById('cuerpo-tabla-productos').innerHTML = productos.map(p => `
      <tr>
        <td>${escaparHtml(p.nombre)}</td>
        <td>${ETIQUETAS_GENERO[p.genero] || 'Hombre y Mujer'}</td>
        <td><button class="btn btn-secundario btn-chico" onclick="quitarProducto(${p.id})">Quitar del catálogo</button></td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="texto-vacio">Aún no hay productos en el catálogo.</td></tr>';
  }
}

async function agregarProducto() {
  const input = document.getElementById('nuevo-producto');
  const nombre = input.value.trim();
  if (!nombre) return;
  const genero = document.getElementById('nuevo-producto-genero').value;

  const resp = await fetch('/api/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, genero }),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || 'No fue posible agregar el producto.'); return; }

  input.value = '';
  document.getElementById('nuevo-producto-genero').value = 'unisex';
  await cargarProductos(true);
}

async function quitarProducto(id) {
  if (!confirm('¿Quitar este producto del catálogo? Las ventas ya registradas no se ven afectadas.')) return;
  await fetch(`/api/productos/${id}`, { method: 'DELETE' });
  await cargarProductos(true);
}

// ---------------------------------------------------------------
iniciar();
