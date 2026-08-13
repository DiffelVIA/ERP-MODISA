require('dotenv').config(); // db
const express = require('express');
const mysql = require('mysql2/promise'); // db
const cors = require('cors');
const fs = require('fs'); // db
const path = require('path'); // db
const bcrypt = require('bcrypt'); 
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN A MYSQL//
const pool = require('./src/config/db');

// DRIVE //
const authRouter = require('./src/routes/auth');
app.use('/api/auth/google', authRouter);

// MULTER //
const multer = require('multer');

// UPLOAD //
const upload = require('./src/middlewares/uploads');

// INICIO DE SESIÓN Y GESTIÓN DE CONTRASEÑA //
const authRouter = require('./src/routes/auth');
app.use('/api/auth', authRouter);

// PROYECTOS //
const projectsRouter = require('./src/routes/projects');

app.use('/api/projects', projectsRouter);
app.use('/api/proyectos', projectsRouter);
app.use('/api/projects-report', (req, res, next) => {
  req.url = '/report' + req.url;
  projectsRouter(req, res, next);
});

// CATEGORÍZACIÓN //
const categoriesRouter = require('./src/routes/categories');
app.use('/api', categoriesRouter);

// EMPLEADOS //
const employeesRouter = require('./src/routes/employees');
app.use('/api/empleados', employeesRouter);

// MINUTAS //
const minutesRouter = require('./src/routes/minutes');
app.use('/api', minutesRouter);

// MATERIALES //
const materialesRouter = require('./src/routes/materials');
app.use('/api/materiales', materialesRouter);

//CREDITOS //
const creditosRouter = require('./src/routes/credits');
app.use('/api/creditos', creditosRouter);

// CONTRATOS
const contratosRouter = require('./src/routes/contracts');
app.use('/api/contratos', contratosRouter);

// PAGOS //
const pagosRouter = require('./src/routes/payments');
app.use('/api/pagos', pagosRouter);

// DASHBOARD //
const dashboardRouter = require('./src/routes/dashboard');
app.use('/api/dashboard', dashboardRouter);

// ARRANQUE DE SERVIDOR //
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});