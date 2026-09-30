(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    document.addEventListener('DOMContentLoaded', () => {
        inicializarSolicitante();
        configurarCalculoDiasHabiles();
        configurarEnvioFormulario();
    });

    /**
     * Decodifica de forma segura el token JWT para extraer las credenciales del usuario
     */
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

    /**
     * MODIFICACIÓN SOLUCIÓN: Carga el ID y consulta a la API el nombre completo del empleado logeado
     */
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

        // Si el JWT ya trae el nombre de forma directa
        const nombreJWT = payload.nombre_completo || (payload.name ? `${payload.name} ${payload.last_name || ''}` : null);
        
        if (nombreJWT) {
            if (inputNombre) inputNombre.value = nombreJWT.trim();
            return;
        }

        // Si el JWT solo traía el ID (Causa de "Empleado #8"), consultamos al API para obtener los nombres reales
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/empleados/gestion`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol') || ''
                }
            });

            if (res.ok) {
                const empleados = await res.json();
                const empActual = empleados.find(e => String(e.id_employee) === String(idEmpleado));
                if (empActual) {
                    if (inputNombre) inputNombre.value = `${empActual.name} ${empActual.last_name}`.trim();
                    return;
                }
            }
        } catch (err) {
            console.error("❌ Error al consultar nombre de empleado:", err);
        }

        // Fallback visual en caso de fallo de red
        if (inputNombre) inputNombre.value = `Empleado ID #${idEmpleado}`;
    }

    /**
     * Algoritmo de cálculo dinámico para contar únicamente días laborables (Lunes a Viernes)
     */
    function configurarCalculoDiasHabiles() {
        const inputInicio = document.getElementById('fecha_inicio');
        const inputFin = document.getElementById('fecha_fin');
        const inputDias = document.getElementById('dias_tomados');

        if (!inputInicio || !inputFin || !inputDias) return;

        function calcularDiasHabiles() {
            const fInicioVal = inputInicio.value;
            const fFinVal = inputFin.value;

            if (!fInicioVal || !fFinVal) return;

            // Evitar desfase por zona horaria instanciando componentes exactos
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

            // Recorrer el rango y contar solo días entre Lunes (1) y Viernes (5)
            while (fechaActual <= fechaFin) {
                const diaSemana = fechaActual.getDay(); // 0: Domingo, 6: Sábado
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

    /**
     * MODIFICACIÓN SOLUCIÓN: Envío limpio de solicitud a la base de datos MySQL omitiendo 'motivo'
     */
    function configurarEnvioFormulario() {
        const form = document.getElementById('form-vacaciones');
        if (!form) return;

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

            const payload = {
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                dias_tomados: diasTomados
            };

            try {
                const token = localStorage.getItem('jwtToken') || '';
                const res = await fetch(`${API_BASE}/empleados/${idEmployee}/vacaciones`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : '',
                        'x-user-rol': localStorage.getItem('userRol') || ''
                    },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al registrar la solicitud.');

                alert('🎉 Solicitud de vacaciones registrada correctamente.');

                // Restablecer exclusivamente las fechas y días para dejar el formulario listo
                document.getElementById('fecha_inicio').value = '';
                document.getElementById('fecha_fin').value = '';
                document.getElementById('dias_tomados').value = '';

            } catch (err) {
                console.error('❌ Error en solicitud de vacaciones:', err);
                alert(`❌ ${err.message}`);
            }
        });
    }
})();