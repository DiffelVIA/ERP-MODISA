const { makeWASocket, DisconnectReason, initAuthCreds, proto, Browsers } = require('@whiskeysockets/baileys');
const pool = require('../config/db');

let sock = null;

const useMySQLAuthState = async (sessionId) => {
    const writeData = async (data, key) => {
        const jsonStr = JSON.stringify(data);
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
                return JSON.parse(rows[0].data);
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

        // ==================== INICIO MODIFICACIÓN: Identificador oficial de navegador ====================
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'), // Firma de cliente aceptada nativamente por WhatsApp
            syncFullHistory: false
        });
        // ==================== FIN MODIFICACIÓN ====================

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300`;
                console.log('\n======================================================');
                console.log('🔗 ESCANEA ESTE QR EN TU NAVEGADOR:');
                console.log(qrImageUrl);
                console.log('======================================================\n');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`🔴 Conexión cerrada (Status ${statusCode}). Reconectando: ${shouldReconnect}`);
                
                // Si la sesión quedó corrupta o rechazada por WhatsApp, limpia la tabla para generar QR nuevo
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    console.log('🧹 Limpiando credenciales obsoletas en la base de datos...');
                    await pool.query(`DELETE FROM whatsapp_sessions WHERE session_id = ?`, [sessionId]);
                }
                
                if (shouldReconnect) {
                    setTimeout(iniciarWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Conexión con WhatsApp establecida exitosamente.');
                
                try {
                    const groupList = await sock.groupFetchAllParticipating();
                    console.log('📋 --- LISTA DE GRUPOS DE WHATSAPP DISPONIBLES ---');
                    for (const jid in groupList) {
                        console.log(`📌 Grupo: "${groupList[jid].subject}" | JID: ${jid}`);
                    }
                    console.log('--------------------------------------------------');
                } catch (err) {
                    console.error('Error al listar grupos:', err.message);
                }
            }
        });
    } catch (err) {
        console.error('❌ Error al inicializar servicio de WhatsApp:', err.message);
    }
};

const notificarModificacionContrato = async (contractKey) => {
    try {
        const groupJid = process.env.WHATSAPP_GROUP_JID;
        if (!sock || !groupJid) {
            console.warn('⚠️ No se pudo enviar mensaje: WhatsApp no conectado o WHATSAPP_GROUP_JID no definido.');
            return;
        }

        const mensaje = `El Contrato (${contractKey}) ha sido modificado, está pendiente de autorización y firma.`;
        await sock.sendMessage(groupJid, { text: mensaje });
        console.log(`📲 Notificación de WhatsApp enviada exitosamente para contrato: ${contractKey}`);
    } catch (error) {
        console.error('❌ Error al enviar notificación por WhatsApp:', error.message);
    }
};

module.exports = {
    iniciarWhatsApp,
    notificarModificacionContrato
};