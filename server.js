// server.js
// Punto de entrada del sistema "Todo a 10.000".

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const ventasRoutes = require('./routes/ventas');
const productosRoutes = require('./routes/productos');
const gastosRoutes = require('./routes/gastos');
const comprasRoutes = require('./routes/compras');
const trabajadoresRoutes = require('./routes/trabajadores');
const prestamosRoutes = require('./routes/prestamos');
const pendientesRoutes = require('./routes/pendientes');
const reportesRoutes = require('./routes/reportes');
const db = require('./database/db');
const { iniciarRespaldos } = require('./database/respaldos');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'todo-a-10000-cambiar-este-secreto',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 12, // 12 horas
    httpOnly: true,
  },
}));

// --- Rutas de la API (todas devuelven JSON) ---
app.use('/api/auth', authRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/gastos', gastosRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/trabajadores', trabajadoresRoutes);
app.use('/api/prestamos', prestamosRoutes);
app.use('/api/pendientes', pendientesRoutes);
app.use('/api/reportes', reportesRoutes);

// --- Paginas (archivos estaticos) ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  if (!req.session.usuario) {
    return res.redirect('/login.html');
  }
  return res.redirect('/dueno.html');
});

// Manejador simple de errores para que nunca se caiga el servidor sin avisar
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Ocurrio un error inesperado en el servidor.' });
});

app.listen(PORT, () => {
  console.log(`Todo a 10.000 corriendo en http://localhost:${PORT}`);
  iniciarRespaldos(db);
});
