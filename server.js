require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const { iniciarWhatsApp, verificarYNotificarContratosSinFirma } = require('./src/services/whatsapp');
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

// Arranque de Servidor
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  iniciarWhatsApp();

  const PROGRAMAR_HORA = 8;
  const PROGRAMAR_MINUTO = 30;
  const ZONA_HORARIA = 'America/Mexico_City';

  const calcularTiempoSiguienteEjecucion = () => {
      const ahora = new Date();

      const opciones = { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' };
      const partesFecha = new Intl.DateTimeFormat('en-US', opciones).formatToParts(ahora);
      
      let year, month, day;
      for (const part of partesFecha) {
          if (part.type === 'year') year = part.value;
          if (part.type === 'month') month = part.value;
          if (part.type === 'day') day = part.value;
      }

      let siguienteEjecucion = new Date(`${year}-${month}-${day}T${String(PROGRAMAR_HORA).padStart(2, '0')}:${String(PROGRAMAR_MINUTO).padStart(2, '0')}:00-06:00`);

      if (ahora >= siguienteEjecucion) {
          siguienteEjecucion.setDate(siguienteEjecucion.getDate() + 1);
      }

      return siguienteEjecucion.getTime() - ahora.getTime();
  };

  const iniciarCronDiario = () => {
      const msFaltantes = calcularTiempoSiguienteEjecucion();
      console.log(`⏱️ Próxima verificación de firmas programada en ${(msFaltantes / 1000 / 60 / 60).toFixed(2)} horas (8:30 AM hora México).`);

      setTimeout(() => {
          verificarYNotificarContratosSinFirma();
          setInterval(verificarYNotificarContratosSinFirma, 24 * 60 * 60 * 1000);
      }, msFaltantes);
  };

  iniciarCronDiario();
});