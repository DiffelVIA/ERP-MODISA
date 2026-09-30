(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    document.addEventListener('DOMContentLoaded', () => {
        cargarTablaVacaciones();
    });

    /**
     * Decodifica el JWT para obtener el rol y la identidad del usuario activo
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
     * Consulta el backend y renderiza la tabla con los registros de la tabla MySQL 'vacaciones'
     */
    async function cargarTablaVacaciones() {
        const tbody = document.getElementById('tbody-vacaciones');
        if (!tbody) return;

        const token = localStorage.getItem('jwtToken') || '';
        const userRol = localStorage.getItem('userRol') || '';
        const payload = obtenerDatosDesdeJWT();
        const esAdmin = ['admin', 'administrador', 'rh', 'gerencia'].includes(userRol.toLowerCase());

        try {
            const res = await fetch(`${API_BASE}/vacaciones`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': userRol
                }
            });

            if (!res.ok) throw new Error('Error al consultar el historial de vacaciones.');

            const vacaciones = await res.json();
            tbody.innerHTML = '';

            if (vacaciones.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No hay solicitudes de vacaciones registradas.</td></tr>';
                return;
            }

            vacaciones.forEach(item => {
                const tr = document.createElement('tr');

                // 1. Empleado
                const tdEmpleado = document.createElement('td');
                tdEmpleado.textContent = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
                tr.appendChild(tdEmpleado);

                // 2. Fecha de Solicitud (created_at)
                const tdCreated = document.createElement('td');
                tdCreated.textContent = formatearFecha(item.created_at || item.fecha_solicitud);
                tr.appendChild(tdCreated);

                // 3. Fecha Inicio
                const tdInicio = document.createElement('td');
                tdInicio.textContent = formatearFecha(item.fecha_inicio);
                tr.appendChild(tdInicio);

                // 4. Fecha Fin
                const tdFin = document.createElement('td');
                tdFin.textContent = formatearFecha(item.fecha_fin);
                tr.appendChild(tdFin);

                // 5. Días Solicitados
                const tdDias = document.createElement('td');
                tdDias.style.textAlign = 'center';
                tdDias.textContent = item.dias_tomados;
                tr.appendChild(tdDias);

                // 6. Estado (Dropdown con ENUM: 'pendiente', 'autorizada', 'rechazada')
                const tdEstado = document.createElement('td');
                const selectEstado = document.createElement('select');
                selectEstado.className = 'select-estado';
                selectEstado.dataset.idVacacion = item.id_vacacion;

                const opciones = [
                    { val: 'pendiente', text: 'Pendiente' },
                    { val: 'autorizada', text: 'Autorizada' },
                    { val: 'rechazada', text: 'Rechazada' }
                ];

                opciones.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.val;
                    option.textContent = opt.text;
                    if (String(item.estado).toLowerCase() === opt.val) {
                        option.selected = true;
                    }
                    selectEstado.appendChild(option);
                });

                // Control de seguridad RBAC: Bloquear selector si el usuario no es Administrador / RH
                if (!esAdmin) {
                    selectEstado.disabled = true;
                    selectEstado.style.cursor = 'not-allowed';
                } else {
                    selectEstado.addEventListener('change', (e) => actualizarEstadoVacacion(item.id_vacacion, e.target.value));
                }

                tdEstado.appendChild(selectEstado);
                tr.appendChild(tdEstado);

                // 7. Observaciones
                const tdObs = document.createElement('td');
                if (esAdmin) {
                    const inputObs = document.createElement('input');
                    inputObs.type = 'text';
                    inputObs.value = item.observaciones || '';
                    inputObs.placeholder = 'Agregar observación...';
                    inputObs.style.width = '90%';
                    inputObs.addEventListener('blur', (e) => actualizarObservacionVacacion(item.id_vacacion, e.target.value));
                    tdObs.appendChild(inputObs);
                } else {
                    tdObs.textContent = item.observaciones || '-';
                }
                tr.appendChild(tdObs);

                tbody.appendChild(tr);
            });

        } catch (err) {
            console.error("❌ Error al cargar vacaciones:", err);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 20px;">❌ ${err.message}</td></tr>`;
        }
    }

    /**
     * Envía una petición PATCH para actualizar el estado del ENUM en MySQL
     */
    async function actualizarEstadoVacacion(idVacacion, nuevoEstado) {
        const token = localStorage.getItem('jwtToken') || '';
        try {
            const res = await fetch(`${API_BASE}/vacaciones/${idVacacion}/estado`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol') || ''
                },
                body: JSON.stringify({ estado: nuevoEstado })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'No se pudo actualizar el estado.');
            }

            alert('✅ Estado de vacaciones actualizado correctamente.');
        } catch (err) {
            console.error("❌ Error al actualizar estado:", err);
            alert(`❌ Error: ${err.message}`);
            cargarTablaVacaciones(); // Revertir cambios en pantalla
        }
    }

    /**
     * Envía una petición PATCH para actualizar las observaciones en MySQL
     */
    async function actualizarObservacionVacacion(idVacacion, nuevaObservacion) {
        const token = localStorage.getItem('jwtToken') || '';
        try {
            await fetch(`${API_BASE}/vacaciones/${idVacacion}/observaciones`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol') || ''
                },
                body: JSON.stringify({ observaciones: nuevaObservacion })
            });
        } catch (err) {
            console.error("❌ Error al guardar observación:", err);
        }
    }

    /**
     * Formatea cadenas de fecha a formato legible local DD/MM/AAAA
     */
    function formatearFecha(fechaStr) {
        if (!fechaStr) return '-';
        const date = new Date(fechaStr);
        if (isNaN(date.getTime())) return fechaStr;
        return date.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'UTC'
        });
    }
})();