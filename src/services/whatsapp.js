const { makeWASocket, DisconnectReason, initAuthCreds, proto, Browsers, BufferJSON } = require('@whiskeysockets/baileys');
const pool = require('../config/db');

let sock = null;

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
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`🔴 Conexión de WhatsApp cerrada (Status ${statusCode}). Reconectando: ${shouldReconnect}`);
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    await pool.query(`DELETE FROM whatsapp_sessions WHERE session_id = ?`, [sessionId]);
                }

                if (shouldReconnect) {
                    setTimeout(iniciarWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Conexión con WhatsApp establecida exitosamente.');
                
                // Espera de 4 segundos para asegurar sincronización de grupos
                setTimeout(async () => {
                    try {
                        console.log('🔍 Obteniendo lista de grupos...');
                        const groupList = await sock.groupFetchAllParticipating();
                        const groupKeys = Object.keys(groupList);

                        if (groupKeys.length === 0) {
                            console.log('⚠️ No se encontraron grupos asociados.');
                        } else {
                            console.log('📋 --- LISTA DE GRUPOS DE WHATSAPP DISPONIBLES ---');
                            for (const jid of groupKeys) {
                                console.log(`📌 Grupo: "${groupList[jid].subject}" | JID: ${jid}`);
                            }
                            console.log('--------------------------------------------------');
                        }
                    } catch (err) {
                        console.error('Error al listar grupos:', err.message);
                    }
                }, 4000);
            }
        });
    } catch (err) {
        console.error('❌ Error al inicializar servicio de WhatsApp:', err.message);
    }
};

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
            WHERE LOWER(TRIM(IFNULL(c.firma, ''))) != 'autorizado'
              AND LOWER(TRIM(IFNULL(c.estado_costos, ''))) = 'autorizado'
              AND LOWER(TRIM(IFNULL(c.status_direccion, ''))) = 'autorizado'
        `;

        const [contratos] = await pool.query(sql);

        if (contratos.length === 0) {
            console.log('✅ No hay contratos autorizados pendientes de firma el día de hoy.');
            return { success: true, message: 'No hay contratos pendientes de firma hoy.' };
        }

        let notificacionesEnviadas = 0;

        for (const contrato of contratos) {
            const dias = Number(contrato.dias_transcurridos);
            
            const correspondeNotificar = (dias === 3) || (dias === 7) || (dias > 7 && (dias - 7) % 3 === 0);

            if (correspondeNotificar) {
                const targetJid = contrato.whatsapp_group_jid || process.env.WHATSAPP_GROUP_JID;

                if (!targetJid) {
                    console.warn(`⚠️ No hay JID configurado para el contrato: ${contrato.contract_key}`);
                    continue;
                }

                const clave = contrato.contract_key || `ID #${contrato.id_contract}`;
                const mensaje = `⚠️ *RECORDATORIO DE FIRMA DE CONTRATO*\n\n` +
                                `El contrato *${clave}* del proveedor *${contrato.supplier}* lleva *${dias} días* autorizado y aún continúa *pendiente de firma*.\n\n` +
                                `📌 *Por favor, regularizar la firma para proceder con los trámites correspondientes.*`;

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
    verificarYNotificarContratosSinFirma // <-- Comentar/Agregar esta exportación
};