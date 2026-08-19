const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR CRÍTICO: La variable de entorno JWT_SECRET no está configurada.');
}

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : null;

  if (token) {
    try {
      const decodificado = jwt.verify(
        token, 
        process.env.JWT_SECRET
      );
      
      req.usuario = decodificado;
      return next();
    } catch (error) {
      console.warn('⚠️ Token JWT inválido o expirado:', error.message);
      return res.status(401).json({ error: '🔒 Token inválido o expirado.' });
    }
  }

  req.usuario = null;
  next();
};

const verificarRol = (rolesPermitidos = []) => {
  return (req, res, next) => {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];

    if (req.usuario && req.usuario.rol) {
      if (roles.includes(req.usuario.rol)) {
        return next();
      }
      return res.status(403).json({ error: '⛔ Acceso denegado. Permisos insuficientes.' });
    }

    const rolHeader = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';
    if (rolHeader && roles.includes(rolHeader)) {
      return next();
    }

    return res.status(403).json({ error: '⛔ Acceso denegado. Se requiere autenticación válida.' });
  };
};

module.exports = {
  verificarToken,
  verificarRol
};