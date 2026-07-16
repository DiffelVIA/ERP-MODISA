require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// DRIVE //

const multer = require('multer');
const { google } = require('googleapis');

const credentialsPath = path.join(__dirname, 'credentials.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath));
const { client_id, client_secret, redirect_uris } = credentials.web;

const redirectUri = process.env.NODE_ENV === 'production' 
  ? 'https://erp-modisa.onrender.com'
  : redirect_uris[0];

const oauth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirectUri
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function subirArchivoADrive(fileObject, idCarpetaDrive) {
  try {
    const fileMetadata = {
      name: Date.now() + path.extname(fileObject.originalname),
      parents: [idCarpetaDrive],
    };

    const media = {
      mimeType: fileObject.mimetype,
      body: fs.createReadStream(fileObject.path),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    if (fs.existsSync(fileObject.path)) {
      fs.unlinkSync(fileObject.path);
    }

    return response.data.webViewLink;
  } catch (error) {
    console.error("❌ Error interno en la subida a Google Drive API:", error);
    throw error;
  }
}

// =========================================================================================
// CONEXIÓN A MYSQL
// =========================================================================================

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, 'ca.pem'))
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// =========================================================================================
// REGISTRO DE NUEVOS PROYECTOS
// =========================================================================================
app.post('/api/projects', async (req, res) => {
    // 🛡️ CONTROL DE ACCESO BACKEND: Validación estricta multi-rol
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

    // Validación de integridad de los datos entrantes
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

// ==========================================
// TABLA DE PROYECTOS CON ROLES ASIGNADOS
// ==========================================
app.get('/api/projects-report', async (req, res) => {
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

app.put('/api/projects/:id', async (req, res) => {
    // 🛡️ CONTROL DE ACCESO BACKEND: Validación estricta de Rol
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';

    if (rolUsuario !== "Director Operativo") {
        return res.status(403).json({ 
            success: false, 
            error: '⛔ Acceso denegado. Solo el Director Operativo puede realizar modificaciones en los proyectos.' 
        });
    }

    const { id } = req.params;
    let { status, finish_date } = req.body;

    // 🩹 Salvavidas técnico: Validar que la fecha realmente exista antes de procesarla
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

        // 🧠 Mantiene tu increíble lógica de negocio automatizada
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

// =========================================================================================
// MULTER
// =========================================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) =>{
    const dir = './uploads';
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }
    cb(null,dir);
  },
  filename: (req, file, cb) =>{
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// PROYECTOS //

// 📌 GET /api/proyectos/:id/contratos (Trae los contratistas asignados a una obra específica)
app.get('/api/proyectos/:id/contracts', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT id_contract, contractor_name 
       FROM contracts 
       WHERE id_project = ? AND status = 'Activo' 
       ORDER BY contractor_name ASC`, 
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener contratistas de la obra:', error);
    res.status(500).json({ error: 'Error interno al cargar la lista de contratistas' });
  }
});

// MINUTAS //
app.get('/api/tabla_minutas', async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const hoyFormateado = `${anio}-${mes}-${dia}`;

    console.log("Revisando actividades vencidas para la fecha local:", hoyFormateado);

    // 1. Actualizar las tareas que ya vencieron automáticamente
    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado != 'completada' AND estado != 'atrasada' AND estado != 'aplazada'
    `, [hoyFormateado]);

    // 🔥 NUEVA LÓGICA DE LIMPIEZA: Borrar minutas completadas hace más de 4 semanas
    console.log("Ejecutando limpieza periódica de minutas completadas antiguas...");
    await pool.query(`
      DELETE FROM minutas 
      WHERE estado = 'completada' AND fecha < NOW() - INTERVAL 5 WEEK
    `);

    const querySQL = `
      SELECT id, proyecto, avance, responsable, semana, fecha, descripcion, estado, comentarioDirector 
      FROM minutas 
      ORDER BY fecha ASC;
    `;

    console.log("!!! EJECUTANDO CONSULTA SEGURA DE MINUTAS !!!");

    const [filas] = await pool.query(querySQL);
    console.log(`Se encontraron ${filas.length} minutas.`);
    
    // Devolvemos la respuesta al frontend
    res.json(filas);

  } catch (error) {
    console.error('Error crítico dentro de GET /api/tabla_minutas:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar minutas', detalle: error.message });
  }
});

app.post('/api/tabla_minutas', async (req, res) => {
  const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';
  if (rolUsuario !== "Director Operativo") {
    return res.status(403).json({ error: '⛔ Acceso denegado'});
  }

  const minutas = req.body;
  const listaMinutas = Array.isArray(minutas) ? minutas : [minutas];

  try {
    // MEJOR PRÁCTICA: Procesar de forma controlada y segura para capturar errores de forma síncrona
    for (const item of listaMinutas) {
      
      // 1. Validar si la actividad ya está registrada para obtener su histórico
      const [registroPrevio] = await pool.query(
        'SELECT fecha, semana, estado, comentarioDirector FROM minutas WHERE id = ?', 
        [item.id]
      );
      
      let comentarioFinal = item.comentarioDirector || item.comentariodirector || '';
      let fechaDestino = item.fecha ? item.fecha.split('T')[0] : new Date().toISOString().split('T')[0];
      let semanaOriginal;

      if (registroPrevio.length > 0) {
        // --- REGLAS PARA REGISTROS EXISTENTES ---
        const datosOriginales = registroPrevio[0];

        // Bloquear la semana fiscal de origen
        semanaOriginal = datosOriginales.semana;

        // Si se cambia cualquier dato pero NO es aplazada, se respeta la fecha que ya estaba en BD
        if (item.estado !== 'aplazada') {
          fechaDestino = datosOriginales.fecha ? new Date(datosOriginales.fecha).toISOString().split('T')[0] : fechaDestino;
        }

        // LÓGICA DE DÍAS RETRASADOS AL COMPLETAR
        if (item.estado === 'completada' && datosOriginales.estado !== 'completada') {
          const fechaLimiteOriginal = new Date(datosOriginales.fecha);
          const fechaCompletadoHoy = new Date();

          fechaLimiteOriginal.setHours(0, 0, 0, 0);
          fechaCompletadoHoy.setHours(0, 0, 0, 0);

          if (fechaCompletadoHoy > fechaLimiteOriginal) {
            const diferenciaMilisegundos = fechaCompletadoHoy.getTime() - fechaLimiteOriginal.getTime();
            const diasRetrasados = Math.floor(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
            
            const prefijoRetraso = `⚠️ Esta actividad se completó con ${diasRetrasados} días retrasados.`;

            if (comentarioFinal) {
              if (!comentarioFinal.includes(`con ${diasRetrasados} días retrasados`)) {
                comentarioFinal = `${comentarioFinal} | ${prefijoRetraso}`;
              }
            } else {
              comentarioFinal = prefijoRetraso;
            }
          }
        }
      } else {
        // --- REGLAS PARA NUEVOS REGISTROS ---
        if (item.semana !== undefined && item.semana !== null && !isNaN(Number(item.semana)) && Number(item.semana) !== 0) {
          semanaOriginal = Number(item.semana);
        } else {
          const fechaHoy = new Date();
          const primeraFechaAnio = new Date(fechaHoy.getFullYear(), 0, 1);
          const diasPasados = Math.floor((fechaHoy - primeraFechaAnio) / (1000 * 60 * 60 * 24));
          semanaOriginal = Math.ceil((diasPasados + primeraFechaAnio.getDay() + 1) / 7);
        }
      }

      // MEJOR PRÁCTICA: Evitar VALUES() ambiguos en ON DUPLICATE KEY UPDATE asignando parámetros limpios
      const querySQL = `
        INSERT INTO minutas (id, proyecto, avance, responsable, semana, fecha, descripcion, estado, comentarioDirector)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          estado = ?,
          comentarioDirector = ?,
          proyecto = ?,
          avance = ?,
          responsable = ?,
          fecha = ?, 
          descripcion = ?;
      `;

      const valoresControlados = [
        item.id, 
        item.proyecto, 
        item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0, 
        item.responsable, 
        semanaOriginal, 
        fechaDestino, 
        item.descripcion, 
        item.estado, 
        comentarioFinal, // Para el INSERT inicial
        // Valores explícitos para el UPDATE (Previene fallas de mapeo atómico):
        item.estado,
        comentarioFinal,
        item.proyecto,
        item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0,
        item.responsable,
        fechaDestino,
        item.descripcion
      ];

      // Ejecutar y esperar de manera segura dentro del bloque try/catch
      await pool.query(querySQL, valoresControlados);
    }

    res.json({ mensaje: 'Minutas sincronizadas con éxito en Aiven' });
  } catch (error) {
    console.error('Error crítico controlado en el guardado de minutas:', error);
    res.status(500).json({ error: 'Error al persistir minutas en la base de datos', detalle: error.message });
  }
});

// EMPLEADOS //

app.get('/api/empleados', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_employee, name, last_name FROM employees ORDER BY name ASC;');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener empleados de Aiven:', error);
    res.status(500).json({ error: error.message });
  }
});

// PROYECTOS //

app.get('/api/proyectos', async (req, res) => {
  try {
    const querySQL = `
      SELECT 
        p.id_project, 
        p.project_name, 
        p.location AS direccion, 
        e.phone AS telefono,
        CONCAT(e.name, ' ', e.last_name) AS residente
      FROM projects AS p
      LEFT JOIN employees AS e ON p.id_user = e.id_employee
      WHERE p.project_name IS NOT NULL 
      ORDER BY p.project_name ASC;
    `;

    console.log("📡 Cargando proyectos con sus datos de contacto y ubicación...");
    const [rows] = await pool.query(querySQL);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener proyectos de Aiven:', error);
    res.status(500).json({ error: error.message });
  }
});

// MATERIALES //

app.get('/api/materiales', async (req, res) => {
  try {
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim().toLowerCase() : '';
    
    // MODIFICADO: Agregamos subconsultas para obtener el presupuesto autorizado de materiales 
    // y la suma de lo que ya se ha cotizado/comprado de esa categoría en este proyecto.
    const querySQL = `
      SELECT 
        od.id_detail,
        CONCAT(e.name, ' ', e.last_name) AS solicitante,
        e.phone AS telefono,
        p.project_name AS obra,
        mo.id_project,
        od.id_project_category,
        mo.order_date,
        mo.fiscal_week,
        pc.grupo,
        pc.categoria,
        pc.subcategoria,
        od.material_description,
        od.unit,
        od.quantity,
        od.commentary,
        od.provider AS proveedor,
        od.reference AS referencia,
        od.unit_price AS precio_unitario,
        LOWER(od.status) AS estado,
        
        -- Presupuesto asignado a la subcategoría (columna 'materiales')
        COALESCE(pc.materiales, 0.00) AS presupuesto_autorizado,
        
        -- Suma de todo lo cotizado/comprado de esta subcategoría en este proyecto (excluyendo el detalle actual)
        COALESCE((
          SELECT SUM(sub_od.quantity * sub_od.unit_price)
          FROM order_details AS sub_od
          INNER JOIN material_orders AS sub_mo ON sub_od.id_order = sub_mo.id_order
          WHERE sub_mo.id_project = mo.id_project
            AND sub_od.id_project_category = od.id_project_category
            AND sub_od.id_detail <> od.id_detail
            AND LOWER(sub_od.status) IN ('cotizado', 'comprado')
        ), 0.00) AS monto_gastado_otros
        
      FROM order_details AS od
      INNER JOIN material_orders AS mo ON od.id_order = mo.id_order
      LEFT JOIN projects AS p ON mo.id_project = p.id_project
      LEFT JOIN employees AS e ON mo.id_employee = e.id_employee
      LEFT JOIN project_categories AS pc ON od.id_project_category = pc.id_project_category;
    `;

    const [rows] = await pool.query(querySQL);
    
    const rolesAdministrativos = [
      "gerente administración", 
      "compras", 
      "director general", 
      "director operativo", 
      "gerente de costs", // Mantenemos compatibilidad con tus roles
      "gerente de costos", 
      "auxiliar costos"
    ];

    if (!rolesAdministrativos.includes(rolUsuario)) {
      console.log(`🔒 Filtro de seguridad activado. Rol detectado: "${rolUsuario}". Costos ocultados.`);
      
      const datosSeguros = rows.map(item => ({
        ...item,
        proveedor: null,
        precio_unitario: "0.00",
        monto: null,
        presupuesto_autorizado: 0,
        monto_gastado_otros: 0
      }));
      
      return res.json(datosSeguros);
    }
    
    console.log(`🔓 Acceso completo concedido a rol administrativo: "${rolUsuario}"`);
    res.json(rows);

  } catch (error) {
    console.error('Error al obtener materiales de MODISA:', error);
    res.status(500).json({ error: 'Error interno al cargar materiales', detalle: error.message });
  }
});

app.post('/api/materiales', async (req, res) => {
  const { id_project, id_employee, order_date, fiscal_week, materiales } = req.body;
  
  console.log("📥 Datos recibidos en el Backend:", req.body);

  if (id_project === undefined || id_project === null || isNaN(id_project)) {
    return res.status(400).json({ error: 'El campo id_project es inválido o está vacío.' });
  }
  if (id_employee === undefined || id_employee === null || isNaN(id_employee)) {
    return res.status(400).json({ error: 'El campo id_employee es inválido o está vacío.' });
  }
  if (!order_date) {
    return res.status(400).json({ error: 'El campo order_date está vacío.' });
  }
  if (fiscal_week === undefined || fiscal_week === null || isNaN(fiscal_week)) {
    return res.status(400).json({ error: 'El campo fiscal_week es inválido o está vacío.' });
  }
  if (!materiales || !Array.isArray(materiales) || materiales.length === 0) {
    return res.status(400).json({ error: 'La lista de materiales está vacía.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [resOrder] = await connection.query(
      `INSERT INTO material_orders (id_project, id_employee, order_date, fiscal_week) VALUES (?, ?, ?, ?)`,
      [id_project, id_employee, order_date, fiscal_week]
    );
    const id_order = resOrder.insertId;

    const queryDetails = `
      INSERT INTO order_details 
        (id_order, id_project_category, material_description, unit, quantity, commentary, status, unit_price) 
      VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', 0.00)
    `;

    for (const mat of materiales) {
      if (!mat.id_project_category) {
        throw new Error(`El material "${mat.material_description}" no tiene una categoría válida.`);
      }
      await connection.query(queryDetails, [
        id_order, 
        mat.id_project_category, 
        mat.material_description, 
        mat.unit, 
        mat.quantity, 
        mat.commentary
      ]);
    }

    await connection.commit();
    res.json({ status: 'success', mensaje: 'Solicitud guardada con éxito.' });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en inserción:", error.message);
    res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  } finally {
    connection.release();
  }
});

// INICIO DE SESIÓN //

app.post('/api/auth/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    const [usuarios] = await pool.query(
      'SELECT id_employee, name, password, job_title, first_entry FROM employees WHERE name = ?',
      [usuario.trim()]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'El usuario ingresado no existe' });
    }

    const usuarioBD = usuarios[0];

    const coinciden = await bcrypt.compare(contrasena.trim(), usuarioBD.password.trim());

    if (!coinciden) {
      return res.status(401).json({ mensaje: 'Contraseña Incorrecta' });
    }

    res.json({
      id_employee: usuarioBD.id_employee,
      nombre: usuarioBD.name,
      rol: usuarioBD.job_title,
      primerIngreso: usuarioBD.first_entry === 1 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el inicio de sesión' });
  }
});

app.put('/api/auth/update-password', async (req, res) => {
  const { usuario, nuevaContrasena } = req.body;
  try {
    const hashContrasena = await bcrypt.hash(nuevaContrasena.trim(), 10);
    await pool.query(
      'UPDATE employees SET password = ?, first_entry = 0 WHERE name = ?',
      [hashContrasena, usuario.trim()]
    );
    
    const [usuarios] = await pool.query('SELECT job_title FROM employees WHERE name = ?', [usuario.trim()]);
    res.json({ mensaje: 'Contraseña actualizada', rol: usuarios[0].job_title });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/verify-identity', async (req, res) => {
  const { name, email } = req.body;

  try {
    const [resultado] = await pool.query(
      'SELECT id_employee FROM employees WHERE name = ? AND email = ?',
      [name.trim(), email.trim()]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ mensaje: 'Los datos ingresados no coinciden con ningún empleado registrado.' });
    }

    res.json({ verificado: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al verificar identidad' });
  }
});

app.put('/api/auth/reset-password', async (req, res) => {
  const { name, nuevaContrasena } = req.body;

  try {
    const hashContrasena = await bcrypt.hash(nuevaContrasena.trim(), 10);

    await pool.query(
      'UPDATE employees SET password = ?, first_entry = 0 WHERE name = ?',
      [hashContrasena, name.trim()]
    );
    res.json({ mensaje: 'Contraseña restablecida con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

// PROYECTOS //

app.get('/api/proyectos/:id/categorias', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT id_project_category, grupo, categoria, subcategoria 
       FROM project_categories 
       WHERE id_project = ?`, 
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener categorías del proyecto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// MATERIALES //

app.put('/api/materiales/detalle/:id', async (req, res) => {
  const { id } = req.params;
  const { proveedor, referencia, precio_unitario, estado } = req.body;
  const rolUsuario = req.headers['x-user-rol'];

  const rolesAdministrativos = [
    "Gerente Administración", "Compras", "Director General", 
    "Director Operativo", "Gerente de Costos", "Auxiliar Costos"
  ];

  if (!rolUsuario || !rolesAdministrativos.includes(rolUsuario.trim())) {
    return res.status(403).json({
      error: 'Acceso denegado',
      detalle: 'No cuentas con los permisos administrativos necesarios para editar cotizaciones.'
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let id_credit = null;
    let id_provider = null; 
    const precio = parseFloat(precio_unitario) || 0.00;
    const refLimpia = referencia ? referencia.trim() : '';

    if (proveedor && proveedor.trim() !== "") {
      const nombreProveedor = proveedor.trim();
      
      const [provBD] = await connection.query(
        'SELECT id_provider FROM providers WHERE provider_name = ? LIMIT 1',
        [nombreProveedor]
      );
      
      if (provBD.length > 0) {
        id_provider = provBD[0].id_provider;
      } else {
        const [nuevoProv] = await connection.query(
          'INSERT INTO providers (provider_name, credit_days) VALUES (?, 30)',
          [nombreProveedor]
        );
        id_provider = nuevoProv.insertId;
        console.log(`✨ Proveedor creado en su tabla: "${nombreProveedor}" con ID: ${id_provider}`);
      }
    }

    if (refLimpia !== '') {
      const [existeCredito] = await connection.query(
        'SELECT id_credit FROM provider_credits WHERE reference_invoice = ? LIMIT 1',
        [refLimpia]
      );

      if (existeCredito.length > 0) {
        id_credit = existeCredito[0].id_credit;
      } else {
        const [datosOrigen] = await connection.query(`
          SELECT mo.id_project, mo.order_date 
          FROM order_details od
          INNER JOIN material_orders mo ON od.id_order = mo.id_order
          WHERE od.id_detail = ? LIMIT 1
        `, [id]);

        let id_project = null;
        let fechaEmision = new Date().toISOString().split('T')[0];

        if (datosOrigen.length > 0) {
          id_project = datosOrigen[0].id_project;
          if (datosOrigen[0].order_date) {
            fechaEmision = new Date(datosOrigen[0].order_date).toISOString().split('T')[0];
          }
        }

        const [nuevoCredito] = await connection.query(`
          INSERT INTO provider_credits 
            (id_provider, id_project, reference_invoice, emission_date, amount, status) 
          VALUES (?, ?, ?, ?, 0.00, 'Pendiente')
        `, [id_provider, id_project, refLimpia, fechaEmision]);

        id_credit = nuevoCredito.insertId;
      }
    }

    const querySQL = `
      UPDATE order_details 
      SET 
        provider = ?,
        reference = ?,
        unit_price = ?, 
        status = ?,
        id_credit = ?
      WHERE id_detail = ?
    `;

    const [result] = await connection.query(querySQL, [
      proveedor && proveedor.trim() !== "" ? proveedor.trim() : null,
      refLimpia || null,
      precio,
      estado || 'pendiente',
      id_credit,
      id
    ]);

    if (result.affectedRows === 0) {
      throw new Error('No se encontró el registro de material especificado.');
    }

    if (id_credit) {
      await connection.query(`
        UPDATE provider_credits pc
        SET pc.amount = (
            SELECT COALESCE(SUM(od.quantity * od.unit_price), 0)
            FROM order_details od
            WHERE od.id_credit = pc.id_credit
        )
        WHERE pc.id_credit = ?
      `, [id_credit]);
    }

    await connection.commit();
    console.log(`💾 Guardado exitoso. Proveedor: "${proveedor}". Crédito ID: ${id_credit || 'Ninguno (Contado)'}`);
    res.json({ status: 'success', mensaje: 'Detalle actualizado correctamente.' });

  } catch (error) {
    await connection.rollback();
    console.error('Error crítico en el PUT /api/materiales/detalle/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  } finally {
    connection.release();
  }
});

// CREDITOS //

app.get('/api/creditos', async (req, res) => {
  try {
    const querySQL = `
      SELECT 
        pc.id_credit,
        pc.reference_invoice,
        pc.emission_date,
        pc.due_date,
        pc.amount,
        pc.amount_paid,
        pc.status,
        pc.observations,
        COALESCE(p.provider_name, 'Sin Proveedor') AS provider_name,
        COALESCE(pr.project_name, 'Sin Obra') AS project_name,
        CASE 
          WHEN pc.status = 'Pagado' THEN 'Pagado'
          WHEN pc.status = 'Cancelado' THEN 'Cancelado'
          WHEN pc.due_date < CURDATE() THEN 'Vencido'
          ELSE 'Activo'
        END AS tiempo_credito
      FROM provider_credits pc
      LEFT JOIN providers p ON pc.id_provider = p.id_provider
      LEFT JOIN projects pr ON pc.id_project = pr.id_project
      ORDER BY pc.emission_date DESC
    `;
    const [rows] = await pool.query(querySQL);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener créditos:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/api/creditos/:id', async (req, res) => {
  const { id } = req.params;
  const { amount_paid, status, observations } = req.body;

  try {
    const [credito] = await pool.query('SELECT amount FROM provider_credits WHERE id_credit = ?', [id]);
    if (credito.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const totalAmount = parseFloat(credito[0].amount) || 0;
    let finalStatus = status;

    if (status !== 'Cancelado') {
      if (amount_paid >= totalAmount && totalAmount > 0) {
        finalStatus = 'Pagado';
      } else {
        finalStatus = 'Pendiente';
      }
    }

    await pool.query(`
      UPDATE provider_credits 
      SET amount_paid = ?, status = ?, observations = ? 
      WHERE id_credit = ?
    `, [amount_paid, finalStatus, observations, id]);

    res.json({ status: 'success', statusCalculado: finalStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// CONTRATOS //

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

app.post('/api/contratos', async (req, res) => {
    // CAPA DE SEGURIDAD BACKEND: Validación del rol a través de los headers de control
    const userRol = req.headers['x-user-rol'];

    if (!userRol || userRol !== 'Residente') {
        return res.status(403).json({ 
            success: false, 
            error: "⛔ Acceso denegado: Solo usuarios con rol de 'Residente' pueden registrar contratos." 
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
        total_amount,
        contract_file_url
    } = req.body;

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
            contract_file_url || null
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
    }
});

app.get('/api/contratos', async (req, res) => {
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
                
                CASE 
                    WHEN LOWER(TRIM(c.status)) = 'rechazado' OR LOWER(TRIM(c.status_direccion)) = 'rechazado' OR LOWER(TRIM(c.estado_costos)) = 'rechazado' THEN 'Rechazado'
                    
                    WHEN c.total_amount > 0 AND (
                        SELECT IFNULL(SUM(IFNULL(po_sub.monto_pagado, 0)), 0)
                        FROM payment_orders po_sub
                        INNER JOIN payment_order_details pod_sub ON po_sub.id_payment_order = pod_sub.id_payment_order
                        WHERE LOWER(TRIM(pod_sub.provider)) = LOWER(TRIM(c.supplier))
                          AND po_sub.payment_type IN ('contratista', 'especifico')
                    ) >= c.total_amount THEN 'Pagado'
                    
                    ELSE 'Pendiente'
                END AS status,

                IFNULL((
                    SELECT SUM(IFNULL(po_sub.monto_pagado, 0))
                    FROM payment_orders po_sub
                    INNER JOIN payment_order_details pod_sub ON po_sub.id_payment_order = pod_sub.id_payment_order
                    WHERE LOWER(TRIM(pod_sub.provider)) = LOWER(TRIM(c.supplier))
                      AND po_sub.payment_type IN ('contratista', 'especifico')
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

app.put('/api/contratos/:id/actualizar-control', async (req, res) => {
    const { id } = req.params;
    const { status, estado_costos, status_direccion, firma } = req.body;

    try {
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

// PAGOS //

app.post('/api/pagos', upload.single('ticketFile'), async (req, res) => {
  console.log("================= API PAGOS INVOCADA =================");
  console.log("Datos recibidos en body:", req.body);
  const { id_project, id_employee, request_date, fiscal_week, payment_type, payment_method, conceptos } = req.body;

  if (!id_project || !id_employee || !request_date || !fiscal_week || !payment_type || !payment_method) {
    // Si llegó archivo y faltan datos, borramos el temporal
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Faltan campos obligatorios en la cabecera de la solicitud.' });
  }
  if (!conceptos) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'No se envió ningún concepto financiero en la lista.' });
  }

  let listaConceptos = [];
  try {
    listaConceptos = JSON.parse(conceptos);
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El formato de los conceptos es inválido.' });
  }

  // ☁️ SUBIDA A GOOGLE DRIVE SI EXISTE UN ARCHIVO
  let urlDestinoFinal = null;
  if (req.file) {
    try {
      const ID_CARPETA_DRIVE_TARGET = '1EDUH7xLfrpDus1CygJNBI0to32St9HXR'; 
      
      console.log("📤 Subiendo ticket de caja chica hacia Google Drive...");
      urlDestinoFinal = await subirArchivoADrive(req.file, ID_CARPETA_DRIVE_TARGET);
      console.log("🔗 Enlace generado exitosamente por Google Drive:", urlDestinoFinal);
    } catch (errDrive) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Fallo al almacenar el ticket en Google Drive.', detalle: errDrive.message });
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1️⃣ INSERTAR CABECERA CON LA URL DE GOOGLE DRIVE
    const [resOrder] = await connection.query(
      `INSERT INTO payment_orders (id_project, id_employee, request_date, fiscal_week, payment_type, payment_method, ticket_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id_project, id_employee, request_date, fiscal_week, payment_type, payment_method, urlDestinoFinal]
    );
    const id_payment_order = resOrder.insertId;

    console.log(`📝 Insertando Cabecera de Pagos ID: #${id_payment_order}. Total conceptos a procesar: ${listaConceptos.length}`);

    const queryDetails = `
      INSERT INTO payment_order_details 
        (id_payment_order, id_project_category, provider, concept_description, unit, quantity, unit_price, amount, commentary) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const item of listaConceptos) {
      await connection.query(queryDetails, [
        id_payment_order, 
        item.id_project_category || null, 
        item.provider_name, 
        item.concept_description, 
        item.unit, 
        item.quantity, 
        item.price_unit, // Mapeado exacto desde el objeto sanitizado del frontend
        item.amount, 
        item.commentary
      ]);
    }

    await connection.commit();
    console.log(`💾 ¡Éxito! Guardada solicitud de pago ID #${id_payment_order} en la nube.`);
    console.log("======================================================");
    res.json({ status: 'success', mensaje: 'Solicitud de pago guardada con éxito en la base de datos.' });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en la transacción de pagos:", error.message);
    res.status(500).json({ error: 'Error interno en el servidor de base de datos', detalle: error.message });
  } finally {
    connection.release();
  }
});

app.get('/api/pagos', async (req, res) => {
    try {
        const query = `
            SELECT 
                po.id_payment_order AS id_payment_order,
                -- CONCATG asegura un identificador único por fila en el frontend sin depender de nombres ocultos de PK
                CONCAT(po.id_payment_order, '-', ROW_NUMBER() OVER (PARTITION BY po.id_payment_order ORDER BY po.id_payment_order)) AS id_payment_order_detail,
                p.project_name,
                po.request_date,
                po.fiscal_week,
                po.payment_type,
                po.payment_method,
                po.ticket_url,
                pc.grupo AS grupo,
                pc.categoria AS categoria,
                pc.subcategoria AS subcategoria,
                pod.provider AS provider,
                pod.concept_description AS concept_description,
                pod.quantity AS quantity,
                pod.unit AS unit,
                pod.unit_price AS price_unit,
                pod.amount AS amount,
                po.status,
                IFNULL(po.monto_pagado, 0) AS monto_pagado,
                (
                    SELECT c.firma 
                    FROM contracts c 
                    WHERE LOWER(TRIM(c.supplier)) = LOWER(TRIM(pod.provider)) 
                    LIMIT 1
                ) AS contrato_firma,
                (
                    SELECT c.start_date 
                    FROM contracts c 
                    WHERE LOWER(TRIM(c.supplier)) = LOWER(TRIM(pod.provider)) 
                    LIMIT 1
                ) AS contrato_fecha_registro
            FROM payment_orders po
            INNER JOIN payment_order_details pod ON po.id_payment_order = pod.id_payment_order
            LEFT JOIN projects p ON po.id_project = p.id_project
            LEFT JOIN project_categories pc ON pod.id_project_category = pc.id_project_category
            ORDER BY po.id_payment_order DESC;
        `;

        const [results] = await pool.query(query);
        res.json(results);

    } catch (err) {
        console.error("❌ Error en la consulta SQL detallada de pagos:", err);
        res.status(500).json({ error: "Error interno del servidor al consultar pagos" });
    }
});

app.put('/api/pagos/:id/monto-pagado', async (req, res) => {
    try {
        const idOrden = req.params.id;
        const { monto_pagado } = req.body;
        const nuevoMonto = parseFloat(monto_pagado) || 0;

        if (!idOrden || idOrden === 'undefined') {
            return res.status(400).json({ error: "El ID de la orden no es válido." });
        }

        const [contratoInfo] = await pool.query(
            `SELECT c.firma, c.start_date 
             FROM payment_order_details pod
             INNER JOIN contracts c ON LOWER(TRIM(c.supplier)) = LOWER(TRIM(pod.provider))
             WHERE pod.id_payment_order = ? LIMIT 1`,
            [idOrden]
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
                        error: `Bloqueo Financiero: El contrato asociado tiene ${diferenciaDias} días sin firmar (alcanzó o superó el límite de 7 días). Captura deshabilitada.` 
                    });
                }
            }
        }

        const [sumaDetalle] = await pool.query(
            `SELECT SUM(amount) AS monto_total FROM payment_order_details WHERE id_payment_order = ?`,
            [idOrden]
        );

        const montoTotalOrden = parseFloat(sumaDetalle[0]?.monto_total) || 0;

        let nuevoStatus = 'Pendiente';
        if (montoTotalOrden > 0 && nuevoMonto >= montoTotalOrden) {
            nuevoStatus = 'Pagado';
        }

        const updateQuery = `
            UPDATE payment_orders 
            SET monto_pagado = ?, status = ?
            WHERE id_payment_order = ?
        `;

        await pool.query(updateQuery, [nuevoMonto, nuevoStatus, idOrden]);

        res.json({ 
            success: true, 
            message: `Monto y estado (${nuevoStatus}) actualizados correctamente en la base de datos.`,
            status: nuevoStatus
        });

    } catch (err) {
        console.error("❌ Error crítico en el servidor al actualizar pago y estatus:", err);
        res.status(500).json({ error: `Error interno del servidor: ${err.message}` });
    }
});

// =========================================================================================
// CATEGORIZACIÓN
// =========================================================================================
// ========================================================
// 🔒 MIDDLEWARE DE SEGURIDAD ESTRICTA: GESTIÓN DE COSTOS
// ========================================================
const verificarGerenteCostos = (req, res, next) => {
    // Extraemos la cabecera idéntica a la lógica del módulo de proyectos
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';

    if (rolUsuario !== "Gerente de Costos") {
        return res.status(403).json({ 
            success: false, 
            error: "⛔ Acceso denegado. Este endpoint es confidencial y solo permite modificaciones por el Gerente de Costos." 
        });
    }
    next();
};

// A. OBTENER CATEGORÍAS (Acceso de lectura interna)
app.get('/api/proyectos/:id/categorias', async (req, res) => {
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

// B. CONSULTAR MATRIZ FINANCIERA COMPLETA
app.get('/api/project-categories/:id_project', async (req, res) => {
    const idProject = req.params.id_project;
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `SELECT id_project_category, grupo, categoria, subcategoria, mano_obra, materiales, maquinaria_equipo, contratos, total
             FROM project_categories 
             WHERE id_project = ? 
             ORDER BY grupo ASC, categoria ASC, subcategoria ASC`,
            [idProject]
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ Error al obtener categorías del proyecto:", error);
        res.status(500).json({ error: "Error interno al consultar las categorías." });
    } finally {
        connection.release();
    }
});

// C. CARGA MASIVA CSV (🔒 Blindado)
app.post('/api/upload-hierarchy', verificarGerenteCostos, async (req, res) => {
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

// D. REGISTRO MANUAL INDIVIDUAL (🔒 Blindado)
app.post('/api/project-categories', verificarGerenteCostos, async (req, res) => {
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

// E. MODIFICACIÓN DE FILA (🔒 Blindado)
app.put('/api/project-categories/:id', verificarGerenteCostos, async (req, res) => {
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

// F. ELIMINACIÓN DE REGISTRO (🔒 Blindado)
app.delete('/api/project-categories/:id', verificarGerenteCostos, async (req, res) => {
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

// OBTENER PROYECTOS ACTIVOS PARA EL DROPDOWN DE PRESUPUESTOS (Adaptado)
app.get('/api/projects-active', async (req, res) => {
  try {
    // Intentamos con 'projects' (inglés) y 'status' (inglés)
    const [rows] = await pool.query(
      `SELECT id_project, project_name 
       FROM projects 
       WHERE status = 'Activo' OR status = 'activo'
       ORDER BY project_name ASC`
    );
    res.json(rows);
  } catch (error) {
    // Si falla, intentamos con la tabla en español 'proyectos' por si acaso
    try {
      const [rows] = await pool.query(
        `SELECT id_project, project_name 
         FROM proyectos 
         WHERE estatus = 'Activo' OR estatus = 'activo'
         ORDER BY project_name ASC`
      );
      return res.json(rows);
    } catch (innerError) {
      console.error('❌ Error detallado en MySQL:', innerError);
      res.status(500).json({ 
        error: 'Error interno del servidor', 
        detalles: innerError.message 
      });
    }
  }
});