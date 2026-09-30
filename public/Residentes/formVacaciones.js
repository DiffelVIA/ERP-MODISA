(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    document.addEventListener('DOMContentLoaded', () => {
        inicializarSolicitanteDesdeJWT();
        configurarCalculoDiasHabiles();
        configurarEnvioFormulario();
    });

    /**
     * MODIFICACIÓN SOLUCIÓN: Decodifica de forma segura el JWT para obtener los datos del usuario logeado
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
            console.error("❌ Error al decodificar JWT en vacaciones:", e);
            return null;
        }
    }

    /**
     * Carga el nombre e ID del solicitante logeado en la interfaz
     */
    function inicializarSolicitanteDesdeJWT() {
        const payload = obtenerDatosDesdeJWT();
        const inputHiddenId = document.getElementById('id_employee');
        const inputNombre = document.getElementById('nombre_solicitante');

        if (!payload || (!payload.id_employee && !payload.id)) {
            alert('⚠️ No se pudo verificar la sesión del usuario. Por favor vuelve a iniciar sesión.');
            window.location.href = '../login.html';
            return;
        }

        const idEmpleado = payload.id_employee || payload.id;
        const nombreCompleto = payload.nombre_completo 
            || (payload.name ? `${payload.name} ${payload.last_name || ''}` : '') 
            || payload.email 
            || `Empleado #${idEmpleado}`;

        if (inputHiddenId) inputHiddenId.value = idEmpleado;
        if (inputNombre) inputNombre.value = nombreCompleto.trim();
    }

    /**
     * MODIFICACIÓN SOLUCIÓN: Algoritmo para contar exclusivamente días hábiles (Lunes a Viernes)
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

            // Instanciar fechas evitando desfase por zona horaria UTC
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

            // Recorrer día por día el rango seleccionado
            while (fechaActual <= fechaFin) {
                const diaSemana = fechaActual.getDay(); // 0: Domingo, 6: Sábado
                
                // Si es de Lunes (1) a Viernes (5), se contabiliza
                if (diaSemana !== 0 && diaSemana !== 6) {
                    diasHabiles++;
                }

                // Avanzar un día
                fechaActual.setDate(fechaActual.getDate() + 1);
            }

            inputDias.value = diasHabiles;
        }

        inputInicio.addEventListener('change', calcularDiasHabiles);
        inputFin.addEventListener('change', calcularDiasHabiles);
    }

    /**
     * Procesa y envía la solicitud al backend
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
            const motivo = document.getElementById('motivo').value.trim();

            if (!idEmployee) {
                alert('⚠️ Identificación de usuario no válida.');
                return;
            }

            if (!fechaInicio || !fechaFin || isNaN(diasTomados) || diasTomados <= 0) {
                alert('⚠️ Por favor selecciona un rango de fechas válido con al menos 1 día hábil.');
                return;
            }

            const payload = {
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                dias_tomados: diasTomados,
                motivo: motivo || null
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
                if (!res.ok) throw new Error(data.error || 'Error al guardar la solicitud de vacaciones.');

                alert('🎉 Solicitud de vacaciones registrada correctamente.');
                
                // Limpiar campos de fecha y mantener datos del solicitante
                document.getElementById('fecha_inicio').value = '';
                document.getElementById('fecha_fin').value = '';
                document.getElementById('dias_tomados').value = '';
                document.getElementById('motivo').value = '';

            } catch (err) {
                console.error('❌ Error al enviar formulario:', err);
                alert(`❌ ${err.message}`);
            }
        });
    }
})();