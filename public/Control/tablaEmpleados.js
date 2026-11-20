(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        return String(texto)
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ");
    }

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
        const rolNormalizado = normalizarTexto(ROL_USUARIO);

        const rolesPermitidos = [
            'director operativo',
            'gerente administración',
            'gerente administracion',
            'gerente de administracion',
            'compras'
        ];

        const tienePermiso = rolesPermitidos.some(rolPermitido => {
            const permitidoLimpio = normalizarTexto(rolPermitido);
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
            tbody.innerHTML = `<tr><td colspan="8" class="tabla-vacia">No hay empleados registrados.</td></tr>`;
            return;
        }

        const formatoMoneda = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        });

        listaEmpleados.forEach(emp => {
            let fechaIngresoFormatted = '---';
            if (emp.hire_date) {
                const f = new Date(emp.hire_date);
                fechaIngresoFormatted = f.toLocaleDateString('es-MX', { timeZone: 'UTC' });
            }

            const sueldoNum = Number(emp.sueldo || 0);
            const sueldoFormatted = formatoMoneda.format(sueldoNum);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHTML(emp.name)} ${escapeHTML(emp.last_name)}</strong></td>
                <td>${escapeHTML(emp.email)}</td>
                <td>${escapeHTML(emp.phone) || '---'}</td>
                <td><strong>${escapeHTML(emp.job_title) || '---'}</strong></td>
                <td>${escapeHTML(emp.department) || '---'}</td>
                <td>${fechaIngresoFormatted}</td>
                <td style="text-align: right; font-weight: 600; color: #2e7d32;">${sueldoFormatted}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn btn-editar" data-id="${Number(emp.id_employee)}" style="padding: 3px 8px; font-size: 11px;">✏️ Editar</button>
                    <button class="btn btn-eliminar" data-id="${Number(emp.id_employee)}" style="padding: 3px 8px; font-size: 11px; background-color: #f0a351; color: #fff;">🗑️ Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function actualizarVisibilidadCampoOtro(idGrupo, idInput, valorSelect) {
        const grupoOtro = document.getElementById(idGrupo);
        const inputOtro = document.getElementById(idInput);
        if (!grupoOtro || !inputOtro) return;

        if (valorSelect === '__otro__') {
            grupoOtro.style.display = 'block';
            inputOtro.setAttribute('required', 'true');
        } else {
            grupoOtro.style.display = 'none';
            inputOtro.removeAttribute('required');
            inputOtro.value = '';
        }
    }

    function establecerValorEnSelectCatalogo(idSelect, idGrupoOtro, idInputOtro, valorActual) {
        const selectEl = document.getElementById(idSelect);
        const inputOtro = document.getElementById(idInputOtro);
        if (!selectEl) return;

        const valorLimpio = (valorActual || '').trim();
        if (!valorLimpio) {
            selectEl.value = '';
            actualizarVisibilidadCampoOtro(idGrupoOtro, idInputOtro, '');
            return;
        }

        const valorNorm = normalizarTexto(valorLimpio);
        const opciones = Array.from(selectEl.options);
        const opcionCoincidente = opciones.find(opt =>
            opt.value !== '' &&
            opt.value !== '__otro__' &&
            normalizarTexto(opt.value) === valorNorm
        );

        if (opcionCoincidente) {
            selectEl.value = opcionCoincidente.value;
            actualizarVisibilidadCampoOtro(idGrupoOtro, idInputOtro, opcionCoincidente.value);
        } else {
            selectEl.value = '__otro__';
            actualizarVisibilidadCampoOtro(idGrupoOtro, idInputOtro, '__otro__');
            if (inputOtro) {
                inputOtro.value = valorLimpio;
            }
        }
    }

    function configurarEventos() {
        const modal = document.getElementById('modalEmpleado');
        const btnNuevo = document.getElementById('btn-nuevo-empleado');
        const btnCerrar = document.getElementById('btnCerrarModal');
        const form = document.getElementById('formEmpleado');
        const btnExcel = document.getElementById('btn-descargar-excel');
        const selectPuesto = document.getElementById('emp-puesto');
        const selectDepto = document.getElementById('emp-depto');

        if (selectPuesto) {
            selectPuesto.addEventListener('change', (e) => {
                actualizarVisibilidadCampoOtro('grupo-puesto-otro', 'emp-puesto-otro', e.target.value);
                if (e.target.value === '__otro__') {
                    const inputOtro = document.getElementById('emp-puesto-otro');
                    if (inputOtro) inputOtro.focus();
                }
            });
        }

        if (selectDepto) {
            selectDepto.addEventListener('change', (e) => {
                actualizarVisibilidadCampoOtro('grupo-depto-otro', 'emp-depto-otro', e.target.value);
                if (e.target.value === '__otro__') {
                    const inputOtro = document.getElementById('emp-depto-otro');
                    if (inputOtro) inputOtro.focus();
                }
            });
        }

        if (btnExcel) {
            btnExcel.addEventListener('click', descargarExcel);
        }

        if (btnNuevo && modal) {
            btnNuevo.addEventListener('click', () => {
                form.reset();
                document.getElementById('emp-id').value = '';
                establecerValorEnSelectCatalogo('emp-puesto', 'grupo-puesto-otro', 'emp-puesto-otro', '');
                establecerValorEnSelectCatalogo('emp-depto', 'grupo-depto-otro', 'emp-depto-otro', '');

                const inputFecha = document.getElementById('emp-hire-date');
                if (inputFecha) inputFecha.value = '';

                const inputSueldo = document.getElementById('emp-sueldo');
                if (inputSueldo) inputSueldo.value = '';

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
                        establecerValorEnSelectCatalogo('emp-puesto', 'grupo-puesto-otro', 'emp-puesto-otro', emp.job_title || '');
                        establecerValorEnSelectCatalogo('emp-depto', 'grupo-depto-otro', 'emp-depto-otro', emp.department || '');

                        const inputFecha = document.getElementById('emp-hire-date');
                        if (inputFecha) {
                            inputFecha.value = emp.hire_date ? emp.hire_date.substring(0, 10) : '';
                        }

                        const inputSueldo = document.getElementById('emp-sueldo');
                        if (inputSueldo) {
                            inputSueldo.value = emp.sueldo !== undefined && emp.sueldo !== null ? emp.sueldo : '';
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

                const seleccionPuesto = document.getElementById('emp-puesto').value;
                const puestoFinal = seleccionPuesto === '__otro__'
                    ? document.getElementById('emp-puesto-otro').value.trim()
                    : seleccionPuesto.trim();

                if (!puestoFinal) {
                    alert('⚠️ Por favor selecciona o especifica un puesto válido.');
                    return;
                }

                const seleccionDepto = document.getElementById('emp-depto').value;
                const deptoFinal = seleccionDepto === '__otro__'
                    ? document.getElementById('emp-depto-otro').value.trim()
                    : seleccionDepto.trim();

                const valSueldo = document.getElementById('emp-sueldo') ? document.getElementById('emp-sueldo').value : '0';

                const payload = {
                    name: document.getElementById('emp-nombre').value.trim(),
                    last_name: document.getElementById('emp-apellido').value.trim(),
                    email: document.getElementById('emp-email').value.trim(),
                    phone: document.getElementById('emp-telefono').value.trim(),
                    job_title: puestoFinal,
                    department: deptoFinal,
                    hire_date: document.getElementById('emp-hire-date').value || null,
                    sueldo: valSueldo !== '' ? parseFloat(valSueldo) : 0
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

    async function descargarExcel() {
        const btnExcel = document.getElementById('btn-descargar-excel');
        if (!btnExcel) return;

        const textoOriginal = btnExcel.innerHTML;
        btnExcel.disabled = true;
        btnExcel.style.opacity = '0.7';
        btnExcel.style.cursor = 'not-allowed';
        btnExcel.innerHTML = '⏳ Descargando...';

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_BASE}/empleados/exportar-excel`, {
                method: 'GET',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-user-rol': localStorage.getItem('userRol') || ''
                }
            });

            if (!res.ok) {
                let errorMsg = 'No se pudo descargar el archivo.';
                try {
                    const errData = await res.json();
                    if (errData && errData.error) errorMsg = errData.error;
                } catch (_) {}
                throw new Error(errorMsg);
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const fechaHoy = new Date().toISOString().split('T')[0];
            a.download = `Reporte_Empleados_${fechaHoy}.xlsx`;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error('❌ Error al descargar Excel:', err);
            alert(`❌ Error al descargar Excel: ${err.message}`);
        } finally {
            btnExcel.disabled = false;
            btnExcel.style.opacity = '1';
            btnExcel.style.cursor = 'pointer';
            btnExcel.innerHTML = textoOriginal;
        }
    }

})();