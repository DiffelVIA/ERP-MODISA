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
            if (!res.ok) throw new Error('Error al obtener datos del servidor.');

            listaEmpleados = await res.json();
            renderizarTabla();
        } catch (err) {
            console.error("❌ Error al cargar empleados:", err);
        }
    }

    function renderizarTabla() {
        const tbody = document.getElementById('cuerpoTablaEmpleados');
        tbody.innerHTML = '';

        if (listaEmpleados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #64748b;">No hay empleados registrados.</td></tr>`;
            return;
        }

        listaEmpleados.forEach(emp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${emp.name} ${emp.last_name}</strong></td>
                <td>${emp.email}</td>
                <td>${emp.phone || '---'}</td>
                <td><span class="badge-rol">${emp.job_title || '---'}</span></td>
                <td>${emp.department || '---'}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-accion btn-editar-emp" data-id="${emp.id_employee}">✏️ Editar</button>
                    <button class="btn-accion btn-eliminar-emp" data-id="${emp.id_employee}">🗑️ Eliminar</button>
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

        btnNuevo.addEventListener('click', () => {
            form.reset();
            document.getElementById('emp-id').value = '';
            document.getElementById('modalTitulo').textContent = '➕ Agregar Nuevo Empleado';
            document.getElementById('grupo-pass').style.display = 'flex';
            document.getElementById('emp-pass').setAttribute('required', 'true');
            modal.style.display = 'flex';
        });

        btnCerrar.addEventListener('click', () => modal.style.display = 'none');

        // Escuchador corregido con delegación exacta de eventos
        document.getElementById('cuerpoTablaEmpleados').addEventListener('click', (e) => {
            const btnEdit = e.target.closest('.btn-editar-emp');
            const btnDel = e.target.closest('.btn-eliminar-emp');

            if (btnEdit) {
                const id = btnEdit.getAttribute('data-id');
                const emp = listaEmpleados.find(item => String(item.id_employee) === String(id));
                if (emp) {
                    document.getElementById('emp-id').value = emp.id_employee;
                    document.getElementById('emp-nombre').value = emp.name;
                    document.getElementById('emp-apellido').value = emp.last_name;
                    document.getElementById('emp-email').value = emp.email;
                    document.getElementById('emp-telefono').value = emp.phone || '';
                    document.getElementById('emp-puesto').value = emp.job_title || '';
                    document.getElementById('emp-depto').value = emp.department || '';
                    
                    // Al editar no exigimos contraseña
                    document.getElementById('grupo-pass').style.display = 'none';
                    document.getElementById('emp-pass').removeAttribute('required');
                    
                    document.getElementById('modalTitulo').textContent = '✏️ Editar Empleado';
                    modal.style.display = 'flex';
                }
            }

            if (btnDel) {
                const id = btnDel.getAttribute('data-id');
                if (confirm('¿Estás seguro de que deseas eliminar a este empleado de la plataforma?')) {
                    eliminarEmpleado(id);
                }
            }
        });

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
                if (!res.ok) throw new Error(data.error || 'Error al guardar los datos.');

                alert(data.message);
                modal.style.display = 'none';
                cargarEmpleados();
            } catch (err) {
                alert(`❌ ${err.message}`);
            }
        });
    }

    async function eliminarEmpleado(id) {
        try {
            const res = await fetch(`${API_BASE}/empleados/${id}`, {
                method: 'DELETE',
                headers: { 'x-user-rol': localStorage.getItem('userRol') }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el registro.');

            alert(data.message);
            cargarEmpleados();
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    }
})();