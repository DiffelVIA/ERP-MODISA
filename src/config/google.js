const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// MODIFICACIÓN SOLUCIÓN (Ciberseguridad): Priorizar variables de entorno (.env) y proteger lectura de credentials.json con try/catch
let fileClientId = null;
let fileClientSecret = null;

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  try {
    const credentialsPath = path.join(__dirname, '../../credentials.json');
    if (fs.existsSync(credentialsPath)) {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      if (credentials && credentials.web) {
        fileClientId = credentials.web.client_id;
        fileClientSecret = credentials.web.client_secret;
      }
    }
  } catch (err) {
    console.warn('⚠️ No se pudo leer credentials.json local, usando variables de entorno:', err.message);
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || fileClientId;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || fileClientSecret;

const redirectUri = process.env.NODE_ENV === 'production' 
  ? 'https://erp-modisa.onrender.com/api/auth/google/callback' 
  : 'http://localhost:3000/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  redirectUri
);

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.send'
];

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_TOKEN,
  scope: SCOPES.join(' ')
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

module.exports = { drive, gmail, oauth2Client, SCOPES };