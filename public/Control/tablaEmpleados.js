(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    let chartGaugeVacaciones = null;

    function obtenerRolDesdeJWT() {
        const token = localStorage.getItem('jwtToken');
        if (!token) return '';
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return '';
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const payload = JSON.parse(jsonPayload);
            return payload.rol || payload.role || '';
        } catch (e) {
            console.error("❌ Error al decodificar JWT en empleados:", e);
            return '';
        }
    }

    const ROL_RAW = obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '';
    const ROL_USUARIO = ROL_RAW.trim().toLowerCase();

    let listaEmpleados = [];

    document.addEventListener('DOMContentLoaded', () => {
        const rolNormalizado = ROL_USUARIO
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ");

        const rolesPermitidos = [
            'director operativo',
            'gerente administración',
            'gerente administracion',
            'compras'
        ];

        const tienePermiso = rolesPermitidos.some(rolPermitido => {
            const permitidoLimpio = rolPermitido
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/_/g, " ")
                .replace(/\s+/g, " ");
            return ROL_USUARIO === rolPermitido || rolNormalizado === permitidoLimpio;
        });

        if (!tienePermiso) {
            alert('🚫 Acceso denegado, no puedes ingresar a esta sección.');
            window.location.href = '../principal.html';
            return;
        }

        cargarEmpleados();
        configurarEventos();
    });

    async function cargarEmpleados() {
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/empleados/gestion`, {
                headers: { 
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol') 
                }
            });
            if (!res.ok) throw new Error('Error al obtener datos.');

            listaEmpleados = await res.json();
            renderizarTabla();
        } catch (err) {
            console.error('❌ Error al cargar la lista:', err);
        }
    }

    function renderizarTabla() {
        const tbody = document.getElementById('cuerpoTablaEmpleados');
        tbody.innerHTML = '';

        if (listaEmpleados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="tabla-vacia">No hay empleados registrados.</td></tr>`;
            return;
        }

        listaEmpleados.forEach(emp => {
            let fechaIngresoFormatted = '---';
            if (emp.hire_date) {
                const f = new Date(emp.hire_date);
                fechaIngresoFormatted = f.toLocaleDateString('es-MX', { timeZone: 'UTC' });
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${emp.name} ${emp.last_name}</strong></td>
                <td>${emp.email}</td>
                <td>${emp.phone || '---'}</td>
                <td><strong>${emp.job_title || '---'}</strong></td>
                <td>${emp.department || '---'}</td>
                <td>${fechaIngresoFormatted}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <!-- MODIFICACIÓN: Se añade el botón de vacaciones -->
                    <button class="btn btn-vacaciones" data-id="${emp.id_employee}" style="padding: 3px 8px; font-size: 11px; background-color: #28a745; color: #fff;">🌴 Vacaciones</button>
                    <button class="btn btn-editar" data-id="${emp.id_employee}" style="padding: 3px 8px; font-size: 11px;">✏️ Editar</button>
                    <button class="btn btn-eliminar" data-id="${emp.id_employee}" style="padding: 3px 8px; font-size: 11px; background-color: var(--red--); color: #fff;">🗑️ Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function configurarEventos() {
        const modal = document.getElementById('modalEmpleado');
        const btnNuevo = document.getElementById('btn-nuevo-empleado');
        const btnCerrar = document.getElementById('btnCerrarModal');
        const form = document.getElementById('formEmpleado');

        const modalVac = document.getElementById('modalVacaciones');
        const btnCerrarVac = document.getElementById('btnCerrarModalVacaciones');
        const formVac = document.getElementById('formVacaciones');

        if (btnCerrarVac && modalVac) {
            btnCerrarVac.addEventListener('click', () => modalVac.classList.remove('mostrar'));
        }

        if (btnNuevo && modal) {
            btnNuevo.addEventListener('click', () => {
                form.reset();
                document.getElementById('emp-id').value = '';
                const inputFecha = document.getElementById('emp-hire-date');
                if (inputFecha) inputFecha.value = '';

                document.getElementById('modalTitulo').textContent = '➕ Agregar Empleado';
                document.getElementById('grupo-pass').style.display = 'block';
                document.getElementById('emp-pass').setAttribute('required', 'true');
                modal.classList.add('mostrar');
            });
        }

        if (btnCerrar && modal) {
            btnCerrar.addEventListener('click', () => modal.classList.remove('mostrar'));
        }

        const cuerpoTabla = document.getElementById('cuerpoTablaEmpleados');
        if (cuerpoTabla) {
            cuerpoTabla.addEventListener('click', (e) => {
                const btnEdit = e.target.closest('.btn-editar');
                const btnDel = e.target.closest('.btn-eliminar');
                const btnVac = e.target.closest('.btn-vacaciones');

                if (btnVac) {
                    const id = btnVac.getAttribute('data-id');
                    abrirModalVacaciones(id);
                }

                if (btnEdit) {
                    const id = btnEdit.getAttribute('data-id');
                    const emp = listaEmpleados.find(i => String(i.id_employee) === String(id));
                    if (emp) {
                        document.getElementById('emp-id').value = emp.id_employee;
                        document.getElementById('emp-nombre').value = emp.name;
                        document.getElementById('emp-apellido').value = emp.last_name;
                        document.getElementById('emp-email').value = emp.email;
                        document.getElementById('emp-telefono').value = emp.phone || '';
                        document.getElementById('emp-puesto').value = emp.job_title || '';
                        document.getElementById('emp-depto').value = emp.department || '';

                        const inputFecha = document.getElementById('emp-hire-date');
                        if (inputFecha) {
                            inputFecha.value = emp.hire_date ? emp.hire_date.substring(0, 10) : '';
                        }
                        
                        document.getElementById('grupo-pass').style.display = 'none';
                        document.getElementById('emp-pass').removeAttribute('required');
                        
                        document.getElementById('modalTitulo').textContent = '✏️ Editar Empleado';
                        modal.classList.add('mostrar');
                    }
                }

                if (btnDel) {
                    const id = btnDel.getAttribute('data-id');
                    if (confirm('¿Estás seguro de que deseas eliminar este empleado?')) {
                        eliminarEmpleado(id);
                    }
                }
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('emp-id').value;
                const esEdicion = Boolean(id);

                const payload = {
                    name: document.getElementById('emp-nombre').value.trim(),
                    last_name: document.getElementById('emp-apellido').value.trim(),
                    email: document.getElementById('emp-email').value.trim(),
                    phone: document.getElementById('emp-telefono').value.trim(),
                    job_title: document.getElementById('emp-puesto').value.trim(),
                    department: document.getElementById('emp-depto').value.trim(),
                    hire_date: document.getElementById('emp-hire-date').value || null
                };

                if (!esEdicion) {
                    payload.password = document.getElementById('emp-pass').value;
                }

                const url = esEdicion ? `${API_BASE}/empleados/${id}` : `${API_BASE}/empleados`;
                const method = esEdicion ? 'PUT' : 'POST';

                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
                    const rolActual = (userToken && userToken.rol) ? userToken.rol.trim() : '';
                    const res = await fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : '',
                            'x-user-rol': rolActual
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Error al procesar.');

                    alert(data.message);
                    modal.classList.remove('mostrar');
                    cargarEmpleados();
                } catch (err) {
                    alert(`❌ ${err.message}`);
                }
            });
        }

        if (formVac) {
            formVac.addEventListener('submit', async (e) => {
                e.preventDefault();
                const idEmployee = document.getElementById('vac-emp-id').value;
                const payload = {
                    fecha_inicio: document.getElementById('vac-fecha-inicio').value,
                    fecha_fin: document.getElementById('vac-fecha-fin').value,
                    dias_tomados: parseInt(document.getElementById('vac-dias-tomados').value),
                    motivo: document.getElementById('vac-motivo').value.trim()
                };

                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const res = await fetch(`${API_BASE}/empleados/${idEmployee}/vacaciones`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : '',
                            'x-user-rol': localStorage.getItem('userRol')
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Error al guardar vacaciones.');

                    alert('🎉 Vacaciones registradas correctamente.');
                    formVac.reset();
                    abrirModalVacaciones(idEmployee);
                } catch (err) {
                    alert(`❌ ${err.message}`);
                }
            });
        }
    }

    async function abrirModalVacaciones(idEmployee) {
        const emp = listaEmpleados.find(i => String(i.id_employee) === String(idEmployee));
        if (!emp) return;

        document.getElementById('vacNombreEmpleado').textContent = `🌴 Vacaciones - ${emp.name} ${emp.last_name}`;
        document.getElementById('vac-emp-id').value = idEmployee;

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/empleados/${idEmployee}/vacaciones`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol')
                }
            });

            if (!res.ok) throw new Error('Error al consultar datos de vacaciones.');

            const data = await res.json();
            
            // Actualizar KPIs
            document.getElementById('kpiDiasLey').textContent = data.dias_ley;
            document.getElementById('kpiDiasTomados').textContent = data.dias_tomados;
            document.getElementById('kpiDiasRestantes').textContent = data.dias_restantes;
            document.getElementById('gaugeTextoCentral').textContent = `${data.dias_restantes} Días Restantes`;

            renderizarVelocimetro(data.dias_tomados, data.dias_restantes);

            renderizarTablaHistorial(data.historial, idEmployee);

            document.getElementById('modalVacaciones').classList.add('mostrar');
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    }

    function renderizarVelocimetro(diasTomados, diasRestantes) {
        const ctx = document.getElementById('gaugeVacaciones').getContext('2d');
        if (chartGaugeVacaciones) {
            chartGaugeVacaciones.destroy();
        }

        const total = diasTomados + (diasRestantes > 0 ? diasRestantes : 0);
        
        chartGaugeVacaciones = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Días Tomados', 'Días Restantes'],
                datasets: [{
                    data: [diasTomados, diasRestantes > 0 ? diasRestantes : 0],
                    backgroundColor: ['#ffc107', '#28a745'],
                    borderWidth: 0
                }]
            },
            options: {
                rotation: -90,
                circumference: 180,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                }
            }
        });
    }

    function renderizarTablaHistorial(historial, idEmployee) {
        const tbody = document.getElementById('historialVacacionesTabla');
        tbody.innerHTML = '';

        if (!historial || historial.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:10px; color:#888;">Sin registros de vacaciones tomadas.</td></tr>`;
            return;
        }

        historial.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 6px;">${new Date(item.fecha_inicio).toLocaleDateString('es-MX', {timeZone: 'UTC'})}</td>
                <td style="padding: 6px;">${new Date(item.fecha_fin).toLocaleDateString('es-MX', {timeZone: 'UTC'})}</td>
                <td style="padding: 6px;"><strong>${item.dias_tomados}</strong></td>
                <td style="padding: 6px;">${item.motivo || '---'}</td>
                <td style="padding: 6px; text-align: center;">
                    <button class="btn" style="padding: 2px 5px; font-size: 10px; background: #dc3545; color: #fff;" onclick="eliminarVacacion(${item.id_vacacion}, ${idEmployee})">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.eliminarVacacion = async function(idVacacion, idEmployee) {
        if (!confirm('¿Deseas eliminar este registro de vacaciones?')) return;
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/empleados/vacaciones/${idVacacion}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol')
                }
            });

            if (!res.ok) throw new Error('Error al eliminar registro.');
            abrirModalVacaciones(idEmployee);
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    };

    async function eliminarEmpleado(id) {
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
            const rolActual = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol.trim() : '';
            const res = await fetch(`${API_BASE}/empleados/${id}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol')
                }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al eliminar.');

            alert(data.message);
            cargarEmpleados();
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    }
})();