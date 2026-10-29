const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { gmail } = require('../config/google');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

const multer = require('multer');
const { subirArchivoADrive } = require('../services/drive');

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const ID_CARPETA_DRIVE_VACACIONES = process.env.GOOGLE_DRIVE_VACACIONES_FOLDER_ID || '1OY9sLfMIqnPDPhMMfhT13sc-Wm3FqOyS';

const ROLES_VISUALIZACION_GLOBAL = [
  'Director Operativo',
  'Director General',
  'Gerente de Administración',
  'Gerente administración',
  'Gerente Administracion'
];

const ROLES_AUTORIZADORES = [
  'Director Operativo',
  'Director General'
];

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

setInterval(depurarVacacionesRechazadas, 24 * 60 * 60 * 1000);
setTimeout(depurarVacacionesRechazadas, 5000);

router.get('/', verificarToken, async (req, res) => {
  try {
    const rolUsuario = req.usuario ? req.usuario.rol : '';
    const idEmpleadoToken = req.usuario ? (req.usuario.id_employee || req.usuario.id || req.usuario.userId) : null;

    const rolUsuarioLimpio = (rolUsuario || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esAdmin = ROLES_VISUALIZACION_GLOBAL.some(r => {
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
        COALESCE(v.dias_tomados, 0) AS dias_tomados,
        v.created_at,
        COALESCE(v.estado, 'pendiente') AS estado,
        v.observaciones,
        v.documento_firmado_url,
        ve.hire_date,
        CONCAT(
          YEAR(COALESCE(v.fecha_inicio, CURRENT_DATE)), '-', YEAR(DATE_ADD(COALESCE(v.fecha_inicio, CURRENT_DATE), INTERVAL 1 YEAR))
        ) AS periodo,
        COALESCE(ve.dias_vacaciones_ley, 0) AS dias_vacaciones_ley,
        COALESCE((
          SELECT SUM(COALESCE(v2.dias_tomados, 0)) 
          FROM vacaciones v2 
          WHERE v2.id_employee = v.id_employee 
            AND v2.estado IN ('aprobada', 'autorizada')
            AND v2.fecha_inicio >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR)
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
        motivo: '',
        dias_gozados: diasGozados,
        dias_restantes: Math.max(0, diasLey - diasGozados)
      };
    });

    res.json(resultadosEnriquecidos);

  } catch (error) {
    console.error('❌ Error crítico al consultar la tabla vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener las solicitudes de vacaciones.'
    });
  }
});

router.get('/estatus', verificarToken, async (req, res) => {
  try {
    const rolUsuario = req.usuario ? req.usuario.rol : '';
    const idEmpleadoToken = req.usuario ? (req.usuario.id_employee || req.usuario.id || req.usuario.userId) : null;

    const rolUsuarioLimpio = (rolUsuario || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esAdmin = ROLES_VISUALIZACION_GLOBAL.some(r => {
      const rLimpio = r.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return rLimpio === rolUsuarioLimpio || (rolUsuarioLimpio.includes('gerente') && rolUsuarioLimpio.includes('administrac'));
    });

    let sql = `
      SELECT 
        ve.id_employee,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(ve.name, ''), ' ', COALESCE(ve.last_name, ''))), ''),
          CONCAT('Empleado ID #', ve.id_employee)
        ) AS nombre_empleado,
        COALESCE(ve.dias_vacaciones_ley, 0) AS dias_ley,
        COALESCE((
          SELECT SUM(COALESCE(v.dias_tomados, 0)) 
          FROM vacaciones v 
          WHERE v.id_employee = ve.id_employee 
            AND v.estado IN ('aprobada', 'autorizada')
            AND v.fecha_inicio >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR)
        ), 0) AS dias_tomados
      FROM vista_empleados_vacaciones ve
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
      sql += ` AND ve.id_employee = ?`;
      params.push(idEmpleadoToken);
    }

    sql += ` ORDER BY nombre_empleado ASC;`;

    const [rows] = await pool.query(sql, params);

    const resultado = rows.map(r => {
      const diasLey = Number(r.dias_ley || 0);
      const diasTomados = Number(r.dias_tomados || 0);
      return {
        id_employee: r.id_employee,
        nombre_empleado: r.nombre_empleado,
        dias_ley: diasLey,
        dias_tomados: diasTomados,
        dias_restantes: Math.max(0, diasLey - diasTomados)
      };
    });

    res.json(resultado);

  } catch (error) {
    console.error('❌ Error al consultar estatus de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener el estatus de vacaciones.'
    });
  }
});

router.delete('/renovar/:id_employee', verificarToken, verificarRol(ROLES_AUTORIZADORES), async (req, res) => {
  const idEmpleadoParam = parseInt(req.params.id_employee, 10);

  if (isNaN(idEmpleadoParam) || idEmpleadoParam <= 0) {
    return res.status(400).json({
      success: false,
      error: 'ID de empleado inválido.'
    });
  }

  try {
    const sqlDelete = `
      DELETE FROM vacaciones 
      WHERE id_employee = ? 
        AND fecha_inicio >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR)
    `;

    const [result] = await pool.query(sqlDelete, [idEmpleadoParam]);

    res.json({
      success: true,
      message: `🎉 Renovación de días completada. Se eliminaron ${result.affectedRows} registro(s) de vacaciones del periodo.`
    });

  } catch (error) {
    console.error('❌ Error al forzar renovación de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al renovar días de vacaciones.'
    });
  }
});

router.post('/', verificarToken, async (req, res) => {
  if (!req.usuario) {
    return res.status(401).json({
      success: false,
      error: '⛔ Se requiere sesión activa para enviar una solicitud de vacaciones.'
    });
  }

  const {
    id_employee,
    fecha_inicio,
    fecha_fin,
    dias_tomados
  } = req.body;

  const idEmpleadoBruto = req.usuario.id_employee || req.usuario.id || req.usuario.userId || id_employee;
  const idEmpleadoFinal = parseInt(idEmpleadoBruto, 10);
  const diasTomadosFinal = parseInt(dias_tomados, 10);

  if (isNaN(idEmpleadoFinal) || !fecha_inicio || !fecha_fin || isNaN(diasTomadosFinal) || diasTomadosFinal <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Campos obligatorios faltantes o inválidos: ID de empleado, fecha_inicio, fecha_fin y dias_tomados son requeridos.'
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
        estado
      ) VALUES (?, ?, ?, ?, 'pendiente')
    `;

    const [insertResult] = await pool.query(sqlInsert, [
      idEmpleadoFinal,
      fecha_inicio,
      fecha_fin,
      diasTomadosFinal
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

// MODIFICACIÓN (Producción): Envío dinámico de notificaciones al correo real del empleado
router.patch('/:id/estado', verificarToken, verificarRol(ROLES_AUTORIZADORES), async (req, res) => {
  const idVacacion = req.params.id;
  const { estado, observaciones } = req.body;

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
    let sqlUpdate = `UPDATE vacaciones SET estado = ?`;
    const queryParams = [estadoParaBD];

    if (observaciones !== undefined) {
      sqlUpdate += `, observaciones = ?`;
      queryParams.push(observaciones ? observaciones.trim() : null);
    }

    sqlUpdate += ` WHERE id_vacacion = ?`;
    queryParams.push(idVacacion);

    const [result] = await pool.query(sqlUpdate, queryParams);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la solicitud de vacaciones especificada.'
      });
    }

    if (estadoParaBD === 'aprobada' || estadoParaBD === 'rechazada') {
      const estadoEtiqueta = estadoParaBD === 'aprobada' ? 'Autorizada' : 'Rechazada';

      const sqlDetalles = `
        SELECT 
          v.observaciones,
          COALESCE(ve.email, '') AS email_empleado
        FROM vacaciones v
        LEFT JOIN vista_empleados_vacaciones ve ON v.id_employee = ve.id_employee
        WHERE v.id_vacacion = ?
      `;

      pool.query(sqlDetalles, [idVacacion]).then(([rows]) => {
        if (rows.length > 0) {
          const obsTexto = (observaciones !== undefined && observaciones !== null && observaciones.trim() !== '')
            ? observaciones.trim()
            : (rows[0].observaciones ? rows[0].observaciones.trim() : 'Sin comentarios adicionales.');
          
          // MODIFICACIÓN: Asignación dinámica del correo real del empleado con dirección fallback
          const emailEmpleadoReal = rows[0].email_empleado ? String(rows[0].email_empleado).trim() : '';
          const destinatarioFinal = (emailEmpleadoReal && emailEmpleadoReal.includes('@')) 
            ? emailEmpleadoReal 
            : 'dvillalva@modisa.com.mx';

          const cuerpoHtml = `
            <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; background-color: #ffffff;">
              <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">MODISA ERP - Estado de Vacaciones</h2>
              <p style="font-size: 15px; line-height: 1.6;">Buen día,</p>
              <p style="font-size: 15px; line-height: 1.6;">
                Te informamos que tu solicitud fue <strong style="color: ${estadoParaBD === 'aprobada' ? '#16a34a' : '#dc2626'};">${estadoEtiqueta}</strong>, contempla los siguientes comentarios:
              </p>
              <blockquote style="background-color: #f8fafc; border-left: 4px solid #2563eb; margin: 16px 0; padding: 12px 16px; font-style: italic; color: #334155;">
                "${obsTexto}"
              </blockquote>
              <p style="font-size: 14px; margin-top: 24px; color: #475569;">
                Saludos,<br/>
                <strong>Dirección MODISA</strong>
              </p>
            </div>
          `;

          enviarCorreoGmail({
            to: destinatarioFinal,
            subject: `Notificación de Solicitud de Vacaciones - ${estadoEtiqueta}`,
            html: cuerpoHtml
          }).catch(err => console.error('❌ Error al procesar envío de correo:', err));
        }
      }).catch(err => console.error('❌ Error al consultar detalles para correo:', err));
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

router.post('/:id/expediente', verificarToken, uploadMemory.single('expediente'), async (req, res) => {
  const idVacacion = req.params.id;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Debe seleccionar un archivo PDF para subir.'
    });
  }

  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({
      success: false,
      error: 'Formato no permitido. Solamente se admiten documentos en formato PDF.'
    });
  }

  const magicBytes = req.file.buffer.toString('utf8', 0, 4);
  if (magicBytes !== '%PDF') {
    return res.status(400).json({
      success: false,
      error: 'El archivo provisto está dañado o no es un documento PDF válido.'
    });
  }

  try {
    const sqlQuery = `
      SELECT 
        v.fecha_inicio,
        COALESCE(ve.name, 'Empleado') AS primer_nombre,
        CONCAT(
          YEAR(v.fecha_inicio), '-', YEAR(DATE_ADD(v.fecha_inicio, INTERVAL 1 YEAR))
        ) AS periodo
      FROM vacaciones v
      LEFT JOIN vista_empleados_vacaciones ve ON v.id_employee = ve.id_employee
      WHERE v.id_vacacion = ?
    `;

    const [rows] = await pool.query(sqlQuery, [idVacacion]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la solicitud de vacaciones correspondiente.'
      });
    }

    const info = rows[0];
    const primerNombreLimpio = String(info.primer_nombre).trim().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const periodoVal = info.periodo || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    
    const nombrePdfDrive = `${primerNombreLimpio}-VAC-${periodoVal}.pdf`;

    const driveWebViewLink = await subirArchivoADrive(req.file, ID_CARPETA_DRIVE_VACACIONES, nombrePdfDrive);

    const sqlUpdate = `UPDATE vacaciones SET documento_firmado_url = ? WHERE id_vacacion = ?`;
    await pool.query(sqlUpdate, [driveWebViewLink, idVacacion]);

    res.json({
      success: true,
      message: '🎉 Expediente digital guardado en Google Drive y vinculado con éxito.',
      documento_firmado_url: driveWebViewLink
    });

  } catch (error) {
    console.error('❌ Error al procesar subida de expediente de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al guardar el expediente digital en Google Drive.'
    });
  }
});

router.patch('/:id/observaciones', verificarToken, verificarRol(ROLES_AUTORIZADORES), async (req, res) => {
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