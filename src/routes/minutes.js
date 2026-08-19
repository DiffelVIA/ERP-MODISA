const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { vereficarToken, verificarRol, verificarToken } = require('../middlewares/authMiddleware');

router.get('/tabla_minutas', async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const hoyFormateado = `${anio}-${mes}-${dia}`;

    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado != 'completada' AND estado != 'atrasada' AND estado != 'aplazada'
    `, [hoyFormateado]);

    await pool.query(`
      DELETE FROM minutas 
      WHERE estado = 'completada' AND fecha < NOW() - INTERVAL 5 WEEK
    `);

    const querySQL = `
      SELECT id, proyecto, avance, responsable, semana, fecha, descripcion, estado, comentarioDirector 
      FROM minutas 
      ORDER BY fecha ASC;
    `;

    console.log("!!! EJECUTANDO CONSULTA SEGURA DE MINUTAS !!!");

    const [filas] = await pool.query(querySQL);
    console.log(`Se encontraron ${filas.length} minutas.`);
    
    res.json(filas);

  } catch (error) {
    console.error('Error crítico dentro de GET /api/tabla_minutas:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar minutas', detalle: error.message });
  }
});

router.post('/tabla_minutas', verificarToken, (req, res, next) => {
  const rolUsuario = req.usuario ? req.usuario.rol : (req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '');
  if (rolUsuario !== "Director Operativo") {
    return res.status(403).json({ error: '⛔ Acceso denegado'});
  }

  next();

}, async (req, res) => {
  const minutas = req.body;
  const listaMinutas = Array.isArray(minutas) ? minutas : [minutas];

  try {
    for (const item of listaMinutas) {
      
      const [registroPrevio] = await pool.query(
        'SELECT fecha, semana, estado, comentarioDirector FROM minutas WHERE id = ?', 
        [item.id]
      );
      
      let comentarioFinal = item.comentarioDirector || item.comentariodirector || '';
      let fechaDestino = item.fecha ? item.fecha.split('T')[0] : new Date().toISOString().split('T')[0];
      let semanaOriginal;

      if (registroPrevio.length > 0) {
        const datosOriginales = registroPrevio[0];

        semanaOriginal = datosOriginales.semana;

        if (item.estado !== 'aplazada') {
          fechaDestino = datosOriginales.fecha ? new Date(datosOriginales.fecha).toISOString().split('T')[0] : fechaDestino;
        }

        if (item.estado === 'completada' && datosOriginales.estado !== 'completada') {
          const fechaLimiteOriginal = new Date(datosOriginales.fecha);
          const fechaCompletadoHoy = new Date();

          fechaLimiteOriginal.setHours(0, 0, 0, 0);
          fechaCompletadoHoy.setHours(0, 0, 0, 0);

          if (fechaCompletadoHoy > fechaLimiteOriginal) {
            const diferenciaMilisegundos = fechaCompletadoHoy.getTime() - fechaLimiteOriginal.getTime();
            const diasRetrasados = Math.floor(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
            
            const prefijoRetraso = `⚠️ Esta actividad se completó con ${diasRetrasados} días retrasados.`;

            if (comentarioFinal) {
              if (!comentarioFinal.includes(`con ${diasRetrasados} días retrasados`)) {
                comentarioFinal = `${comentarioFinal} | ${prefijoRetraso}`;
              }
            } else {
              comentarioFinal = prefijoRetraso;
            }
          }
        }
      } else {
        if (item.semana !== undefined && item.semana !== null && !isNaN(Number(item.semana)) && Number(item.semana) !== 0) {
          semanaOriginal = Number(item.semana);
        } else {
          const fechaHoy = new Date();
          const primeraFechaAnio = new Date(fechaHoy.getFullYear(), 0, 1);
          const diasPasados = Math.floor((fechaHoy - primeraFechaAnio) / (1000 * 60 * 60 * 24));
          semanaOriginal = Math.ceil((diasPasados + primeraFechaAnio.getDay() + 1) / 7);
        }
      }

      const querySQL = `
        INSERT INTO minutas (id, proyecto, avance, responsable, semana, fecha, descripcion, estado, comentarioDirector)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          estado = ?,
          comentarioDirector = ?,
          proyecto = ?,
          avance = ?,
          responsable = ?,
          fecha = ?, 
          descripcion = ?;
      `;

      const valoresControlados = [
        item.id, 
        item.proyecto, 
        item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0, 
        item.responsable, 
        semanaOriginal, 
        fechaDestino, 
        item.descripcion, 
        item.estado, 
        comentarioFinal,
        item.estado,
        comentarioFinal,
        item.proyecto,
        item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0,
        item.responsable,
        fechaDestino,
        item.descripcion
      ];

      await pool.query(querySQL, valoresControlados);
    }

    res.json({ mensaje: 'Minutas sincronizadas con éxito en Aiven' });
  } catch (error) {
    console.error('Error en el guardado de minutas', error);
    res.status(500).json({ error: 'Error al traer minutas de las bases de datos', detalle: error.message });
  }
});

router.get('/notificaciones/minutas-resumen', async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const hoyFormateado = `${anio}-${mes}-${dia}`;

    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado NOT IN ('completada', 'atrasada', 'aplazada')
    `, [hoyFormateado]);

    const responsableReq = req.headers['x-usuario-nombre'] ? req.headers['x-usuario-nombre'].trim() : '';
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim().toLowerCase() : '';

    let querySQL = '';
    let parametrosSQL = [];

    if (rolUsuario === 'director operativo' || rolUsuario === 'director_operativo' || !responsableReq) {
      querySQL = `
        SELECT 
          COUNT(CASE WHEN estado = 'atrasada' THEN 1 END) AS atrasadas,
          COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) AS pendientes,
          COUNT(CASE WHEN estado = 'aplazada' THEN 1 END) AS aplazadas,
          COUNT(*) AS total
        FROM minutas
        WHERE estado != 'completada';
      `;
    } else {
      querySQL = `
        SELECT 
          COUNT(CASE WHEN estado = 'atrasada' THEN 1 END) AS atrasadas,
          COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) AS pendientes,
          COUNT(CASE WHEN estado = 'aplazada' THEN 1 END) AS aplazadas,
          COUNT(*) AS total
        FROM minutas
        WHERE estado != 'completada' AND LOWER(responsable) LIKE LOWER(?);
      `;
      parametrosSQL = [`%${responsableReq}%`];
    }

    const [filas] = await pool.query(querySQL, parametrosSQL);
    const resumen = filas[0] || { atrasadas: 0, pendientes: 0, aplazadas: 0, total: 0 };

    res.json(resumen);

  } catch (error) {
    console.error('Error al obtener resumen de notificaciones:', error);
    res.status(500).json({ error: 'Error al consultar notificaciones de minutas' });
  }
});

module.exports = router;