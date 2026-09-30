(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    const MESES = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    document.addEventListener('DOMContentLoaded', async () => {
        const formKPI = document.getElementById('form-kpi');
        const selectProyecto = document.getElementById('id_project');
        const selectResidente = document.getElementById('id_employee');
        const inputFecha = document.getElementById('fecha');

        if (inputFecha) {
            const hoy = new Date().toISOString().split('T')[0];
            inputFecha.value = hoy;
            actualizarFechaYSemana(hoy);

            inputFecha.addEventListener('change', (e) => {
                actualizarFechaYSemana(e.target.value);
            });
        }

        // 1. Cargar proyectos primero
        const proyectosCargados = await cargarProyectosDesdeNube();
        
        // 2. Intentar cargar empleados desde la API de gestión
        const exitoEmpleados = await cargarEmpleadosDesdeNube();

        // MODIFICACIÓN: Si el usuario recibe 403 en empleados, usamos de respaldo los residentes de los proyectos
        if (!exitoEmpleados && proyectosCargados && proyectosCargados.length > 0) {
            poblarResidenteDesdeProyectos(proyectosCargados);
        }

        if (selectProyecto) {
            selectProyecto.addEventListener('change', (e) => {
                const optionSeleccionada = e.target.options[e.target.selectedIndex];
                const idUserResidente = optionSeleccionada.getAttribute('data-id-user');
                
                if (selectResidente) {
                    selectResidente.value = idUserResidente || '';
                }
            });
        }

        if (formKPI) {
            formKPI.addEventListener('submit', async (e) => {
                e.preventDefault();

                const btnGuardar = document.getElementById('guardar');
                if (btnGuardar) btnGuardar.disabled = true;

                const formData = new FormData(formKPI);
                const datos = Object.fromEntries(formData.entries());

                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const respuesta = await fetch(`${API_URL}/kpi`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : ''
                        },
                        body: JSON.stringify(datos)
                    });

                    const resultado = await respuesta.json();

                    if (!respuesta.ok) {
                        throw new Error(resultado.error || 'Error al guardar el registro KPI');
                    }

                    alert('Indicadores de Rendimiento guardados correctamente.');
                    formKPI.reset();

                    if (inputFecha) {
                        const hoy = new Date().toISOString().split('T')[0];
                        inputFecha.value = hoy;
                        actualizarFechaYSemana(hoy);
                    }
                    if (selectResidente) selectResidente.value = '';

                } catch (error) {
                    console.error('Error al enviar formulario KPI:', error);
                    alert(`❌ No se pudo guardar la información: ${error.message}`);
                } finally {
                    if (btnGuardar) btnGuardar.disabled = false;
                }
            });
        }
    });

    async function cargarProyectosDesdeNube() {
        const selectProyecto = document.getElementById('id_project');
        if (!selectProyecto) return [];

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const respuesta = await fetch(`${API_URL}/proyectos`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });

            if (!respuesta.ok) throw new Error('Error al obtener la lista de proyectos');

            const proyectos = await respuesta.json();
            selectProyecto.innerHTML = '<option value="">-- Selecciona --</option>';

            proyectos.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id_project;
                option.textContent = p.project_name;
                
                if (p.id_user) {
                    option.setAttribute('data-id-user', p.id_user);
                }

                selectProyecto.appendChild(option);
            });

            return proyectos;
        } catch (error) {
            console.error('Error al cargar proyectos:', error);
            return [];
        }
    }

    async function cargarEmpleadosDesdeNube() {
        const selectResidente = document.getElementById('id_employee');
        if (!selectResidente) return false;

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });

            if (!respuesta.ok) return false;

            const empleados = await respuesta.json();
            selectResidente.innerHTML = '<option value="">-- Selecciona --</option>';

            empleados.forEach(empleado => {
                const option = document.createElement('option');
                option.value = empleado.id_employee;
                option.textContent = `${empleado.name} ${empleado.last_name}`.trim();
                selectResidente.appendChild(option);
            });

            return true;
        } catch (error) {
            console.error('Error al cargar residentes/empleados:', error);
            return false;
        }
    }

    // MODIFICACIÓN: Función auxiliar para extraer los residentes únicos de los proyectos cargados
    function poblarResidenteDesdeProyectos(proyectos) {
        const selectResidente = document.getElementById('id_employee');
        if (!selectResidente) return;

        selectResidente.innerHTML = '<option value="">-- Selecciona --</option>';
        const agregados = new Set();

        proyectos.forEach(p => {
            if (p.id_user && p.residente && !agregados.has(p.id_user)) {
                agregados.add(p.id_user);
                const option = document.createElement('option');
                option.value = p.id_user;
                option.textContent = p.residente;
                selectResidente.appendChild(option);
            }
        });
    }

    function actualizarFechaYSemana(fechaString) {
        if (!fechaString) return;
        const partes = fechaString.split('-');
        const fecha = new Date(partes[0], partes[1] - 1, partes[2]);

        const inputMes = document.getElementById('mes');
        if (inputMes) inputMes.value = MESES[fecha.getMonth()];

        const inputSemana = document.getElementById('semana');
        if (inputSemana) inputSemana.value = obtenerNumeroSemana(fecha);
    }

    function obtenerNumeroSemana(fecha) {
        const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
        const dianNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dianNum);
        const anioInicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - anioInicio) / 86400000) + 1) / 7);
    }
})();