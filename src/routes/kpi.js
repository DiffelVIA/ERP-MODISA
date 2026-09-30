const express = require('express');
const router = express.Router();
const db = require('../config/db');

// POST /api/kpi - Guardar nuevo registro de Indicadores de Rendimiento
router.post('/', async (req, res) => {
  try {
    const {
      id_project,
      id_employee,
      fecha,
      semana,
      mes,
      reporte_fotografico,
      justificacion_fotografico,
      volumen_obra,
      justificacion_volumen,
      diagrama_gantt,
      justificacion_gantt,
      atencion_minutas,
      justificacion_minutas,
      planificacion_actividades,
      justificacion_planificacion,
      cumplimiento_actividades,
      justificacion_cumplimiento,
      desfase,
      extemporaneos,
      supervision,
      avance_fisico_obra
    } = req.body;

    const query = `
      INSERT INTO kpi (
        id_project, id_employee, fecha, semana, mes,
        reporte_fotografico, justificacion_fotografico,
        volumen_obra, justificacion_volumen,
        diagrama_gantt, justificacion_gantt,
        atencion_minutas, justificacion_minutas,
        planificacion_actividades, justificacion_planificacion,
        cumplimiento_actividades, justificacion_cumplimiento,
        desfase, extemporaneos, supervision, avance_fisico_obra
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const valores = [
      id_project,
      id_employee,
      fecha,
      semana,
      mes,
      reporte_fotografico || 'no aplica',
      justificacion_fotografico || null,
      volumen_obra || 'no aplica',
      justificacion_volumen || null,
      diagrama_gantt || 'no aplica',
      justificacion_gantt || null,
      atencion_minutas || 'No Aplica',
      justificacion_minutas || null,
      planificacion_actividades || 'no aplica',
      justificacion_planificacion || null,
      cumplimiento_actividades || 'No Aplica',
      justificacion_cumplimiento || null,
      desfase || 0,
      extemporaneos || 0,
      supervision || 'no_hay_registro',
      avance_fisico_obra || '0%'
    ];

    const [resultado] = await db.query(query, valores);
    res.status(201).json({ message: 'KPI guardado con éxito', id: resultado.insertId });

  } catch (error) {
    console.error('Error al guardar el registro KPI:', error);
    res.status(500).json({ error: 'Error al registrar los indicadores de rendimiento' });
  }
});

// GET /api/kpi - Consultar histórico de KPIs
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        k.*,
        p.name AS project_name,
        CONCAT(e.first_name, ' ', e.last_name) AS employee_name
      FROM kpi k
      LEFT JOIN projects p ON k.id_project = p.id
      LEFT JOIN employees e ON k.id_employee = e.id
      ORDER BY k.fecha DESC, k.semana DESC
    `;
    const [filas] = await db.query(query);
    res.json(filas);
  } catch (error) {
    console.error('Error al obtener KPIs:', error);
    res.status(500).json({ error: 'Error al consultar indicadores de rendimiento' });
  }
});

module.exports = router;