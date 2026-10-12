const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { drive } = require('../config/google');

async function subirArchivoADrive(fileObject, idCarpetaDrive, nombrePersonalizado = null) {
  try {
    const extension = path.extname(fileObject.originalname) || '.pdf';
    const nombreFinal = nombrePersonalizado 
      ? (nombrePersonalizado.endsWith('.pdf') ? nombrePersonalizado : `${nombrePersonalizado}${extension}`)
      : `${Date.now()}${extension}`;

    const fileMetadata = {
      name: nombreFinal,
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
      mimeType: fileObject.mimetype || 'application/pdf',
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