// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password) {
    return res.status(400).json({ error: 'Ingresa el usuario y la contrasena.' });
  }

  const usuario = db.prepare(`
    SELECT * FROM usuarios WHERE nombre_usuario = ? AND activo = 1
  `).get(nombre_usuario.trim());

  if (!usuario) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
  }

  const passwordOk = bcrypt.compareSync(password, usuario.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
  }

  // Guardamos solo lo necesario en la sesion (nunca el hash de la contrasena)
  req.session.usuario = {
    id: usuario.id,
    nombre_usuario: usuario.nombre_usuario,
    nombre_completo: usuario.nombre_completo,
    rol: usuario.rol,
  };

  res.json({ usuario: req.session.usuario });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me  -> quien esta conectado ahora mismo
router.get('/me', (req, res) => {
  if (req.session && req.session.usuario) {
    return res.json({ usuario: req.session.usuario });
  }
  return res.status(401).json({ error: 'No hay sesion activa.' });
});

module.exports = router;
