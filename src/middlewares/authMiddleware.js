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

// Funcionalidad auxiliar interna para insensibilidad a tildes/mayúsculas
const normalizarTexto = (texto) => {
  if (!texto) return '';
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const verificarRol = (rolesPermitidos = []) => {
  return (req, res, next) => {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];

    if (req.usuario && req.usuario.rol) {
      const rolUsuarioNormalizado = normalizarTexto(req.usuario.rol);
      
      const tienePermiso = roles.some(rolPermitido => {
        const rolPermitidoNormalizado = normalizarTexto(rolPermitido);
        return rolUsuarioNormalizado === rolPermitidoNormalizado ||
               (rolUsuarioNormalizado.includes('gerente') && rolUsuarioNormalizado.includes('administrac'));
      });

      if (tienePermiso) {
        return next();
      }
      return res.status(403).json({ error: '⛔ Acceso denegado. Permisos insuficientes.' });
    }

    return res.status(403).json({ error: '⛔ Acceso denegado. Se requiere autenticación válida.' });
  };
};

module.exports = {
  verificarToken,
  verificarRol
};