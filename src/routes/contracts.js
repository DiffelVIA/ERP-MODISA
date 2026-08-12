const express = require('express');
const router = express.Router();
const fs = require('fs');
const pool = require('../config/db');
const upload = require('../middlewares/uploads');
const { subirArchivoADrive } = require('../services/drive');

router.post('/', upload.single('pdfFile'), async (req, res) => {
    const userRol = req.headers['x-user-rol'];
    const rolNormalizado = userRol ? userRol.trim().toLowerCase() : '';

    const pdfFile = req.file;

    const limpiarArchivoTemporal = () => {
        if (pdfFile && pdfFile.path && fs.existsSync(pdfFile.path)) {
            fs.unlinkSync(pdfFile.path);
        }
    };

    if (!rolNormalizado || rolNormalizado !== 'residente de obra') {
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

router.get('/', async (req, res) => {
    try {
        const sql = `
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
                c.status_direccion,  
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
                        WHERE (
                            pod_sub.id_contract = c.id_contract 
                            OR (
                                pod_sub.id_contract IS NULL 
                                AND LOWER(TRIM(pod_sub.provider)) = LOWER(TRIM(c.supplier))
                                AND (pod_sub.id_project_category = c.id_project_category OR c.id_project_category IS NULL)
                                AND (pod_sub.id_project = c.id_project OR c.id_project IS NULL)
                            )
                        )
                    ) >= c.total_amount THEN 'Pagado'
                    
                    ELSE 'Pendiente'
                END AS status,

                IFNULL((
                    SELECT SUM(IFNULL(pod_sub.monto_pagado, 0))
                    FROM payment_order_details pod_sub
                    INNER JOIN payment_orders po_sub ON po_sub.id_payment_order = pod_sub.id_payment_order
                    WHERE (
                        pod_sub.id_contract = c.id_contract 
                        OR (
                            pod_sub.id_contract IS NULL 
                            AND LOWER(TRIM(pod_sub.provider)) = LOWER(TRIM(c.supplier))
                            AND (pod_sub.id_project_category = c.id_project_category OR c.id_project_category IS NULL)
                            AND (pod_sub.id_project = c.id_project OR c.id_project IS NULL)
                        )
                    )
                ), 0) AS monto_pagado
            FROM contracts c
            LEFT JOIN projects p ON c.id_project = p.id_project
            LEFT JOIN project_categories pc ON c.id_project_category = pc.id_project_category
            ORDER BY c.id_contract DESC
        `;
        
        const [rows] = await pool.query(sql);
        res.json(rows); 

    } catch (error) {
        console.error("❌ Error crítico al obtener contratos con relaciones:", error);
        res.status(500).json({ error: "Error en la base de datos al realizar los cruces de contratos." });
    }
});

router.put('/:id/actualizar-control', async (req, res) => {
    const { id } = req.params;
    let { status, estado_costos, status_direccion, firma } = req.body;

    try {
        if (status_direccion !== 'Rechazado' && status === 'Rechazado') {
            status = 'Pendiente';
        }

        if (status_direccion !== 'Rechazado' && estado_costos === 'Rechazado') {
            estado_costos = 'Pendiente';
        }

        const estadoPagoValido = status ? (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()) : 'Pendiente';
        const estadoCostosValido = estado_costos || 'Pendiente';
        const statusDireccionValido = status_direccion || 'Pendiente';
        const firmaValida = firma || 'Pendiente';

        const sql = `
            UPDATE contracts 
            SET status = ?, estado_costos = ?, status_direccion = ?, firma = ? 
            WHERE id_contract = ?
        `;
        
        const [result] = await pool.query(sql, [
            estadoPagoValido, 
            estadoCostosValido, 
            statusDireccionValido, 
            firmaValida, 
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró el contrato especificado." });
        }

        res.json({ success: true, message: "Control del contrato actualizado con éxito." });
    } catch (error) {
        console.error("❌ Error crítico en MySQL al auto-guardar contrato:", error);
        res.status(500).json({ error: "Error interno del servidor al actualizar registro." });
    }
});

module.exports = router;