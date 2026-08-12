const express = require('express');
const router = express.Router();
const fs = require('fs');
const MailComposer = require('nodemailer/lib/mail-composer');
const pool = require('../config/db');
const upload = require('../middlewares/uploads');
const { subirArchivoADrive } = require('../services/drive');
const { gmail } = require('../config/google');

router.post('/', upload.any(), async (req, res) => {
  const { id_project, id_employee, request_date, fiscal_week, payment_type, payment_method, conceptos } = req.body;
  const limpiarArchivosTemporales = () => {
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (e) { /* ignorar error de eliminación  */}
        }
      });
    }
  };
  const excelFile = req.files ? req.files.find(f => f.fieldname === 'excelFile') : null;
  if (!id_project || !id_employee || !request_date || !fiscal_week || !payment_type || !payment_method) {
    limpiarArchivosTemporales();
    return res.status(400).json({ error: 'Faltan campos obligatorios en la cabecera de la solicitud.' });
  }
  if (!conceptos) {
    limpiarArchivosTemporales();
    return res.status(400).json({ error: 'No se envió ningún concepto financiero en la lista.' });
  }

  let listaConceptos = [];
  try {
    listaConceptos = JSON.parse(conceptos);
  } catch (e) {
    limpiarArchivosTemporales();
    return res.status(400).json({ error: 'El formato de los conceptos es inválido.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let primerTicketUrlHeader = null;

    const [resOrder] = await connection.query(
      `INSERT INTO payment_orders (id_project, id_employee, request_date, fiscal_week, payment_type, payment_method) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id_project, id_employee, request_date, fiscal_week, payment_type, payment_method]
    );
    const id_payment_order = resOrder.insertId;

    console.log(`📝 Insertando Cabecera de Pagos ID: #${id_payment_order}. Total conceptos a procesar: ${listaConceptos.length}`);

    const queryDetails = `
      INSERT INTO payment_order_details 
        (id_payment_order, id_project, id_project_category, id_contract, payment_type, payment_method, provider, concept_description, amount, commentary, ticket_url) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (let i = 0; i < listaConceptos.length; i++) {
      const item = listaConceptos[i];
      const comentarioLimpiado = item.commentary || item.comment || item.comentario || null;
      let ticketUrlDetalle = null;

      const archivoTicket = req.files ? req.files.find(f => f.fieldname === `ticketFile_${i}` || (i === 0 && f.fieldname === 'ticketFile')) : null;

      if (archivoTicket) {
        try {
          const ID_CARPETA_DRIVE_TARGET = '1T_WFb1LnEgzUk-eyNjv-qKW3XR5jAR1K';
          console.log(`📤 Subiendo ticket/comprobante de posición ${i} (${item.payment_type || payment_type}) hacia Google Drive...`);
          ticketUrlDetalle = await subirArchivoADrive(archivoTicket, ID_CARPETA_DRIVE_TARGET);
          console.log(`🔗 Enlace generado para ítem ${i}:`, ticketUrlDetalle);

          if (!primerTicketUrlHeader) {
            primerTicketUrlHeader = ticketUrlDetalle;
          }
        } catch (errDrive) {
          console.error(`❌ Fallo al subir ticket de la posición ${i}:`, errDrive.message);
        }
      }

      await connection.query(queryDetails, [
        id_payment_order, 
        item.id_project || id_project,
        item.id_project_category || null, 
        item.id_contract || null,
        item.payment_type || payment_type,
        item.payment_method || payment_method,
        item.provider_name || item.provider || null, 
        item.concept_description || item.concept || null, 
        item.amount, 
        comentarioLimpiado,
        ticketUrlDetalle
      ]);
    }

    if (primerTicketUrlHeader) {
      await connection.query(
        `UPDATE payment_orders SET ticket_url = ? WHERE id_payment_order = ?`,
        [primerTicketUrlHeader, id_payment_order]
      );
    }

    await connection.commit();
    console.log(`💾 ¡Éxito! Guardada solicitud de pago ID #${id_payment_order} en la nube.`);

    let datosSolicitante = { name: 'Solicitante ERP', email: process.env.GMAIL_USER };
    try {
      const [empRows] = await pool.query(
        'SELECT name, email FROM employees WHERE id_employee = ?',
        [id_employee]
      );
      if (empRows.length > 0) {
        datosSolicitante = empRows[0];
      }
    } catch (errEmp) {
      console.error("⚠️ No se pudo obtener el detalle del empleado solicitante:", errEmp.message);
    }

    (async () => {
      try {
        console.log("✉️ Enviando correo a través de la API oficial de Gmail (Googleapis)...");

        const montoTotal = listaConceptos.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
        const correoDestino = process.env.RESPONSABLE_PAGOS_EMAIL || process.env.GMAIL_USER;

        const MailComposer = require('nodemailer/lib/mail-composer');

        const adjuntos = [];
        if (excelFile) {
          let bufferExcel = null;

          if (excelFile.buffer) {
            bufferExcel = excelFile.buffer;
          } else if (excelFile.path && fs.existsSync(excelFile.path)) {
            bufferExcel = fs.readFileSync(excelFile.path);
          }

          if (bufferExcel) {
            adjuntos.push({
              filename: excelFile.originalname || `Desglose_ManoDeObra_Folio_${id_payment_order}.xlsx`,
              content: bufferExcel
            });
            console.log(`📎 Archivo Excel (${excelFile.originalname}) adjuntado correctamente al correo.`);
          } else {
            console.warn("⚠️ Se recibió referencia de excelFile pero no se pudo obtener su contenido binario.");
          }
        }

        const mail = new MailComposer({
          from: `"${datosSolicitante.name} (ERP MODISA)" <${process.env.GMAIL_USER}>`,
          replyTo: `"${datosSolicitante.name}" <${datosSolicitante.email}>`,
          to: correoDestino,
          subject: `Solicitud de Pago - Sem. ${fiscal_week}`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
              
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #e2e8f0;">
                <tr><td style="padding: 8px; font-weight: bold; background-color: #f8fafc;">Solicitante:</td><td style="padding: 8px;">${datosSolicitante.name} (&lt;${datosSolicitante.email}&gt;)</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; background-color: #f8fafc;">Tipo de Pago:</td><td style="padding: 8px;">${payment_type}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; background-color: #f8fafc;">Semana Fiscal:</td><td style="padding: 8px;">Semana ${fiscal_week}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; background-color: #f8fafc;">Fecha:</td><td style="padding: 8px;">${request_date}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; background-color: #f8fafc;">Monto Total:</td><td style="padding: 8px; color: #16a34a; font-weight: bold;">$${montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>
              </table>

              <!-- MODIFICACIÓN: Se eliminó el enlace a Google Drive (${primerTicketUrlHeader}) -->
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 20px;">
              <p style="font-size: 11px; color: #64748b;">Notificación automática del sistema ERP MODISA.</p>
            </div>
          `,
          attachments: adjuntos
        });

        const messageBuffer = await mail.compile().build();
        const encodedMessage = messageBuffer
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const responseGmail = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        });

        console.log(`📧 ¡Correo enviado con éxito mediante Gmail API! ID de mensaje: ${responseGmail.data.id}`);
      } catch (errEmail) {
        console.error("❌ Error al enviar el correo mediante Gmail API:", errEmail);
      } finally {
        limpiarArchivosTemporales();
      }
    })();

    res.json({ status: 'success', mensaje: 'Solicitud de pago guardada con éxito en la base de datos.' });

  } catch (error) {
    await connection.rollback();
    limpiarArchivosTemporales();
    console.error("❌ Error en la transacción de pagos:", error.message);
    res.status(500).json({ error: 'Error interno en el servidor de base de datos', detalle: error.message });
  } finally {
    connection.release();
  }
});

router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                po.id_payment_order AS id_payment_order,
                pod.id_payment_detail AS id_payment_detail,
                COALESCE(p_det.project_name, p.project_name, '---') AS project_name,
                DATE_FORMAT(po.request_date, '%Y-%m-%d') AS request_date,
                po.fiscal_week,
                IFNULL(pod.payment_type, po.payment_type) AS payment_type,
                IFNULL(pod.payment_method, po.payment_method) AS payment_method,
                COALESCE(pod.ticket_url, po.ticket_url) AS ticket_url,
                pod.commentary AS commentary,
                pod.commentary AS resident_comment,
                pod.compras_comment AS compras_comment,
                COALESCE(pc.grupo, c_pc.grupo, '---') AS grupo,
                COALESCE(pc.categoria, c_pc.categoria, '---') AS categoria,
                COALESCE(pc.subcategoria, c_pc.subcategoria, '---') AS subcategoria,
                
                IFNULL(
                    CASE 
                        WHEN LOWER(TRIM(IFNULL(pod.payment_type, po.payment_type))) IN ('contratista') 
                            THEN COALESCE(pc.contratos, c_pc.contratos, 0)
                        WHEN LOWER(TRIM(IFNULL(pod.payment_type, po.payment_type))) IN ('manoobra', 'mano de obra') 
                            THEN COALESCE(pc.mano_obra, c_pc.mano_obra, 0)
                        WHEN LOWER(TRIM(IFNULL(pod.payment_type, po.payment_type))) IN ('material', 'materiales') 
                            THEN COALESCE(pc.materiales, c_pc.materiales, 0)
                        WHEN LOWER(TRIM(IFNULL(pod.payment_type, po.payment_type))) IN ('maquinariaequipo', 'maquinaria y equipo') 
                            THEN COALESCE(pc.maquinaria_equipo, c_pc.maquinaria_equipo, 0)
                        ELSE COALESCE(pc.total, c_pc.total, 0)
                    END, 0
                ) AS presupuesto_autorizado,

                pod.provider AS provider,
                pod.concept_description AS concept_description,
                pod.amount AS amount,
                pod.status AS status,
                IFNULL(pod.monto_pagado, 0) AS monto_pagado,
                c.firma AS contrato_firma,
                c.start_date AS contrato_fecha_registro
            FROM payment_orders po
            INNER JOIN payment_order_details pod ON po.id_payment_order = pod.id_payment_order
            LEFT JOIN projects p ON po.id_project = p.id_project
            LEFT JOIN projects p_det ON pod.id_project = p_det.id_project
            LEFT JOIN project_categories pc ON pod.id_project_category = pc.id_project_category

            LEFT JOIN (
                SELECT 
                    id_contract,
                    LOWER(TRIM(supplier)) AS supplier_clean,
                    id_project_category,
                    firma,
                    start_date,
                    ROW_NUMBER() OVER (
                        PARTITION BY LOWER(TRIM(supplier)), IFNULL(id_project_category, 0) 
                        ORDER BY start_date DESC
                    ) AS rn
                FROM contracts
            ) c ON (
                (pod.id_contract IS NOT NULL AND c.id_contract = pod.id_contract)
                OR 
                (
                    pod.id_contract IS NULL 
                    AND c.supplier_clean = LOWER(TRIM(pod.provider)) 
                    AND pod.id_project_category IS NOT NULL 
                    AND c.id_project_category = pod.id_project_category 
                    AND c.rn = 1
                )
            )

            LEFT JOIN project_categories c_pc ON c.id_project_category = c_pc.id_project_category
            ORDER BY po.id_payment_order DESC;
        `;

        const [results] = await pool.query(query);
        res.json(results);

    } catch (err) {
        console.error("❌ Error en la consulta SQL detallada de pagos:", err);
        res.status(500).json({ error: "Error interno del servidor al consultar pagos", detalle: err.message });
    }
});

router.put('/:id/monto-pagado', async (req, res) => {
    try {
        const idPaymentDetail = req.params.id;
        const { monto_pagado, compras_comment } = req.body;

        if (!idPaymentDetail || idPaymentDetail === 'undefined') {
            return res.status(400).json({ error: "El ID del detalle de pago no es válido." });
        }

        if (monto_pagado !== undefined) {
            const nuevoMonto = parseFloat(monto_pagado) || 0;

            const [contratoInfo] = await pool.query(
                `SELECT c.firma, c.start_date 
                 FROM payment_order_details pod
                 INNER JOIN contracts c ON LOWER(TRIM(c.supplier)) = LOWER(TRIM(pod.provider))
                 WHERE pod.id_payment_detail = ? LIMIT 1`,
                [idPaymentDetail]
            );

            if (contratoInfo.length > 0 && contratoInfo[0].start_date) {
                const firma = contratoInfo[0].firma ? contratoInfo[0].firma.trim().toLowerCase() : 'pendiente';
                const esFirmado = (firma === 'firmado' || firma === 'sí' || firma === 'si');
                
                if (!esFirmado) {
                    const fechaContrato = new Date(contratoInfo[0].start_date);
                    const fechaActual = new Date();
                    fechaContrato.setHours(0, 0, 0, 0);
                    fechaActual.setHours(0, 0, 0, 0);
                    
                    const diferenciaDias = Math.floor((fechaActual - fechaContrato) / (1000 * 60 * 60 * 24));
                    
                    if (diferenciaDias >= 7) {
                        return res.status(403).json({ 
                            error: `Bloqueo Financiero: El contrato asociado tiene ${diferenciaDias} días sin firmar. Captura deshabilitada.` 
                        });
                    }
                }
            }

            const [detalle] = await pool.query(
                `SELECT amount, id_payment_order FROM payment_order_details WHERE id_payment_detail = ?`,
                [idPaymentDetail]
            );

            if (detalle.length === 0) {
                return res.status(404).json({ error: "No se encontró el detalle de pago." });
            }

            const montoTotalConcepto = parseFloat(detalle[0].amount) || 0;
            const idOrdenCabecera = detalle[0].id_payment_order;

            let nuevoStatus = 'Pendiente';
            if (montoTotalConcepto > 0 && nuevoMonto >= (montoTotalConcepto - 0.01)) {
                nuevoStatus = 'Pagado';
            }

            const updateDetailQuery = `
                UPDATE payment_order_details 
                SET monto_pagado = ?, status = ?
                WHERE id_payment_detail = ?
            `;
            await pool.query(updateDetailQuery, [nuevoMonto, nuevoStatus, idPaymentDetail]);

            const [pendientes] = await pool.query(
                `SELECT COUNT(*) AS incompletos FROM payment_order_details WHERE id_payment_order = ? AND status != 'Pagado'`,
                [idOrdenCabecera]
            );

            const statusCabecera = pendientes[0].incompletos === 0 ? 'Pagado' : 'Pendiente';
            await pool.query(
                `UPDATE payment_orders SET status = ? WHERE id_payment_order = ?`,
                [statusCabecera, idOrdenCabecera]
            );

            return res.json({ 
                success: true, 
                message: `Monto individual y estado (${nuevoStatus}) actualizados correctamente.`,
                status: nuevoStatus
            });
        }

        if (compras_comment !== undefined) {
            const updateCommentQuery = `
                UPDATE payment_order_details 
                SET compras_comment = ?
                WHERE id_payment_detail = ?
            `;
            await pool.query(updateCommentQuery, [compras_comment.trim(), idPaymentDetail]);

            return res.json({ 
                success: true, 
                message: `Comentario de compras actualizado correctamente para el detalle.`
            });
        }

        return res.status(400).json({ error: "No se proporcionaron campos para actualizar." });

    } catch (err) {
        console.error("❌ Error crítico en el servidor al actualizar detalle de pago:", err);
        res.status(500).json({ error: `Error interno del servidor: ${err.message}` });
    }
});

module.exports = router;