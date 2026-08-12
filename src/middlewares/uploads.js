const multer = require('multer');
const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'ticketFile' || file.fieldname === 'pdfFile') {
      const extension = path.extname(file.originalname).toLowerCase();
      const mimeType = file.mimetype;

      const esImagenOPdf = mimeType.startsWith('image/') || 
                           mimeType === 'application/pdf' || 
                           extension === '.pdf';

      if (esImagenOPdf) {
        cb(null, true);
      } else {
        cb(new Error('Formato no permitido para el comprobante. Solo se admiten imágenes o archivos PDF.'));
      }
    } else {
      cb(null, true); 
    }
  }
});

module.exports = upload;