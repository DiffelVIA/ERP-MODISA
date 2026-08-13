require('dotenv').config(); // db
const express = require('express');
const mysql = require('mysql2/promise'); // db
const cors = require('cors');
const fs = require('fs'); // db
const path = require('path'); // db
const bcrypt = require('bcrypt'); 
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN A MYSQL//
const pool = require('./src/config/db');

// DRIVE //
const authRouter = require('./src/routes/auth');
app.use('/api/auth/google', authRouter);

// MULTER //
const multer = require('multer');

// UPLOAD //
const upload = require('./src/middlewares/uploads');

// PROYECTOS //
const projectsRouter = require('./src/routes/projects');

app.use('/api/projects', projectsRouter);
app.use('/api/proyectos', projectsRouter);
app.use('/api/projects-report', (req, res, next) => {
  req.url = '/report' + req.url;
  projectsRouter(req, res, next);
});

// EMPLEADOS //
const employeesRouter = require('./src/routes/employees');
app.use('/api/empleados', employeesRouter);

// MATERIALES //
const materialesRouter = require('./src/routes/materials');
app.use('/api/materiales', materialesRouter);

//CREDITOS //
const creditosRouter = require('./src/routes/credits');
app.use('/api/creditos', creditosRouter);

// CONTRATOS
const contratosRouter = require('./src/routes/contracts');
app.use('/api/contratos', contratosRouter);

// PAGOS //
const pagosRouter = require('./src/routes/payments');
app.use('/api/pagos', pagosRouter);


// INICIO DE SESIÓN Y RECUPERACIÓN DE CONTRASEÑA //
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const createTransporter = async () => {
  const accessTokenResponse = await oauth2Client.getAccessToken();
  
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_TOKEN,
      accessToken: accessTokenResponse.token,
    },
  });
};

app.post('/api/auth/login', async (req, res) => {
  const { correo, contrasena } = req.body;

  try {
    const [usuarios] = await pool.query(
      'SELECT id_employee, name, password, job_title, first_entry FROM employees WHERE email = ?',
      [correo.trim()]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'El correo ingresado no existe o es incorrecto.' });
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
  const { correo, nuevaContrasena } = req.body;
  try {
    const hashContrasena = await bcrypt.hash(nuevaContrasena.trim(), 10);
    await pool.query(
      'UPDATE employees SET password = ?, first_entry = 0 WHERE email = ?',
      [hashContrasena, correo.trim()]
    );
    
    const [usuarios] = await pool.query(
      'SELECT id_employee, name, job_title FROM employees WHERE email = ?', 
      [correo.trim()]
    );

    res.json({ 
      mensaje: 'Contraseña actualizada', 
      id_employee: usuarios[0].id_employee,
      nombre: usuarios[0].name,
      rol: usuarios[0].job_title 
    });
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

const createRawMessage = ({ from, to, subject, html }) => {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: MODISA ERP <${from}>`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html
  ];

  const message = messageParts.join('\r\n');

  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

app.post('/api/auth/request-reset', async (req, res) => {
  const { email } = req.body;

  try {
    const [resultado] = await pool.query(
      'SELECT id_employee, name FROM employees WHERE email = ?',
      [email.trim()]
    );

    if (resultado.length === 0) {
      return res.json({ 
        mensaje: 'Si el correo ingresado se encuentra registrado, recibirás un enlace de recuperación.' 
      });
    }

    const usuario = resultado[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      'UPDATE employees SET reset_token = ?, reset_expires = ? WHERE email = ?',
      [token, expires, email.trim()]
    );

    const baseUrl = process.env.FRONTEND_URL || 'https://erp-modisa.onrender.com';
    const resetUrl = `${baseUrl}/recuperar.html?token=${token}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Hola, ${usuario.name}</h2>
        <p>Has solicitado restablecer tu contraseña en el sistema <strong>MODISA ERP</strong>.</p>
        <p>Haz clic en el siguiente botón para completar el proceso. Este enlace expirará en 5 minutos:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0;">
          Restablecer Contraseña
        </a>
        <p style="font-size: 0.85rem; color: #777;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      </div>
    `;

    const senderEmail = process.env.GMAIL_USER || 'dvillalva@modisa.com.mx';

    const rawMessage = createRawMessage({
      from: senderEmail,
      to: email.trim(),
      subject: 'Restablecer Contraseña - MODISA ERP',
      html: htmlContent
    });

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage
      }
    });

    res.json({ 
      mensaje: 'Si el correo ingresado se encuentra registrado, recibirás un enlace de recuperación.' 
    });

  } catch (error) {
    console.error('Error al solicitar la recuperación:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud de recuperación' });
  }
});

app.post('/api/auth/verify-token', async (req, res) => {
  const { token } = req.body;

  try {
    const [resultado] = await pool.query(
      'SELECT id_employee FROM employees WHERE reset_token = ? AND reset_expires > NOW()',
      [token.trim()]
    );

    if (resultado.length === 0) {
      return res.status(400).json({ mensaje: 'El token de recuperación es inválido o ha expirado.' });
    }

    res.json({ verificado: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al verificar el token' });
  }
});

app.put('/api/auth/reset-password', async (req, res) => {
  const { token, nuevaContrasena } = req.body;

  try {
    const [resultado] = await pool.query(
      'SELECT id_employee FROM employees WHERE reset_token = ? AND reset_expires > NOW()',
      [token.trim()]
    );

    if (resultado.length === 0) {
      return res.status(400).json({ mensaje: 'El token es inválido o ha expirado. Solicita un nuevo token.' });
    }

    const hashContrasena = await bcrypt.hash(nuevaContrasena.trim(), 10);

    await pool.query(
      'UPDATE employees SET password = ?, reset_token = NULL, reset_expires = NULL, first_entry = 0 WHERE reset_token = ?',
      [hashContrasena, token.trim()]
    );

    res.json({ mensaje: 'Contraseña restablecida con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
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

    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado != 'completada' AND estado != 'atrasada' AND estado != 'aplazada'
    `, [hoyFormateado]);

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
    for (const item of listaMinutas) {
      
      const [registroPrevio] = await pool.query(
        'SELECT fecha, semana, estado, comentarioDirector FROM minutas WHERE id = ?', 
        [item.id]
      );
      
      let comentarioFinal = item.comentarioDirector || item.comentariodirector || '';
      let fechaDestino = item.fecha ? item.fecha.split('T')[0] : new Date().toISOString().split('T')[0];
      let semanaOriginal;

      if (registroPrevio.length > 0) {
        const datosOriginales = registroPrevio[0];

        semanaOriginal = datosOriginales.semana;

        if (item.estado !== 'aplazada') {
          fechaDestino = datosOriginales.fecha ? new Date(datosOriginales.fecha).toISOString().split('T')[0] : fechaDestino;
        }

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
        if (item.semana !== undefined && item.semana !== null && !isNaN(Number(item.semana)) && Number(item.semana) !== 0) {
          semanaOriginal = Number(item.semana);
        } else {
          const fechaHoy = new Date();
          const primeraFechaAnio = new Date(fechaHoy.getFullYear(), 0, 1);
          const diasPasados = Math.floor((fechaHoy - primeraFechaAnio) / (1000 * 60 * 60 * 24));
          semanaOriginal = Math.ceil((diasPasados + primeraFechaAnio.getDay() + 1) / 7);
        }
      }

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
        comentarioFinal,
        item.estado,
        comentarioFinal,
        item.proyecto,
        item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0,
        item.responsable,
        fechaDestino,
        item.descripcion
      ];

      await pool.query(querySQL, valoresControlados);
    }

    res.json({ mensaje: 'Minutas sincronizadas con éxito en Aiven' });
  } catch (error) {
    console.error('Error crítico controlado en el guardado de minutas:', error);
    res.status(500).json({ error: 'Error al persistir minutas en la base de datos', detalle: error.message });
  }
});

// NOTIFICACIONES DE MINUTAS //
app.get('/api/notificaciones/minutas-resumen', async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const hoyFormateado = `${anio}-${mes}-${dia}`;

    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado NOT IN ('completada', 'atrasada', 'aplazada')
    `, [hoyFormateado]);

    const responsableReq = req.headers['x-usuario-nombre'] ? req.headers['x-usuario-nombre'].trim() : '';
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim().toLowerCase() : '';

    let querySQL = '';
    let parametrosSQL = [];

    if (rolUsuario === 'director operativo' || rolUsuario === 'director_operativo' || !responsableReq) {
      querySQL = `
        SELECT 
          COUNT(CASE WHEN estado = 'atrasada' THEN 1 END) AS atrasadas,
          COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) AS pendientes,
          COUNT(CASE WHEN estado = 'aplazada' THEN 1 END) AS aplazadas,
          COUNT(*) AS total
        FROM minutas
        WHERE estado != 'completada';
      `;
    } else {
      querySQL = `
        SELECT 
          COUNT(CASE WHEN estado = 'atrasada' THEN 1 END) AS atrasadas,
          COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) AS pendientes,
          COUNT(CASE WHEN estado = 'aplazada' THEN 1 END) AS aplazadas,
          COUNT(*) AS total
        FROM minutas
        WHERE estado != 'completada' AND LOWER(responsable) LIKE LOWER(?);
      `;
      parametrosSQL = [`%${responsableReq}%`];
    }

    const [filas] = await pool.query(querySQL, parametrosSQL);
    const resumen = filas[0] || { atrasadas: 0, pendientes: 0, aplazadas: 0, total: 0 };

    res.json(resumen);

  } catch (error) {
    console.error('Error al obtener resumen de notificaciones:', error);
    res.status(500).json({ error: 'Error al consultar notificaciones de minutas' });
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

// CATEGORIZACIÓN
const verificarGerenteCostos = (req, res, next) => {
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';

    const rolesPermitidos = ["Gerente de Costos", "Director Operativo"];

    if (!rolesPermitidos.includes(rolUsuario)) {
        return res.status(403).json({ 
            success: false, 
            error: "⛔ Acceso denegado. Este endpoint es confidencial y solo permite modificaciones por el Gerente de Costos o la Dirección Operativa." 
        });
    }
    next();
};

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

app.get('/api/project-categories/:id_project', async (req, res) => {
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
                /* =========================================================================
                   MODIFICACIÓN: Se remueven los estados 'cotizado' y 'pendiente' del WHERE.
                   Ahora solo los materiales con estatus 'comprado' se contemplan como 
                   monto ejecutado en la tabla de presupuestos autorizados.
                   ========================================================================= */
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

app.get('/api/projects-active', async (req, res) => {
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


// Endpoint de métricas del Dashboard de Pagos por Proyecto
app.get('/api/dashboard/metrics/:id_project', async (req, res) => {
  const { id_project } = req.params;

  try {
    const [filas] = await pool.query(
      `SELECT 
        SUM(mano_obra) AS mano_obra_auth,
        SUM(materiales) AS materiales_auth,
        SUM(maquinaria_equipo) AS maquinaria_auth,
        SUM(contratos) AS contratos_auth,
        SUM(total) AS total_auth
       FROM project_categories 
       WHERE id_project = ?`,
      [id_project]
    );

    const metrics = filas[0] || {};

    // Estructura de rubros para las gráficas
    const rubros = [
      { nombre: 'Mano de Obra', autorizado: metrics.mano_obra_auth || 0, ejecutado: 0.00 },
      { nombre: 'Materiales', autorizado: metrics.materiales_auth || 0, ejecutado: 0.00 },
      { nombre: 'Maquinaria y Equipo', autorizado: metrics.maquinaria_auth || 0, ejecutado: 0.00 },
      { nombre: 'Contratos', autorizado: metrics.contratos_auth || 0, ejecutado: 0.00 }
    ];

    const totalAutorizado = parseFloat(metrics.total_auth) || 0;
    const totalEjecutado = rubros.reduce((acc, r) => acc + r.ejecutado, 0);

    res.json({
      totales: {
        autorizado: totalAutorizado,
        ejecutado: totalEjecutado
      },
      rubros
    });
  } catch (error) {
    console.error('Error al obtener métricas del dashboard:', error);
    res.status(500).json({ error: 'Error al consultar métricas' });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});