const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { drive } = require('../config/google');

async function subirArchivoADrive(fileObject, idCarpetaDrive) {
  try {
    const fileMetadata = {
      name: Date.now() + path.extname(fileObject.originalname),
      parents: [idCarpetaDrive],
    };

    let bodyStream;
    if (fileObject.buffer) {
      bodyStream = Readable.from(fileObject.buffer);
    } else if (fileObject.path && fs.existsSync(fileObject.path)) {
      bodyStream = fs.createReadStream(fileObject.path);
    } else {
      throw new Error("El archivo recibido no contiene un buffer válido ni una ruta en disco.");
    }

    const media = {
      mimeType: fileObject.mimetype,
      body: bodyStream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      supportsAllDrives: true,
      supportsTeamDrives: true,
      fields: 'id, webViewLink',
    });

    if (fileObject && fileObject.path && fs.existsSync(fileObject.path)) {
      fs.unlinkSync(fileObject.path);
    }

    return response.data.webViewLink;
  } catch (error) {
    console.error("❌ Error interno en la subida a Google Drive API:", error);
    
    if (fileObject && fileObject.path && fs.existsSync(fileObject.path)) {
      fs.unlinkSync(fileObject.path);
    }
    throw error;
  }
}

module.exports = { subirArchivoADrive };