const express = require('express')
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

const rolesPermitidos = [
    'director operativo',
    'director_operativo',
    'gerente administración',
    'gerente administracion',
    'gerente_administracion'
]

const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

const validarRolJWT = (req, res, next) => {
    if (!req.usuario || !req.usuario.rol) {
        return res.status(403).json({ error: "⛔ Acceso denegado: Se requiere un token válido." });
    }
    const rolNormalizado = req.usuario.rol.rtrim().toLowerCase();
    if (!rolesPermitidos.includes(rolNormalizado)){
        return res.status(403).json({ error: "⛔ Acceso denegado: No tienes permisos para consultar esta sección."});
    }
    next();
};

router.get('/gestion', verificarToken, validarRolJWT, async (req, res) => {
    try {
        const sql = `
            SELECT id_employee, name, last_name, email, phone, job_title, department, hire_date, first_entry 
            FROM employees 
            ORDER BY name ASC
        `;
        const [rows] = await pool.query(sql);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error al obtener empleados:', error);
        res.status(500).json({ error: "Error al consultar los empleados de la base de datos." });
    }
});

router.post('/', verificarToken, validarRolJWT, async (req, res) => {
    const { name, last_name, email, phone, job_title, department, password, hire_date } = req.body;

    if (!name || !last_name || !email || !password || !job_title) {
        return res.status(400).json({ error: "⚠️ Por favor completa todos los campos obligatorios." });
    }

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password.trim(), saltRounds);

        const sql = `
            INSERT INTO employees (name, last_name, email, phone, job_title, department, hire_date, password, first_entry)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `;
        const [result] = await pool.query(sql, [
            name.trim(), 
            last_name.trim(), 
            email.trim().toLowerCase(), 
            phone ? phone.trim() : null, 
            job_title.trim(), 
            department ? department.trim() : null, 
            hire_date || null,
            hashedPassword
        ]);

        res.status(201).json({ success: true, message: "🎉 Empleado registrado con éxito.", insertId: result.insertId });
    } catch (error) {
        console.error('❌ Error al crear empleado:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "⚠️ El correo electrónico ingresado ya pertenece a otro usuario." });
        }
        res.status(500).json({ error: "Error en la base de datos al guardar el empleado." });
    }
});

router.put('/:id', verificarToken, validarRolJWT, async (req, res) => {
    const { id } = req.params;
    const { name, last_name, email, phone, job_title, department, hire_date } = req.body;

    try {
        const sql = `
            UPDATE employees 
            SET name = ?, last_name = ?, email = ?, phone = ?, job_title = ?, department = ?, hire_date = ?
            WHERE id_employee = ?
        `;
        const [result] = await pool.query(sql, [
            name, 
            last_name, 
            email, 
            phone || null, 
            job_title, 
            department || null, 
            hire_date || null, 
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró el empleado especificado." });
        }

        res.json({ success: true, message: "Empleado actualizado correctamente." });
    } catch (error) {
        console.error('❌ Error al actualizar empleado:', error);
        res.status(500).json({ error: "Error al actualizar los datos del empleado." });
    }
});

router.delete('/:id', verificarToken, validarRolJWT, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.query("DELETE FROM employees WHERE id_employee = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "El empleado no existe o ya fue eliminado." });
        }
        res.json({ success: true, message: "Empleado eliminado del sistema." });
    } catch (error) {
        console.error('❌ Error al eliminar empleado:', error);
        res.status(500).json({ error: "No se puede eliminar el empleado porque tiene registros/historial vinculados." });
    }
});

module.exports = router;