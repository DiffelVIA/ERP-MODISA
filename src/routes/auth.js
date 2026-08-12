const express = require('express');
const router = express.Router();
const { oauth2Client, SCOPES } = require('../config/google');

router.get('/login', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });
  res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
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

module.exports = router;