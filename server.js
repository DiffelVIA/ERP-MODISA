// Endpoint de métricas corregido
app.get('/api/dashboard/metrics/:id_project', async (req, res) => {
  const { id_project } = req.params;
  let connection;

  try {
    connection = await pool.getConnection();

    // 1. Presupuesto Autorizado por Rubro desde project_categories
    const queryAuth = `
      SELECT 
        SUM(COALESCE(mano_obra, 0)) AS mano_obra_auth,
        SUM(COALESCE(materiales, 0)) AS materiales_auth,
        SUM(COALESCE(maquinaria_equipo, 0)) AS maquinaria_auth,
        SUM(COALESCE(contratos, 0)) AS contratos_auth,
        SUM(COALESCE(total, 0)) AS total_auth
      FROM project_categories
      WHERE id_project = ?;
    `;

    // 2. Ejecutado Real (Únicamente Pagos Efectuados de payment_order_details)
    const queryEjecutado = `
      SELECT 
        SUM(CASE 
            WHEN LOWER(COALESCE(payment_type, '')) LIKE '%mano%' 
              OR LOWER(COALESCE(payment_type, '')) LIKE '%destajo%' 
            THEN IFNULL(monto_pagado, 0) ELSE 0 
        END) AS mano_obra_ejecutado,

        SUM(CASE 
            WHEN LOWER(COALESCE(payment_type, '')) LIKE '%material%' 
              OR LOWER(COALESCE(payment_type, '')) LIKE '%caja%' 
            THEN IFNULL(monto_pagado, 0) ELSE 0 
        END) AS materiales_ejecutado,

        SUM(CASE 
            WHEN LOWER(COALESCE(payment_type, '')) LIKE '%maquinaria%' 
              OR LOWER(COALESCE(payment_type, '')) LIKE '%equipo%' 
            THEN IFNULL(monto_pagado, 0) ELSE 0 
        END) AS maquinaria_ejecutado,

        SUM(CASE 
            WHEN LOWER(COALESCE(payment_type, '')) LIKE '%contrat%' 
              OR LOWER(COALESCE(payment_type, '')) LIKE '%servicio%' 
              OR LOWER(COALESCE(payment_type, '')) LIKE '%subcontrat%' 
            THEN IFNULL(monto_pagado, 0) ELSE 0 
        END) AS contratos_ejecutado

      FROM payment_order_details
      WHERE id_project = ? AND IFNULL(monto_pagado, 0) > 0;
    `;

    // 3. Monto Comprometido (Órdenes de Pago en estado Pendiente)
    const queryComprometido = `
      SELECT SUM(COALESCE(amount, 0)) AS total_comprometido
      FROM payment_order_details
      WHERE id_project = ? AND LOWER(COALESCE(status, '')) = 'pendiente';
    `;

    // 4. Métodos de Pago
    const queryMetodosPago = `
      SELECT 
        COALESCE(NULLIF(TRIM(payment_method), ''), 'No especificado') AS metodo,
        SUM(COALESCE(monto_pagado, amount, 0)) AS total
      FROM payment_order_details
      WHERE id_project = ? AND IFNULL(monto_pagado, 0) > 0
      GROUP BY metodo;
    `;

    // 5. Flujo Semanal
    const queryFlujoSemanal = `
      SELECT 
        COALESCE(po.fiscal_week, 0) AS semana,
        SUM(COALESCE(pod.monto_pagado, 0)) AS total
      FROM payment_order_details pod
      INNER JOIN payment_orders po ON pod.id_payment_order = po.id_payment_order
      WHERE pod.id_project = ? AND IFNULL(pod.monto_pagado, 0) > 0
      GROUP BY po.fiscal_week
      ORDER BY po.fiscal_week ASC;
    `;

    // 6. Top Proveedores
    const queryTopProveedores = `
      SELECT 
        COALESCE(NULLIF(TRIM(provider), ''), 'Sin Proveedor') AS proveedor,
        SUM(COALESCE(monto_pagado, 0)) AS total
      FROM payment_order_details
      WHERE id_project = ? AND IFNULL(monto_pagado, 0) > 0
      GROUP BY proveedor
      ORDER BY total DESC
      LIMIT 5;
    `;

    const [[authData]] = await connection.query(queryAuth, [id_project]);
    const [[ejecData]] = await connection.query(queryEjecutado, [id_project]);
    const [[compData]] = await connection.query(queryComprometido, [id_project]);
    const [filasMetodos] = await connection.query(queryMetodosPago, [id_project]);
    const [filasFlujo] = await connection.query(queryFlujoSemanal, [id_project]);
    const [filasProveedores] = await connection.query(queryTopProveedores, [id_project]);

    const rubros = [
      { 
        nombre: 'Mano de Obra', 
        autorizado: parseFloat(authData?.mano_obra_auth) || 0, 
        ejecutado: parseFloat(ejecData?.mano_obra_ejecutado) || 0 
      },
      { 
        nombre: 'Materiales', 
        autorizado: parseFloat(authData?.materiales_auth) || 0, 
        ejecutado: parseFloat(ejecData?.materiales_ejecutado) || 0 
      },
      { 
        nombre: 'Maquinaria y Equipo', 
        autorizado: parseFloat(authData?.maquinaria_auth) || 0, 
        ejecutado: parseFloat(ejecData?.maquinaria_ejecutado) || 0 
      },
      { 
        nombre: 'Contratos', 
        autorizado: parseFloat(authData?.contratos_auth) || 0, 
        ejecutado: parseFloat(ejecData?.contratos_ejecutado) || 0 
      }
    ];

    const totalEjecutado = rubros.reduce((acc, r) => acc + r.ejecutado, 0);

    res.json({
      totales: {
        autorizado: parseFloat(authData?.total_auth) || 0,
        ejecutado: totalEjecutado,
        comprometido: parseFloat(compData?.total_comprometido) || 0
      },
      rubros,
      metodosPago: filasMetodos,
      flujoSemanal: filasFlujo,
      topProveedores: filasProveedores
    });

  } catch (error) {
    console.error('Error al obtener métricas del dashboard:', error);
    res.status(500).json({ error: 'Error al consultar métricas' });
  } finally {
    if (connection) connection.release();
  }
});