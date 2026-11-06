const express = require('express');
const router = express.Router();
const fs = require('fs');
const pool = require('../config/db');
const upload = require('../middlewares/uploads');
const { subirArchivoADrive } = require('../services/drive');
const { verificarToken } = require('../middlewares/authMiddleware');
const { notificarModificacionContrato } = require('../services/whatsapp');

const { gmail } = require('../config/google');

async function enviarCorreoRechazoDireccion(idContrato, comentarioRechazo) {
  try {
    const sqlContrato = `
      SELECT 
        c.contract_key,
        c.supplier,
        COALESCE(p.project_name, 'Sin Proyecto') AS project_name,
        e_proj.email AS email_residente_proyecto,
        e_contr.email AS email_residente_contrato
      FROM contracts c
      LEFT JOIN projects p ON c.id_project = p.id_project
      LEFT JOIN employees e_proj ON p.id_user = e_proj.id_employee
      LEFT JOIN employees e_contr ON c.id_employee = e_contr.id_employee
      WHERE c.id_contract = ?
    `;

    const [rowsContrato] = await pool.query(sqlContrato, [idContrato]);
    if (rowsContrato.length === 0) return;

    const datosContrato = rowsContrato[0];

    const sqlCostos = `
      SELECT email 
      FROM employees 
      WHERE LOWER(TRIM(job_title)) LIKE '%costos%' 
         OR LOWER(TRIM(job_title)) LIKE '%gerente de costos%'
    `;

    const [rowsCostos] = await pool.query(sqlCostos);

    const correosDestino = new Set();

    if (datosContrato.email_residente_proyecto && datosContrato.email_residente_proyecto.includes('@')) {
      correosDestino.add(datosContrato.email_residente_proyecto.trim());
    }

    if (datosContrato.email_residente_contrato && datosContrato.email_residente_contrato.includes('@')) {
      correosDestino.add(datosContrato.email_residente_contrato.trim());
    }

    rowsCostos.forEach(emp => {
      if (emp.email && emp.email.includes('@')) {
        correosDestino.add(emp.email.trim());
      }
    });

    if (correosDestino.size === 0) {
      correosDestino.add('dvillalva@modisa.com.mx');
    }

    const listaDestinatarios = Array.from(correosDestino).join(', ');
    const asunto = `🚨 Contrato Rechazado: ${datosContrato.contract_key || '---'} (${datosContrato.project_name})`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
              <div style="padding: 24px;">
                  <h2 style="color: #dc2626; font-size: 18px; margin-top: 0;">⚠️ Contrato Rechazado</h2>
                  <p style="font-size: 14px; line-height: 1.5; color: #475569;">
                      Se ha actualizado el estado de la siguiente solicitud de contrato, revisa los comentarios:
                  </p>
                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                      <tr style="background-color: #f1f5f9;">
                          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; width: 40%;">Clave de Contrato:</td>
                          <td style="padding: 10px; border: 1px solid #cbd5e1;">${datosContrato.contract_key || '---'}</td>
                      </tr>
                      <tr>
                          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Proyecto:</td>
                          <td style="padding: 10px; border: 1px solid #cbd5e1;">${datosContrato.project_name}</td>
                      </tr>
                      <tr style="background-color: #f1f5f9;">
                          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Proveedor:</td>
                          <td style="padding: 10px; border: 1px solid #cbd5e1;">${datosContrato.supplier || '---'}</td>
                      </tr>
                  </table>

                  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0;">
                      <strong style="color: #991b1b; display: block; margin-bottom: 5px;">Comentarios:</strong>
                      <p style="margin: 0; color: #7f1d1d; font-size: 14px; white-space: pre-wrap;">${comentarioRechazo || 'Sin comentarios registrados.'}</p>
                  </div>

                  <p style="font-size: 12px; color: #94a3b8; margin-top: 30px; text-align: center;">
                      Este es un mensaje automático generado por el ERP MODISA, no contestar.
                  </p>
              </div>
          </div>
      </div>
    `;

    const utf8Subject = `=?utf-8?B?${Buffer.from(asunto).toString('base64')}?=`;
    const messageParts = [
      `To: ${listaDestinatarios}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      htmlContent
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
    console.log(`✉️ Correo de rechazo enviado vía Gmail API a: ${listaDestinatarios}`);
  } catch (err) {
    console.error('❌ Error al enviarle correo al Residente/Costos mediante Gmail API:', err);
  }
}

router.post('/', upload.single('pdfFile'), async (req, res) => {
    const userRol = req.headers['x-user-rol'];
    const rolNormalizado = userRol ? userRol.trim().toLowerCase() : '';

    const pdfFile = req.file;

    const limpiarArchivoTemporal = () => {
        if (pdfFile && pdfFile.path && fs.existsSync(pdfFile.path)) {
            fs.unlinkSync(pdfFile.path);
        }
    };

    const rolesPermitidos = ['residente de obra', 'director operativo', 'compras', 'gerente de costos'];
    if (!rolNormalizado || !rolesPermitidos.includes(rolNormalizado)) {
        limpiarArchivoTemporal();
        return res.status(403).json({ 
            success: false, 
            error: "⛔ Acceso denegado: Solo usuarios con rol de 'Residente de Obra' pueden registrar contratos." 
        }); 
    }

    if (!pdfFile) {
        return res.status(400).json({
            success: false,
            error: "⚠️ Debe adjuntar el archivo PDF del contrato."
        });
    }

    const {
        id_project,
        id_project_category, 
        contract_key,
        Concept,
        supplier,
        id_employee,
        start_date,
        end_date,
        total_amount
    } = req.body;

    let urlDriveContrato = null;

    try {
        const ID_CARPETA_CONTRATOS_DRIVE = '1fh2e0QGmXYrwx5GoHJHmi058FP30B_q1';
        console.log("📤 Subiendo PDF de contrato a Google Drive...");

        urlDriveContrato = await subirArchivoADrive(pdfFile, ID_CARPETA_CONTRATOS_DRIVE);
        console.log("🔗 Enlace de Contrato generado exitosamente:", urlDriveContrato);

    } catch (errDrive) {
        limpiarArchivoTemporal();
        console.error("❌ Error al subir PDF del contrato a Google Drive:", errDrive.message);
        return res.status(500).json({
            success: false,
            error: "Fallo al almacenar el PDF del contrato en Google Drive.",
            details: errDrive.message
        });
    }

    try {
        const sql = `
            INSERT INTO contracts 
                (id_project, id_project_category, contract_key, supplier, id_employee, Concept, start_date, end_date, total_amount, contract_file_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente')
        `;

        const [resultado] = await pool.query(sql, [
            id_project,
            id_project_category || null, 
            contract_key,
            supplier,
            id_employee || null,
            Concept || null, 
            start_date || null,
            end_date || null,
            total_amount || 0,
            urlDriveContrato,
        ]);

        res.status(201).json({ 
            success: true, 
            message: "🎉 Contrato guardado en la base de datos exitosamente.",
            insertId: resultado.insertId 
        });

    } catch (error) {
        console.error("❌ Error en MySQL al insertar contrato:", error);
        res.status(500).json({ 
            success: false, 
            error: "No se pudo guardar el registro en la base de datos.",
            details: error.message 
        });
    } finally {
        limpiarArchivoTemporal();
    }
});

router.get('/', verificarToken, async (req, res) => {
    try {
        const usuarioSesion = req.usuario;
        
        const userRol = usuarioSesion && usuarioSesion.rol 
            ? usuarioSesion.rol.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
            : (req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim().toLowerCase() : '');

        const employeeId = usuarioSesion 
            ? (usuarioSesion.id_employee || usuarioSesion.id_user) 
            : req.headers['x-employee-id'];

        const rolesGlobales = [
            'director operativo',
            'subdirector de obra',
            'gerente administracion',
            'gerente de administracion',
            'compras',
            'gerente de costos',
            'costos',
            'director general'
        ];

        const esRolGlobal = rolesGlobales.includes(userRol);

        // MODIFICACIÓN: Selección de c.comentarios_administracion agregada a la consulta SQL
        let sql = `
            SELECT 
                c.id_contract,
                c.contract_key,
                c.supplier,
                c.Concept,
                c.start_date,
                c.end_date,
                c.total_amount,
                c.contract_file_url,
                c.estado_costos,     
                c.comentarios_costos,
                c.status_direccion,  
                c.comentarios_direccion,
                c.comentarios_administracion,
                c.firma,
                COALESCE(p.project_name, 'Sin Proyecto') AS project_name,
                COALESCE(pc.grupo, '---') AS grupo,
                COALESCE(pc.categoria, '---') AS categoria,
                COALESCE(pc.subcategoria, '---') AS subcategoria,
                COALESCE(pc.contratos, 0) AS contratos_aut,
                CASE 
                    WHEN LOWER(TRIM(c.status)) = 'rechazado' OR LOWER(TRIM(c.status_direccion)) = 'rechazado' OR LOWER(TRIM(c.estado_costos)) = 'rechazado' THEN 'Rechazado'
                    
                    WHEN c.total_amount > 0 AND (
                        SELECT IFNULL(SUM(IFNULL(pod_sub.monto_pagado, 0)), 0)
                        FROM payment_order_details pod_sub
                        INNER JOIN payment_orders po_sub ON po_sub.id_payment_order = pod_sub.id_payment_order
                        WHERE pod_sub.id_contract = c.id_contract
                    ) >= c.total_amount THEN 'Pagado'
                    
                    ELSE 'Pendiente'
                END AS status,

                IFNULL((
                    SELECT SUM(IFNULL(pod_sub.monto_pagado, 0))
                    FROM payment_order_details pod_sub
                    INNER JOIN payment_orders po_sub ON po_sub.id_payment_order = pod_sub.id_payment_order
                    WHERE pod_sub.id_contract = c.id_contract
                ), 0) AS monto_pagado
            FROM contracts c
            LEFT JOIN projects p ON c.id_project = p.id_project
            LEFT JOIN project_categories pc ON c.id_project_category = pc.id_project_category
        `;
        
        const queryParams = [];

        if (!esRolGlobal && employeeId) {
            sql += ` WHERE (p.id_user = ? OR c.id_employee = ?)`;
            queryParams.push(employeeId, employeeId);
        }

        sql += ` ORDER BY c.id_contract DESC`;

        const [rows] = await pool.query(sql, queryParams);
        res.json(rows); 

    } catch (error) {
        console.error("❌ Error crítico al obtener contratos con relaciones:", error);
        res.status(500).json({ error: "Error en la base de datos al realizar los cruces de contratos." });
    }
});

// MODIFICACIÓN: Adición de verificarToken para protección del endpoint
router.put('/:id/actualizar-control', verificarToken, async (req, res) => {
    const { id } = req.params;
    const usuarioSesion = req.usuario;

    let { 
        status, 
        estado_costos, 
        status_direccion, 
        firma, 
        total_amount, 
        comentarios_costos,
        comentarios_direccion,
        comentarios_administracion // MODIFICACIÓN: Desestructuración del nuevo parámetro
    } = req.body;

    // CIBERSEGURIDAD: Validación estricta de rol en backend para edición del nuevo campo de administración
    const userRol = usuarioSesion && usuarioSesion.rol 
        ? usuarioSesion.rol.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
        : '';

    const rolesAutorizadosAdmin = ['gerente de costos', 'costos', 'compras', 'director operativo'];

    if (comentarios_administracion !== undefined) {
        const esAutorizado = rolesAutorizadosAdmin.some(r => userRol.includes(r));
        if (!esAutorizado) {
            return res.status(403).json({ 
                error: "⛔ Acceso denegado: Solo Costos, Compras y Director Operativo pueden modificar los comentarios de administración." 
            });
        }
    }

    try {
        const [contratoPrevio] = await pool.query(
            `SELECT c.contract_key, c.supplier, c.total_amount, p.project_name, p.whatsapp_group_jid 
             FROM contracts c
             LEFT JOIN projects p ON c.id_project = p.id_project
             WHERE c.id_contract = ?`,
            [id]
        );

        let fueRechazadoPorDireccion = false;

        if (status_direccion === 'Rechazado') {
            estado_costos = 'Rechazado';
            firma = 'Pendiente';
            status = 'Rechazado';
            fueRechazadoPorDireccion = true;
        } 
        else if (estado_costos === 'Rechazado') {
            status = 'Rechazado';
        }

        const estadoPagoValido = status ? (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()) : 'Pendiente';
        const estadoCostosValido = estado_costos || 'Pendiente';
        const statusDireccionValido = status_direccion || 'Pendiente';
        const firmaValida = firma || 'Pendiente';
        const nuevoTotal = (total_amount !== undefined && total_amount !== null) ? Number(total_amount) : null;
        const comentarioCostosValido = comentarios_costos !== undefined ? comentarios_costos : null;
        const comentarioDireccionValido = comentarios_direccion !== undefined ? comentarios_direccion : null;
        // MODIFICACIÓN: Tratamiento seguro para comentarios_administracion
        const comentarioAdministracionValido = comentarios_administracion !== undefined ? comentarios_administracion : null;

        // MODIFICACIÓN: Inclusión de comentarios_administracion en la sentencia SQL UPDATE
        const sql = `
            UPDATE contracts 
            SET status = ?, estado_costos = ?, status_direccion = ?, firma = ?, total_amount = ?, comentarios_costos = ?, comentarios_direccion = ?, comentarios_administracion = ?
            WHERE id_contract = ?
        `;
        
        const [result] = await pool.query(sql, [
            estadoPagoValido, 
            estadoCostosValido, 
            statusDireccionValido, 
            firmaValida, 
            nuevoTotal,
            comentarioCostosValido,
            comentarioDireccionValido,
            comentarioAdministracionValido,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró el contrato especificado." });
        }

        if (fueRechazadoPorDireccion) {
            enviarCorreoRechazoDireccion(id, comentarioDireccionValido);
        }

        if (contratoPrevio.length > 0 && nuevoTotal !== null) {
            const montoAnterior = Number(contratoPrevio[0].total_amount);
            if (montoAnterior !== nuevoTotal) {
                const clave = contratoPrevio[0].contract_key || `ID #${id}`;
                const targetGroupJid = contratoPrevio[0].whatsapp_group_jid;
                notificarModificacionContrato(clave, targetGroupJid);
            }
        }

        res.json({ success: true, message: "Control del contrato actualizado con éxito." });
    } catch (error) {
        console.error("❌ Error crítico en MySQL al auto-guardar contrato:", error);
        res.status(500).json({ error: "Error interno del servidor al actualizar registro." });
    }
});

router.put('/:id/actualizar-url', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { contract_file_url } = req.body;

    try {
        const [contratoPrevio] = await pool.query(
            `SELECT c.contract_key, c.contract_file_url, p.whatsapp_group_jid 
             FROM contracts c
             LEFT JOIN projects p ON c.id_project = p.id_project
             WHERE c.id_contract = ?`,
            [id]
        );

        const sql = `UPDATE contracts SET contract_file_url = ? WHERE id_contract = ?`;
        const [result] = await pool.query(sql, [contract_file_url, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: "No se encontró el contrato especificado." });
        }

        if (contratoPrevio.length > 0) {
            const urlAnterior = contratoPrevio[0].contract_file_url;
            if (urlAnterior !== contract_file_url) {
                const clave = contratoPrevio[0].contract_key || `ID #${id}`;
                const targetGroupJid = contratoPrevio[0].whatsapp_group_jid;
                notificarModificacionContrato(clave, targetGroupJid);
            }
        }
        
        res.json( { success: true, message: "Contrato Actualizado con éxito." });    
    } catch (error) {
        console.error("Error al actualizar la URL del contrato:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor al actualizar la URL del contrato."});
    }
});

router.get('/:id/saldo', async (req, res) => {
    const { id } = req.params;
    try {
        const [contrato] = await pool.query(
            `SELECT id_contract, total_amount FROM contracts WHERE id_contract = ?`, 
            [id]
        );

        if (contrato.length === 0) {
            return res.status(404).json({ error: "Contrato no encontrado" });
        }

        const [acumuladoBD] = await pool.query(
            `SELECT IFNULL(SUM(amount), 0) AS monto_solicitado_total 
             FROM payment_order_details 
             WHERE id_contract = ? AND LOWER(TRIM(IFNULL(status, ''))) != 'rechazado'`,
            [id]
        );

        res.json({
            id_contract: contrato[0].id_contract,
            total_amount: parseFloat(contrato[0].total_amount) || 0,
            monto_solicitado_total: parseFloat(acumuladoBD[0].monto_solicitado_total) || 0
        });
    } catch (error) {
        console.error("❌ Error al obtener el saldo del contrato:", error);
        res.status(500).json({ error: "Error interno al verificar saldo de contrato" });
    }
});

router.delete('/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const usuarioSesion = req.usuario;

    const userRol = usuarioSesion && usuarioSesion.rol 
        ? usuarioSesion.rol.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
        : '';

    const rolesAutorizados = ['gerente de costos', 'costos', 'residente de obra', 'residente'];

    if (!rolesAutorizados.includes(userRol)) {
        return res.status(403).json({ 
            success: false, 
            error: "⛔ Acceso denegado: Solo el Gerente de Costos y el Residente de Obra pueden eliminar contratos." 
        });
    }

    try {
        const [pagosActivos] = await pool.query(
            `SELECT COUNT(*) AS total_pagos 
             FROM payment_order_details 
             WHERE id_contract = ? AND LOWER(TRIM(IFNULL(status, ''))) != 'rechazado'`,
            [id]
        );

        if (pagosActivos[0].total_pagos > 0) {
            return res.status(400).json({
                success: false,
                error: `🔒 Bloqueo Financiero: No se puede eliminar el contrato ID #${id} porque ya cuenta con ${pagosActivos[0].total_pagos} solicitud(es) de pago registrada(s).`
            });
        }

        const [resultado] = await pool.query(`DELETE FROM contracts WHERE id_contract = ?`, [id]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ success: false, error: "El contrato no existe o ya fue eliminado previamente." });
        }

        return res.json({ 
            success: true, 
            message: `🗑️ Contrato ID #${id} eliminado correctamente de la base de datos.` 
        });

    } catch (error) {
        console.error("❌ Error al eliminar contrato:", error);
        return res.status(500).json({ 
            success: false, 
            error: "Error interno del servidor al intentar borrar el contrato.",
            details: error.message 
        });
    }
});

module.exports = router;