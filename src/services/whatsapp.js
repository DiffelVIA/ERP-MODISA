const { makeWASocket, DisconnectReason, initAuthCreds, proto, Browsers, BufferJSON } = require('@whiskeysockets/baileys');
const pool = require('../config/db');

let sock = null;
let whatsappConectado = false;
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
                whatsappConectado = false;
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
                    console.warn('⚠ Conflict 440 detectado: Otra instancia activa con esta sesión. Se detiene la reconexión cíclica.');
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
                whatsappConectado = true;
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
        whatsappConectado = false;
        console.error('❌ Error al inicializar servicio de WhatsApp:', err.message);
    }
};

// MODIFICACIÓN SOLUCIÓN: Helpers de normalización de teléfonos mexicanos, saneamiento de texto y pausa antispam
const esperarPausaAleatoria = (minMs = 8000, maxMs = 14000) => {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, ms));
};

const sanearTextoWhatsApp = (texto, maxLen = 140) => {
    if (!texto) return '';
    return String(texto)
        .replace(/[*_~`]/g, '')
        .replace(/https?:\/\/\S+/gi, '[enlace]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);
};

const normalizarTelefonoMexico = (telefonoRaw) => {
    if (!telefonoRaw) return null;
    const soloDigitos = String(telefonoRaw).replace(/\D/g, '');
    if (soloDigitos.length === 10) {
        return `521${soloDigitos}`;
    }
    if (soloDigitos.length === 12 && soloDigitos.startsWith('52')) {
        return `521${soloDigitos.slice(2)}`;
    }
    if (soloDigitos.length === 13 && soloDigitos.startsWith('521')) {
        return soloDigitos;
    }
    return null;
};

const esperarConexionWhatsApp = async (maxEsperaMs = 25000) => {
    const inicio = Date.now();
    while ((!sock || !whatsappConectado) && (Date.now() - inicio < maxEsperaMs)) {
        await new Promise(resolve => setTimeout(resolve, 2500));
    }
    return Boolean(sock && whatsappConectado);
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
        const listo = await esperarConexionWhatsApp();
        if (!listo) {
            console.warn('⚠️ No se ejecutó la revisión de firmas: WhatsApp no está conectado.');
            return { success: false, message: 'WhatsApp no está conectado.' };
        }

        console.log('🔍 Ejecutando revisión automática de contratos sin seguimiento (≥ 7 días)...');

        const sql = `
            SELECT 
                c.id_contract,
                c.contract_key,
                c.supplier,
                c.estado_costos,
                c.status_direccion,
                c.firma,
                p.project_name,
                p.whatsapp_group_jid,
                DATEDIFF(NOW(), c.created_at) AS dias_transcurridos
            FROM contracts c
            LEFT JOIN projects p ON c.id_project = p.id_project
            WHERE DATEDIFF(NOW(), c.created_at) >= 7
              AND LOWER(TRIM(IFNULL(c.status, ''))) != 'rechazado'
              AND LOWER(TRIM(IFNULL(c.status_direccion, ''))) != 'rechazado'
              AND LOWER(TRIM(IFNULL(c.estado_costos, ''))) != 'rechazado'
              AND (
                  LOWER(TRIM(IFNULL(c.estado_costos, ''))) NOT IN ('revisado', 'aprobado') OR
                  LOWER(TRIM(IFNULL(c.status_direccion, ''))) NOT IN ('autorizado', 'autorizada') OR
                  LOWER(TRIM(IFNULL(c.firma, ''))) NOT IN ('firmado', 'si', 'sí')
              )
        `;

        const [contratos] = await pool.query(sql);

        if (contratos.length === 0) {
            console.log('✅ No hay contratos con falta de seguimiento mayores a 7 días hoy.');
            return { success: true, message: 'No hay contratos con falta de seguimiento hoy.' };
        }

        // Agrupar los contratos por grupo de WhatsApp para enviar un único mensaje por chat
        const gruposNotificación = new Map();

        for (const contrato of contratos) {
            const targetJid = contrato.whatsapp_group_jid ? String(contrato.whatsapp_group_jid).trim() : null;
            if (!targetJid) {
                console.warn(`⚠️ Contrato ${contrato.contract_key} omitido: el proyecto "${contrato.project_name || 'Sin Proyecto'}" aún no tiene whatsapp_group_jid configurado.`);
                continue;
            }

            // Sanitización contra caracteres de control de Markdown en WhatsApp
            const claveLimpia = String(contrato.contract_key || `ID #${contrato.id_contract}`)
                .replace(/[*_~`]/g, '')
                .trim();

            const estadoCostos = String(contrato.estado_costos || '').toLowerCase().trim();
            const statusDireccion = String(contrato.status_direccion || '').toLowerCase().trim();
            const estadoFirma = String(contrato.firma || '').toLowerCase().trim();

            const faltantes = [];

            if (!['revisado', 'aprobado'].includes(estadoCostos)) {
                faltantes.push('falta de revisión');
            }
            if (!['autorizado', 'autorizada'].includes(statusDireccion)) {
                faltantes.push('falta de autorización');
            }
            if (!['firmado', 'si', 'sí'].includes(estadoFirma)) {
                faltantes.push('falta de firma');
            }

            if (faltantes.length === 0) continue;

            // Ensamblar la descripción de faltantes formateada
            let textoFaltantes = '';
            if (faltantes.length === 1) {
                textoFaltantes = faltantes[0].charAt(0).toUpperCase() + faltantes[0].slice(1);
            } else if (faltantes.length === 2) {
                textoFaltantes = `${faltantes[0].charAt(0).toUpperCase() + faltantes[0].slice(1)} y ${faltantes[1]}`;
            } else {
                textoFaltantes = `${faltantes[0].charAt(0).toUpperCase() + faltantes[0].slice(1)}, ${faltantes[1]} y ${faltantes[2]}`;
            }

            const lineaContrato = `${claveLimpia} ${textoFaltantes}`;

            if (!gruposNotificación.has(targetJid)) {
                gruposNotificación.set(targetJid, []);
            }
            gruposNotificación.get(targetJid).push(lineaContrato);
        }

        let mensajesEnviados = 0;

        // Construir y enviar un mensaje único por grupo de WhatsApp
        for (const [jidGrupo, listaLineas] of gruposNotificación.entries()) {
            if (listaLineas.length === 0) continue;

            const cuerpoMensaje = `Los siguientes contratos tienen falta de seguimiento:\n` +
                listaLineas.join('\n');

            await sock.sendMessage(jidGrupo, { text: cuerpoMensaje });
            mensajesEnviados++;
            console.log(`📲 Reporte consolidado enviado a (${jidGrupo}) con ${listaLineas.length} contrato(s).`);
        }

        return { 
            success: true, 
            message: `Proceso finalizado. Mensajes consolidados enviados: ${mensajesEnviados}`,
            totalContratosIdentificados: contratos.length 
        };

    } catch (error) {
        console.error('❌ Error en la verificación automática de contratos:', error);
        throw error;
    }
};

// MODIFICACIÓN SOLUCIÓN: Notificación automática consolidada al WhatsApp personal del responsable de minutas
// Regla: 1 aviso cuando está por vencer (hoy o mañana) y 1 recordatorio cada 5 días mientras siga vencida sin completarse
const verificarYNotificarMinutasPendientes = async () => {
    try {
        const listo = await esperarConexionWhatsApp();
        if (!listo) {
            console.warn('⚠️ No se ejecutó la revisión de minutas: WhatsApp no está conectado.');
            return { success: false, message: 'WhatsApp no está conectado.' };
        }

        const hoyMexico = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Mexico_City',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());

        // Sincronizar automáticamente en MySQL las actividades vencidas a estado 'atrasada' sin depender de que abran la página
        await pool.query(`
            UPDATE minutas
            SET estado = 'atrasada'
            WHERE fecha < ?
              AND LOWER(TRIM(IFNULL(estado, 'pendiente'))) NOT IN ('completada', 'atrasada')
        `, [hoyMexico]);

        console.log('🔍 Ejecutando revisión automática de acuerdos de minutas (por vencer y vencidas cada 5 días)...');

        const sql = `
            SELECT
                m.id,
                m.proyecto,
                m.responsable,
                m.semana,
                DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha_compromiso,
                m.descripcion,
                m.estado,
                m.avance,
                m.aviso_vencimiento_enviado,
                m.ultima_notificacion_wa,
                DATEDIFF(?, m.fecha) AS dias_atraso,
                e.id_employee,
                e.name,
                e.last_name,
                e.phone
            FROM minutas m
            INNER JOIN employees e
                ON LOWER(TRIM(REPLACE(CONCAT(COALESCE(e.name, ''), ' ', COALESCE(e.last_name, '')), '  ', ' ')))
                 = LOWER(TRIM(REPLACE(COALESCE(m.responsable, ''), '  ', ' ')))
            WHERE LOWER(TRIM(IFNULL(m.estado, 'pendiente'))) != 'completada'
              AND COALESCE(m.avance, 0) < 100
              AND (
                  -- Caso 1: Actividad por vencer hoy o mañana y aún no recibe su aviso preventivo
                  (DATEDIFF(m.fecha, ?) IN (0, 1) AND COALESCE(m.aviso_vencimiento_enviado, 0) = 0)
                  OR
                  -- Caso 2: Actividad ya vencida y pasaron >= 5 días desde el último WhatsApp (o nunca se notificó)
                  (m.fecha < ? AND (m.ultima_notificacion_wa IS NULL OR DATEDIFF(?, DATE(m.ultima_notificacion_wa)) >= 5))
              )
            ORDER BY e.id_employee ASC, m.fecha ASC
        `;

        const [actividades] = await pool.query(sql, [hoyMexico, hoyMexico, hoyMexico, hoyMexico]);

        if (actividades.length === 0) {
            console.log('✅ No hay minutas por vencer ni vencidas pendientes de notificación hoy.');
            return { success: true, message: 'Sin minutas por notificar hoy.' };
        }

        // Consolidar todas las actividades por empleado para mandar un único mensaje por persona
        const notificacionesPorEmpleado = new Map();

        for (const act of actividades) {
            const numeroNormalizado = normalizarTelefonoMexico(act.phone);
            if (!numeroNormalizado) {
                console.warn(`⚠️ Minuta ${act.id} omitida: el empleado "${act.name} ${act.last_name}" no tiene un teléfono celular válido de 10 dígitos en employees.`);
                continue;
            }

            if (!notificacionesPorEmpleado.has(act.id_employee)) {
                notificacionesPorEmpleado.set(act.id_employee, {
                    id_employee: act.id_employee,
                    nombre: sanearTextoWhatsApp(act.name || act.responsable, 60),
                    numero: numeroNormalizado,
                    porVencer: [],
                    vencidas: [],
                    idsPorVencer: [],
                    idsVencidas: []
                });
            }

            const grupoEmp = notificacionesPorEmpleado.get(act.id_employee);
            const proyectoLimpio = sanearTextoWhatsApp(act.proyecto, 60);
            const descLimpia = sanearTextoWhatsApp(act.descripcion, 130);
            const diasAtraso = Number(act.dias_atraso || 0);

            if (diasAtraso <= 0) {
                const cuando = diasAtraso === 0 ? 'Vence HOY' : 'Vence MAÑANA';
                grupoEmp.porVencer.push(`• *[${proyectoLimpio}]* (${cuando} - ${act.fecha_compromiso}): ${descLimpia}`);
                grupoEmp.idsPorVencer.push(act.id);
            } else {
                grupoEmp.vencidas.push(`• *[${proyectoLimpio}]* (Venció hace ${diasAtraso} día(s) - ${act.fecha_compromiso}): ${descLimpia}`);
                grupoEmp.idsVencidas.push(act.id);
            }
        }

        let mensajesEnviados = 0;

        for (const [, datosEmp] of notificacionesPorEmpleado.entries()) {
            try {
                // Verificar en WhatsApp que el número exista antes de enviar y obtener su JID oficial
                const [verificacionWa] = await sock.onWhatsApp(`${datosEmp.numero}@s.whatsapp.net`);
                if (!verificacionWa || !verificacionWa.exists) {
                    console.warn(`⚠️ Número ${datosEmp.numero} (${datosEmp.nombre}) no tiene cuenta activa de WhatsApp.`);
                    continue;
                }

                const secciones = [];
                secciones.push(`Hola *${datosEmp.nombre}*, tienes acuerdos de minuta que requieren tu atención en el ERP MODISA:`);

                if (datosEmp.porVencer.length > 0) {
                    secciones.push(`\n⏳ *Próximos a vencer:*\n${datosEmp.porVencer.join('\n')}`);
                }

                if (datosEmp.vencidas.length > 0) {
                    secciones.push(`\n⚠️ *Actividades vencidas (recordatorio cada 5 días):*\n${datosEmp.vencidas.join('\n')}`);
                }

                secciones.push(`\nPor favor ingresa al sistema para actualizar tu avance o marcar como completada la actividad.`);

                await sock.sendMessage(verificacionWa.jid, { text: secciones.join('\n') });
                mensajesEnviados++;

                // Registrar bitácora en MySQL inmediatamente después del envío exitoso
                if (datosEmp.idsPorVencer.length > 0) {
                    await pool.query(
                        `UPDATE minutas SET aviso_vencimiento_enviado = 1, ultima_notificacion_wa = NOW() WHERE id IN (?)`,
                        [datosEmp.idsPorVencer]
                    );
                }

                if (datosEmp.idsVencidas.length > 0) {
                    await pool.query(
                        `UPDATE minutas SET ultima_notificacion_wa = NOW() WHERE id IN (?)`,
                        [datosEmp.idsVencidas]
                    );
                }

                console.log(`📲 Recordatorio consolidado de minutas enviado a ${datosEmp.nombre} (${verificacionWa.jid}).`);

                // Pausa aleatoria antispam entre envíos individuales
                await esperarPausaAleatoria(8000, 14000);

            } catch (errEnvio) {
                console.error(`❌ Error al enviar WhatsApp de minutas a ${datosEmp.nombre}:`, errEnvio.message);
            }
        }

        return {
            success: true,
            message: `Revisión de minutas finalizada. Responsables notificados: ${mensajesEnviados}`,
            totalActividadesEvaluadas: actividades.length
        };

    } catch (error) {
        console.error('❌ Error en la verificación automática de minutas:', error);
        throw error;
    }
};

module.exports = {
    iniciarWhatsApp,
    notificarModificacionContrato,
    verificarYNotificarContratosSinFirma,
    verificarYNotificarMinutasPendientes
};