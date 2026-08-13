require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Importación de Routers
const authRouter = require('./src/routes/auth');
const projectsRouter = require('./src/routes/projects');
const categoriesRouter = require('./src/routes/categories');
const employeesRouter = require('./src/routes/employees');
const minutesRouter = require('./src/routes/minutes');
const materialesRouter = require('./src/routes/materials');
const creditosRouter = require('./src/routes/credits');
const contratosRouter = require('./src/routes/contracts');
const pagosRouter = require('./src/routes/payments');
const dashboardRouter = require('./src/routes/dashboard');

// Vinculación de Rutas
app.use('/api/auth/google', authRouter);
app.use('/api/auth', authRouter);
app.use('/api/proyectos', projectsRouter);
app.use('/api/projects-report', (req, res, next) => {
  req.url = '/report' + req.url;
  projectsRouter(req, res, next);
});
app.use('/api', categoriesRouter);
app.use('/api/empleados', employeesRouter);
app.use('/api', minutesRouter);
app.use('/api/materiales', materialesRouter);
app.use('/api/creditos', creditosRouter);
app.use('/api/contratos', contratosRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/dashboard', dashboardRouter);

// Arranque de Servidor
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});