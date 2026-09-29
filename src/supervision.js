const express = require('express');
const router = express.Router();
const pool = require('../config/db');

function obtenerPuntajeOpcion(opcion) {
  switch (opcion) {
    case 'Excelente': return 1.0;
    case 'Muy bueno': return 0.8;
    case 'Regular': return 0.6;
    case 'Malo': return 0.4;
    case 'Muy malo': return 0.2;
    default: return 0.0; 
  }
}

function calcularEvaluacionYResultado(datos) {
  const vPlanos = obtenerPuntajeOpcion(datos.cumplimiento_planos);
  const vCalidad = obtenerPuntajeOpcion(datos.calidad_obra);
  const vPersonal = obtenerPuntajeOpcion(datos.personal_mano_obra);
  const vMaterial = obtenerPuntajeOpcion(datos.material_orden_seguridad);
  const vGestoria = obtenerPuntajeOpcion(datos.cumplimiento_gestoria);
  const evaluacionCalculada = (vPlanos * 0.25) +
                              (vCalidad * 0.25) +
                              (vPersonal * 0.20) +
                              (vMaterial * 0.15) +
                              (vGestoria * 0.15);

  const evaluacion = Number(evaluacionCalculada.toFixed(4));

  let resultado = 'Sin evaluación';
  if (evaluacion >= 0.9) {
    resultado = 'Excelente';
  } else if (evaluacion >= 0.8) {
    resultado = 'Bueno';
  } else if (evaluacion >= 0.7) {
    resultado = 'Aceptable';
  } else if (evaluacion >= 0.1) {
    resultado = 'Requiere mejora';
  }

  return { evaluacion, resultado };
}

router.get('/', async (req, res) => {
  try {
    const { id_project, id_employee, mes, semana } = req.query;

    let sql = `
      SELECT 
        s.id_supervision,
        s.fecha,
        s.semana,
        s.mes,
        s.id_project,
        p.project_name,
        s.id_employee,
        CONCAT(e.name, ' ', e.last_name) AS residente,
        s.cumplimiento_planos,
        s.justificacion_planos,
        s.calidad_obra,
        s.justificacion_calidad,
        s.personal_mano_obra,
        s.justificacion_personal,
        s.material_orden_seguridad,
        s.justificacion_material,
        s.cumplimiento_gestoria,
        s.justificacion_gestoria,
        s.evaluacion,
        s.resultado,
        s.created_at
      FROM supervision s
      INNER JOIN projects p ON s.id_project = p.id_project
      INNER JOIN employees e ON s.id_employee = e.id_employee
      WHERE 1=1
    `;

    const params = [];

    if (id_project) {
      sql += ` AND s.id_project = ?`;
      params.push(id_project);
    }
    if (id_employee) {
      sql += ` AND s.id_employee = ?`;
      params.push(id_employee);
    }
    if (mes) {
      sql += ` AND s.mes = ?`;
      params.push(mes);
    }
    if (semana) {
      sql += ` AND s.semana = ?`;
      params.push(semana);
    }

    sql += ` ORDER BY s.fecha DESC, s.id_supervision DESC;`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);

  } catch (error) {
    console.error('❌ Error al consultar tabla supervision:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor al obtener supervisiones.' });
  }
});

router.post('/', async (req, res) => {
  const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim() : '';
  const rolesPermitidos = [
    "Director Operativo", 
    "Subdirector de Obra", 
    "Gerente de Costos", 
    "Gerente de Administración", 
    "Director General", 
    "Supervisor", 
    "Residente"
  ];

  if (rolUsuario && !rolesPermitidos.some(r => r.toLowerCase() === rolUsuario.toLowerCase())) {
    return res.status(403).json({
      success: false,
      error: '⛔ Acceso denegado. No cuentas con permisos para registrar supervisiones.'
    });
  }

  const {
    fecha,
    semana,
    mes,
    id_project,
    id_employee,
    cumplimiento_planos = 'No aplica',
    justificacion_planos = null,
    calidad_obra = 'No aplica',
    justificacion_calidad = null,
    personal_mano_obra = 'No aplica',
    justificacion_personal = null,
    material_orden_seguridad = 'No aplica',
    justificacion_material = null,
    cumplimiento_gestoria = 'No aplica',
    justificacion_gestoria = null
  } = req.body;

  if (!fecha || !semana || !mes || !id_project || !id_employee) {
    return res.status(400).json({
      success: false,
      error: 'Campos obligatorios faltantes: fecha, semana, mes, id_project e id_employee son requeridos.'
    });
  }

  try {
    const { evaluacion, resultado } = calcularEvaluacionYResultado({
      cumplimiento_planos,
      calidad_obra,
      personal_mano_obra,
      material_orden_seguridad,
      cumplimiento_gestoria
    });

    const sqlInsert = `
      INSERT INTO supervision (
        fecha,
        semana,
        mes,
        id_project,
        id_employee,
        cumplimiento_planos,
        justificacion_planos,
        calidad_obra,
        justificacion_calidad,
        personal_mano_obra,
        justificacion_personal,
        material_orden_seguridad,
        justificacion_material,
        cumplimiento_gestoria,
        justificacion_gestoria,
        evaluacion,
        resultado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [insertResult] = await pool.query(sqlInsert, [
      fecha,
      parseInt(semana),
      mes,
      parseInt(id_project),
      parseInt(id_employee),
      cumplimiento_planos,
      justificacion_planos ? justificacion_planos.trim() : null,
      calidad_obra,
      justificacion_calidad ? justificacion_calidad.trim() : null,
      personal_mano_obra,
      justificacion_personal ? justificacion_personal.trim() : null,
      material_orden_seguridad,
      justificacion_material ? justificacion_material.trim() : null,
      cumplimiento_gestoria,
      justificacion_gestoria ? justificacion_gestoria.trim() : null,
      evaluacion,
      resultado
    ]);

    res.status(201).json({
      success: true,
      message: '🎉 Evaluación de supervisión registrada correctamente.',
      id_supervision: insertResult.insertId,
      evaluacion,
      resultado
    });

  } catch (error) {
    console.error('❌ Error crítico al insertar en la tabla supervision:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al procesar el registro de supervisión.',
      details: error.message
    });
  }
});

module.exports = router;