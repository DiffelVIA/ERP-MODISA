const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const verificarGerenteCostos = (req, res, next) => {
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';

    const rolesPermitidos = ["Gerente de Costos", "Director Operativo", "compras"];

    if (!rolesPermitidos.includes(rolUsuario)) {
        return res.status(403).json({ 
            success: false, 
            error: "⛔ Acceso denegado. Este endpoint es confidencial y solo permite modificaciones por el Gerente de Costos o la Dirección Operativa." 
        });
    }
    next(); 
};

router.get('/proyectos/:id/categorias', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT id_project_category, grupo, categoria, subcategoria FROM project_categories WHERE id_project = ?`, 
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener categorías del proyecto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/project-categories/:id_project', async (req, res) => {
    const idProject = req.params.id_project;
    let connection;

    try {
        connection = await pool.getConnection();
        const query = `
            SELECT 
                pc.id_project_category,
                pc.grupo,
                pc.categoria,
                pc.subcategoria,
                
                COALESCE(pc.mano_obra, 0) AS mano_obra_aut,
                COALESCE(pc.materiales, 0) AS materiales_aut,
                COALESCE(pc.maquinaria_equipo, 0) AS maquinaria_aut,
                COALESCE(pc.contratos, 0) AS contratos_aut,
                COALESCE(pc.total, 0) AS total_aut,

                COALESCE(mat.total_mat, 0) AS materiales_ejecutado,
                COALESCE(pag.pagado_mano_obra, 0) AS mano_obra_ejecutado,
                COALESCE(pag.pagado_maquinaria, 0) AS maquinaria_ejecutado,
                COALESCE(pag.pagado_contratos, 0) AS contratos_ejecutado,
                COALESCE(pag.pagado_materiales_extra, 0) AS materiales_pagos_extra

            FROM project_categories pc

            LEFT JOIN (
                SELECT 
                    id_project_category,
                    SUM(COALESCE(quoted_amount, (quantity * unit_price), 0)) AS total_mat
                FROM order_details
                WHERE LOWER(COALESCE(status, '')) IN ('comprado')
                GROUP BY id_project_category
            ) mat ON pc.id_project_category = mat.id_project_category

            LEFT JOIN (
                SELECT 
                    COALESCE(pod.id_project_category, c.id_project_category) AS id_category,
                    
                    SUM(CASE 
                        WHEN (LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%mano%'
                           OR LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%manoobra%')
                        THEN IFNULL(pod.monto_pagado, 0) ELSE 0 
                    END) AS pagado_mano_obra,
                    
                    SUM(CASE 
                        WHEN (LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%maquinaria%'
                           OR LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%equipo%')
                        THEN IFNULL(pod.monto_pagado, 0) ELSE 0 
                    END) AS pagado_maquinaria,
                    
                    SUM(CASE 
                        WHEN (LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%contrat%'
                           OR LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%subcontrat%'
                           OR LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%destajo%'
                           OR LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%servicio%')
                        THEN IFNULL(pod.monto_pagado, 0) ELSE 0 
                    END) AS pagado_contratos,
                    
                    SUM(CASE 
                        WHEN (LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%material%' 
                           OR LOWER(COALESCE(pod.payment_type, po.payment_type, '')) LIKE '%caja%')
                        THEN IFNULL(pod.monto_pagado, 0) ELSE 0 
                    END) AS pagado_materiales_extra

                FROM payment_order_details pod
                INNER JOIN payment_orders po ON pod.id_payment_order = po.id_payment_order
                LEFT JOIN contracts c ON c.id_contract = pod.id_contract

                WHERE IFNULL(pod.monto_pagado, 0) > 0
                  AND COALESCE(pod.id_project_category, c.id_project_category) IS NOT NULL
                GROUP BY COALESCE(pod.id_project_category, c.id_project_category)
            ) pag ON pc.id_project_category = pag.id_category

            WHERE pc.id_project = ?
            ORDER BY pc.grupo ASC, pc.categoria ASC, pc.subcategoria ASC;
        `;

        const [rows] = await connection.query(query, [idProject]);
        res.json(rows);

    } catch (error) {
        console.error("❌ ERROR EN BASE DE DATOS:", error);
        res.status(500).json({ 
            error: "Error en respuesta de base de datos", 
            message: error.sqlMessage || error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/upload-hierarchy', verificarGerenteCostos, async (req, res) => {
    const { id_project, csvData } = req.body;
    if (!id_project || !csvData) return res.status(400).json({ error: "Faltan parámetros requeridos." });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const lineas = csvData.split(/\r?\n/).filter(line => line.trim() !== "");
        const primeraLinea = lineas[0].toLowerCase();
        const inicioIndex = (primeraLinea.includes("proyecto") || primeraLinea.includes("grupo") || primeraLinea.includes("categor")) ? 1 : 0;

        const sqlInsert = `
            INSERT IGNORE INTO project_categories 
            (id_project, grupo, categoria, subcategoria, mano_obra, materiales, maquinaria_equipo, contratos, total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (let i = inicioIndex; i < lineas.length; i++) {
            const columnas = lineas[i].split(',').map(col => col.trim());
            if (columnas.length < 3) continue;

            const grupo = columnas[1];       
            const categoria = columnas[2];   
            let subcategoria = columnas[3] || null;
            if (subcategoria === "") subcategoria = null;

            if (!grupo || !categoria) continue;

            await connection.query(sqlInsert, [
                id_project, grupo, categoria, subcategoria,
                parseFloat(columnas[4]) || 0, parseFloat(columnas[5]) || 0,
                parseFloat(columnas[6]) || 0, parseFloat(columnas[7]) || 0, parseFloat(columnas[8]) || 0
            ]);
        }
        await connection.commit();
        res.json({ success: true, message: "Matriz de presupuestos guardada exitosamente." });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Error en Bulk Upload:", error);
        res.status(500).json({ error: "Error interno en la carga masiva." });
    } finally {
        connection.release();
    }
});

router.post('/project-categories', verificarGerenteCostos, async (req, res) => {
    const { id_project, grupo, categoria, subcategoria, mano_obra, materiales, maquinaria_equipo, contratos, total } = req.body;
    if (!id_project || !grupo || !categoria) return res.status(400).json({ error: "Campos obligatorios incompletos." });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const sqlInsert = `INSERT IGNORE INTO project_categories (id_project, grupo, categoria, subcategoria, mano_obra, materiales, maquinaria_equipo, contratos, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await connection.query(sqlInsert, [id_project, grupo.trim(), categoria.trim(), subcategoria || null, parseFloat(mano_obra) || 0, parseFloat(materiales) || 0, parseFloat(maquinaria_equipo) || 0, parseFloat(contratos) || 0, parseFloat(total) || 0]);
        await connection.commit();
        res.json({ success: true, message: "Categoría guardada con éxito." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: "Error al insertar categoría de forma manual." });
    } finally {
        connection.release();
    }
});

router.put('/project-categories/:id', verificarGerenteCostos, async (req, res) => {
    const idCategory = req.params.id;
    const { grupo, categoria, subcategoria, mano_obra, materiales, maquinaria_equipo, contratos, total } = req.body;

    if (!grupo || !categoria) return res.status(400).json({ error: "Campos obligatorios faltantes." });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const sqlUpdate = `UPDATE project_categories SET grupo = ?, categoria = ?, subcategoria = ?, mano_obra = ?, materiales = ?, maquinaria_equipo = ?, contratos = ?, total = ? WHERE id_project_category = ?`;
        await connection.query(sqlUpdate, [grupo.trim(), categoria.trim(), subcategoria || null, parseFloat(mano_obra) || 0, parseFloat(materiales) || 0, parseFloat(maquinaria_equipo) || 0, parseFloat(contratos) || 0, parseFloat(total) || 0, idCategory]);
        await connection.commit();
        res.json({ success: true, message: "Registro financiero actualizado." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: "Error al actualizar la categoría." });
    } finally {
        connection.release();
    }
});

router.delete('/project-categories/:id', verificarGerenteCostos, async (req, res) => {
    const idCategory = req.params.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(`DELETE FROM project_categories WHERE id_project_category = ?`, [idCategory]);
        await connection.commit();
        res.json({ success: true, message: "Renglón presupuestal eliminado." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: "Error interno al procesar borrado." });
    } finally {
        connection.release();
    }
});

router.get('/projects-active', async (req, res) => {
  try {
    const querySQL = `
      SELECT id_project, project_name 
      FROM projects 
      WHERE project_name IS NOT NULL 
      ORDER BY project_name ASC;
    `;

    const [rows] = await pool.query(querySQL);
    res.json(rows);
  } catch (error) {
    console.error('❌ Error al obtener proyectos activos:', error);
    res.status(500).json({ error: 'Error interno al consultar los proyectos activos.' });
  }
});

module.exports = router;