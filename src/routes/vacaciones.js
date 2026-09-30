const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../middlewares/authmiddlewares');

// Definición centralizada de roles administrativos para módulo de vacaciones
const ROLES_ADMINISTRATIVOS = [
  'Admin',
  'Administrador',
  'Director Operativo',
  'Director General',
  'Gerente de Administración',
  'RH',
  'Recursos Humanos'
];

/**
 * GET /api/vacaciones
 * Consulta el historial de vacaciones.
 * Si es usuario estándar, filtra solo sus propias vacaciones.
 * Si es Admin/RH, consulta todas las solicitudes con JOIN a la tabla employees.
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const rolUsuario = req.usuario ? req.usuario.rol : '';
    const idEmpleadoToken = req.usuario ? (req.usuario.id_employee || req.usuario.id) : null;

    const esAdmin = ROLES_ADMINISTRATIVOS.some(
      r => r.toLowerCase() === (rolUsuario || '').toLowerCase()
    );

    let sql = `
      SELECT 
        v.id_vacacion,
        v.id_employee,
        CONCAT(e.name, ' ', e.last_name) AS nombre_empleado,
        v.fecha_inicio,
        v.fecha_fin,
        v.dias_tomados,
        v.motivo,
        v.created_at,
        v.estado,
        v.observaciones
      FROM vacaciones v
      INNER JOIN employees e ON v.id_employee = e.id_employee
      WHERE 1=1
    `;

    const params = [];

    // Si no es un usuario administrativo, restringir estrictamente a sus propios registros
    if (!esAdmin) {
      if (!idEmpleadoToken) {
        return res.status(403).json({
          success: false,
          error: '⛔ No se pudo identificar la credencial del empleado en la sesión.'
        });
      }
      sql += ` AND v.id_employee = ?`;
      params.push(idEmpleadoToken);
    }

    sql += ` ORDER BY v.created_at DESC, v.id_vacacion DESC;`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);

  } catch (error) {
    console.error('❌ Error al consultar la tabla vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener las solicitudes de vacaciones.'
    });
  }
});

/**
 * POST /api/vacaciones
 * Registra una nueva solicitud de vacaciones.
 */
router.post('/', verificarToken, async (req, res) => {
  const {
    id_employee,
    fecha_inicio,
    fecha_fin,
    dias_tomados,
    motivo
  } = req.body;

  // Empleado que realiza la acción o se le asigna
  const idEmpleadoFinal = id_employee || (req.usuario ? (req.usuario.id_employee || req.usuario.id) : null);

  if (!idEmpleadoFinal || !fecha_inicio || !fecha_fin || !dias_tomados) {
    return res.status(400).json({
      success: false,
      error: 'Campos obligatorios faltantes: id_employee, fecha_inicio, fecha_fin y dias_tomados son requeridos.'
    });
  }

  // Validación de lógica de fechas
  if (new Date(fecha_inicio) > new Date(fecha_fin)) {
    return res.status(400).json({
      success: false,
      error: 'La fecha de inicio no puede ser posterior a la fecha de fin.'
    });
  }

  try {
    const sqlInsert = `
      INSERT INTO vacaciones (
        id_employee,
        fecha_inicio,
        fecha_fin,
        dias_tomados,
        motivo,
        estado
      ) VALUES (?, ?, ?, ?, ?, 'pendiente')
    `;

    const [insertResult] = await pool.query(sqlInsert, [
      parseInt(idEmpleadoFinal),
      fecha_inicio,
      fecha_fin,
      parseInt(dias_tomados),
      motivo ? motivo.trim() : null
    ]);

    res.status(201).json({
      success: true,
      message: '🎉 Solicitud de vacaciones registrada correctamente.',
      id_vacacion: insertResult.insertId
    });

  } catch (error) {
    console.error('❌ Error al insertar en la tabla vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al procesar la solicitud de vacaciones.'
    });
  }
});

/**
 * PATCH /api/vacaciones/:id/estado
 * Actualiza el campo 'estado' ENUM('pendiente', 'autorizada', 'rechazada').
 * Restringido exclusivamente a roles administrativos/RH.
 */
router.patch('/:id/estado', verificarToken, verificarRol(ROLES_ADMINISTRATIVOS), async (req, res) => {
  const idVacacion = req.params.id;
  const { estado } = req.body;

  const estadosValidos = ['pendiente', 'autorizada', 'rechazada'];

  if (!estado || !estadosValidos.includes(estado.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Estado inválido. Los valores permitidos son: ${estadosValidos.join(', ')}.`
    });
  }

  try {
    const sqlUpdate = `UPDATE vacaciones SET estado = ? WHERE id_vacacion = ?`;
    const [result] = await pool.query(sqlUpdate, [estado.toLowerCase(), idVacacion]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la solicitud de vacaciones especificada.'
      });
    }

    res.json({
      success: true,
      message: `✅ Estado de vacaciones actualizado a '${estado}' con éxito.`
    });

  } catch (error) {
    console.error('❌ Error al actualizar estado de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al actualizar el estado de las vacaciones.'
    });
  }
});

/**
 * PATCH /api/vacaciones/:id/observaciones
 * Actualiza las observaciones/notas administrativas.
 * Restringido exclusivamente a roles administrativos/RH.
 */
router.patch('/:id/observaciones', verificarToken, verificarRol(ROLES_ADMINISTRATIVOS), async (req, res) => {
  const idVacacion = req.params.id;
  const { observaciones } = req.body;

  try {
    const sqlUpdate = `UPDATE vacaciones SET observaciones = ? WHERE id_vacacion = ?`;
    const [result] = await pool.query(sqlUpdate, [observaciones ? observaciones.trim() : null, idVacacion]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la solicitud de vacaciones especificada.'
      });
    }

    res.json({
      success: true,
      message: '✅ Observaciones actualizadas correctamente.'
    });

  } catch (error) {
    console.error('❌ Error al actualizar observaciones de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al actualizar las observaciones.'
    });
  }
});

module.exports = router;