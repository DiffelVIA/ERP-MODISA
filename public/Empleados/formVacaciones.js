(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    document.addEventListener('DOMContentLoaded', () => {
        cargarEmpleadosSelect();
        configurarCalculoDias();
        configurarEnvioFormulario();
    });

    /**
     * Carga el listado de empleados activos en el campo <select id="id_employee">
     */
    async function cargarEmpleadosSelect() {
        const selectEmp = document.getElementById('id_employee');
        if (!selectEmp) return;

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/empleados/gestion`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol') || ''
                }
            });

            if (!res.ok) throw new Error('Error al cargar la lista de empleados.');

            const empleados = await res.json();
            
            // Limpiar opciones previas manteniendo el placeholder por defecto
            selectEmp.innerHTML = '<option value="">-- Selecciona un empleado --</option>';

            empleados.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.id_employee;
                option.textContent = `${emp.name} ${emp.last_name} (${emp.department || 'Sin Depto'})`;
                selectEmp.appendChild(option);
            });

        } catch (err) {
            console.error('❌ Error al cargar empleados:', err);
            alert('❌ No se pudo cargar el catálogo de empleados.');
        }
    }

    /**
     * Calcula los días hábiles/naturales sugeridos entre la fecha de inicio y la fecha de fin
     */
    function configurarCalculoDias() {
        const inputInicio = document.getElementById('fecha_inicio');
        const inputFin = document.getElementById('fecha_fin');
        const inputDias = document.getElementById('dias_tomados');

        if (!inputInicio || !inputFin || !inputDias) return;

        function calcularDias() {
            const fInicioVal = inputInicio.value;
            const fFinVal = inputFin.value;

            if (!fInicioVal || !fFinVal) return;

            const inicio = new Date(fInicioVal);
            const fin = new Date(fFinVal);

            if (fin < inicio) {
                alert('⚠️ La fecha de fin no puede ser anterior a la fecha de inicio.');
                inputFin.value = '';
                inputDias.value = '';
                return;
            }

            // Cálculo básico de diferencia de días inclusivo
            const diffTime = Math.abs(fin - inicio);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            
            inputDias.value = diffDays;
        }

        inputInicio.addEventListener('change', calcularDias);
        inputFin.addEventListener('change', calcularDias);
    }

    /**
     * Procesa el evento submit del formulario e interactúa con el backend
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

            if (!idEmployee || !fechaInicio || !fechaFin || isNaN(diasTomados)) {
                alert('⚠️ Por favor completa todos los campos requeridos.');
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
                form.reset();

            } catch (err) {
                console.error('❌ Error al enviar formulario:', err);
                alert(`❌ ${err.message}`);
            }
        });
    }
})();