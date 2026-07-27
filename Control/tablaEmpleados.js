(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    const ROL_USUARIO = (localStorage.getItem('userRol') || '').trim().toLowerCase();

    let listaEmpleados = [];

    document.addEventListener('DOMContentLoaded', () => {
        if (ROL_USUARIO !== 'director operativo' && ROL_USUARIO !== 'director_operativo') {
            alert('🚫 Acceso denegado: Solo el Director Operativo puede ingresar a esta sección.');
            window.location.href = '../principal.html';
            return;
        }

        cargarEmpleados();
        configurarEventos();
    });

    async function cargarEmpleados() {
        try {
            const res = await fetch(`${API_BASE}/empleados/gestion`, {
                headers: { 'x-user-rol': localStorage.getItem('userRol') }
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
            tbody.innerHTML = `<tr><td colspan="6" class="tabla-vacia">No hay empleados registrados.</td></tr>`;
            return;
        }

        listaEmpleados.forEach(emp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${emp.name} ${emp.last_name}</strong></td>
                <td>${emp.email}</td>
                <td>${emp.phone || '---'}</td>
                <td><strong>${emp.job_title || '---'}</strong></td>
                <td>${emp.department || '---'}</td>
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
                };

                if (!esEdicion) {
                    payload.password = document.getElementById('emp-pass').value;
                }

                const url = esEdicion ? `${API_BASE}/empleados/${id}` : `${API_BASE}/empleados`;
                const method = esEdicion ? 'PUT' : 'POST';

                try {
                    const res = await fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-rol': localStorage.getItem('userRol')
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
            const res = await fetch(`${API_BASE}/empleados/${id}`, {
                method: 'DELETE',
                headers: { 'x-user-rol': localStorage.getItem('userRol') }
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