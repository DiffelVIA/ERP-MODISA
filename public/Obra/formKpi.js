(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    document.addEventListener('DOMContentLoaded', async () => {
        const formKPI = document.getElementById('form-kpi');
        const selectProyecto = document.getElementById('id_project');
        const selectResidente = document.getElementById('id_employee');
        const inputFecha = document.getElementById('fecha');
        const inputSemana = document.getElementById('semana');
        const inputMes = document.getElementById('mes');

        // Inicializar fechas y catálogos
        inicializarFechas(inputFecha, inputSemana, inputMes);
        await cargarProyectos(selectProyecto);
        await cargarEmpleados(selectResidente);

        // Selección de proyecto autoselecciona residente si está asignado
        selectProyecto.addEventListener('change', async () => {
            const idProyecto = selectProyecto.value;
            if (!idProyecto) return;

            try {
                const token = localStorage.getItem('jwtToken') || '';
                const res = await fetch(`${API_URL}/proyectos/${idProyecto}`, {
                    headers: { 'Authorization': token ? `Bearer ${token}` : '' }
                });
                if (res.ok) {
                    const proyecto = await res.json();
                    if (proyecto.id_employee) {
                        selectResidente.value = proyecto.id_employee;
                    }
                }
            } catch (error) {
                console.error('Error al obtener detalle del proyecto:', error);
            }
        });

        // Envío del formulario
        formKPI.addEventListener('submit', async (e) => {
            e.preventDefault();

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

                if (!respuesta.ok) {
                    const err = await respuesta.json();
                    throw new Error(err.error || 'Error al guardar');
                }

                alert('Indicadores de Rendimiento guardados correctamente.');
                formKPI.reset();
                inicializarFechas(inputFecha, inputSemana, inputMes);

            } catch (error) {
                console.error('Error al enviar datos:', error);
                alert(`No se pudo guardar la información: ${error.message}`);
            }
        });
    });

    function inicializarFechas(inputFecha, inputSemana, inputMes) {
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');
        
        if (inputFecha) inputFecha.value = `${yyyy}-${mm}-${dd}`;

        const primeraFechaAno = new Date(hoy.getFullYear(), 0, 1);
        const diasPasados = Math.floor((hoy - primeraFechaAno) / (24 * 60 * 60 * 1000));
        const numeroSemana = Math.ceil((diasPasados + primeraFechaAno.getDay() + 1) / 7);

        if (inputSemana) inputSemana.value = numeroSemana;

        const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        if (inputMes) inputMes.value = nombresMeses[hoy.getMonth()];
    }

    async function cargarProyectos(selectProyecto) {
        if (!selectProyecto) return;
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_URL}/proyectos`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            if (!res.ok) return;
            const proyectos = await res.json();

            selectProyecto.innerHTML = '<option value="">-- Selecciona --</option>';
            proyectos.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.nombre;
                selectProyecto.appendChild(opt);
            });
        } catch (error) {
            console.error('Error al cargar proyectos:', error);
        }
    }

    async function cargarEmpleados(selectResidente) {
        if (!selectResidente) return;
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_URL}/empleados`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            if (!res.ok) return;
            const empleados = await res.json();

            selectResidente.innerHTML = '<option value="">-- Selecciona --</option>';
            empleados.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.first_name || e.nombre || ''} ${e.last_name || e.apellido || ''}`.trim();
                selectResidente.appendChild(opt);
            });
        } catch (error) {
            console.error('Error al cargar empleados:', error);
        }
    }
})();