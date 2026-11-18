const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken } = require('../middlewares/authMiddleware');
const { gmail } = require('../config/google');

const ROLES_PERMITIDOS_PRESTAMOS = [
    'compras',
    'gerente de administracion',
    'gerente administracion',
    'director operativo',
    'director general'
];

function normalizarTexto(texto) {
    if (!texto) return '';
    return String(texto)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tieneAccesoPrestamos(usuarioSesion) {
    if (!usuarioSesion || !usuarioSesion.rol) return false;
    const rolLimpio = normalizarTexto(usuarioSesion.rol);
    return ROLES_PERMITIDOS_PRESTAMOS.some(permitido => {
        const permitidoLimpio = normalizarTexto(permitido);
        return rolLimpio === permitidoLimpio || (rolLimpio.includes('gerente') && rolLimpio.includes('administrac'));
    });
}

function escaparHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function obtenerInfoFechaMexico() {
    const ahora = new Date();
    const fechaISO = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(ahora);

    const diaSemana = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        weekday: 'short'
    }).format(ahora);

    return {
        fechaISO,
        esLunes: diaSemana === 'Mon'
    };
}

function esFechaValidaISO(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr.trim())) return false;
    const fecha = new Date(`${fechaStr.trim()}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime());
}

async function verificarYNotificarPrestamosPorVencer() {
    try {
        const { fechaISO, esLunes } = obtenerInfoFechaMexico();

        if (!esLunes) {
            return { success: true, message: 'Hoy no es lunes; no corresponde envío de alertas de préstamos.' };
        }

        const sqlPrestamos = `
            SELECT 
                id_loan,
                lender_name,
                DATE_FORMAT(loan_date, '%Y-%m-%d') AS loan_date,
                DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
                interest_rate,
                contract_signed,
                DATEDIFF(due_date, ?) AS dias_restantes
            FROM loans
            WHERE renewed = 0
              AND DATEDIFF(due_date, ?) BETWEEN 0 AND 30
              AND (last_alert_sent_date IS NULL OR last_alert_sent_date < ?)
            ORDER BY due_date ASC
        `;

        const [prestamos] = await pool.query(sqlPrestamos, [fechaISO, fechaISO, fechaISO]);

        if (prestamos.length === 0) {
            console.log('✅ No hay préstamos próximos a vencer (≤ 30 días) pendientes de alerta este lunes.');
            return { success: true, message: 'Sin préstamos por notificar este lunes.' };
        }

        const sqlDestinatarios = `
            SELECT email, job_title
            FROM employees
            WHERE email IS NOT NULL AND TRIM(email) != ''
        `;
        const [empleados] = await pool.query(sqlDestinatarios);

        const correosDestino = new Set();
        for (const emp of empleados) {
            const puestoLimpio = normalizarTexto(emp.job_title);
            const esDestinatarioValido =
                puestoLimpio === 'compras' ||
                puestoLimpio === 'director operativo' ||
                puestoLimpio === 'director general' ||
                (puestoLimpio.includes('gerente') && puestoLimpio.includes('administrac'));

            if (esDestinatarioValido && emp.email.includes('@')) {
                correosDestino.add(emp.email.trim());
            }
        }

        if (correosDestino.size === 0) {
            console.warn('⚠️ No se encontraron correos de destinatarios autorizados para alertas de préstamos.');
            return { success: false, message: 'Sin destinatarios configurados.' };
        }

        const filasHtml = prestamos.map((p, idx) => {
            const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            const dias = Number(p.dias_restantes);
            const textoDias = dias === 0 ? 'Vence HOY' : `${dias} día(s)`;
            const colorFirma = p.contract_signed === 'Sí' ? '#16a34a' : '#dc2626';

            return `
                <tr style="background-color: ${bg};">
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${escaparHTML(p.lender_name)}</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${escaparHTML(p.loan_date)}</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #b45309;">${escaparHTML(p.due_date)}</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${textoDias}</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${Number(p.interest_rate || 0).toFixed(2)}%</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${colorFirma};">${escaparHTML(p.contract_signed)}</td>
                </tr>
            `;
        }).join('');

        const listaDestinatarios = Array.from(correosDestino).join(', ');
        const asunto = `⏰ Alerta Semanal de Vencimiento de Préstamos (${prestamos.length})`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
                <div style="max-width: 720px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="padding: 24px;">
                        <h2 style="color: #b45309; font-size: 18px; margin-top: 0;">⚠️ Recordatorio Semanal: Préstamos Próximos a Vencer</h2>
                        <p style="font-size: 14px; line-height: 1.5; color: #475569;">
                            Los siguientes préstamos vencen dentro de los próximos 30 días y aún no han sido marcados como renovados:
                        </p>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
                            <thead>
                                <tr style="background-color: #f1f5f9; color: #0f172a;">
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Quien nos presta</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Fecha de Préstamo</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Fecha de Vencimiento</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Tiempo Restante</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Tasa de Interés</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Contrato Firmado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filasHtml}
                            </tbody>
                        </table>
                        <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
                            Este recordatorio se envía cada lunes hasta la fecha de vencimiento o hasta registrar la renovación del préstamo en el módulo de Finanzas del ERP MODISA.
                        </p>
                        <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center;">
                            Este es un mensaje automático generado por el ERP MODISA, no contestar.
                        </p>
                    </div>
                </div>
            </div>
        `;

        const utf8Subject = `=?utf-8?B?${Buffer.from(asunto).toString('base64')}?=`;
        const messageParts = [
            `To: ${listaDestinatarios}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${utf8Subject}`,
            '',
            htmlContent
        ];
        const rawMessage = Buffer.from(messageParts.join('\r\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: rawMessage }
        });

        const idsNotificados = prestamos.map(p => p.id_loan);
        await pool.query(
            `UPDATE loans SET last_alert_sent_date = ? WHERE id_loan IN (?)`,
            [fechaISO, idsNotificados]
        );

        console.log(`✉️ Alerta semanal de préstamos enviada a: ${listaDestinatarios} (${idsNotificados.length} préstamo(s)).`);
        return { success: true, totalNotificados: idsNotificados.length };
    } catch (error) {
        console.error('❌ Error al verificar y notificar préstamos por vencer:', error);
        throw error;
    }
}

router.get('/', verificarToken, async (req, res) => {
    if (!tieneAccesoPrestamos(req.usuario)) {
        return res.status(403).json({ success: false, error: '⛔ Acceso denegado al módulo de préstamos.' });
    }

    try {
        const { fechaISO } = obtenerInfoFechaMexico();
        const sql = `
            SELECT 
                id_loan,
                lender_name,
                DATE_FORMAT(loan_date, '%Y-%m-%d') AS loan_date,
                DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
                interest_rate,
                contract_signed,
                renewed,
                DATEDIFF(due_date, ?) AS dias_restantes
            FROM loans
            ORDER BY renewed ASC, due_date ASC, id_loan DESC
        `;
        const [rows] = await pool.query(sql, [fechaISO]);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error al consultar préstamos:', error);
        res.status(500).json({ success: false, error: 'Error interno al obtener los préstamos.' });
    }
});

router.post('/', verificarToken, async (req, res) => {
    if (!tieneAccesoPrestamos(req.usuario)) {
        return res.status(403).json({ success: false, error: '⛔ Acceso denegado para registrar préstamos.' });
    }

    const { lender_name, loan_date, due_date, interest_rate, contract_signed } = req.body;

    const acreedorLimpio = lender_name ? String(lender_name).trim() : '';
    if (!acreedorLimpio || acreedorLimpio.length > 150) {
        return res.status(400).json({ success: false, error: '⚠️ Ingresa un nombre válido de quien nos presta (máximo 150 caracteres).' });
    }

    if (!esFechaValidaISO(loan_date) || !esFechaValidaISO(due_date)) {
        return res.status(400).json({ success: false, error: '⚠️ Las fechas de préstamo y vencimiento deben tener un formato válido.' });
    }

    if (due_date < loan_date) {
        return res.status(400).json({ success: false, error: '⚠️ La fecha de vencimiento no puede ser anterior a la fecha de préstamo.' });
    }

    const tasaNumerica = Number(interest_rate);
    if (!Number.isFinite(tasaNumerica) || tasaNumerica < 0 || tasaNumerica > 999.99) {
        return res.status(400).json({ success: false, error: '⚠️ La tasa de interés debe ser un número válido entre 0 y 999.99.' });
    }

    const firmaValida = contract_signed === 'Sí' ? 'Sí' : 'No';
    const idEmpleado = req.usuario.id_employee || req.usuario.id_user || null;

    try {
        const sql = `
            INSERT INTO loans (lender_name, loan_date, due_date, interest_rate, contract_signed, renewed, created_by)
            VALUES (?, ?, ?, ?, ?, 0, ?)
        `;
        const [result] = await pool.query(sql, [
            acreedorLimpio,
            loan_date.trim(),
            due_date.trim(),
            tasaNumerica.toFixed(2),
            firmaValida,
            idEmpleado
        ]);

        res.status(201).json({
            success: true,
            message: 'Préstamo registrado correctamente.',
            id_loan: result.insertId
        });
    } catch (error) {
        console.error('❌ Error al registrar préstamo:', error);
        res.status(500).json({ success: false, error: 'Error interno al guardar el préstamo.' });
    }
});

router.put('/:id/firma', verificarToken, async (req, res) => {
    if (!tieneAccesoPrestamos(req.usuario)) {
        return res.status(403).json({ success: false, error: '⛔ Acceso denegado.' });
    }

    const idLoan = parseInt(req.params.id, 10);
    if (!Number.isInteger(idLoan) || idLoan <= 0) {
        return res.status(400).json({ success: false, error: '⚠️ Identificador de préstamo inválido.' });
    }

    const firmaValida = req.body.contract_signed === 'Sí' ? 'Sí' : 'No';

    try {
        const [result] = await pool.query(
            `UPDATE loans SET contract_signed = ? WHERE id_loan = ?`,
            [firmaValida, idLoan]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Préstamo no encontrado.' });
        }

        res.json({ success: true, message: 'Estatus de firma actualizado.' });
    } catch (error) {
        console.error('❌ Error al actualizar firma del préstamo:', error);
        res.status(500).json({ success: false, error: 'Error interno al actualizar el estatus de firma.' });
    }
});

router.put('/:id/renovar', verificarToken, async (req, res) => {
    if (!tieneAccesoPrestamos(req.usuario)) {
        return res.status(403).json({ success: false, error: '⛔ Acceso denegado.' });
    }

    const idLoan = parseInt(req.params.id, 10);
    if (!Number.isInteger(idLoan) || idLoan <= 0) {
        return res.status(400).json({ success: false, error: '⚠️ Identificador de préstamo inválido.' });
    }

    const { nueva_fecha_vencimiento, nueva_tasa_interes, contract_signed } = req.body;

    try {
        const [rows] = await pool.query(`SELECT loan_date, due_date, interest_rate, contract_signed FROM loans WHERE id_loan = ?`, [idLoan]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Préstamo no encontrado.' });
        }

        const actual = rows[0];

        if (nueva_fecha_vencimiento) {
            if (!esFechaValidaISO(nueva_fecha_vencimiento)) {
                return res.status(400).json({ success: false, error: '⚠️ La nueva fecha de vencimiento no es válida.' });
            }

            const tasaFinal = (nueva_tasa_interes !== undefined && nueva_tasa_interes !== null && nueva_tasa_interes !== '')
                ? Number(nueva_tasa_interes)
                : Number(actual.interest_rate);

            if (!Number.isFinite(tasaFinal) || tasaFinal < 0 || tasaFinal > 999.99) {
                return res.status(400).json({ success: false, error: '⚠️ La tasa de interés no es válida.' });
            }

            const firmaFinal = contract_signed === 'Sí' ? 'Sí' : (contract_signed === 'No' ? 'No' : actual.contract_signed);

            await pool.query(
                `UPDATE loans 
                 SET due_date = ?, interest_rate = ?, contract_signed = ?, renewed = 0, last_alert_sent_date = NULL 
                 WHERE id_loan = ?`,
                [nueva_fecha_vencimiento.trim(), tasaFinal.toFixed(2), firmaFinal, idLoan]
            );

            return res.json({ success: true, message: 'Préstamo renovado con nueva fecha de vencimiento.' });
        }

        await pool.query(`UPDATE loans SET renewed = 1 WHERE id_loan = ?`, [idLoan]);
        res.json({ success: true, message: 'Préstamo marcado como renovado. Las alertas de vencimiento se han detenido.' });
    } catch (error) {
        console.error('❌ Error al renovar préstamo:', error);
        res.status(500).json({ success: false, error: 'Error interno al procesar la renovación.' });
    }
});

router.delete('/:id', verificarToken, async (req, res) => {
    if (!tieneAccesoPrestamos(req.usuario)) {
        return res.status(403).json({ success: false, error: '⛔ Acceso denegado.' });
    }

    const idLoan = parseInt(req.params.id, 10);
    if (!Number.isInteger(idLoan) || idLoan <= 0) {
        return res.status(400).json({ success: false, error: '⚠️ Identificador de préstamo inválido.' });
    }

    try {
        const [result] = await pool.query(`DELETE FROM loans WHERE id_loan = ?`, [idLoan]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Préstamo no encontrado.' });
        }

        res.json({ success: true, message: 'Préstamo eliminado correctamente.' });
    } catch (error) {
        console.error('❌ Error al eliminar préstamo:', error);
        res.status(500).json({ success: false, error: 'Error interno al eliminar el préstamo.' });
    }
});

module.exports = {
    router,
    verificarYNotificarPrestamosPorVencer
};