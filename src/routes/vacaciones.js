const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Importación directa del cliente Gmail desde tu modulo de Google
const { gmail } = require('../config/google');

const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

const ROLES_ADMINISTRATIVOS = [
  'Director Operativo',
  'Director General',
  'Gerente de Administración',
  'Gerente administración',
  'Gerente Administracion'
];

// =========================================================================
// FUNCIÓN AUXILIAR: Enviar correo seguro mediante API de Gmail (MIME Base64)
// =========================================================================
async function enviarCorreoGmail({ to, subject, html }) {
  try {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      html
    ];
    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });
    console.log(`✉️ Correo enviado exitosamente vía Gmail a: ${to}`);
  } catch (err) {
    console.error('❌ Error al enviar correo mediante Gmail API:', err);
  }
}

// =========================================================================
// NUEVA LÓGICA: Depuración automática de solicitudes rechazadas tras 10 días
// =========================================================================
async function depurarVacacionesRechazadas() {
  try {
    const sqlDelete = `
      DELETE FROM vacaciones 
      WHERE estado = 'rechazada' 
        AND updated_at <= NOW() - INTERVAL 10 DAY
    `;
    const [result] = await pool.query(sqlDelete);
    if (result.affectedRows > 0) {
      console.log(`🧹 Depuración de vacaciones: ${result.affectedRows} registro(s) rechazados antiguos eliminados.`);
    }
  } catch (error) {
    console.error('❌ Error durante la depuración de vacaciones rechazadas:', error);
  }
}

// Ejecutar depuración cada 24 horas y al iniciar
setInterval(depurarVacacionesRechazadas, 24 * 60 * 60 * 1000);
setTimeout(depurarVacacionesRechazadas, 5000);

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
            AND v2.fecha_inicio >= CASE 
              WHEN DATE_FORMAT(CURRENT_DATE, '%m-%d') >= DATE_FORMAT(ve.hire_date, '%m-%d')
              THEN STR_TO_DATE(CONCAT(YEAR(CURRENT_DATE), '-', DATE_FORMAT(ve.hire_date, '%m-%d')), '%Y-%m-%d')
              ELSE STR_TO_DATE(CONCAT(YEAR(CURRENT_DATE) - 1, '-', DATE_FORMAT(ve.hire_date, '%m-%d')), '%Y-%m-%d')
            END
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

    const resultadosEnriquecidos = rows.map(r => {
      const diasLey = Number(r.dias_vacaciones_ley || 0);
      const diasGozados = Number(r.dias_gozados || 0);
      return {
        ...r,
        dias_gozados: diasGozados,
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

// =========================================================================
// MODIFICACIÓN: Envío de correo mediante Gmail API al rechazar
// =========================================================================
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

    // Si fue RECHAZADA, notificar por correo al empleado
    if (estadoParaBD === 'rechazada') {
      try {
        const sqlQuery = `
          SELECT 
            v.fecha_inicio, 
            v.fecha_fin, 
            v.observaciones,
            COALESCE(ve.email, ve.correo) AS correo,
            CONCAT(COALESCE(ve.name, ''), ' ', COALESCE(ve.last_name, '')) AS nombre
          FROM vacaciones v
          LEFT JOIN vista_empleados_vacaciones ve ON v.id_employee = ve.id_employee
          WHERE v.id_vacacion = ?
        `;
        const [filasInfo] = await pool.query(sqlQuery, [idVacacion]);

        if (filasInfo.length > 0 && filasInfo[0].correo) {
          const info = filasInfo[0];
          const plantillaHtml = `
            <div style="font-family: Arial, sans-serif; padding: 15px; color: #333;">
              <h2 style="color: #dc2626;">Notificación de Solicitud de Vacaciones - MODISA</h2>
              <p>Hola <strong>${info.nombre || 'Empleado'}</strong>,</p>
              <p>Te informamos que tu solicitud de vacaciones programada del <strong>${info.fecha_inicio}</strong> al <strong>${info.fecha_fin}</strong> ha sido <span style="color: #dc2626; font-weight: bold;">RECHAZADA</span>.</p>
              ${info.observaciones ? `<p><strong>Observaciones:</strong> ${info.observaciones}</p>` : ''}
              <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;">
              <p style="font-size: 12px; color: #777;">Este es un mensaje automático generado por el Sistema ERP MODISA.</p>
            </div>
          `;

          await enviarCorreoGmail({
            to: info.correo,
            subject: 'Estatus de Solicitud de Vacaciones - MODISA',
            html: plantillaHtml
          });
        }
      } catch (errEmail) {
        console.error('⚠️ Solicitud rechazada pero falló la notificación de correo:', errEmail.message);
      }
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