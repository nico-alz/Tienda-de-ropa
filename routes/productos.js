// routes/productos.js
const express = require('express');
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
const GENEROS_VALIDOS = ['hombre', 'mujer', 'unisex'];

router.use(requireLogin);

// GET /api/productos -> lista de productos activos (para el formulario de venta)
router.get('/', (req, res) => {
  const productos = db.prepare(`
    SELECT * FROM productos WHERE activo = 1 ORDER BY nombre ASC
  `).all();
  res.json({ productos });
});

// POST /api/productos -> agregar un producto nuevo al catalogo
router.post('/', (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) {
    return res.status(400).json({ error: 'Escribe el nombre del producto.' });
  }
  const genero = GENEROS_VALIDOS.includes(req.body.genero) ? req.body.genero : 'unisex';

  try {
    const resultado = db.prepare('INSERT INTO productos (nombre, genero) VALUES (?, ?)').run(nombre, genero);
    const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(resultado.lastInsertRowid);
    res.status(201).json({ producto });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ese producto ya existe en el catalogo.' });
    }
    throw err;
  }
});

// DELETE /api/productos/:id -> desactivar un producto (no se borra el historial)
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
