(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const ROL_USUARIO = (userToken && userToken.rol) ? userToken.rol.trim().toLowerCase() : '';

    let listaEmpleados = [];

    document.addEventListener('DOMContentLoaded', () => {
        const rolesPermitidos = [
            'director operativo',
            'director_operativo',
            'gerente administración',
            'gerente administracion',
            'gerente_administracion'
        ];

        if (!rolesPermitidos.includes(ROL_USUARIO)) {
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
                <!-- MODIFICACIÓN: Se renderiza la Fecha de Ingreso -->
                <td>${fechaIngresoFormatted}</td>
                <td style="text-align: center; white-space: nowrap;">
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
    }

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