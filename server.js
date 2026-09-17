require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const { iniciarWhatsApp, verificarYNotificarContratosSinFirma} = require('./src/services/whatsapp');
const authRouter = require('./src/routes/auth');
const projectsRouter = require('./src/routes/projects');
const categoriesRouter = require('./src/routes/categories');
const employeesRouter = require('./src/routes/employees');
const minutesRouter = require('./src/routes/minutes');
const materialesRouter = require('./src/routes/materials');
const creditosRouter = require('./src/routes/credits');
const contratosRouter = require('./src/routes/contracts');
const pagosRouter = require('./src/routes/payments');
const dashboardRouter = require('./src/routes/dashboardBackend');

// Vinculación de Rutas
app.use('/api/auth/google', authRouter);
app.use('/api/auth', authRouter);
app.use('/api/proyectos', projectsRouter);
app.use('/api/projects-report', (req, res, next) => {
  req.url = '/report' + req.url;
  projectsRouter(req, res, next);
});

app.use('/api/empleados', employeesRouter);
app.use('/api/materiales', materialesRouter);
app.use('/api/creditos', creditosRouter);
app.use('/api/contratos', contratosRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/dashboardBackend', dashboardRouter);

app.use('/api', categoriesRouter);
app.use('/api', minutesRouter);

app.get('/api/test-firmas-whatsapp', async (req, res) => {
    try {
        const resultado = await verificarYNotificarContratosSinFirma();
        res.json({ success: true, resultado });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Arranque de Servidor
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  iniciarWhatsApp();

  const PROGRAMAR_HORA = 8;
  const PROGRAMAR_MINUTO = 30;

  const calcularTiempoSiguienteEjecucion = () => {
      const ahora = new Date();
      const siguiente = new Date();
      siguiente.setHours(PROGRAMAR_HORA, PROGRAMAR_MINUTO, 0, 0);

      if (ahora >= siguiente) {
          siguiente.setDate(siguiente.getDate() + 1);
      }
      return siguiente - ahora;
  };

  const iniciarCronDiario = () => {
      setTimeout(() => {
          verificarYNotificarContratosSinFirma();
          setInterval(verificarYNotificarContratosSinFirma, 24 * 60 * 60 * 1000);
      }, calcularTiempoSiguienteEjecucion());
  };

  iniciarCronDiario();
});