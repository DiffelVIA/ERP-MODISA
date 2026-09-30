const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

const ROLES_ADMINISTRATIVOS = [
  'Director Operativo',
  'Director General',
  'Gerente de Administración',
  'Gerente administración',
  'Gerente Administracion'
];

router.get('/', verificarToken, async (req, res) => {
  try {
    const rolUsuario = req.usuario ? req.usuario.rol : '';
    const idEmpleadoToken = req.usuario ? (req.usuario.id_employee || req.usuario.id) : null;

    const rolUsuarioLimpio = (rolUsuario || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esAdmin = ROLES_ADMINISTRATIVOS.some(r => {
      const rLimpio = r.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return rLimpio === rolUsuarioLimpio;
    });

    let sql = `
      SELECT 
        v.id_vacacion,
        v.id_employee,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(e.name, ''), ' ', COALESCE(e.last_name, ''))), ''),
          CONCAT('Empleado ID #', v.id_employee)
        ) AS nombre_empleado,
        v.fecha_inicio,
        v.fecha_fin,
        v.dias_tomados,
        v.motivo,
        v.created_at,
        v.estado,
        v.observaciones
      FROM vacaciones v
      LEFT JOIN employees e ON v.id_employee = e.id_employee
      WHERE 1=1
    `;

    const params = [];

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

router.post('/', verificarToken, async (req, res) => {
  const {
    id_employee,
    fecha_inicio,
    fecha_fin,
    dias_tomados,
    motivo
  } = req.body;

  const idEmpleadoFinal = id_employee || (req.usuario ? (req.usuario.id_employee || req.usuario.id) : null);

  if (!idEmpleadoFinal || !fecha_inicio || !fecha_fin || !dias_tomados) {
    return res.status(400).json({
      success: false,
      error: 'Campos obligatorios faltantes: id_employee, fecha_inicio, fecha_fin y dias_tomados son requeridos.'
    });
  }

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