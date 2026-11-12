const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// MODIFICACIÓN SOLUCIÓN (Ciberseguridad): Validar formato oficial de JID de grupo de WhatsApp (@g.us)
const validarWhatsappGroupJid = (jid) => {
  if (jid === undefined || jid === null || String(jid).trim() === '') {
    return { valido: true, valor: null };
  }
  const limpio = String(jid).trim();
  const regexGrupo = /^[0-9-]+@g\.us$/;
  if (!regexGrupo.test(limpio) || limpio.length > 100) {
    return {
      valido: false,
      error: 'El ID del grupo de WhatsApp debe tener el formato válido (ej. 120363XXXXXXXXXX@g.us).'
    };
  }
  return { valido: true, valor: limpio };
};

// MODIFICACIÓN SOLUCIÓN (Ciberseguridad): Extraer identidad verificada desde JWT si está presente, manteniendo compatibilidad con headers existentes
const obtenerContextoUsuario = (req) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secreto_fallback_temp');
      return {
        rol: decoded.rol ? String(decoded.rol).trim() : '',
        idEmpleado: decoded.id_employee || decoded.id_user || null
      };
    } catch (err) {
      // Si el token expiró o es inválido, se continúa con los headers de respaldo para no romper clientes legados
    }
  }
  return {
    rol: req.headers['x-user-rol'] ? String(req.headers['x-user-rol']).trim() : '',
    idEmpleado: req.headers['x-employee-id'] || null
  };
};

// PROYECTOS //
router.get('/', async (req, res) => {
  try {
    const contexto = obtenerContextoUsuario(req);
    const employeeIdHeader = contexto.idEmpleado;
    const userRolHeader = contexto.rol.toLowerCase();
    const rolesAdministrativos = [
      'director operativo',
      'subdirector de obra',
      'gerente administración',
      'compras',
      'gerente de costos',
      'director general'
    ];

    const esRolGlobal = rolesAdministrativos.includes(userRolHeader);

    // MODIFICACIÓN SOLUCIÓN: Incluir p.whatsapp_group_jid en la consulta de proyectos
    let querySQL = `
      SELECT 
        p.id_project, 
        p.project_name, 
        p.id_user,
        p.location AS direccion, 
        p.whatsapp_group_jid,
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
    const contexto = obtenerContextoUsuario(req);
    const rolUsuario = contexto.rol;
    const rolesPermitidos = ["Director Operativo", "Subdirector de Obra", "Compras", "Gerente de Costos", "Gerente de Administración", "Director General"];

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
        ubicacion,
        whatsapp_group_jid
    } = req.body;

    if (!proyecto || !responsable || !fechaInicio || !fechaFin || !ubicacion) {
        return res.status(400).json({
            success: false,
            error: "Todos los campos (Proyecto, Responsable, Fecha Inicio, Fecha Fin y Ubicación) son obligatorios."
        });
    }

    // MODIFICACIÓN SOLUCIÓN: Validar formato del grupo de WhatsApp si se envía al crear el proyecto
    const validacionJid = validarWhatsappGroupJid(whatsapp_group_jid);
    if (!validacionJid.valido) {
        return res.status(400).json({
            success: false,
            error: validacionJid.error
        });
    }

    try {
        const sql = `
            INSERT INTO projects 
                (project_name, id_user, start_date, finish_date, location, whatsapp_group_jid)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [resultado] = await pool.query(sql, [
            proyecto.trim(),
            parseInt(responsable),
            fechaInicio,
            fechaFin,
            ubicacion.trim(),
            validacionJid.valor
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
        // MODIFICACIÓN SOLUCIÓN: Exponer p.whatsapp_group_jid en el reporte de proyectos
        const sql = `
            SELECT 
                p.id_project,
                p.project_name,
                p.id_user, -- Se agrega id_user para mantener el ID del responsable asignado
                p.location,
                p.start_date,
                p.finish_date,
                p.status,
                p.whatsapp_group_jid,
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
    const contexto = obtenerContextoUsuario(req);
    const rolUsuario = contexto.rol;
    if (rolUsuario !== "Director Operativo") {
        return res.status(403).json({ 
            success: false, 
            error: '⛔ Acceso denegado. Solo el Director Operativo puede realizar modificaciones en los proyectos.' 
        });
    }
    const { id } = req.params;
    let { status, finish_date, id_user, whatsapp_group_jid } = req.body;

    if (!finish_date) {
        return res.status(400).json({ success: false, error: "La fecha de finalización es obligatoria." });
    }

    // MODIFICACIÓN SOLUCIÓN: Validar whatsapp_group_jid si viene en la petición de actualización
    if (whatsapp_group_jid !== undefined) {
        const validacionJid = validarWhatsappGroupJid(whatsapp_group_jid);
        if (!validacionJid.valido) {
            return res.status(400).json({ success: false, error: validacionJid.error });
        }
        whatsapp_group_jid = validacionJid.valor;
    }

    try {
        const [proyectoActual] = await pool.query(
            'SELECT status, finish_date, id_user, whatsapp_group_jid FROM projects WHERE id_project = ?', 
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

        const nuevoResponsableId = (id_user !== undefined && id_user !== '') ? parseInt(id_user, 10) : datosBD.id_user;
        const nuevoWhatsappJid = (whatsapp_group_jid !== undefined) ? whatsapp_group_jid : datosBD.whatsapp_group_jid;

        const sqlUpdate = `
            UPDATE projects 
            SET status = ?, finish_date = ?, id_user = ?, whatsapp_group_jid = ? 
            WHERE id_project = ?
        `;
        await pool.query(sqlUpdate, [status, nuevaFechaFinClean, nuevoResponsableId, nuevoWhatsappJid, id]);
        res.json({ 
            success: true, 
            message: "🔄 Proyecto, fecha y responsable actualizados con éxito en MySQL." 
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