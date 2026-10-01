(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

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

            while (fechaActual <= fechaFin) {
                const diaSemana = fechaActual.getDay();
                if (diaSemana !== 0 && diaSemana !== 6) {
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
                // CORRECCIÓN DE SEGURIDAD Y RUTA: Apunta directamente al endpoint universal /vacaciones
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