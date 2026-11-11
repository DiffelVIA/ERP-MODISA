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

// MODIFICACIÓN SOLUCIÓN (Ciberseguridad): Parametrización mediante variables de entorno (.env) para evitar datos hardcodeados
const CORREO_FALLBACK = process.env.GMAIL_FALLBACK_EMAIL || 'dvillalva@modisa.com.mx';
const REMITENTE_EMAIL = process.env.GMAIL_FROM_EMAIL || 'no-reply@modisa.com.mx';
const REMITENTE_NOMBRE = process.env.GMAIL_FROM_NAME || 'Notificaciones MODISA';

// MODIFICACIÓN SOLUCIÓN: Enviar correo dinámico utilizando cabecera From no-reply formal
async function enviarCorreoGmail({ to, subject, html }) {
  try {
    const destinatarioFinal = (to && typeof to === 'string' && to.includes('@')) ? to.trim() : CORREO_FALLBACK;
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    
    const messageParts = [
      `From: "${REMITENTE_NOMBRE}" <${REMITENTE_EMAIL}>`,
      `To: ${destinatarioFinal}`,
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
    console.log(`✉️ Correo enviado exitosamente desde ${REMITENTE_EMAIL} a: ${destinatarioFinal}`);
  } catch (err) {
    console.error('❌ Error al enviar correo mediante Gmail API:', err);
  }
}

async function depurarVacacionesRechazadas() {
  try {
    const sqlDelete = `
      DELETE FROM vacaciones 
      WHERE (estado = 'rechazada' OR estado_jefe = 'rechazada' OR estado_director = 'rechazada')
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

// GET / con campos de doble aprobación y fecha de solicitud
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
          NULLIF(TRIM(CONCAT(COALESCE(e.name, ''), ' ', COALESCE(e.last_name, ''))), ''),
          CONCAT('Empleado ID #', v.id_employee)
        ) AS nombre_empleado,
        e.id_manager,
        DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date,
        DATE_FORMAT(COALESCE(v.created_at, v.fecha_inicio), '%Y-%m-%d') AS fecha_solicitud,
        v.fecha_inicio,
        v.fecha_fin,
        COALESCE(v.dias_tomados, 0) AS dias_tomados,
        v.estado,
        COALESCE(v.estado_jefe, 'pendiente') AS estado_jefe,
        v.observaciones_jefe,
        COALESCE(v.estado_director, 'pendiente') AS estado_director,
        v.observaciones_director,
        v.observaciones,
        v.documento_firmado_url,
        COALESCE(ve.dias_vacaciones_ley, 0) AS dias_vacaciones_ley
      FROM vacaciones v
      INNER JOIN employees e ON e.id_employee = v.id_employee
      LEFT JOIN vista_empleados_vacaciones ve ON ve.id_employee = v.id_employee
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
      sql += ` AND (v.id_employee = ? OR e.id_manager = ?)`;
      params.push(idEmpleadoToken, idEmpleadoToken);
    }

    sql += ` ORDER BY v.id_vacacion DESC;`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);

  } catch (error) {
    console.error('❌ Error al obtener listado de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al consultar vacaciones.'
    });
  }
});

router.get('/gantt', verificarToken, async (req, res) => {
  try {
    const idEmpleadoToken = parseInt(req.usuario && req.usuario.id_employee, 10);

    if (!Number.isInteger(idEmpleadoToken) || idEmpleadoToken <= 0) {
      return res.status(403).json({
        success: false,
        error: '⛔ No se pudo identificar la credencial del empleado en la sesión.'
      });
    }

    const vista = req.query.vista === 'general' ? 'general' : 'area';

    let anio = parseInt(req.query.anio, 10);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      anio = new Date().getFullYear();
    }

    const [filasSolicitante] = await pool.query(
      'SELECT department FROM employees WHERE id_employee = ? LIMIT 1',
      [idEmpleadoToken]
    );

    if (filasSolicitante.length === 0) {
      return res.status(403).json({
        success: false,
        error: '⛔ El empleado de la sesión ya no existe en el sistema.'
      });
    }

    const area = filasSolicitante[0].department ? String(filasSolicitante[0].department).trim() : null;

    res.set('Cache-Control', 'no-store');

    if (vista === 'area' && !area) {
      return res.json({ success: true, vista, area: null, anio, datos: [] });
    }

    let sql = `
      SELECT
        v.id_vacacion,
        v.id_employee,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(e.name, ''), ' ', COALESCE(e.last_name, ''))), ''),
          CONCAT('Empleado ID #', v.id_employee)
        ) AS nombre_empleado,
        DATE_FORMAT(v.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
        DATE_FORMAT(v.fecha_fin, '%Y-%m-%d') AS fecha_fin,
        COALESCE(v.dias_tomados, 0) AS dias_tomados,
        v.estado
      FROM vacaciones v
      INNER JOIN employees e ON e.id_employee = v.id_employee
      WHERE v.estado IN ('pendiente', 'aprobada', 'autorizada')
        AND v.fecha_inicio <= ?
        AND v.fecha_fin >= ?
    `;

    const params = [`${anio}-12-31`, `${anio}-01-01`];

    if (vista === 'area') {
      sql += ` AND e.department = ?`;
      params.push(area);
    }

    sql += ` ORDER BY e.name ASC, v.fecha_inicio ASC;`;

    const [rows] = await pool.query(sql, params);

    res.json({ success: true, vista, area, anio, datos: rows });

  } catch (error) {
    console.error('❌ Error al consultar el calendario Gantt de vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener el calendario de vacaciones.'
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

// MODIFICACIÓN SOLUCIÓN: Notificación dirigida al correo del Jefe Inmediato asignado
router.post('/', verificarToken, async (req, res) => {
  if (!req.usuario) {
    return res.status(401).json({
      success: false,
      error: '⛔ Se requiere sesión activa para enviar una solicitud de vacaciones.'
    });
  }

  const { id_employee, fecha_inicio, fecha_fin, dias_tomados } = req.body;
  const idEmpleadoBruto = req.usuario.id_employee || req.usuario.id || req.usuario.userId || id_employee;
  const idEmpleadoFinal = parseInt(idEmpleadoBruto, 10);
  const diasTomadosFinal = parseInt(dias_tomados, 10);

  if (isNaN(idEmpleadoFinal) || !fecha_inicio || !fecha_fin || isNaN(diasTomadosFinal) || diasTomadosFinal <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Campos obligatorios faltantes o inválidos.'
    });
  }

  try {
    const [empRows] = await pool.query(`
      SELECT 
        TRIM(CONCAT(COALESCE(e.name, ''), ' ', COALESCE(e.last_name, ''))) AS nombre_completo,
        j.email AS correo_jefe
      FROM employees e
      LEFT JOIN employees j ON j.id_employee = e.id_manager
      WHERE e.id_employee = ? LIMIT 1
    `, [idEmpleadoFinal]);

    const nombreEmpleadoCorreo = (empRows.length > 0 && empRows[0].nombre_completo.trim())
      ? empRows[0].nombre_completo.trim()
      : `Empleado ID #${idEmpleadoFinal}`;

    const correoJefe = (empRows.length > 0 && empRows[0].correo_jefe)
      ? empRows[0].correo_jefe
      : CORREO_FALLBACK;

    const sqlInsert = `
      INSERT INTO vacaciones (
        id_employee, fecha_inicio, fecha_fin, dias_tomados, estado, estado_jefe, estado_director
      ) VALUES (?, ?, ?, ?, 'pendiente', 'pendiente', 'pendiente')
    `;

    const [insertResult] = await pool.query(sqlInsert, [idEmpleadoFinal, fecha_inicio, fecha_fin, diasTomadosFinal]);

    const htmlCorreo = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">Nueva Solicitud de Vacaciones</h2>
        <p style="font-size: 14px;">Buena tarde,</p>
        <p style="font-size: 14px;"><strong>${nombreEmpleadoCorreo}</strong>, ha registrado una nueva solicitud del <strong>${fecha_inicio}</strong> al <strong>${fecha_fin}</strong> (${diasTomadosFinal} días hábiles).</p>
        <p style="font-size: 14px;">Por favor ingresa al sistema para revisar y autorizar.</p>
      </div>
    `;

    enviarCorreoGmail({
      to: correoJefe,
      subject: 'Nueva Solicitud de Vacaciones Pendiente de Autorizar',
      html: htmlCorreo
    }).catch(err => console.error('❌ Error enviando correo:', err));

    res.status(201).json({
      success: true,
      message: '🎉 Solicitud de vacaciones registrada correctamente.',
      id_vacacion: insertResult.insertId
    });

  } catch (error) {
    console.error('❌ Error al insertar vacaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al procesar la solicitud.'
    });
  }
});

router.patch('/:id/estado', verificarToken, async (req, res) => {
  const idVacacion = req.params.id;
  const { estado, observaciones, nivel } = req.body;

  if (!estado) {
    return res.status(400).json({ success: false, error: 'El estado es obligatorio.' });
  }

  const estadoLimpio = estado.toLowerCase().trim();
  const estadoParaBD = (estadoLimpio === 'autorizada' || estadoLimpio === 'aprobada') ? 'autorizada' : (estadoLimpio === 'rechazada' ? 'rechazada' : 'pendiente');
  const comentarioFinal = (observaciones && observaciones.trim().length > 0) ? observaciones.trim() : 'Sin comentarios adicionales';

  try {
    const [filas] = await pool.query(`
      SELECT 
        v.*, 
        e.id_manager, 
        e.email AS correo_empleado,
        TRIM(CONCAT(COALESCE(e.name, ''), ' ', COALESCE(e.last_name, ''))) AS nombre_empleado
      FROM vacaciones v 
      INNER JOIN employees e ON e.id_employee = v.id_employee 
      WHERE v.id_vacacion = ?
    `, [idVacacion]);

    if (filas.length === 0) return res.status(404).json({ success: false, error: 'Solicitud no encontrada.' });

    const vac = filas[0];
    const idUsuarioSesion = req.usuario ? (req.usuario.id_employee || req.usuario.id || req.usuario.userId) : null;
    const rolUsuarioRaw = req.usuario ? (req.usuario.rol || req.usuario.role || '') : '';
    const rolLimpio = rolUsuarioRaw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const esAdminGlobal = ROLES_VISUALIZACION_GLOBAL.some(r => r.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === rolLimpio);

    const [dirRows] = await pool.query(`
      SELECT email FROM employees 
      WHERE job_title = 'Director Operativo' AND email IS NOT NULL AND email != '' 
      LIMIT 1
    `);
    const correoDirectorOperativo = (dirRows.length > 0 && dirRows[0].email) ? dirRows[0].email : CORREO_FALLBACK;

    let sqlUpdate = '';
    const params = [];

    if (nivel === 'jefe') {
      const esJefeDirecto = String(vac.id_manager) === String(idUsuarioSesion);
      if (!esJefeDirecto && !esAdminGlobal) {
        return res.status(403).json({
          success: false,
          error: '⛔ No tienes permisos para modificar el estado del Jefe Inmediato de este empleado.'
        });
      }
      sqlUpdate = `UPDATE vacaciones SET estado_jefe = ?, observaciones_jefe = ? WHERE id_vacacion = ?`;
      params.push(estadoParaBD, comentarioFinal, idVacacion);
    } else if (nivel === 'director') {
      const esDirector = ROLES_AUTORIZADORES.some(r => r.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === rolLimpio);
      if (!esDirector && !esAdminGlobal) {
        return res.status(403).json({
          success: false,
          error: '⛔ No tienes permisos de Dirección Operativa para autorizar este nivel.'
        });
      }
      sqlUpdate = `UPDATE vacaciones SET estado_director = ?, observaciones_director = ? WHERE id_vacacion = ?`;
      params.push(estadoParaBD, comentarioFinal, idVacacion);
    } else {
      sqlUpdate = `UPDATE vacaciones SET estado_jefe = ?, observaciones_jefe = ? WHERE id_vacacion = ?`;
      params.push(estadoParaBD, comentarioFinal, idVacacion);
    }

    await pool.query(sqlUpdate, params);

    const [filasActual] = await pool.query('SELECT * FROM vacaciones WHERE id_vacacion = ?', [idVacacion]);
    const vAct = filasActual[0];

    let estadoGlobal = 'pendiente';
    if (vAct.estado_jefe === 'rechazada' || vAct.estado_director === 'rechazada') {
      estadoGlobal = 'rechazada';
    } else if (
      (vAct.estado_jefe === 'autorizada' || vAct.estado_jefe === 'aprobada') && 
      (vAct.estado_director === 'autorizada' || vAct.estado_director === 'aprobada')
    ) {
      estadoGlobal = 'aprobada';
    }

    await pool.query('UPDATE vacaciones SET estado = ? WHERE id_vacacion = ?', [estadoGlobal, idVacacion]);

    const correoSolicitante = vac.correo_empleado || CORREO_FALLBACK;
    const nombreEmpleado = vac.nombre_empleado || `Empleado ID #${vac.id_employee}`;
    const fechaInicio = vac.fecha_inicio ? String(vac.fecha_inicio).split('T')[0] : '-';
    const fechaFin = vac.fecha_fin ? String(vac.fecha_fin).split('T')[0] : '-';

    if (nivel === 'jefe') {
      if (estadoParaBD === 'autorizada') {
        const htmlSolicitante = `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; max-width: 550px;">
            <h2 style="color: #2563eb; margin-top: 0;">Actualización de Solicitud</h2>
            <p>Buena tarde,</p>
            <p>Tu <strong>Jefe Inmediato</strong> ha <strong style="color: #16a34a;">AUTORIZADO</strong> tu solicitud del period vacacional (<strong>${fechaInicio}</strong> al <strong>${fechaFin}</strong>).</p>
            <p>Tu solicitud se encuentra actualmente <strong>pendiente de autorización por la Dirección Operativa</strong>.</p>
            <p style="font-size: 13px; color: #475569;">Observaciones de Jefatura: "${comentarioFinal}"</p>
          </div>
        `;
        enviarCorreoGmail({ to: correoSolicitante, subject: 'Actualización de Solicitud - Autorización de Jefe Inmediato', html: htmlSolicitante }).catch(err => console.error(err));

        const htmlDirector = `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; max-width: 550px;">
            <h2 style="color: #2563eb; margin-top: 0;">Solicitud de vacaciones pendiente</h2>
            <p>Buena tarde,</p>
            <p>El Jefe Inmediato de <strong>${nombreEmpleado}</strong> ha autorizado su solicitud de vacaciones (<strong>${fechaInicio}</strong> al <strong>${fechaFin}</strong>).</p>
            <p>Por favor ingresa al sistema para revisar y otorgar la autorización de Dirección.</p>
            <p style="font-size: 13px; color: #475569;">Observaciones del Jefe: "${comentarioFinal}"</p>
          </div>
        `;
        enviarCorreoGmail({ to: correoDirectorOperativo, subject: 'Solicitud de Vacaciones Pendiente de Autorizar (Dirección Operativa)', html: htmlDirector }).catch(err => console.error(err));

      } else if (estadoParaBD === 'rechazada') {
        const htmlSolicitanteRechazo = `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; max-width: 550px;">
            <h2 style="color: #dc2626; margin-top: 0;">Actualización de Solicitud</h2>
            <p>Buena tarde,</p>
            <p>Lamentamos informarte que tu solicitud de vacaciones (<strong>${fechaInicio}</strong> al <strong>${fechaFin}</strong>) ha sido <strong style="color: #dc2626;">RECHAZADA</strong> por tu Jefe Inmediato.</p>
            <p>Puedes ingresar al sistema para realizar una nueva solicitud atendiendo las observaciones.</p>
            <p style="font-size: 13px; color: #475569;">Observaciones del Jefe: "${comentarioFinal}"</p>
          </div>
        `;
        enviarCorreoGmail({ to: correoSolicitante, subject: 'Actualización de Solicitud - Rechazada por Jefe Inmediato', html: htmlSolicitanteRechazo }).catch(err => console.error(err));
      }

    } else if (nivel === 'director') {
      if (estadoParaBD === 'autorizada') {
        if (estadoGlobal === 'aprobada') {
          const htmlAprobadaTotal = `
            <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; max-width: 550px;">
              <h2 style="color: #16a34a; margin-top: 0;">¡Solicitud Autorizada Completamente!</h2>
              <p>Buena tarde,</p>
              <p>Te informamos que tu solicitud de vacaciones del <strong>${fechaInicio}</strong> al <strong>${fechaFin}</strong> cuenta con la <strong style="color: #16a34a;">AUTORIZACIÓN FINAL COMPLETA</strong> (Jefe Inmediato y Dirección Operativa).</p>
              <p>El departamento de Administración procederá a la impresión del formato para firma de expediente.</p>
              <p style="font-size: 13px; color: #475569;">Observaciones de Dirección: "${comentarioFinal}"</p>
            </div>
          `;
          enviarCorreoGmail({ to: correoSolicitante, subject: 'Actualización de Solicitud - Autorización Final Completa', html: htmlAprobadaTotal }).catch(err => console.error(err));
        }
      } else if (estadoParaBD === 'rechazada') {
        const htmlDirectorRechazo = `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; max-width: 550px;">
            <h2 style="color: #dc2626; margin-top: 0;">Actualización de Solicitud</h2>
            <p>Buena tarde,</p>
            <p>Te informamos que tu solicitud de vacaciones (<strong>${fechaInicio}</strong> al <strong>${fechaFin}</strong>) ha sido <strong style="color: #dc2626;">RECHAZADA</strong> por la Dirección Operativa.</p>
            <p>Puedes ingresar al sistema para coordinar y realizar una nueva solicitud atendiendo las observaciones.</p>
            <p style="font-size: 13px; color: #475569;">Observaciones de Dirección: "${comentarioFinal}"</p>
          </div>
        `;
        enviarCorreoGmail({ to: correoSolicitante, subject: 'Actualización de Solicitud - Rechazada por Dirección Operativa', html: htmlDirectorRechazo }).catch(err => console.error(err));
      }
    }

    res.json({
      success: true,
      message: `✅ Estado actualizado con éxito a '${estadoParaBD}'.`,
      estado_global: estadoGlobal
    });

  } catch (error) {
    console.error('❌ Error al actualizar estado:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
});

router.post('/:id/expediente', verificarToken, uploadMemory.single('expediente'), async (req, res) => {
  const idVacacion = req.params.id;

  if (!req.file || req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ success: false, error: 'Debe seleccionar un archivo PDF válido.' });
  }

  try {
    const driveWebViewLink = await subirArchivoADrive(req.file, ID_CARPETA_DRIVE_VACACIONES, `VAC-${idVacacion}.pdf`);
    await pool.query('UPDATE vacaciones SET documento_firmado_url = ? WHERE id_vacacion = ?', [driveWebViewLink, idVacacion]);

    res.json({ success: true, message: '🎉 Expediente digital guardado en Google Drive y vinculado con éxito.', documento_firmado_url: driveWebViewLink });
  } catch (error) {
    console.error('❌ Error al procesar expediente:', error);
    res.status(500).json({ success: false, error: 'Error al subir el expediente.' });
  }
});

module.exports = router;