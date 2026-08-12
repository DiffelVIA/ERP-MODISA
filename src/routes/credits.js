const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const querySQL = `
      SELECT 
        pc.id_credit,
        pc.reference_invoice,
        pc.emission_date,
        pc.due_date,
        pc.amount,
        pc.amount_paid,
        pc.status,
        pc.observations,
        COALESCE(p.provider_name, 'Sin Proveedor') AS provider_name,
        COALESCE(pr.project_name, 'Sin Obra') AS project_name,
        CASE 
          WHEN pc.status = 'Pagado' THEN 'Pagado'
          WHEN pc.status = 'Cancelado' THEN 'Cancelado'
          WHEN pc.due_date < CURDATE() THEN 'Vencido'
          ELSE 'Activo'
        END AS tiempo_credito
      FROM provider_credits pc
      LEFT JOIN providers p ON pc.id_provider = p.id_provider
      LEFT JOIN projects pr ON pc.id_project = pr.id_project
      ORDER BY pc.emission_date DESC
    `;
    const [rows] = await pool.query(querySQL);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener créditos:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { amount_paid, status, observations } = req.body;

  try {
    const [credito] = await pool.query('SELECT amount FROM provider_credits WHERE id_credit = ?', [id]);
    if (credito.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const totalAmount = parseFloat(credito[0].amount) || 0;
    let finalStatus = status;

    if (status !== 'Cancelado') {
      if (amount_paid >= totalAmount && totalAmount > 0) {
        finalStatus = 'Pagado';
      } else {
        finalStatus = 'Pendiente';
      }
    }

    await pool.query(`
      UPDATE provider_credits 
      SET amount_paid = ?, status = ?, observations = ? 
      WHERE id_credit = ?
    `, [amount_paid, finalStatus, observations, id]);

    res.json({ status: 'success', statusCalculado: finalStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

module.exports = router;