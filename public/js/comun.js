// public/js/comun.js
// Funciones compartidas por todas las pantallas.

const formatoPesos = (valor) =>
  '$' + Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 0 });

const formatoHora = (fechaHora) => {
  const d = new Date(fechaHora.replace(' ', 'T'));
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
};

const formatoFechaHora = (fechaHora) => {
  const d = new Date(fechaHora.replace(' ', 'T'));
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const ETIQUETAS_ESTADO = {
  activa: 'Activa',
  anulacion_solicitada: 'Anulación pendiente',
  anulada: 'Anulada',
};

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// Fecha de HOY en hora local del computador (AAAA-MM-DD).
function fechaLocalISO() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// Llamada a la API que devuelve { ok, data }. Si la sesion se vencio, vuelve al login.
async function api(url, metodo = 'GET', cuerpo) {
  const opciones = { method: metodo };
  if (cuerpo !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(cuerpo);
  }
  const resp = await fetch(url, opciones);
  let data = {};
  try { data = await resp.json(); } catch (e) { /* respuesta sin cuerpo */ }
  if (resp.status === 401) {
    window.location.href = '/login.html';
  }
  return { ok: resp.ok, data };
}

async function cerrarSesion() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// Dibuja los botones de atajo de producto a partir del catálogo (lo que
// trae /api/productos), separados en la columna de Hombre y la de Mujer.
// Un producto "unisex" aparece en ambas columnas. Se vuelve a llamar cada
// vez que se recarga el catálogo, así que si el dueño agrega un producto
// nuevo (o lo quita), el botón aparece o desaparece solo, sin recargar la
// página.
function pintarAtajosProducto(productos) {
  const contHombre = document.getElementById('atajos-hombre');
  const contMujer = document.getElementById('atajos-mujer');
  if (!contHombre || !contMujer) return;

  const boton = (p) =>
    `<button type="button" class="btn-producto-atajo" data-producto="${escaparHtml(p.nombre)}" onclick="elegirProducto(this)">${escaparHtml(p.nombre)}</button>`;

  const deHombre = productos.filter((p) => p.genero === 'hombre' || p.genero === 'unisex');
  const deMujer = productos.filter((p) => p.genero === 'mujer' || p.genero === 'unisex');

  contHombre.innerHTML = deHombre.map(boton).join('')
    || '<span class="texto-vacio-atajos">Agrega productos de hombre en la pestaña "Productos".</span>';
  contMujer.innerHTML = deMujer.map(boton).join('')
    || '<span class="texto-vacio-atajos">Agrega productos de mujer en la pestaña "Productos".</span>';
}

// Atajos de producto en el formulario de venta: clic en un botón llena el
// campo "producto" y lo resalta. Si la cajera escribe el nombre a mano
// (para algo que no está en los atajos), se resalta solo si coincide.
function elegirProducto(boton) {
  const nombre = boton.dataset.producto;
  const campo = document.getElementById('producto');
  campo.value = nombre;
  document.querySelectorAll('.btn-producto-atajo').forEach((b) =>
    b.classList.toggle('seleccionado', b.dataset.producto === nombre));
  campo.focus();
}

function iniciarAtajosProducto() {
  const campo = document.getElementById('producto');
  if (!campo) return;
  campo.addEventListener('input', () => {
    document.querySelectorAll('.btn-producto-atajo').forEach((b) =>
      b.classList.toggle('seleccionado', b.dataset.producto === campo.value));
  });
}

function limpiarAtajosProducto() {
  document.querySelectorAll('.btn-producto-atajo').forEach((b) => b.classList.remove('seleccionado'));
}
