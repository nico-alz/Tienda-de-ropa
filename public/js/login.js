// public/js/login.js
const form = document.getElementById('form-login');
const mensajeError = document.getElementById('mensaje-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeError.classList.add('oculto');

  const nombre_usuario = document.getElementById('nombre_usuario').value;
  const password = document.getElementById('password').value;

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      mensajeError.textContent = data.error || 'No fue posible iniciar sesión.';
      mensajeError.classList.remove('oculto');
      return;
    }

    if (data.usuario.rol === 'dueno') {
      window.location.href = '/dueno.html';
    } else {
      window.location.href = '/cajera.html';
    }
  } catch (err) {
    mensajeError.textContent = 'No fue posible conectar con el servidor.';
    mensajeError.classList.remove('oculto');
  }
});
