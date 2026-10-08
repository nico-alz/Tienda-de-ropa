// routes/usuarios.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin, requireRole('dueno'));

// GET /api/usuarios -> lista de todos los usuarios (sin el hash de contrasena)
router.get('/', (req, res) => {
  const usuarios = db.prepare(`
    SELECT id, nombre_usuario, nombre_completo, rol, activo, creado_en
    FROM usuarios ORDER BY creado_en ASC
  `).all();
  res.json({ usuarios });
});

// POST /api/usuarios -> crear un usuario nuevo (cajera o dueno)
router.post('/', (req, res) => {
  const { nombre_usuario, nombre_completo, password, rol } = req.body;

  if (!nombre_usuario || !nombre_completo || !password) {
    return res.status(400).json({ error: 'Completa todos los campos.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 4 caracteres.' });
  }
  if (!['dueno', 'cajera'].includes(rol)) {
    return res.status(400).json({ error: 'El rol no es valido.' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const resultado = db.prepare(`
      INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol)
      VALUES (?, ?, ?, ?)
    `).run(nombre_usuario.trim(), nombre_completo.trim(), hash, rol);

    const usuario = db.prepare(`
      SELECT id, nombre_usuario, nombre_completo, rol, activo FROM usuarios WHERE id = ?
    `).get(resultado.lastInsertRowid);

    res.status(201).json({ usuario });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya existe.' });
    }
    throw err;
  }
});

// PATCH /api/usuarios/:id/estado -> activar o desactivar un usuario
router.patch('/:id/estado', (req, res) => {
  const { activo } = req.body;
  if (Number(req.params.id) === req.session.usuario.id) {
    return res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
  }
  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/usuarios/:id/password -> restablecer la contrasena de un usuario
router.patch('/:id/password', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 4 caracteres.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
