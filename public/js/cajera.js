// public/js/cajera.js
// (usa comun.js y movimientos.js)

async function iniciar() {
  // 1. Verificar sesion
  const meResp = await fetch('/api/auth/me');
  if (!meResp.ok) {
    window.location.href = '/login.html';
    return;
  }
  const { usuario } = await meResp.json();
  document.getElementById('texto-usuario').textContent =
    `${usuario.nombre_completo} · ${usuario.rol === 'dueno' ? 'Dueño' : 'Cajera'}`;

  document.getElementById('fecha-hoy').textContent =
    new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  await cargarProductos();
  await cargarVentasHoy();

  document.querySelectorAll('.app-nav button').forEach(b =>
    b.addEventListener('click', () => mostrarSeccion(b.dataset.seccion)));
  iniciarMovimientos(false);

  document.getElementById('btn-salir').addEventListener('click', cerrarSesion);
  document.getElementById('form-venta').addEventListener('submit', registrarVenta);
  iniciarAtajosProducto();
}

async function cargarProductos() {
  const resp = await fetch('/api/productos');
  if (!resp.ok) return;
  const { productos } = await resp.json();
  const datalist = document.getElementById('lista-productos');
  datalist.innerHTML = productos.map(p => `<option value="${escaparHtml(p.nombre)}">`).join('');

  pintarAtajosProducto(productos);
}

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

    const puedeSolicitarAnulacion = v.estado === 'activa';

    return `
      <tr class="${claseFila}">
        <td>${formatoHora(v.fecha_hora)}</td>
        <td>${escaparHtml(v.producto_nombre)}</td>
        <td>${v.cantidad}</td>
        <td>${formatoPesos(v.valor_total)}</td>
        <td>${v.forma_pago}</td>
        <td>${escaparHtml(v.usuario_nombre)}</td>
        <td><span class="etiqueta-estado estado-${v.estado}">${ETIQUETAS_ESTADO[v.estado]}</span></td>
        <td>
          ${puedeSolicitarAnulacion
            ? `<button class="btn btn-peligro btn-chico" onclick="solicitarAnulacion(${v.id})">Solicitar anulación</button>`
            : ''}
        </td>
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
  const mensaje = document.getElementById('mensaje-venta');
  mensaje.className = 'oculto';

  if (precioSeleccionado === null) {
    mensaje.textContent = 'Elige el precio: $10.000 o $20.000.';
    mensaje.className = 'mensaje-error';
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

  if (!resp.ok) {
    mensaje.textContent = data.error || 'No fue posible registrar la venta.';
    mensaje.className = 'mensaje-error';
    return;
  }

  mensaje.textContent = 'Venta registrada correctamente.';
  mensaje.className = 'mensaje-exito';
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
  if (!motivo.trim()) {
    alert('Debes escribir un motivo para poder solicitar la anulación.');
    return;
  }

  const resp = await fetch(`/api/ventas/${ventaId}/solicitar-anulacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo }),
  });
  const data = await resp.json();

  if (!resp.ok) {
    alert(data.error || 'No fue posible enviar la solicitud.');
    return;
  }
  await cargarVentasHoy();
}

function mostrarSeccion(nombre) {
  document.querySelectorAll('.seccion').forEach(sec => sec.classList.remove('activa'));
  document.getElementById(`seccion-${nombre}`).classList.add('activa');
  document.querySelectorAll('.app-nav button').forEach(b =>
    b.classList.toggle('activo', b.dataset.seccion === nombre));
  if (['gastos', 'compras', 'prestamos'].includes(nombre)) recargarMovimientos(nombre);
}

iniciar();
