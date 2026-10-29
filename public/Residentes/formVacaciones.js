(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    // MODIFICACIÓN (LFT Dinámica): Obtiene el N-ésimo día de la semana de un mes/año
    function obtenerNthDiaDelMes(anio, mesZeroBased, diaSemanaDeseado, nOcurrencia) {
        let fecha = new Date(anio, mesZeroBased, 1);
        let conteo = 0;
        while (fecha.getMonth() === mesZeroBased) {
            if (fecha.getDay() === diaSemanaDeseado) {
                conteo++;
                if (conteo === nOcurrencia) {
                    const m = String(mesZeroBased + 1).padStart(2, '0');
                    const d = String(fecha.getDate()).padStart(2, '0');
                    return `${anio}-${m}-${d}`;
                }
            }
            fecha.setDate(fecha.getDate() + 1);
        }
        return null;
    }

    // MODIFICACIÓN: Genera el conjunto de días festivos oficiales LFT (México) para un año específico
    function obtenerFestivosOficialesMexico(anio) {
        return new Set([
            `${anio}-01-01`, // Año Nuevo
            `${anio}-05-01`, // Día del Trabajo
            `${anio}-09-16`, // Día de la Independencia
            `${anio}-12-25`, // Navidad
            // Lunes conmemorativos según Art. 74 LFT:
            obtenerNthDiaDelMes(anio, 1, 1, 1), // Aniversario Constitución (1er lunes de Feb)
            obtenerNthDiaDelMes(anio, 2, 1, 3), // Natalicio Benito Juárez (3er lunes de Mar)
            obtenerNthDiaDelMes(anio, 10, 1, 3) // Revolución Mexicana (3er lunes de Nov)
        ]);
    }

    document.addEventListener('DOMContentLoaded', () => {
        inicializarSolicitante();
        configurarCalculoDiasHabiles();
        configurarEnvioFormulario();
    });

    function obtenerDatosDesdeJWT() {
        const token = localStorage.getItem('jwtToken');
        if (!token) return null;
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return null;
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error("❌ Error al decodificar JWT:", e);
            return null;
        }
    }

    async function inicializarSolicitante() {
        const payload = obtenerDatosDesdeJWT();
        const inputHiddenId = document.getElementById('id_employee');
        const inputNombre = document.getElementById('nombre_solicitante');

        if (!payload || (!payload.id_employee && !payload.id && !payload.userId)) {
            alert('⚠️ No se pudo verificar la sesión. Por favor vuelve a iniciar sesión.');
            window.location.href = '../login.html';
            return;
        }

        const idEmpleado = payload.id_employee || payload.id || payload.userId;
        if (inputHiddenId) inputHiddenId.value = idEmpleado;

        const nombreJWT = payload.nombre_completo || 
                        payload.nombre || 
                        (payload.name ? `${payload.name} ${payload.last_name || payload.apellidos || ''}` : null) ||
                        payload.usuario;

        if (nombreJWT && String(nombreJWT).trim() !== '') {
            if (inputNombre) inputNombre.value = String(nombreJWT).trim();
            return;
        }

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/vacaciones`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });

            if (res.ok) {
                const solicitudes = await res.json();
                if (Array.isArray(solicitudes) && solicitudes.length > 0 && solicitudes[0].nombre_empleado) {
                    if (inputNombre) inputNombre.value = solicitudes[0].nombre_empleado;
                    return;
                }
            }
        } catch (err) {
            console.error("❌ Error al consultar nombre de empleado:", err);
        }

        if (inputNombre) inputNombre.value = `Empleado ID #${idEmpleado}`;
    }

    // MODIFICACIÓN: Integración del cálculo de días hábiles omitiendo festivos LFT y fines de semana
    function configurarCalculoDiasHabiles() {
        const inputInicio = document.getElementById('fecha_inicio');
        const inputFin = document.getElementById('fecha_fin');
        const inputDias = document.getElementById('dias_tomados');

        if (!inputInicio || !inputFin || !inputDias) return;

        function calcularDiasHabiles() {
            const fInicioVal = inputInicio.value;
            const fFinVal = inputFin.value;

            if (!fInicioVal || !fFinVal) return;

            const [yearI, monthI, dayI] = fInicioVal.split('-').map(Number);
            const [yearF, monthF, dayF] = fFinVal.split('-').map(Number);

            const fechaActual = new Date(yearI, monthI - 1, dayI);
            const fechaFin = new Date(yearF, monthF - 1, dayF);

            if (fechaFin < fechaActual) {
                alert('⚠️ La fecha de fin no puede ser anterior a la fecha de inicio.');
                inputFin.value = '';
                inputDias.value = '';
                return;
            }

            let diasHabiles = 0;
            const cacheFestivosAnio = {};

            while (fechaActual <= fechaFin) {
                const diaSemana = fechaActual.getDay();
                const anio = fechaActual.getFullYear();
                const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
                const dia = String(fechaActual.getDate()).padStart(2, '0');
                const fechaClave = `${anio}-${mes}-${dia}`;

                if (!cacheFestivosAnio[anio]) {
                    cacheFestivosAnio[anio] = obtenerFestivosOficialesMexico(anio);
                }

                // Omitir Sábados (6), Domingos (0) y Días Festivos LFT
                if (diaSemana !== 0 && diaSemana !== 6 && !cacheFestivosAnio[anio].has(fechaClave)) {
                    diasHabiles++;
                }

                fechaActual.setDate(fechaActual.getDate() + 1);
            }

            inputDias.value = diasHabiles;
        }

        inputInicio.addEventListener('change', calcularDiasHabiles);
        inputFin.addEventListener('change', calcularDiasHabiles);
    }

    function configurarEnvioFormulario() {
        const form = document.getElementById('form-vacaciones');
        const btnGuardar = document.getElementById('guardar');
        if (!form || !btnGuardar) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const idEmployee = document.getElementById('id_employee').value;
            const fechaInicio = document.getElementById('fecha_inicio').value;
            const fechaFin = document.getElementById('fecha_fin').value;
            const diasTomados = parseInt(document.getElementById('dias_tomados').value, 10);

            if (!idEmployee) {
                alert('⚠️ Error de autenticación: No se identificó el empleado.');
                return;
            }

            if (!fechaInicio || !fechaFin || isNaN(diasTomados) || diasTomados <= 0) {
                alert('⚠️ Por favor selecciona un rango de fechas válido con al menos 1 día hábil.');
                return;
            }

            const textoOriginalBtn = btnGuardar.textContent;
            btnGuardar.disabled = true;
            btnGuardar.textContent = '⏳ Enviando...';
            btnGuardar.style.cursor = 'not-allowed';

            const payload = {
                id_employee: parseInt(idEmployee, 10),
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                dias_tomados: diasTomados
            };

            try {
                const token = localStorage.getItem('jwtToken') || '';
                const res = await fetch(`${API_BASE}/vacaciones`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al registrar la solicitud.');

                alert('🎉 Solicitud de vacaciones registrada correctamente.');

                window.location.href = '../principal.html?panel=residentes';

            } catch (err) {
                console.error('❌ Error en solicitud de vacaciones:', err);
                alert(`❌ ${err.message}`);

                btnGuardar.disabled = false;
                btnGuardar.textContent = textoOriginalBtn;
                btnGuardar.style.cursor = 'pointer';
            }
        });
    }
})();