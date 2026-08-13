const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const rolUsuario = req.headers['x-user-rol'] ? req.headers['x-user-rol'].trim().toLowerCase() : '';
    const querySQL = `
      SELECT 
        od.id_detail,
        CONCAT(e.name, ' ', e.last_name) AS solicitante,
        e.phone AS telefono,
        p.project_name AS obra,
        mo.id_project,
        od.id_project_category,
        mo.order_date,
        mo.fiscal_week,
        pc.grupo,
        pc.categoria,
        pc.subcategoria,
        od.material_description,
        od.unit,
        od.quantity,
        od.commentary,
        od.provider AS proveedor,
        od.reference AS referencia,
        od.unit_price AS precio_unitario,
        LOWER(od.status) AS estado,
        COALESCE(pc.materiales, 0.00) AS presupuesto_autorizado,
        COALESCE((
          SELECT SUM(sub_od.quantity * sub_od.unit_price)
          FROM order_details AS sub_od
          INNER JOIN material_orders AS sub_mo ON sub_od.id_order = sub_mo.id_order
          WHERE sub_mo.id_project = mo.id_project
            AND sub_od.id_project_category = od.id_project_category
            AND sub_od.id_detail <> od.id_detail
            AND LOWER(sub_od.status) IN ('cotizado', 'comprado')
        ), 0.00) AS monto_gastado_otros
      FROM order_details AS od
      INNER JOIN material_orders AS mo ON od.id_order = mo.id_order
      LEFT JOIN projects AS p ON mo.id_project = p.id_project
      LEFT JOIN employees AS e ON mo.id_employee = e.id_employee
      LEFT JOIN project_categories AS pc ON od.id_project_category = pc.id_project_category;
    `;
    const [rows] = await pool.query(querySQL);
    const rolesAdministrativos = [
      "gerente administración", 
      "compras", 
      "director general", 
      "director operativo",
      "gerente de costos", 
      "auxiliar costos"
    ];

    if (!rolesAdministrativos.includes(rolUsuario)) {
      console.log(`🔒 Filtro de seguridad activado. Rol detectado: "${rolUsuario}". Costos ocultados.`);
      
      const datosSeguros = rows.map(item => ({
        ...item,
        proveedor: null,
        precio_unitario: "0.00",
        monto: null,
        presupuesto_autorizado: 0,
        monto_gastado_otros: 0
      }));
      
      return res.json(datosSeguros);
    }
    
    console.log(`🔓 Acceso completo concedido a rol administrativo: "${rolUsuario}"`);
    res.json(rows);

  } catch (error) {
    console.error('Error al obtener materiales de MODISA:', error);
    res.status(500).json({ error: 'Error interno al cargar materiales', detalle: error.message });
  }
});

router.post('/', async (req, res) => {
  const { id_employee, order_date, fiscal_week, materiales } = req.body;
  
  console.log("📥 Datos recibidos en el Backend:", req.body);

  if (id_employee === undefined || id_employee === null || isNaN(id_employee)) {
    return res.status(400).json({ error: 'El campo id_employee es inválido o está vacío.' });
  }
  if (!order_date) {
    return res.status(400).json({ error: 'El campo order_date está vacío.' });
  }
  if (fiscal_week === undefined || fiscal_week === null || isNaN(fiscal_week)) {
    return res.status(400).json({ error: 'El campo fiscal_week es inválido o está vacío.' });
  }
  if (!materiales || !Array.isArray(materiales) || materiales.length === 0) {
    return res.status(400).json({ error: 'La lista de materiales está vacía.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const materialesPorProyecto = materiales.reduce((acc, mat) => {
      const idProj = mat.id_project;
      if (!idProj || isNaN(idProj)) {
        throw new Error(`El material "${mat.material_description}" no tiene un id_project válido.`);
      }
      if (!acc[idProj]) {
        acc[idProj] = [];
      }
      acc[idProj].push(mat);
      return acc;
    }, {});

    const queryOrder = `INSERT INTO material_orders (id_project, id_employee, order_date, fiscal_week) VALUES (?, ?, ?, ?)`;
    const queryDetails = `
      INSERT INTO order_details 
        (id_order, id_project_category, material_description, unit, quantity, commentary, status, unit_price) 
      VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', 0.00)
    `;

    for (const [id_project, listaMats] of Object.entries(materialesPorProyecto)) {
      const [resOrder] = await connection.query(queryOrder, [
        id_project, 
        id_employee, 
        order_date, 
        fiscal_week
      ]);
      const id_order = resOrder.insertId;

      for (const mat of listaMats) {
        if (!mat.id_project_category) {
          throw new Error(`El material "${mat.material_description}" no tiene una categoría válida.`);
        }
        await connection.query(queryDetails, [
          id_order, 
          mat.id_project_category, 
          mat.material_description, 
          mat.unit, 
          mat.quantity, 
          mat.commentary
        ]);
      }
    }

    await connection.commit();
    res.json({ status: 'success', mensaje: 'Solicitud guardada con éxito.' });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en inserción:", error.message);
    res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  } finally {
    connection.release();
  }
});

router.put('/detalle/:id', async (req, res) => {
  const { id } = req.params;
  const { proveedor, referencia, precio_unitario, estado } = req.body;
  const rolUsuario = req.headers['x-user-rol'];

  const rolesAdministrativos = [
    "Gerente Administración", "Compras", "Director General", 
    "Director Operativo", "Gerente de Costos", "Auxiliar Costos"
  ];

  if (!rolUsuario || !rolesAdministrativos.includes(rolUsuario.trim())) {
    return res.status(403).json({
      error: 'Acceso denegado',
      detalle: 'No cuentas con los permisos administrativos necesarios para editar cotizaciones.'
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let id_credit = null;
    let id_provider = null; 
    const precio = parseFloat(precio_unitario) || 0.00;
    const refLimpia = referencia ? referencia.trim() : '';

    if (proveedor && proveedor.trim() !== "") {
      const nombreProveedor = proveedor.trim();
      
      const [provBD] = await connection.query(
        'SELECT id_provider FROM providers WHERE provider_name = ? LIMIT 1',
        [nombreProveedor]
      );
      
      if (provBD.length > 0) {
        id_provider = provBD[0].id_provider;
      } else {
        const [nuevoProv] = await connection.query(
          'INSERT INTO providers (provider_name, credit_days) VALUES (?, 30)',
          [nombreProveedor]
        );
        id_provider = nuevoProv.insertId;
        console.log(`✨ Proveedor creado en su tabla: "${nombreProveedor}" con ID: ${id_provider}`);
      }
    }

    if (refLimpia !== '') {
      const [existeCredito] = await connection.query(
        'SELECT id_credit FROM provider_credits WHERE reference_invoice = ? LIMIT 1',
        [refLimpia]
      );

      if (existeCredito.length > 0) {
        id_credit = existeCredito[0].id_credit;
      } else {
        const [datosOrigen] = await connection.query(`
          SELECT mo.id_project, mo.order_date 
          FROM order_details od
          INNER JOIN material_orders mo ON od.id_order = mo.id_order
          WHERE od.id_detail = ? LIMIT 1
        `, [id]);

        let id_project = null;
        let fechaEmision = new Date().toISOString().split('T')[0];

        if (datosOrigen.length > 0) {
          id_project = datosOrigen[0].id_project;
          if (datosOrigen[0].order_date) {
            fechaEmision = new Date(datosOrigen[0].order_date).toISOString().split('T')[0];
          }
        }

        const [nuevoCredito] = await connection.query(`
          INSERT INTO provider_credits 
            (id_provider, id_project, reference_invoice, emission_date, amount, status) 
          VALUES (?, ?, ?, ?, 0.00, 'Pendiente')
        `, [id_provider, id_project, refLimpia, fechaEmision]);

        id_credit = nuevoCredito.insertId;
      }
    }

    const querySQL = `
      UPDATE order_details 
      SET 
        provider = ?,
        reference = ?,
        unit_price = ?, 
        status = ?,
        id_credit = ?
      WHERE id_detail = ?
    `;

    const [result] = await connection.query(querySQL, [
      proveedor && proveedor.trim() !== "" ? proveedor.trim() : null,
      refLimpia || null,
      precio,
      estado || 'pendiente',
      id_credit,
      id
    ]);

    if (result.affectedRows === 0) {
      throw new Error('No se encontró el registro de material especificado.');
    }

    if (id_credit) {
      await connection.query(`
        UPDATE provider_credits pc
        SET pc.amount = (
            SELECT COALESCE(SUM(od.quantity * od.unit_price), 0)
            FROM order_details od
            WHERE od.id_credit = pc.id_credit
        )
        WHERE pc.id_credit = ?
      `, [id_credit]);
    }

    await connection.commit();
    console.log(`💾 Guardado exitoso. Proveedor: "${proveedor}". Crédito ID: ${id_credit || 'Ninguno (Contado)'}`);
    res.json({ status: 'success', mensaje: 'Detalle actualizado correctamente.' });

  } catch (error) {
    await connection.rollback();
    console.error('Error crítico en el PUT /api/materiales/detalle/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;