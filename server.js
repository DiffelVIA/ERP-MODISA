require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  iniciarWhatsApp,
  verificarYNotificarContratosSinFirma,
  verificarYNotificarMinutasPendientes,
  verificarYNotificarFlotillaSinResguardo
} = require('./src/services/whatsapp');
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
const supervisionRouter = require('./src/routes/supervision');
const kpiRouter = require('./src/routes/kpi');
const vacacionesRouter = require('./src/routes/vacaciones');
const vehiclesRouter = require('./src/routes/vehicles');
const {
  router: prestamosRouter,
  verificarYNotificarPrestamosPorVencer
} = require('./src/routes/loans');

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

app.use('/api/supervision', supervisionRouter);
app.use('/api/kpi', kpiRouter);

app.use('/api/vacaciones', vacacionesRouter);
app.use('/api/prestamos', prestamosRouter);
app.use('/api/camionetas', vehiclesRouter);

app.use('/api', categoriesRouter);
app.use('/api', minutesRouter);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  iniciarWhatsApp();

  const PROGRAMAR_HORA = 8;
  const PROGRAMAR_MINUTO = 30;
  const ZONA_HORARIA = 'America/Mexico_City';

  const calcularTiempoSiguienteEjecucion = () => {
      const ahora = new Date();
      const partes = new Intl.DateTimeFormat('en-US', {
          timeZone: ZONA_HORARIA,
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
      }).formatToParts(ahora);

      const mapa = {};
      for (const p of partes) {
          mapa[p.type] = parseInt(p.value, 10);
      }

      const horaActualMx = mapa.hour === 24 ? 0 : mapa.hour;
      const ahoraMxEnMs = Date.UTC(mapa.year, mapa.month - 1, mapa.day, horaActualMx, mapa.minute, mapa.second);
      let objetivoMxEnMs = Date.UTC(mapa.year, mapa.month - 1, mapa.day, PROGRAMAR_HORA, PROGRAMAR_MINUTO, 0);

      if (ahoraMxEnMs >= objetivoMxEnMs) {
          objetivoMxEnMs += 24 * 60 * 60 * 1000;
      }

      return objetivoMxEnMs - ahoraMxEnMs;
  };

  const ejecutarRevisionesDiarias = async () => {
      try {
          await verificarYNotificarContratosSinFirma();
      } catch (err) {
          console.error('❌ Error en tarea programada de contratos:', err.message);
      }

      try {
          await verificarYNotificarMinutasPendientes();
      } catch (err) {
          console.error('❌ Error en tarea programada de minutas:', err.message);
      }

      try {
          await verificarYNotificarPrestamosPorVencer();
      } catch (err) {
          console.error('❌ Error en tarea programada de préstamos:', err.message);
      }

      try {
          await verificarYNotificarFlotillaSinResguardo();
      } catch (err) {
          console.error('❌ Error en tarea programada de flotilla:', err.message);
      }
  };

  const iniciarCronDiario = () => {
      const msFaltantes = calcularTiempoSiguienteEjecucion();
      console.log(`⏱️ Próxima verificación automática (contratos, minutas, préstamos y flotilla) programada en ${(msFaltantes / 1000 / 60 / 60).toFixed(2)} horas (8:30 AM hora México).`);

      setTimeout(() => {
          ejecutarRevisionesDiarias();
          setInterval(ejecutarRevisionesDiarias, 24 * 60 * 60 * 1000);
      }, msFaltantes);
  };

  iniciarCronDiario();
});