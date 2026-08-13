const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/metrics/:id_project', async (req, res) => {
  const { id_project } = req.params;

  try {
    const [filas] = await pool.query(
      `SELECT 
        SUM(mano_obra) AS mano_obra_auth,
        SUM(materiales) AS materiales_auth,
        SUM(maquinaria_equipo) AS maquinaria_auth,
        SUM(contratos) AS contratos_auth,
        SUM(total) AS total_auth
       FROM project_categories 
       WHERE id_project = ?`,
      [id_project]
    );
    const metrics = filas[0] || {};
    const rubros = [
      { nombre: 'Mano de Obra', autorizado: metrics.mano_obra_auth || 0, ejecutado: 0.00 },
      { nombre: 'Materiales', autorizado: metrics.materiales_auth || 0, ejecutado: 0.00 },
      { nombre: 'Maquinaria y Equipo', autorizado: metrics.maquinaria_auth || 0, ejecutado: 0.00 },
      { nombre: 'Contratos', autorizado: metrics.contratos_auth || 0, ejecutado: 0.00 }
    ];
    const totalAutorizado = parseFloat(metrics.total_auth) || 0;
    const totalEjecutado = rubros.reduce((acc, r) => acc + r.ejecutado, 0);
    res.json({
      totales: {
        autorizado: totalAutorizado,
        ejecutado: totalEjecutado
      },
      rubros
    });
  } catch (error) {
    console.error('Error al obtener métricas del dashboard:', error);
    res.status(500).json({ error: 'Error al consultar métricas' });
  }
});

module.exports = router;