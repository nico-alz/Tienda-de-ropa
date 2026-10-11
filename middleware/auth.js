// middleware/auth.js
// Controla quien puede entrar a cada parte del sistema.

function requireLogin(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.status(401).json({ error: 'Debes iniciar sesion.' });
}

module.exports = { requireLogin };
