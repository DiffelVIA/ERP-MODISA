const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { gmail, oauth2Client, SCOPES } = require('../config/google');

function obtenerJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('La variable de entorno JWT_SECRET no está configurada en el servidor.');
  }
  return process.env.JWT_SECRET;
}

function escapeHTMLAuth(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const createRawMessage = ({ from, to, subject, html }) => {
  const fromNombre = (process.env.GMAIL_FROM_NAME || 'Notificaciones MODISA').replace(/[\r\n"]/g, '').trim();
  const utf8FromName = `=?utf-8?B?${Buffer.from(fromNombre).toString('base64')}?=`;
  const utf8Subject = `=?utf-8?B?${Buffer.from(String(subject).replace(/[\r\n]/g, ' ').trim()).toString('base64')}?=`;
  const cleanTo = String(to).replace(/[\r\n]/g, '').trim();

  const messageParts = [
    `From: ${utf8FromName} <${from}>`,
    `Reply-To: <${from}>`,
    `To: ${cleanTo}`,
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
  try {
    const stateToken = jwt.sign(
      { purpose: 'google_oauth_connect', nonce: crypto.randomBytes(16).toString('hex') },
      obtenerJwtSecret(),
      { expiresIn: '10m' }
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: stateToken
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error('❌ Error de configuración JWT en google/login:', err.message);
    res.status(500).send('Error de configuración de seguridad en el servidor.');
  }
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send('No se recibió el código de autorización desde Google.');
  }

  if (!state) {
    return res.status(400).send('Falta el parámetro de seguridad state en la respuesta de Google.');
  }

  try {
    const decodedState = jwt.verify(
      String(state),
      obtenerJwtSecret()
    );
    if (!decodedState || decodedState.purpose !== 'google_oauth_connect') {
      return res.status(403).send('Estado de autorización inválido.');
    }
  } catch (stateErr) {
    return res.status(403).send('La sesión de autorización con Google ha expirado o es inválida. Vuelve a intentar en /api/auth/google/login');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const tokenSeguro = escapeHTMLAuth(
      tokens.refresh_token || 'Atención: No se generó refresh_token. Reintenta entrando de nuevo a /api/auth/google/login'
    );
    
    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px; line-height: 1.6; max-width: 720px; margin: 0 auto;">
        <h2 style="color: #16a34a;">¡Autenticación con Google completada con éxito!</h2>
        <p>Copia el siguiente <strong>refresh_token</strong> y actualízalo en la variable de entorno <code>GOOGLE_TOKEN</code> de tu panel de Render y en tu archivo <code>.env</code> local:</p>
        <textarea id="refreshTokenBox" style="width: 100%; height: 110px; font-family: monospace; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc;" readonly>${tokenSeguro}</textarea>
        <div style="margin-top: 12px;">
          <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('refreshTokenBox').value); this.innerText='✅ ¡Token copiado!';" style="background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: bold;">
            Copiar Refresh Token
          </button>
        </div>
        <p style="color: #475569; font-size: 0.9rem; margin-top: 16px;">Recuerda asegurarte de que la carpeta de Google Drive de vacaciones esté compartida como <strong>Editor</strong> con la cuenta autorizada (<code>noreply@modisa.com.mx</code>).</p>
      </div>
    `);
  } catch (err) {
    console.error('❌ Error al canjear token de Google:', err);
    res.status(500).send(`Error al autenticar con Google: ${escapeHTMLAuth(err.message)}`);
  }
});

router.post('/login', async (req, res) => {
  const { correo, contrasena } = req.body || {};

  if (typeof correo !== 'string' || typeof contrasena !== 'string' || !correo.trim() || !contrasena.trim()) {
    return res.status(400).json({ mensaje: 'Debes proporcionar correo y contraseña válidos.' });
  }

  try {
    const jwtSecret = obtenerJwtSecret();
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

    const token = jwt.sign(
      {
        id_employee: usuarioBD.id_employee,
        nombre: usuarioBD.name,
        rol: usuarioBD.job_title
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    res.json({
      token,
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
  const { correo, nuevaContrasena } = req.body || {};
  if (typeof correo !== 'string' || typeof nuevaContrasena !== 'string' || !correo.trim() || !nuevaContrasena.trim()) {
    return res.status(400).json({ error: 'Datos de actualización inválidos.' });
  }

  try {
    const jwtSecret = obtenerJwtSecret();
    const hashContrasena = await bcrypt.hash(nuevaContrasena.trim(), 10);
    await pool.query(
      'UPDATE employees SET password = ?, first_entry = 0 WHERE email = ?',
      [hashContrasena, correo.trim()]
    );
    
    const [usuarios] = await pool.query(
      'SELECT id_employee, name, job_title FROM employees WHERE email = ?', 
      [correo.trim()]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const usuarioBD = usuarios[0];

    const token = jwt.sign({
        id_employee: usuarioBD.id_employee,
        nombre: usuarioBD.name,
        rol: usuarioBD.job_title
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    res.json({ 
      token,
      mensaje: 'Contraseña actualizada', 
      id_employee: usuarioBD.id_employee,
      nombre: usuarioBD.name,
      rol: usuarioBD.job_title 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-identity', async (req, res) => {
  const { name, email } = req.body || {};
  if (typeof name !== 'string' || typeof email !== 'string' || !name.trim() || !email.trim()) {
    return res.status(400).json({ mensaje: 'Nombre y correo son requeridos.' });
  }

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
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ mensaje: 'El correo electrónico es requerido.' });
  }

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
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      'UPDATE employees SET reset_token = ?, reset_expires = ? WHERE email = ?',
      [hashedToken, expires, email.trim()]
    );

    const baseUrl = process.env.FRONTEND_URL || 'https://erp-modisa.onrender.com';
    const resetUrl = `${baseUrl}/recuperar.html?token=${rawToken}`;
    const nombreUsuarioSeguro = escapeHTMLAuth(usuario.name);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Hola, ${nombreUsuarioSeguro}</h2>
        <p>Has solicitado restablecer tu contraseña en el sistema <strong>MODISA ERP</strong>.</p>
        <p>Haz clic en el siguiente botón para completar el proceso. Este enlace expirará en 5 minutos:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0;">
          Restablecer Contraseña
        </a>
        <p style="font-size: 0.85rem; color: #777;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      </div>
    `;

    const senderEmail = (process.env.GMAIL_USER || process.env.GMAIL_FROM_EMAIL || 'noreply@modisa.com.mx').trim();

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
  const { token } = req.body || {};
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ mensaje: 'El token es requerido.' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const [resultado] = await pool.query(
      'SELECT id_employee FROM employees WHERE reset_token = ? AND reset_expires > NOW()',
      [hashedToken.trim()]
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
  const { token, nuevaContrasena } = req.body || {};
  if (typeof token !== 'string' || typeof nuevaContrasena !== 'string' || !token.trim() || !nuevaContrasena.trim()) {
    return res.status(400).json({ mensaje: 'Datos inválidos para restablecer contraseña.' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const [resultado] = await pool.query(
      'SELECT id_employee FROM employees WHERE reset_token = ? AND reset_expires > NOW()',
      [hashedToken.trim()]
    );
    
    if (resultado.length === 0) {
      return res.status(400).json({ mensaje: 'El token es inválido o ha expirado. Solicita un nuevo token.' });
    }

    const hashContrasena = await bcrypt.hash(nuevaContrasena.trim(), 10);

    await pool.query(
      'UPDATE employees SET password = ?, reset_token = NULL, reset_expires = NULL, first_entry = 0 WHERE reset_token = ?',
      [hashContrasena, hashedToken.trim()]
    );

    res.json({ mensaje: 'Contraseña restablecida con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

module.exports = router;