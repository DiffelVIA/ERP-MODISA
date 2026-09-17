const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pool = require('../../config/db');

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

    const creds = (await readData('creds')) || require('@whiskeysockets/baileys').initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
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
    const sessionId = process.env.SESSION_ID;
    const { state, saveCreds } = await useMySQLAuthState(sessionId);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['MODISA ERP', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('🔴 Conexión de WhatsApp cerrada. Reconectando:', shouldReconnect);
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