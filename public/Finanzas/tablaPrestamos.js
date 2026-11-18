(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://erp-modisa.onrender.com/api';

    let todosLosPrestamos = [];

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function limpiarTexto(texto) {
        if (!texto) return '';
        return texto
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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
            return payload.rol || payload.role || payload.job_title || '';
        } catch (e) {
            console.error('❌ Error al decodificar JWT en préstamos:', e);
            return '';
        }
    }

    function verificarPermisoRol() {
        const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const rolRaw = (userToken && userToken.rol)
            ? userToken.rol
            : (obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '');

        const rolLimpio = limpiarTexto(rolRaw);
        const rolesPermitidos = [
            'compras',
            'gerente de administracion',
            'gerente administracion',
            'director operativo',
            'director general'
        ];

        return rolesPermitidos.some(permitido => {
            const pLimpio = limpiarTexto(permitido);
            return rolLimpio === pLimpio || (rolLimpio.includes('gerente') && rolLimpio.includes('administrac'));
        });
    }

    function calcularEstadoPrestamo(p) {
        if (Number(p.renewed) === 1) {
            return 'Renovado';
        }
        const dias = Number(p.dias_restantes);
        if (dias < 0) {
            return 'Vencido';
        }
        if (dias <= 30) {
            return 'Próximo a vencer';
        }
        return 'Vigente';
    }

    function formatearFechaMX(fechaISO) {
        if (!fechaISO) return '---';
        const partes = String(fechaISO).split('-');
        if (partes.length !== 3) return escapeHTML(fechaISO);
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!verificarPermisoRol()) {
            const mainContent = document.querySelector('.main-tabla');
            if (mainContent) {
                mainContent.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
                        <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
                        <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px; font-weight: bold;">Acceso Denegado</h1>
                        <p style="color: #64748b; font-size: 16px; max-width: 400px; margin: 0 auto 30px auto; line-height: 1.5;">
                            No tienes los permisos necesarios para ver esta sección.
                        </p>
                    </div>
                `;
            }
            return;
        }

        document.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('chk-acreedor') ||
                e.target.classList.contains('chk-firma') ||
                e.target.classList.contains('chk-estado')
            ) {
                aplicarFiltrosCruzados();
            }
        });

        configurarModalPrestamo();
        cargarPrestamos();
    });

    async function cargarPrestamos() {
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const response = await fetch(`${API_BASE}/prestamos`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });

            if (!response.ok) throw new Error('Error al obtener los préstamos');

            todosLosPrestamos = await response.json();
            generarOpcionesFiltros(todosLosPrestamos);
            configurarDropdowns();
            renderizarTabla(todosLosPrestamos);
        } catch (error) {
            console.error('❌ Error al cargar préstamos:', error);
        }
    }

    function renderizarTabla(lista) {
        const tbody = document.getElementById('cuerpo-tabla-prestamos');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">🚫 No se encontraron préstamos registrados con los filtros seleccionados.</td></tr>`;
            return;
        }

        lista.forEach(p => {
            const tr = document.createElement('tr');
            tr.id = `fila-prestamo-${p.id_loan}`;

            const estado = calcularEstadoPrestamo(p);
            const dias = Number(p.dias_restantes);

            let badgeEstado = '';
            if (estado === 'Renovado') {
                badgeEstado = `<span style="color: #2563eb; font-weight: 700;">🔄 Renovado</span>`;
            } else if (estado === 'Vencido') {
                badgeEstado = `<span style="color: #dc2626; font-weight: 700;">❌ Vencido (hace ${Math.abs(dias)} d)</span>`;
            } else if (estado === 'Próximo a vencer') {
                const textoDia = dias === 0 ? 'Vence HOY' : `En ${dias} día(s) · Alerta activa`;
                badgeEstado = `<span style="color: #d97706; font-weight: 700;">⏰ ${textoDia}</span>`;
            } else {
                badgeEstado = `<span style="color: #16a34a; font-weight: 700;">✅ Vigente (${dias} d)</span>`;
            }

            const celdaFirma = `
                <select class="select-tabla" onchange="actualizarFirmaPrestamo(${p.id_loan}, this.value)">
                    <option value="No" ${p.contract_signed === 'No' ? 'selected' : ''}>⏳ No</option>
                    <option value="Sí" ${p.contract_signed === 'Sí' ? 'selected' : ''}>✅ Sí</option>
                </select>
            `;

            const botonRenovar = Number(p.renewed) === 0
                ? `<button type="button" onclick="abrirModalRenovacion(${p.id_loan})" class="btn-dropdown" style="padding: 4px 10px; font-size: 12px;" title="Renovar préstamo o detener alertas">🔄 Renovar</button>`
                : '---';

            const botonEliminar = `<button type="button" class="btn-eliminar-prestamo" data-id="${Number(p.id_loan)}" data-acreedor="${escapeHTML(p.lender_name)}" title="Eliminar préstamo" style="background:none; border:none; cursor:pointer; font-size:13px; color:#ef4444; font-weight:bold; padding: 2px 4px; line-height: 1;">❌</button>`;

            tr.innerHTML = `
                <td style="vertical-align: middle; text-align: center; font-weight: 600;">${escapeHTML(p.lender_name)}</td>
                <td style="vertical-align: middle; text-align: center;">${formatearFechaMX(p.loan_date)}</td>
                <td style="vertical-align: middle; text-align: center; font-weight: 600;">${formatearFechaMX(p.due_date)}</td>
                <td style="vertical-align: middle; text-align: center; font-weight: 600;">${Number(p.interest_rate || 0).toFixed(2)}%</td>
                <td style="vertical-align: middle; text-align: center;">${celdaFirma}</td>
                <td style="vertical-align: middle; text-align: center;">${badgeEstado}</td>
                <td style="vertical-align: middle; text-align: center;">${botonRenovar}</td>
                <td style="vertical-align: middle; text-align: right; padding-right: 10px; width: 44px;">${botonEliminar}</td>
            `;

            const btnEliminarEl = tr.querySelector('.btn-eliminar-prestamo');
            if (btnEliminarEl) {
                btnEliminarEl.addEventListener('click', () => {
                    eliminarPrestamo(Number(p.id_loan), p.lender_name);
                });
            }

            tbody.appendChild(tr);
        });
    }

    function generarOpcionesFiltros(prestamos) {
        const contAcreedor = document.getElementById('filtroAcreedor');
        const contFirma = document.getElementById('filtroFirma');
        const contEstado = document.getElementById('filtroEstado');

        if (!contAcreedor || !contFirma || !contEstado) return;

        const acreedoresUnicos = [...new Set(prestamos.map(p => p.lender_name).filter(Boolean))].sort();
        const firmasUnicas = ['Sí', 'No'];
        const estadosUnicos = [...new Set(prestamos.map(p => calcularEstadoPrestamo(p)))].sort();

        contAcreedor.innerHTML = acreedoresUnicos.map(a => `
            <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
                <input type="checkbox" value="${escapeHTML(a)}" class="chk-acreedor"> ${escapeHTML(a)}
            </label>
        `).join('');

        contFirma.innerHTML = firmasUnicas.map(f => `
            <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
                <input type="checkbox" value="${f}" class="chk-firma"> ${f === 'Sí' ? '✅ Sí' : '⏳ No'}
            </label>
        `).join('');

        contEstado.innerHTML = estadosUnicos.map(e => `
            <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
                <input type="checkbox" value="${escapeHTML(e)}" class="chk-estado"> ${escapeHTML(e)}
            </label>
        `).join('');
    }

    function configurarDropdowns() {
        const dropdowns = document.querySelectorAll('.filtros');
        dropdowns.forEach(dropdown => {
            const boton = dropdown.querySelector('.btn-dropdown');
            const contenido = dropdown.querySelector('.contenido-dropdown');

            if (boton && contenido) {
                boton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.contenido-dropdown').forEach(c => {
                        if (c !== contenido) {
                            c.classList.remove('mostrar', 'show');
                        }
                    });
                    contenido.classList.toggle('mostrar');
                    contenido.classList.toggle('show');
                });
                contenido.addEventListener('click', (e) => e.stopPropagation());
            }
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.contenido-dropdown').forEach(c => c.classList.remove('mostrar', 'show'));
        });
    }

    function aplicarFiltrosCruzados() {
        const obtenerSeleccionados = (selector) =>
            Array.from(document.querySelectorAll(selector)).filter(chk => chk.checked).map(chk => chk.value);

        const acreedores = obtenerSeleccionados('.chk-acreedor');
        const firmas = obtenerSeleccionados('.chk-firma');
        const estados = obtenerSeleccionados('.chk-estado');

        const filtrados = todosLosPrestamos.filter(p => {
            const cumpleAcreedor = acreedores.length === 0 || acreedores.includes(p.lender_name);
            const cumpleFirma = firmas.length === 0 || firmas.includes(p.contract_signed);
            const cumpleEstado = estados.length === 0 || estados.includes(calcularEstadoPrestamo(p));
            return cumpleAcreedor && cumpleFirma && cumpleEstado;
        });

        renderizarTabla(filtrados);
    }

    function configurarModalPrestamo() {
        const modal = document.getElementById('modalNuevoPrestamo');
        const btnAbrir = document.getElementById('btnAbrirModalPrestamo');
        const btnCancelar = document.getElementById('btnCancelarModalPrestamo');
        const form = document.getElementById('formPrestamo');

        if (!modal || !btnAbrir || !btnCancelar || !form) return;

        btnAbrir.addEventListener('click', () => {
            form.reset();
            document.getElementById('prestamoIdRenovar').value = '';
            document.getElementById('tituloModalPrestamo').textContent = 'Registrar Préstamo';
            document.getElementById('inputAcreedor').disabled = false;
            document.getElementById('inputFechaPrestamo').disabled = false;
            modal.style.display = 'flex';
        });

        btnCancelar.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('jwtToken') || '';
            const idRenovar = document.getElementById('prestamoIdRenovar').value;

            try {
                if (idRenovar) {
                    const response = await fetch(`${API_BASE}/prestamos/${idRenovar}/renovar`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : ''
                        },
                        body: JSON.stringify({
                            nueva_fecha_vencimiento: document.getElementById('inputFechaVencimiento').value,
                            nueva_tasa_interes: document.getElementById('inputTasaInteres').value,
                            contract_signed: document.getElementById('selectContratoFirmado').value
                        })
                    });

                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        alert(`❌ ${data.error || 'No se pudo renovar el préstamo.'}`);
                        return;
                    }

                    modal.style.display = 'none';
                    alert('✅ Préstamo renovado con éxito. Se actualizó la fecha de vencimiento.');
                    cargarPrestamos();
                    return;
                }

                const payload = {
                    lender_name: document.getElementById('inputAcreedor').value.trim(),
                    loan_date: document.getElementById('inputFechaPrestamo').value,
                    due_date: document.getElementById('inputFechaVencimiento').value,
                    interest_rate: document.getElementById('inputTasaInteres').value,
                    contract_signed: document.getElementById('selectContratoFirmado').value
                };

                const response = await fetch(`${API_BASE}/prestamos`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    alert(`❌ ${data.error || 'No se pudo registrar el préstamo.'}`);
                    return;
                }

                modal.style.display = 'none';
                alert('✅ Préstamo registrado correctamente.');
                cargarPrestamos();
            } catch (error) {
                console.error('❌ Error al guardar préstamo:', error);
                alert('❌ Error de red al procesar la solicitud.');
            }
        });
    }

    window.abrirModalRenovacion = function(idLoan) {
        const prestamo = todosLosPrestamos.find(p => p.id_loan === idLoan);
        if (!prestamo) return;

        const modal = document.getElementById('modalNuevoPrestamo');
        document.getElementById('prestamoIdRenovar').value = idLoan;
        document.getElementById('tituloModalPrestamo').textContent = `Renovar Préstamo: ${prestamo.lender_name}`;

        const inputAcreedor = document.getElementById('inputAcreedor');
        const inputFechaPrestamo = document.getElementById('inputFechaPrestamo');
        inputAcreedor.value = prestamo.lender_name;
        inputAcreedor.disabled = true;
        inputFechaPrestamo.value = prestamo.loan_date;
        inputFechaPrestamo.disabled = true;

        document.getElementById('inputFechaVencimiento').value = prestamo.due_date;
        document.getElementById('inputTasaInteres').value = prestamo.interest_rate;
        document.getElementById('selectContratoFirmado').value = prestamo.contract_signed;

        modal.style.display = 'flex';
    };

    window.actualizarFirmaPrestamo = async function(idLoan, nuevoValor) {
        const token = localStorage.getItem('jwtToken') || '';
        const trFila = document.getElementById(`fila-prestamo-${idLoan}`);

        try {
            const response = await fetch(`${API_BASE}/prestamos/${idLoan}/firma`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ contract_signed: nuevoValor })
            });

            if (response.ok) {
                const prestamo = todosLosPrestamos.find(p => p.id_loan === idLoan);
                if (prestamo) prestamo.contract_signed = nuevoValor;
                if (trFila) {
                    trFila.style.backgroundColor = '#eaffea';
                    setTimeout(() => { trFila.style.backgroundColor = ''; }, 600);
                }
            } else if (trFila) {
                trFila.style.backgroundColor = '#ffdddd';
            }
        } catch (error) {
            console.error('❌ Error al actualizar firma del préstamo:', error);
        }
    };

    window.eliminarPrestamo = async function(idLoan, acreedor) {
        if (!confirm(`⚠️ ¿Estás seguro de eliminar el préstamo de "${acreedor}"?`)) return;

        const token = localStorage.getItem('jwtToken') || '';

        try {
            const response = await fetch(`${API_BASE}/prestamos/${idLoan}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });

            const data = await response.json();
            if (response.ok && data.success) {
                cargarPrestamos();
            } else {
                alert(`⛔ ${data.error || 'No se pudo eliminar el préstamo.'}`);
            }
        } catch (error) {
            console.error('❌ Error al eliminar préstamo:', error);
            alert('❌ Error de red al intentar eliminar el préstamo.');
        }
    };
})();