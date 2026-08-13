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

// CATEGORÍZACIÓN //
const categoriesRouter = require('./src/routes/categories');
app.use('/api', categoriesRouter);

// EMPLEADOS //
const employeesRouter = require('./src/routes/employees');
app.use('/api/empleados', employeesRouter);

// MINUTAS //
const minutesRouter = require('./src/routes/minutes');
app.use('/api', minutesRouter);

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

// DASHBOARD //
const dashboardRouter = require('./src/routes/dashboard');
app.use('/api/dashboard', dashboardRouter);



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

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});