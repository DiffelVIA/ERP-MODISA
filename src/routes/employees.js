const express = require('express')
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

const rolesPermitidos = [
    'director operativo',
    'gerente administración',
    'compras'
]

const { verificarToken } = require('../middlewares/authMiddleware');

const validarRolJWT = (req, res, next) => {
    if (!req.usuario || !req.usuario.rol) {
        return res.status(403).json({ error: "⛔ Acceso denegado: Se requiere un token válido." });
    }
    const rolRaw = req.usuario.rol ? String(req.usuario.rol) : '';
    const rolNormalizado = rolRaw.trim().toLocaleLowerCase().replace(/_/g, ' ');
    const coincideRol = rolesPermitidos.some(rolesPermitido => {
        const permitidoNormalizado = rolesPermitido.trim().toLowerCase().replace(/_/g, ' ');
        return permitidoNormalizado === rolNormalizado;
    });

    if (!coincideRol){
        return res.status(403).json({ error: "⛔ Acceso denegado: No tienes permisos para consultar esta sección."});
    }
    next();
};

function calcularDiasVacacionesLFT(hireDate) {
    if (!hireDate) return 12;

    const ingreso = new Date(hireDate);
    const hoy = new Date();
    
    let anos = hoy.getFullYear() - ingreso.getFullYear();
    const mes = hoy.getMonth() - ingreso.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < ingreso.getDate())) {
        anos--;
    }

    if (anos <= 1) return 12;
    if (anos === 2) return 14;
    if (anos === 3) return 16;
    if (anos === 4) return 18;
    if (anos === 5) return 20;
    if (anos >= 6 && anos <= 10) return 22;
    if (anos >= 11 && anos <= 15) return 24;
    if (anos >= 16 && anos <= 20) return 26;
    if (anos >= 21 && anos <= 25) return 28;
    return 30;
}

function obtenerCicloVacacional(hireDate) {
    if (!hireDate) return { inicioCiclo: '2000-01-01', proximaRenovacion: null };

    const ingreso = new Date(hireDate);
    const hoy = new Date();

    let anioInicio = hoy.getFullYear();
    const fechaAniversarioEsteAnio = new Date(hoy.getFullYear(), ingreso.getMonth(), ingreso.getDate());

    if (hoy < fechaAniversarioEsteAnio) {
        anioInicio--;
    }

    const inicioCiclo = new Date(anioInicio, ingreso.getMonth(), ingreso.getDate());
    const proximaRenovacion = new Date(anioInicio + 1, ingreso.getMonth(), ingreso.getDate());

    return {
        inicioCiclo: inicioCiclo.toISOString().split('T')[0],
        proximaRenovacion: proximaRenovacion.toISOString().split('T')[0]
    };
}

router.get('/:id/vacaciones', verificarToken, validarRolJWT, async (req, res) => {
    const { id } = req.params;
    try {
        const [empRows] = await pool.query("SELECT hire_date FROM employees WHERE id_employee = ?", [id]);
        if (empRows.length === 0) {
            return res.status(404).json({ error: "Empleado no encontrado." });
        }

        const hireDate = empRows[0].hire_date;
        const diasLey = calcularDiasVacacionesLFT(hireDate);
        const { inicioCiclo, proximaRenovacion } = obtenerCicloVacacional(hireDate);

        const [vacRows] = await pool.query(
            "SELECT id_vacacion, fecha_inicio, fecha_fin, dias_tomados, motivo FROM vacaciones WHERE id_employee = ? ORDER BY fecha_inicio DESC", 
            [id]
        );

        const diasTomadosCicloActual = vacRows
            .filter(v => new Date(v.fecha_inicio) >= new Date(inicioCiclo))
            .reduce((acc, curr) => acc + curr.dias_tomados, 0);

        const diasRestantes = diasLey - diasTomadosCicloActual;

        res.json({
            dias_ley: diasLey,
            dias_tomados: diasTomadosCicloActual,
            dias_restantes: diasRestantes,
            proxima_renovacion: proximaRenovacion,
            historial: vacRows
        });
    } catch (error) {
        console.error('❌ Error al consultar vacaciones:', error);
        res.status(500).json({ error: "Error al consultar las vacaciones." });
    }
});

router.post('/:id/vacaciones', verificarToken, validarRolJWT, async (req, res) => {
    const { id } = req.params;
    const { fecha_inicio, fecha_fin, dias_tomados, motivo } = req.body;

    if (!fecha_inicio || !fecha_fin || !dias_tomados) {
        return res.status(400).json({ error: "Por favor completa la fecha de inicio, fin y días a tomar." });
    }

    try {
        const sql = `
            INSERT INTO vacaciones (id_employee, fecha_inicio, fecha_fin, dias_tomados, motivo)
            VALUES (?, ?, ?, ?, ?)
        `;
        await pool.query(sql, [id, fecha_inicio, fecha_fin, dias_tomados, motivo || null]);
        res.status(201).json({ success: true, message: "Registro de vacaciones guardado correctamente." });
    } catch (error) {
        console.error('❌ Error al registrar vacaciones:', error);
        res.status(500).json({ error: "Error al guardar el registro de vacaciones." });
    }
});

router.delete('/vacaciones/:id_vacacion', verificarToken, validarRolJWT, async (req, res) => {
    const { id_vacacion } = req.params;
    try {
        await pool.query("DELETE FROM vacaciones WHERE id_vacacion = ?", [id_vacacion]);
        res.json({ success: true, message: "Registro de vacaciones eliminado." });
    } catch (error) {
        console.error('❌ Error al eliminar vacación:', error);
        res.status(500).json({ error: "Error al borrar el registro." });
    }
});

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