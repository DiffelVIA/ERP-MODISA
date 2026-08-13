const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { gmail, oauth2Client, SCOPES } = require('../config/google');

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

router.get('/google/login', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });
  res.redirect(authUrl);
});

router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('No se recibió el código de autorización desde Google.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px; line-height: 1.6;">
        <h2 style="color: #28a745;">¡Autenticación con Google completada con éxito!</h2>
        <p>Copia el siguiente <strong>refresh_token</strong> y actualízalo en la variable de entorno <code>GOOGLE_TOKEN</code> de tu panel de Render:</p>
        <textarea style="width: 100%; height: 100px; font-family: monospace; padding: 10px;" readonly>${tokens.refresh_token || 'Atención: No se generó refresh_token. Reintenta entrando de nuevo a /api/auth/google/login'}</textarea>
        <p style="color: #666; font-size: 0.9rem;">Una vez actualizado en Render y redeplegado el backend, la subida de tickets a Google Drive funcionará inmediatamente sin error 403/500.</p>
      </div>
    `);
  } catch (err) {
    console.error('❌ Error al canjear token de Google:', err);
    res.status(500).send(`Error al autenticar con Google: ${err.message}`);
  }
});

router.post('/login', async (req, res) => {
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

router.put('/update-password', async (req, res) => {
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

router.post('/verify-identity', async (req, res) => {
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

router.post('/request-reset', async (req, res) => {
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

router.post('/verify-token', async (req, res) => {
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

router.put('/reset-password', async (req, res) => {
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

module.exports = router;