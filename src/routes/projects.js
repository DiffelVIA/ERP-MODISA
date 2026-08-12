const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// PROYECTOS //
router.get('/', async (req, res) => {
  try {
    const employeeIdHeader = req.headers['x-employee-id'];
    const userRolHeader = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim().toLowerCase() : '';
    const rolesAdministrativos = [
      'director operativo',
      'director_operativo',
      'subdirector de obra',
      'subdirector_de_obra',
      'gerente administración y compras',
      'gerente administracion y compras',
      'gerente_administracion_y_compras',
      'gerente administración',
      'gerente administracion',
      'gerente_administracion',
      'compras'
    ];

    const esRolGlobal = rolesAdministrativos.includes(userRolHeader);

    let querySQL = `
      SELECT 
        p.id_project, 
        p.project_name, 
        p.id_user,
        p.location AS direccion, 
        e.phone AS telefono,
        CONCAT(e.name, ' ', e.last_name) AS residente
      FROM projects AS p
      LEFT JOIN employees AS e ON p.id_user = e.id_employee
      WHERE p.project_name IS NOT NULL 
    `;

    const queryParams = [];

    if (employeeIdHeader && !esRolGlobal) {
      querySQL += ` AND p.id_user = ?`;
      queryParams.push(employeeIdHeader);
    }

    querySQL += ` ORDER BY p.project_name ASC;`;

    console.log("📡 Cargando proyectos. Rol:", userRolHeader || 'Sin Rol', "| IdUser:", esRolGlobal ? 'TODOS (Acceso Global)' : (employeeIdHeader || 'Todos'));
    const [rows] = await pool.query(querySQL, queryParams);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener proyectos de Aiven:', error);
    res.status(500).json({ error: error.message });
  }
});

// REGISTRO DE NUEVOS PROYECTOS
router.post('/', async (req, res) => {
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';
    const rolesPermitidos = ["Director Operativo", "Subdirector de Obra"];

    if (!rolesPermitidos.includes(rolUsuario)) {
        return res.status(403).json({ 
            success: false, 
            error: '⛔ Acceso denegado. No cuentas con los privilegios requeridos para esta acción.' 
        });
    }
    const {
        proyecto,
        responsable,
        fechaInicio,
        fechaFin,
        ubicacion
    } = req.body;

    if (!proyecto || !responsable || !fechaInicio || !fechaFin || !ubicacion) {
        return res.status(400).json({
            success: false,
            error: "Todos los campos (Proyecto, Responsable, Fecha Inicio, Fecha Fin y Ubicación) son obligatorios."
        });
    }

    try {
        const sql = `
            INSERT INTO projects 
                (project_name, id_user, start_date, finish_date, location)
            VALUES (?, ?, ?, ?, ?)
        `;

        const [resultado] = await pool.query(sql, [
            proyecto.trim(),
            parseInt(responsable),
            fechaInicio,
            fechaFin,
            ubicacion.trim()
        ]);

        res.status(201).json({
            success: true,
            message: "🎉 Proyecto registrado en la base de datos de manera exitosa.",
            id_project: resultado.insertId
        });

    } catch (error) {
        console.error("❌ Error crítico en MySQL al insertar el proyecto:", error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor al procesar el registro del proyecto.",
            details: error.message
        });
    }
});

// TABLA DE PROYECTOS CON ROLES ASIGNADOS
router.get('/report', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id_project,
                p.project_name,
                p.location,
                p.start_date,
                p.finish_date,
                p.status, -- Leemos directamente el ENUM de la base de datos, sin maquillar
                CONCAT(e.name, ' ', e.last_name) AS responsable_name
            FROM projects p
            LEFT JOIN employees e ON p.id_user = e.id_employee
            ORDER BY p.id_project DESC
        `;
        const [rows] = await pool.query(sql);
        res.json(rows);
    } catch (error) {
        console.error("❌ Error en reporte:", error);
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// Actualización de estado y fecha de finalización
router.put('/:id', async (req, res) => {
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';
    if (rolUsuario !== "Director Operativo") {
        return res.status(403).json({ 
            success: false, 
            error: '⛔ Acceso denegado. Solo el Director Operativo puede realizar modificaciones en los proyectos.' 
        });
    }
    const { id } = req.params;
    let { status, finish_date } = req.body;
    if (!finish_date) {
        return res.status(400).json({ success: false, error: "La fecha de finalización es obligatoria." });
    }
    try {
        const [proyectoActual] = await pool.query(
            'SELECT status, finish_date FROM projects WHERE id_project = ?', 
            [id]
        );
        if (proyectoActual.length === 0) {
            return res.status(404).json({ error: "El proyecto no existe." });
        }
        const datosBD = proyectoActual[0];
        const hoy = new Date();
        const formatoHoyLocal = hoy.toLocaleDateString('fr-CA', { timeZone: 'America/Mexico_City' });
        const nuevaFechaFinClean = finish_date.split('T')[0];
        const fechaFinViejaClean = datosBD.finish_date 
            ? new Date(datosBD.finish_date).toLocaleDateString('fr-CA', { timeZone: 'America/Mexico_City' })
            : '';
        const cambioLaFecha = (nuevaFechaFinClean !== fechaFinViejaClean);
        if (cambioLaFecha) {
            if (nuevaFechaFinClean >= formatoHoyLocal) {
                status = 'Active';
            } else {
                status = 'Completed';
            }
        } else {
            status = req.body.status || datosBD.status;
        }
        const sqlUpdate = `
            UPDATE projects 
            SET status = ?, finish_date = ? 
            WHERE id_project = ?
        `;
        await pool.query(sqlUpdate, [status, nuevaFechaFinClean, id]);
        res.json({ 
            success: true, 
            message: "🔄 Proyecto e inteligencia de estados sincronizados con MySQL bajo firma autorizada." 
        });
    } catch (error) {
        console.error("❌ Error crítico en la actualización automática:", error);
        res.status(500).json({ error: "No se pudo actualizar el registro debido a un error interno." });
    }
});

// Obtener contratistas de un proyecto //
router.get('/:id/contracts', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT id_contract, supplier AS contractor_name 
       FROM contracts 
       WHERE id_project = ? 
       ORDER BY supplier ASC`, 
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener contratistas de la obra:', error);
    res.status(500).json({ error: 'Error interno al cargar la lista de contratistas' });
  }
});

module.exports = router;