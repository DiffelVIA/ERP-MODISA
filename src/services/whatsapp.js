const { makeWASocket, DisconnectReason, initAuthCreds, proto, Browsers, BufferJSON } = require('@whiskeysockets/baileys');
const pool = require('../config/db');

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const useMySQLAuthState = async (sessionId) => {
    const writeData = async (data, key) => {
        const jsonStr = JSON.stringify(data, BufferJSON.replacer);
        const sql = `
            INSERT INTO whatsapp_sessions (session_id, key_id, data) 
            VALUES (?, ?, ?) 
            ON DUPLICATE KEY UPDATE data = VALUES(data)
        `;
        await pool.query(sql, [sessionId, key, jsonStr]);
    };

    const readData = async (key) => {
        try {
            const sql = `SELECT data FROM whatsapp_sessions WHERE session_id = ? AND key_id = ?`;
            const [rows] = await pool.query(sql, [sessionId, key]);
            if (rows.length > 0) {
                return JSON.parse(rows[0].data, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    const removeData = async (key) => {
        const sql = `DELETE FROM whatsapp_sessions WHERE session_id = ? AND key_id = ?`;
        await pool.query(sql, [sessionId, key]);
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                await writeData(value, key);
                            } else {
                                await removeData(key);
                            }
                        }
                    }
                }
            }
        },
        saveCreds: async () => {
            await writeData(creds, 'creds');
        }
    };
};

// ==========================================
// INICIO MODIFICACIÓN: MANEJO SEGURO DE CONEXIÓN, BACKOFF EXPONENCIAL IMPRESIÓN DE JIDS DE GRUPOS
// ==========================================
const iniciarWhatsApp = async () => {
    try {
        const sessionId = process.env.SESSION_ID || 'session_modisa_erp';
        const { state, saveCreds } = await useMySQLAuthState(sessionId);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        // Captura de JID si alguien escribe en un grupo
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (msg && msg.key && msg.key.remoteJid && msg.key.remoteJid.endsWith('@g.us')) {
                console.log(`📌 [JID DE GRUPO DETECTADO VÍA MENSAJE]: ${msg.key.remoteJid}`);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300`;
                console.log('\n======================================================');
                console.log('🔗 ABRE ESTE ENLACE EN TU NAVEGADOR PARA ESCANEAR EL QR:');
                console.log(qrImageUrl);
                console.log('======================================================\n');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                // Si el status es 440 (Conflict) o 401/loggedOut, detener el bucle automático inmediato
                const esConflictoSesion = statusCode === 440 || statusCode === 405;
                const esCierreSesion = statusCode === DisconnectReason.loggedOut || statusCode === 401;

                console.log(`🔴 Conexión de WhatsApp cerrada (Status ${statusCode}).`);

                if (esCierreSesion) {
                    console.log('🧹 Eliminando credenciales inválidas de WhatsApp en MySQL...');
                    await pool.query(`DELETE FROM whatsapp_sessions WHERE session_id = ?`, [sessionId]);
                    reconnectAttempts = 0;
                    return;
                }

                if (esConflictoSesion) {
                    console.warn('⚠️️ Conflict 440 detectado: Otra instancia activa con esta sesión. Se detiene la reconexión cíclica.');
                    reconnectAttempts = 0;
                    return;
                }

                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delayMs = Math.min(30000, 5000 * reconnectAttempts); // Backoff progresivo
                    console.log(`🔄 Reintentando conexión de WhatsApp en ${delayMs / 1000} segundos (Intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(iniciarWhatsApp, delayMs);
                } else {
                    console.error('❌ Límite máximo de reintentos alcanzado para WhatsApp. Proceso pausado.');
                }

            } else if (connection === 'open') {
                reconnectAttempts = 0;
                console.log('✅ Conexión con WhatsApp establecida exitosamente.');
                
                // MODIFICACIÓN SOLUCIÓN: Imprimir la lista de grupos y sus JIDs al conectar
                try {
                    const grupos = await sock.groupFetchAllParticipating();
                    console.log('\n======================================================');
                    console.log('📋 --- LISTA DE GRUPOS DISPONIBLES Y SUS JIDs ---');
                    for (const id in grupos) {
                        console.log(`📌 Grupo: "${grupos[id].subject}" | JID: ${id}`);
                    }
                    console.log('======================================================\n');
                } catch (errGrupos) {
                    console.error('❌ Error al obtener el listado de grupos de WhatsApp:', errGrupos.message);
                }
            }
        });
    } catch (err) {
        console.error('❌ Error al inicializar servicio de WhatsApp:', err.message);
    }
};
// ==========================================
// FIN MODIFICACIÓN
// ==========================================

const notificarModificacionContrato = async (contractKey, targetGroupJid) => {
    try {
        if (!sock) {
            console.warn('⚠️ WhatsApp no está conectado.');
            return;
        }
        if (!targetGroupJid) {
            console.warn(`⚠️ No hay un grupo de WhatsApp asociado para el contrato/proyecto: ${contractKey}`);
            return;
        }

        const mensaje = `El Contrato (${contractKey}) ha sido modificado, está pendiente de autorización y firma.`;
        await sock.sendMessage(targetGroupJid, { text: mensaje });
        console.log(`📲 Notificación enviada al grupo ${targetGroupJid} para contrato: ${contractKey}`);
    } catch (error) {
        console.error('❌ Error al enviar notificación por WhatsApp:', error.message);
    }
};

const verificarYNotificarContratosSinFirma = async () => {
    try {
        if (!sock) {
            console.warn('⚠️ No se ejecutó la revisión de firmas: WhatsApp no está conectado.');
            return { success: false, message: 'WhatsApp no está conectado.' };
        }

        console.log('🔍 Ejecutando revisión automática de contratos sin firma...');

        const sql = `
            SELECT 
                c.id_contract,
                c.contract_key,
                c.supplier,
                c.total_amount,
                p.whatsapp_group_jid,
                DATEDIFF(NOW(), c.created_at) AS dias_transcurridos
            FROM contracts c
            LEFT JOIN projects p ON c.id_project = p.id_project
            WHERE LOWER(TRIM(IFNULL(c.firma, ''))) NOT IN ('firmado', 'autorizado')
              AND LOWER(TRIM(IFNULL(c.status, ''))) != 'rechazado'
              AND LOWER(TRIM(IFNULL(c.status_direccion, ''))) != 'rechazado'
              AND LOWER(TRIM(IFNULL(c.estado_costos, ''))) != 'rechazado'
        `;

        const [contratos] = await pool.query(sql);

        if (contratos.length === 0) {
            console.log('✅ No hay contratos autorizados pendientes de firma el día de hoy.');
            return { success: true, message: 'No hay contratos pendientes de firma hoy.' };
        }

        let notificacionesEnviadas = 0;

        for (const contrato of contratos) {
            const dias = Number(contrato.dias_transcurridos);
            
            const correspondeNotificar = dias >= 3;

            if (correspondeNotificar) {
                const targetJid = contrato.whatsapp_group_jid || process.env.WHATSAPP_GROUP_JID;

                if (!targetJid) {
                    console.warn(`⚠️ No hay JID configurado para el contrato: ${contrato.contract_key}`);
                    continue;
                }

                const clave = contrato.contract_key || `ID #${contrato.id_contract}`;
                const mensaje = `⚠️ *RECORDATORIO DE FIRMA DE CONTRATO*\n\n` +
                                `El contrato *${clave}* del proveedor *${contrato.supplier}* lleva *${dias} días* *pendiente de firma*.\n\n` +
                                `📌 *Por favor, regulariza la firma para autorizar los pagos*`;

                await sock.sendMessage(targetJid, { text: mensaje });
                notificacionesEnviadas++;
                console.log(`📲 Recordatorio de firma enviado a (${targetJid}) para contrato: ${clave} (${dias} días)`);
            }
        }

        return { 
            success: true, 
            message: `Proceso finalizado. Notificaciones enviadas: ${notificacionesEnviadas}`,
            totalEncontrados: contratos.length 
        };

    } catch (error) {
        console.error('❌ Error en la verificación automática de firmas:', error);
        throw error;
    }
};

module.exports = {
    iniciarWhatsApp,
    notificarModificacionContrato,
    verificarYNotificarContratosSinFirma
};