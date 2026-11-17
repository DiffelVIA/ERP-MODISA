const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { verificarToken } = require('../middlewares/authMiddleware');
const { notificarNuevasMinutas, notificarMinutasAplazadas } = require('../services/whatsapp');

const normalizarFechaSQL = (valorFecha, fechaRespaldo = null) => {
  if (!valorFecha) return fechaRespaldo;

  if (valorFecha instanceof Date) {
    if (isNaN(valorFecha.getTime())) return fechaRespaldo;
    return valorFecha.toISOString().split('T')[0];
  }

  const texto = String(valorFecha).trim();
  if (!texto || texto.startsWith('0000-00-00')) return fechaRespaldo;

  const soloFecha = texto.includes('T') ? texto.split('T')[0] : texto.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
    return soloFecha;
  }

  const fechaParseada = new Date(texto);
  if (!isNaN(fechaParseada.getTime())) {
    return fechaParseada.toISOString().split('T')[0];
  }

  return fechaRespaldo;
};

router.get('/tabla_minutas', verificarToken, async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const hoyFormateado = `${anio}-${mes}-${dia}`;

    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado NOT IN ('completada', 'atrasada')
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

router.post('/tabla_minutas', verificarToken, async (req, res, next) => {
  const usuarioSesion = req.usuario || {};
  const minutas = req.body;
  const listaMinutas = Array.isArray(minutas) ? minutas : [minutas];

  if (listaMinutas.length === 0) {
    return res.status(400).json({ error: 'No se recibieron minutas para procesar.' });
  }

  const rolRaw = usuarioSesion.rol || usuarioSesion.role || usuarioSesion.job_title || '';
  const rolLimpio = rolRaw.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const esDirector = rolLimpio.includes('director') || rolLimpio.includes('auxiliar');
  const esResidente = rolLimpio.includes('residente');

  if (esDirector || esResidente) {
    return next();
  }

  const nombreUsuarioSesion = (
    usuarioSesion.nombre || 
    usuarioSesion.nombre_empleado || 
    usuarioSesion.name || 
    usuarioSesion.usuario || 
    ''
  ).toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  if (nombreUsuarioSesion !== '') {
    const todasSonPropias = listaMinutas.every(item => {
      const respItem = (item.responsable || '').toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return respItem !== '' && (respItem.includes(nombreUsuarioSesion) || nombreUsuarioSesion.includes(respItem));
    });

    if (todasSonPropias) {
      return next();
    }
  }

  return res.status(403).json({ error: '⛔ Acceso denegado: Solo puedes actualizar las minutas asignadas a tu nombre.' });

}, async (req, res) => {
  const minutas = req.body;
  const listaMinutas = Array.isArray(minutas) ? minutas : [minutas];
  const minutasRecienCreadas = [];
  const minutasAplazadas = [];
  const hoyIso = new Date().toISOString().split('T')[0];

  try {
    for (const item of listaMinutas) {
      if (!item || !item.id) continue;

      const [registroPrevio] = await pool.query(
        'SELECT proyecto, responsable, descripcion, avance, fecha, semana, estado, comentarioDirector, aviso_vencimiento_enviado, ultima_notificacion_wa FROM minutas WHERE id = ?', 
        [item.id]
      );
      
      let comentarioFinal = item.comentarioDirector !== undefined
        ? item.comentarioDirector
        : (item.comentariodirector !== undefined ? item.comentariodirector : '');
      let fechaDestino = normalizarFechaSQL(item.fecha, hoyIso);
      let semanaOriginal;
      let avisoVencimientoEnviado = 0;
      let ultimaNotificacionWa = null;
      let fueAplazadaAhora = false;
      const esRegistroNuevo = registroPrevio.length === 0;

      let proyectoFinal = item.proyecto;
      let responsableFinal = item.responsable;
      let descripcionFinal = item.descripcion;
      let avanceFinal = item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0;
      let estadoFinal = item.estado || 'pendiente';

      if (!esRegistroNuevo) {
        const datosOriginales = registroPrevio[0];
        const fechaOriginalStr = normalizarFechaSQL(datosOriginales.fecha, fechaDestino);

        proyectoFinal = proyectoFinal !== undefined && proyectoFinal !== null ? proyectoFinal : datosOriginales.proyecto;
        responsableFinal = responsableFinal !== undefined && responsableFinal !== null ? responsableFinal : datosOriginales.responsable;
        descripcionFinal = descripcionFinal !== undefined && descripcionFinal !== null ? descripcionFinal : datosOriginales.descripcion;
        avanceFinal = item.avance !== undefined && item.avance !== null ? Number(item.avance) : Number(datosOriginales.avance || 0);
        estadoFinal = item.estado || datosOriginales.estado || 'pendiente';

        semanaOriginal = datosOriginales.semana;
        avisoVencimientoEnviado = datosOriginales.aviso_vencimiento_enviado || 0;
        ultimaNotificacionWa = datosOriginales.ultima_notificacion_wa || null;

        if (estadoFinal !== 'aplazada') {
          fechaDestino = fechaOriginalStr;
        } else {
          avisoVencimientoEnviado = 0;
          ultimaNotificacionWa = null;
          if (datosOriginales.estado !== 'aplazada' || fechaDestino !== fechaOriginalStr) {
            fueAplazadaAhora = true;
          }
        }

        if (estadoFinal === 'completada' && datosOriginales.estado !== 'completada') {
          const fechaLimiteOriginal = new Date(`${fechaOriginalStr}T00:00:00`);
          const fechaCompletadoHoy = new Date();
          fechaCompletadoHoy.setHours(0, 0, 0, 0);

          if (!isNaN(fechaLimiteOriginal.getTime()) && fechaCompletadoHoy > fechaLimiteOriginal) {
            const diferenciaMilisegundos = fechaCompletadoHoy.getTime() - fechaLimiteOriginal.getTime();
            const diasRetrasados = Math.floor(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
            
            const prefijoRetraso = `⚠️ Esta actividad se completó con ${diasRetrasados} días retrasados.`;

            if (comentarioFinal) {
              if (!comentarioFinal.includes(`con ${diasRetrasados} días retrasados`)) {
                comentarioFinal = `${comentarioFinal} \vert{}${prefijoRetraso}`;
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
        INSERT INTO minutas (id, proyecto, avance, responsable, semana, fecha, descripcion, estado, comentarioDirector, aviso_vencimiento_enviado, ultima_notificacion_wa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          estado = ?,
          comentarioDirector = ?,
          proyecto = ?,
          avance = ?,
          responsable = ?,
          fecha = ?, 
          descripcion = ?,
          aviso_vencimiento_enviado = ?,
          ultima_notificacion_wa = ?;
      `;

      const valoresControlados = [
        item.id, 
        proyectoFinal, 
        isNaN(avanceFinal) ? 0 : avanceFinal, 
        responsableFinal, 
        semanaOriginal, 
        fechaDestino, 
        descripcionFinal, 
        estadoFinal, 
        comentarioFinal,
        avisoVencimientoEnviado,
        ultimaNotificacionWa,
        estadoFinal,
        comentarioFinal,
        proyectoFinal,
        isNaN(avanceFinal) ? 0 : avanceFinal,
        responsableFinal,
        fechaDestino,
        descripcionFinal,
        avisoVencimientoEnviado,
        ultimaNotificacionWa
      ];

      await pool.query(querySQL, valoresControlados);

      if (esRegistroNuevo && String(estadoFinal).toLowerCase() !== 'completada') {
        minutasRecienCreadas.push({
          id: item.id,
          proyecto: proyectoFinal,
          responsable: responsableFinal,
          fecha: fechaDestino,
          descripcion: descripcionFinal,
          comentarioDirector: comentarioFinal
        });
      } else if (fueAplazadaAhora) {
        minutasAplazadas.push({
          id: item.id,
          proyecto: proyectoFinal,
          responsable: responsableFinal,
          fecha: fechaDestino,
          descripcion: descripcionFinal,
          comentarioDirector: comentarioFinal
        });
      }
    }

    if (minutasRecienCreadas.length > 0) {
      notificarNuevasMinutas(minutasRecienCreadas).catch(err => {
        console.error('❌ Error en notificación asíncrona de minutas nuevas:', err.message);
      });
    }

    if (minutasAplazadas.length > 0) {
      notificarMinutasAplazadas(minutasAplazadas).catch(err => {
        console.error('❌ Error en notificación asíncrona de minutas aplazadas:', err.message);
      });
    }

    res.json({ mensaje: 'Minutas sincronizadas con éxito en Aiven' });
  } catch (error) {
    console.error('Error en el guardado de minutas', error);
    res.status(500).json({ error: 'Error al traer minutas de las bases de datos', detalle: error.message });
  }
});

router.get('/notificaciones/minutas-resumen', verificarToken, async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const hoyFormateado = `${anio}-${mes}-${dia}`;

    await pool.query(`
      UPDATE minutas 
      SET estado = 'atrasada' 
      WHERE fecha < ? AND estado NOT IN ('completada', 'atrasada')
    `, [hoyFormateado]);

    const usuarioSesion = req.usuario || {};
    const rolUsuario = (usuarioSesion.rol || usuarioSesion.role || usuarioSesion.job_title || '').toString().trim().toLowerCase();
    const responsableReq = (
      usuarioSesion.nombre || 
      usuarioSesion.nombre_empleado || 
      usuarioSesion.name || 
      usuarioSesion.usuario || 
      ''
    ).toString().trim();

    let querySQL = '';
    let parametrosSQL = [];

    if (rolUsuario === 'director operativo' || rolUsuario === 'director_operativo' || rolUsuario === 'director general' || !responsableReq) {
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