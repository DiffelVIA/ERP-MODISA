const express = require('express');
const router = express.Router();
const fs = require('fs');
const pool = require('../config/db');
const upload = require('../middlewares/uploads');
const { subirArchivoADrive } = require('../services/drive');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');
const {
    notificarAlertaFlotilla,
    notificarEstatusMatutinoFlotilla,
    verificarYNotificarFlotillaSinResguardo
} = require('../services/whatsapp');

const ID_CARPETA_DRIVE_CAMIONETAS_USO = process.env.DRIVE_FOLDER_CAMIONETAS_USO_ID || '13kiySRnXEuU409n6k65u5HGzpOff9IhS';

const rolesAdminFlotilla = [
    'director operativo',
    'director general',
    'gerente administracion',
    'gerente administrativo',
    'subdirector de obra',
    'compras'
];

const limpiarArchivosTemporales = (files) => {
    if (!files) return;
    const lista = Array.isArray(files) ? files : Object.values(files).flat();
    lista.forEach(file => {
        if (file && file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (e) {}
        }
    });
};

const obtenerHoraMexico = () => {
    return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date());
};

const esHorarioFinDeSemana = () => {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        weekday: 'short',
        hour: 'numeric',
        hour12: false
    }).formatToParts(new Date());
    const dia = partes.find(p => p.type === 'weekday')?.value || '';
    const hora = parseInt(partes.find(p => p.type === 'hour')?.value || '0', 10);
    if (dia === 'Sun') return true;
    if (dia === 'Sat' && hora >= 14) return true;
    if (dia === 'Fri' && hora >= 20) return true;
    return false;
};

router.get('/unidades', verificarToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                v.*,
                CONCAT(e.name, ' ', e.last_name) AS conductor_actual
            FROM vehicles v
            LEFT JOIN employees e ON v.current_driver_id = e.id_employee
            ORDER BY v.id_vehicle ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error al consultar unidades:', error);
        res.status(500).json({ error: 'Error al obtener las camionetas registradas.' });
    }
});

router.post('/unidades', verificarToken, verificarRol(rolesAdminFlotilla), async (req, res) => {
    const { unit_name, plate, brand_model, tank_capacity_liters, current_odometer } = req.body;
    if (!unit_name || !plate || !brand_model) {
        return res.status(400).json({ error: 'El nombre de unidad, placas y modelo son obligatorios.' });
    }
    try {
        const capacidad = parseFloat(tank_capacity_liters) || 80;
        const odometro = parseInt(current_odometer, 10) || 0;
        const [result] = await pool.query(
            `INSERT INTO vehicles (unit_name, plate, brand_model, tank_capacity_liters, current_odometer)
             VALUES (?, ?, ?, ?, ?)`,
            [unit_name.trim(), plate.trim().toUpperCase(), brand_model.trim(), capacidad, odometro]
        );
        res.status(201).json({ success: true, id_vehicle: result.insertId, message: 'Camioneta registrada correctamente.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Ya existe una unidad registrada con esas placas.' });
        }
        console.error('❌ Error al registrar camioneta:', error);
        res.status(500).json({ error: 'Error interno al registrar la camioneta.' });
    }
});

router.put('/unidades/:id', verificarToken, verificarRol(rolesAdminFlotilla), async (req, res) => {
    const { id } = req.params;
    const { unit_name, plate, brand_model, tank_capacity_liters, current_odometer, status } = req.body;
    if (!unit_name || !plate || !brand_model) {
        return res.status(400).json({ error: 'Nombre, placas y modelo son campos obligatorios.' });
    }
    try {
        const capacidad = parseFloat(tank_capacity_liters) || 80;
        const odometro = parseInt(current_odometer, 10) || 0;
        const estadoValido = ['Disponible', 'En uso', 'Mantenimiento'].includes(status) ? status : 'Disponible';

        const limpiarAsignacion = estadoValido !== 'En uso';
        const sql = limpiarAsignacion
            ? `UPDATE vehicles SET unit_name = ?, plate = ?, brand_model = ?, tank_capacity_liters = ?, current_odometer = ?, status = ?, current_driver_id = NULL, current_project_id = NULL WHERE id_vehicle = ?`
            : `UPDATE vehicles SET unit_name = ?, plate = ?, brand_model = ?, tank_capacity_liters = ?, current_odometer = ?, status = ? WHERE id_vehicle = ?`;

        const [result] = await pool.query(sql, [
            unit_name.trim(),
            plate.trim().toUpperCase(),
            brand_model.trim(),
            capacidad,
            odometro,
            estadoValido,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'No se encontró la camioneta especificada.' });
        }
        res.json({ success: true, message: 'Datos de la unidad actualizados.' });
    } catch (error) {
        console.error('❌ Error al actualizar unidad:', error);
        res.status(500).json({ error: 'Error al actualizar la unidad.' });
    }
});

router.post('/probar-whatsapp', verificarToken, verificarRol(rolesAdminFlotilla), async (req, res) => {
    try {
        const { tipo } = req.body || {};
        if (tipo === 'matutino') {
            const resp = await notificarEstatusMatutinoFlotilla();
            return res.json(resp);
        }
        if (tipo === 'cierre_viernes') {
            const resp = await verificarYNotificarFlotillaSinResguardo();
            return res.json(resp);
        }
        const horaMx = obtenerHoraMexico();
        const mensajePrueba = [
            '🔔 *Prueba de Conexión — Flotilla MODISA*',
            '',
            `Grupo de WhatsApp vinculado correctamente (${horaMx} hrs).`
        ].join('\n');
        const resp = await notificarAlertaFlotilla(mensajePrueba);
        return res.json(resp);
    } catch (error) {
        console.error('❌ Error al probar notificación de flotilla:', error);
        res.status(500).json({ error: 'Error al enviar el mensaje de prueba a WhatsApp.' });
    }
});

router.post(
    '/movimiento',
    verificarToken,
    upload.fields([
        { name: 'photo_dashboard', maxCount: 1 },
        { name: 'photo_exterior', maxCount: 1 },
        { name: 'photo_exterior_rear', maxCount: 1 }
    ]),
    async (req, res) => {
        const {
            id_vehicle,
            log_type,
            odometer_reading,
            fuel_level,
            destination_or_origin,
            notes,
            gps_coordinates
        } = req.body;

        const idEmpleadoAutenticado = req.usuario?.id_employee || null;

        const fileDashboard = req.files && req.files.photo_dashboard ? req.files.photo_dashboard[0] : null;
        const fileExterior = req.files && req.files.photo_exterior ? req.files.photo_exterior[0] : null;
        const fileExteriorRear = req.files && req.files.photo_exterior_rear ? req.files.photo_exterior_rear[0] : null;

        if (!idEmpleadoAutenticado) {
            limpiarArchivosTemporales(req.files);
            return res.status(401).json({ error: 'Sesión de empleado no válida. Vuelve a iniciar sesión.' });
        }

        if (!id_vehicle || !log_type || !odometer_reading || !fuel_level) {
            limpiarArchivosTemporales(req.files);
            return res.status(400).json({ error: 'Completa todos los campos obligatorios de la bitácora.' });
        }

        if (!fileDashboard || !fileExterior || !fileExteriorRear) {
            limpiarArchivosTemporales(req.files);
            return res.status(400).json({ error: 'Las 3 fotografías obligatorias (tablero, esquina delantera izquierda y esquina trasera derecha) son requeridas.' });
        }

        const tiposPermitidos = ['Salida', 'Relevo', 'Entrega'];
        if (!tiposPermitidos.includes(log_type)) {
            limpiarArchivosTemporales(req.files);
            return res.status(400).json({ error: 'Tipo de movimiento no válido.' });
        }

        const odometroNuevo = parseInt(odometer_reading, 10);
        if (isNaN(odometroNuevo) || odometroNuevo < 0) {
            limpiarArchivosTemporales(req.files);
            return res.status(400).json({ error: 'El kilometraje ingresado no es válido.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [vehiculos] = await connection.query(
                `SELECT * FROM vehicles WHERE id_vehicle = ? FOR UPDATE`,
                [id_vehicle]
            );

            if (vehiculos.length === 0) {
                await connection.rollback();
                limpiarArchivosTemporales(req.files);
                return res.status(404).json({ error: 'La camioneta seleccionada no existe.' });
            }

            const unidad = vehiculos[0];

            if (odometroNuevo < unidad.current_odometer) {
                await connection.rollback();
                limpiarArchivosTemporales(req.files);
                return res.status(400).json({
                    error: `Kilometraje inválido: El odómetro registrado (${odometroNuevo.toLocaleString('es-MX')} km) no puede ser menor al último odómetro de la unidad (${unidad.current_odometer.toLocaleString('es-MX')} km).`
                });
            }

            if (log_type === 'Salida' && unidad.status === 'Mantenimiento') {
                await connection.rollback();
                limpiarArchivosTemporales(req.files);
                return res.status(400).json({ error: 'La unidad se encuentra en Mantenimiento y no puede asignarse.' });
            }

            const ubicacionFinal = log_type === 'Entrega'
                ? 'Oficina Central (Resguardo)'
                : (destination_or_origin && destination_or_origin.trim() ? destination_or_origin.trim() : 'Uso General / Comisión');

            const urlDashboard = await subirArchivoADrive(fileDashboard, ID_CARPETA_DRIVE_CAMIONETAS_USO);
            const urlExterior = await subirArchivoADrive(fileExterior, ID_CARPETA_DRIVE_CAMIONETAS_USO);
            const urlExteriorRear = await subirArchivoADrive(fileExteriorRear, ID_CARPETA_DRIVE_CAMIONETAS_USO);

            const alertaFinDeSemana = (log_type === 'Salida' || log_type === 'Relevo') && esHorarioFinDeSemana() ? 1 : 0;

            await connection.query(
                `INSERT INTO vehicle_logs 
                 (id_vehicle, id_employee, id_project, log_type, odometer_reading, fuel_level, destination_or_origin, notes, photo_dashboard_url, photo_exterior_url, photo_exterior_rear_url, gps_coordinates, is_weekend_alert)
                 VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id_vehicle,
                    idEmpleadoAutenticado,
                    log_type,
                    odometroNuevo,
                    fuel_level.trim(),
                    ubicacionFinal,
                    notes ? notes.trim() : null,
                    urlDashboard,
                    urlExterior,
                    urlExteriorRear,
                    gps_coordinates ? String(gps_coordinates).trim().slice(0, 120) : null,
                    alertaFinDeSemana
                ]
            );

            if (log_type === 'Salida' || log_type === 'Relevo') {
                await connection.query(
                    `UPDATE vehicles 
                     SET status = 'En uso', current_odometer = ?, current_driver_id = ?, current_project_id = NULL, last_location = ?
                     WHERE id_vehicle = ?`,
                    [odometroNuevo, idEmpleadoAutenticado, ubicacionFinal, id_vehicle]
                );
            } else {
                await connection.query(
                    `UPDATE vehicles 
                     SET status = 'Disponible', current_odometer = ?, current_driver_id = NULL, current_project_id = NULL, last_location = ?
                     WHERE id_vehicle = ?`,
                    [odometroNuevo, ubicacionFinal, id_vehicle]
                );
            }

            await connection.commit();
            limpiarArchivosTemporales(req.files);

            try {
                const [empRows] = await pool.query(
                    `SELECT CONCAT(name, ' ', last_name) AS nombre FROM employees WHERE id_employee = ?`,
                    [idEmpleadoAutenticado]
                );
                const conductorNombre = empRows.length > 0 ? empRows[0].nombre.trim() : `ID ${idEmpleadoAutenticado}`;
                const horaRegistro = obtenerHoraMexico();

                let textoNotificacion = '';
                if (log_type === 'Salida' || log_type === 'Relevo') {
                    const etiquetaAccion = log_type === 'Relevo' ? 'Relevo de Unidad' : 'Salida de Unidad';
                    textoNotificacion = [
                        `🛻 *${etiquetaAccion}*`,
                        `Camioneta "${unidad.unit_name}" asignada a ${conductorNombre} — Destino: ${ubicacionFinal} (Odómetro: ${odometroNuevo.toLocaleString('es-MX')} km)`
                    ].join('\n');
                } else {
                    textoNotificacion = [
                        `✅ *Resguardo de Unidad*`,
                        `Camioneta "${unidad.unit_name}" ha sido resguardada a las ${horaRegistro} hrs por ${conductorNombre} (Odómetro: ${odometroNuevo.toLocaleString('es-MX')} km)`
                    ].join('\n');
                }

                notificarAlertaFlotilla(textoNotificacion);
            } catch (errWa) {
                console.error('⚠️ Error al preparar notificación en tiempo real de flotilla:', errWa.message);
            }

            res.status(201).json({
                success: true,
                message: 'Movimiento de bitácora registrado con éxito y respaldo fotográfico guardado.'
            });
        } catch (error) {
            await connection.rollback();
            limpiarArchivosTemporales(req.files);
            console.error('❌ Error al registrar movimiento de camioneta:', error);
            res.status(500).json({ error: 'Error al guardar el movimiento de la camioneta.' });
        } finally {
            connection.release();
        }
    }
);

router.get('/historial-movimientos', verificarToken, verificarRol(rolesAdminFlotilla), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                vl.*,
                v.unit_name,
                v.plate,
                CONCAT(e.name, ' ', e.last_name) AS conductor_nombre
            FROM vehicle_logs vl
            INNER JOIN vehicles v ON vl.id_vehicle = v.id_vehicle
            INNER JOIN employees e ON vl.id_employee = e.id_employee
            ORDER BY vl.created_at DESC
            LIMIT 300
        `);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error al consultar historial de movimientos:', error);
        res.status(500).json({ error: 'Error al obtener la bitácora de movimientos.' });
    }
});

module.exports = router;