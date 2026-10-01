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
      return rLimpio === rolUsuarioLimpio || (rolUsuarioLimpio.includes('gerente') && rolUsuarioLimpio.includes('administrac'));
    });

    let sql = `
      SELECT 
        v.id_vacacion,
        v.id_employee,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(ve.name, ''), ' ', COALESCE(ve.last_name, ''))), ''),
          CONCAT('Empleado ID #', v.id_employee)
        ) AS nombre_empleado,
        v.fecha_inicio,
        v.fecha_fin,
        v.dias_tomados,
        v.motivo,
        v.created_at,
        v.estado,
        v.observaciones,
        COALESCE(ve.dias_vacaciones_ley, 0) AS dias_vacaciones_ley,
        COALESCE((
          SELECT SUM(v2.dias_tomados) 
          FROM vacaciones v2 
          WHERE v2.id_employee = v.id_employee 
            AND v2.estado IN ('aprobada', 'autorizada')
        ), 0) AS dias_gozados
      FROM vacaciones v
      LEFT JOIN vista_empleados_vacaciones ve ON v.id_employee = ve.id_employee
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

    // Mapeo dinámico para obtener la diferencia de días faltantes por gozar
    const resultadosEnriquecidos = rows.map(r => {
      const diasLey = Number(r.dias_vacaciones_ley || 0);
      const diasGozados = Number(r.dias_gozados || 0);
      return {
        ...r,
        dias_restantes: Math.max(0, diasLey - diasGozados)
      };
    });

    res.json(resultadosEnriquecidos);

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

  if (!estado) {
    return res.status(400).json({
      success: false,
      error: 'El campo estado es requerido.'
    });
  }

  const estadoLimpio = estado.toLowerCase().trim();

  let estadoParaBD = estadoLimpio;
  if (estadoLimpio === 'autorizada' || estadoLimpio === 'aprobada') {
    estadoParaBD = 'aprobada';
  } else if (estadoLimpio === 'rechazada') {
    estadoParaBD = 'rechazada';
  } else if (estadoLimpio === 'pendiente') {
    estadoParaBD = 'pendiente';
  } else {
    return res.status(400).json({
      success: false,
      error: 'Estado inválido. Los valores permitidos son: pendiente, autorizada/aprobada, rechazada.'
    });
  }

  try {
    const sqlUpdate = `UPDATE vacaciones SET estado = ? WHERE id_vacacion = ?`;
    const [result] = await pool.query(sqlUpdate, [estadoParaBD, idVacacion]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la solicitud de vacaciones especificada.'
      });
    }

    res.json({
      success: true,
      message: `✅ Estado de vacaciones actualizado a '${estadoParaBD}' con éxito.`
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