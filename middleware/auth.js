// middleware/auth.js
// Controla quien puede entrar a cada parte del sistema.

function requireLogin(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.status(401).json({ error: 'Debes iniciar sesion.' });
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session || !req.session.usuario) {
      return res.status(401).json({ error: 'Debes iniciar sesion.' });
    }
    if (!rolesPermitidos.includes(req.session.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para hacer esto.' });
    }
    return next();
  };
}

module.exports = { requireLogin, requireRole };
