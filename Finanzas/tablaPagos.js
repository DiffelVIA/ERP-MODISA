(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    const ROL_RAW = localStorage.getItem('userRol');
    const ROL_USUARIO = ROL_RAW ? ROL_RAW.trim().toLowerCase() : 'residente';

    const mapaTiposPago = {
        'contratista': '👷 Contratista',
        'especifico': '🎯 Específico',
        'cajaChica': '💵 Caja Chica'
    };

    let todosLosPagos = []; 

    document.addEventListener('DOMContentLoaded', () => {
        verificarPermisosDeAcceso();
        cargarPagosSolicitados();
        configurarDelegacionEventos();
        inicializarEventosFiltros();
    });

    function verificarPermisosDeAcceso() {
        const rolesPermitidos = [
            'compras', 'gerente_administrativo', 'gerente administración',
            'residente', 'residente de obra', 'director_operativo', 
            'director operativo', 'director_general', 'director general',
            'gerente_costos', 'gerente de costos'
        ];
        
        if (!rolesPermitidos.includes(ROL_USUARIO)) {
            alert('🚫 Acceso denegado: No tienes autorización para ingresar a la Consulta de Pagos.');
            window.location.href = '../principal.html'; 
        }
    }

    async function cargarPagosSolicitados() {
        try {
            const response = await fetch(`${API_BASE}/pagos`);
            if (!response.ok) throw new Error(`Error en el servidor: Estado HTTP ${response.status}`);

            todosLosPagos = await response.json();
            
            poblarFiltrosEfectivos(todosLosPagos);
            renderizarTablaPagos(todosLosPagos);
        } catch (error) {
            console.error("❌ Error al cargar solicitudes:", error);
            const tbody = document.querySelector(".cuerpoTabla");
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="14" style="text-align:center; color:#dc2626; font-weight:bold; padding: 25px;">
                            ⚠️ Error al conectar con el servidor de pagos. Revisa la consola o el estado de tu backend.
                        </td>
                    </tr>`;
            }
        }
    }

    /* ==========================================================================
       FILTROS MULTISELECCIÓN
       ========================================================================== */
    function poblarFiltrosEfectivos(lista) {
        const extraerUnicos = (keyExtractor) => Array.from(new Set(lista.map(keyExtractor).filter(Boolean))).sort();

        const obras = extraerUnicos(i => i.project_name);
        const formas = extraerUnicos(i => i.payment_method);
        const estados = extraerUnicos(i => i.status || 'Pendiente');
        const fechas = extraerUnicos(i => i.request_date ? new Date(i.request_date).toLocaleDateString('es-MX') : null);
        const semanas = extraerUnicos(i => i.fiscal_week ? `Semana ${i.fiscal_week}` : null);

        llenarDropdownHTML('filtroObra', obras, 'obra');
        llenarDropdownHTML('filtroForma', formas, 'forma');
        llenarDropdownHTML('filtroEstado', estados, 'estado');
        llenarDropdownHTML('filtroFecha', fechas, 'fecha');
        llenarDropdownHTML('filtroSemana', semanas, 'semana');
    }

    function llenarDropdownHTML(containerId, listaOpciones, dataGroup) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (listaOpciones.length === 0) {
            container.innerHTML = '<p style="padding: 8px; color: #94a3b8; font-size: 13px;">Sin opciones</p>';
            return;
        }

        container.innerHTML = listaOpciones.map(opcion => `
            <label style="display: block; padding: 6px 12px; cursor: pointer; font-size: 13px; color: #334155;">
                <input type="checkbox" class="filtro-chk" data-group="${dataGroup}" value="${opcion}" style="margin-right: 8px;">
                ${opcion}
            </label>
        `).join('');
    }

    function inicializarEventosFiltros() {
        document.querySelectorAll('.contenedorFiltros .filtros').forEach(grupo => {
            const btn = grupo.querySelector('.btn-dropdown');
            const contenido = grupo.querySelector('.contenido-dropdown');
            if (!btn || !contenido) return;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const visibleActual = contenido.style.display === 'block';
                document.querySelectorAll('.contenido-dropdown').forEach(c => c.style.display = 'none');
                contenido.style.display = visibleActual ? 'none' : 'block';
            });
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.contenido-dropdown').forEach(c => c.style.display = 'none');
        });

        const contenedorFiltros = document.querySelector('.contenedorFiltros');
        if (contenedorFiltros) {
            contenedorFiltros.addEventListener('change', (e) => {
                if (e.target.classList.contains('filtro-chk')) {
                    aplicarFiltrosMultiples();
                }
            });
        }
    }

    function aplicarFiltrosMultiples() {
        const obtenerSeleccionados = (group) => 
            Array.from(document.querySelectorAll(`.filtro-chk[data-group="${group}"]:checked`)).map(c => c.value);

        const selObras = obtenerSeleccionados('obra');
        const selFormas = obtenerSeleccionados('forma');
        const selEstados = obtenerSeleccionados('estado');
        const selFechas = obtenerSeleccionados('fecha');
        const selSemanas = obtenerSeleccionados('semana');

        const filtrados = todosLosPagos.filter(item => {
            const fechaTxt = item.request_date ? new Date(item.request_date).toLocaleDateString('es-MX') : '';
            const semanaTxt = item.fiscal_week ? `Semana ${item.fiscal_week}` : '';
            const estadoTxt = item.status || 'Pendiente';

            const matchObra = selObras.length === 0 || selObras.includes(item.project_name);
            const matchForma = selFormas.length === 0 || selFormas.includes(item.payment_method);
            const matchEstado = selEstados.length === 0 || selEstados.includes(estadoTxt);
            const matchFecha = selFechas.length === 0 || selFechas.includes(fechaTxt);
            const matchSemana = selSemanas.length === 0 || selSemanas.includes(semanaTxt);

            return matchObra && matchForma && matchEstado && matchFecha && matchSemana;
        });

        renderizarTablaPagos(filtrados);
    }

    /* ==========================================================================
       MODIFICADO: LÓGICA DE SEMÁFORO EN PORCENTAJE PAGADO
       ========================================================================== */
    function calcularSemaforoPresupuesto(montoPagado, presupuestoAutorizado) {
        if (presupuestoAutorizado <= 0) {
            return { color: '#1e293b', textoAlerta: '' };
        }

        const diferencia = presupuestoAutorizado - montoPagado;

        // ROJO: Si pasa de lo autorizado
        if (montoPagado > presupuestoAutorizado) {
            return {
                color: '#dc2626',
                textoAlerta: `<br><span style="font-size: 10px; color: #dc2626; font-weight: bold;">⚠️ ($${presupuestoAutorizado.toLocaleString('es-MX', {minimumFractionDigits: 2})})</span>`
            };
        }
        // AMARILLO: Si está a menos de 1000
        else if (diferencia <= 1000) {
            return {
                color: '#d97706',
                textoAlerta: ''
            };
        }
        // VERDE: Si está lejos más de 1000
        else {
            return {
                color: '#16a34a',
                textoAlerta: ''
            };
        }
    }

    function renderizarTablaPagos(listaPagos) {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (!listaPagos || listaPagos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="16" style="text-align:center; font-weight:bold; color:#64748b; padding: 30px;">
                        🚫 No se encontraron solicitudes de pago registradas en el sistema.
                    </td>
                </tr>`;
            return;
        }

        const puedeModificarRol = ['compras', 'gerente_administrativo', 'gerente administración'].includes(ROL_USUARIO);

        listaPagos.forEach(pod => {
            const tr = document.createElement("tr");

            const montoConcepto = parseFloat(pod.amount || 0);
            const montoPagado = parseFloat(pod.monto_pagado || 0);
            const presupuestoAutorizado = parseFloat(pod.presupuesto_autorizado || 0);
            const estadoActual = pod.status || 'Pendiente';

            const porcentajeCalculado = montoConcepto > 0 ? Math.round((montoPagado / montoConcepto) * 100) : 0;

            const semaforo = calcularSemaforoPresupuesto(montoPagado, presupuestoAutorizado);

            const firmaContrato = pod.contrato_firma ? pod.contrato_firma.trim().toLowerCase() : 'pendiente';
            const estaFirmado = (firmaContrato === 'firmado' || firmaContrato === 'sí' || firmaContrato === 'si');
            
            let contratoExpiradoSinFirma = false;
            let diasTranscurridos = 0;

            if (!estaFirmado && pod.contrato_fecha_registro) {
                const fechaInicio = new Date(pod.contrato_fecha_registro);
                const fechaActual = new Date();
                
                fechaInicio.setHours(0, 0, 0, 0);
                fechaActual.setHours(0, 0, 0, 0);
                
                const diferenciaMilisegundos = fechaActual - fechaInicio;
                diasTranscurridos = Math.floor(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
                
                if (diasTranscurridos >= 6) {
                    contratoExpiradoSinFirma = true;
                }
            }

            let celdaMontoPagadoHTML = "";
            if (puedeModificarRol) {
                if (contratoExpiradoSinFirma) {
                    celdaMontoPagadoHTML = `
                        <td style="text-align: center;" title="Bloqueado: El contrato de este proveedor tiene ${diasTranscurridos} días sin firmar.">
                            <input type="number" 
                                   class="input-monto-pagado" 
                                   value="${montoPagado}" 
                                   disabled 
                                   style="width: 110px; padding: 5px; border-radius:4px; border:1px solid #fca5a5; background-color: #fef2f2; color: #991b1b; text-align: right; font-weight: bold; cursor: not-allowed;">
                        </td>`;
                } else {
                    celdaMontoPagadoHTML = `
                        <td style="text-align: center;">
                            <input type="number" 
                                   class="input-monto-pagado" 
                                   data-id="${pod.id_payment_order}"
                                   data-presupuesto="${presupuestoAutorizado}"
                                   value="${montoPagado}" 
                                   step="0.01" 
                                   min="0"
                                   style="width: 110px; padding: 5px; border-radius:4px; border:1px solid #cbd5e1; text-align: right; font-weight: 500;">
                        </td>`;
                }
            } else {
                celdaMontoPagadoHTML = `<td style="text-align: right; color: #16a34a; font-weight: 500;">$${montoPagado.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>`;
            }

            const fechaFormateada = pod.request_date ? new Date(pod.request_date).toLocaleDateString('es-MX') : '---';
            const tipoTextoPlano = mapaTiposPago[pod.payment_type?.trim()] || `❓ ${pod.payment_type || 'No definido'}`;
            let tipoPagoVisual = `<strong>${tipoTextoPlano}</strong>`;

            if (pod.payment_type?.trim() === 'cajaChica' && pod.ticket_url) {
                tipoPagoVisual = `
                    <a href="${pod.ticket_url}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="enlace-ticket-drive" 
                       style="color: #2563eb; text-decoration: underline; font-weight: bold; cursor: pointer;">
                       ${tipoTextoPlano}
                    </a>`;
            }

            const comentarioResidente = pod.resident_comment || pod.commentary || pod.comentario || '-';
            const comentarioComprasVal = pod.compras_comment || '';
            let celdaComentarioComprasHTML = '';

            if (puedeModificarRol) {
                celdaComentarioComprasHTML = `
                    <td style="text-align: center;">
                        <input type="text" 
                               class="input-compras-comment" 
                               data-id="${pod.id_payment_order}"
                               value="${comentarioComprasVal}" 
                               placeholder="Comentario compras..."
                               style="width: 140px; padding: 5px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; color: #334155;">
                    </td>`;
            } else {
                celdaComentarioComprasHTML = `
                    <td style="color: #475569; font-style: italic; font-size: 12px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${comentarioComprasVal || '-'}">
                        ${comentarioComprasVal || '-'}
                    </td>`;
            }

            tr.innerHTML = `
                <td>${pod.project_name || '---'}</td>
                <td>${fechaFormateada}</td>
                <td style="text-align: center;">Semana ${pod.fiscal_week || '---'}</td>
                <td style="text-align: center;">${tipoPagoVisual}</td>
                <td><span class="badge-metodo" style="text-transform: capitalize;">${pod.payment_method || '---'}</span></td>
                
                <td style="color: #64748b; font-style: italic; font-size: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${comentarioResidente}">
                    ${comentarioResidente}
                </td>

                <td>${pod.grupo || '---'}</td>
                <td>${pod.categoria || '---'}</td>
                <td>${pod.subcategoria || '---'}</td>
                <td>${pod.provider || '---'}</td>
                <td>${pod.concept_description || '---'}</td>
                <td class="monto-total-celda" data-total="${montoConcepto}" style="font-weight: bold; color: #1e293b; text-align: right;">
                    $${montoConcepto.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                </td>
                ${celdaMontoPagadoHTML}
                <td style="text-align: center;">
                    <strong class="porcentaje-celda" style="color: ${semaforo.color}">${porcentajeCalculado}%</strong>
                    ${semaforo.textoAlerta}
                </td>
                <td style="text-align: center;">
                    <span class="badge-status-pago" style="padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #fff; background-color: ${estadoActual === 'Pagado' ? '#16a34a' : '#eab308'}">
                        ${estadoActual}
                    </span>
                </td>
                ${celdaComentarioComprasHTML}
            `;

            tbody.appendChild(tr);
        });
    }

    function configurarDelegacionEventos() {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        tbody.addEventListener('change', async (e) => {
            if (e.target.classList.contains('input-monto-pagado')) {
                const inputElement = e.target;
                const trFila = inputElement.closest('tr');
                if (!trFila) return;

                const idOrden = inputElement.getAttribute('data-id');
                const presupuestoAutorizado = parseFloat(inputElement.getAttribute('data-presupuesto') || 0);
                const nuevoMontoPagado = parseFloat(inputElement.value) || 0;

                const cellTotal = trFila.querySelector('.monto-total-celda');
                const montoTotal = cellTotal ? parseFloat(cellTotal.getAttribute('data-total') || 0) : 0;

                const porcentajeActualizado = montoTotal > 0 ? Math.round((nuevoMontoPagado / montoTotal) * 100) : 0;
                const semaforo = calcularSemaforoPresupuesto(nuevoMontoPagado, presupuestoAutorizado);

                const tdPorcentaje = trFila.querySelector('.porcentaje-celda')?.closest('td');
                if (tdPorcentaje) {
                    tdPorcentaje.innerHTML = `
                        <strong class="porcentaje-celda" style="color: ${semaforo.color}">${porcentajeActualizado}%</strong>
                        ${semaforo.textoAlerta}
                    `;
                }

                const esPagado = montoTotal > 0 && nuevoMontoPagado >= (montoTotal - 0.01);
                const badgeEstado = trFila.querySelector('.badge-status-pago');
                if (badgeEstado) {
                    badgeEstado.textContent = esPagado ? 'Pagado' : 'Pendiente';
                    badgeEstado.style.backgroundColor = esPagado ? '#16a34a' : '#eab308';
                }

                await guardarMontoPagadoEnBD(idOrden, nuevoMontoPagado, trFila);
            }

            if (e.target.classList.contains('input-compras-comment')) {
                const inputElement = e.target;
                const trFila = inputElement.closest('tr');
                const idOrden = inputElement.getAttribute('data-id');
                const comentarioTexto = inputElement.value;

                await guardarComentarioComprasEnBD(idOrden, comentarioTexto, trFila);
            }
        });
    }

    async function guardarMontoPagadoEnBD(idOrden, monto, trElemento) {
        try {
            const response = await fetch(`${API_BASE}/pagos/${idOrden}/monto-pagado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monto_pagado: monto })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error al actualizar el registro.');
            
            const registroLocal = todosLosPagos.find(p => String(p.id_payment_order) === String(idOrden));
            if (registroLocal) {
                registroLocal.monto_pagado = monto;
                registroLocal.status = data.status;
            }

            const badgeEstado = trElemento.querySelector('.badge-status-pago');
            if (badgeEstado && data.status) {
                badgeEstado.textContent = data.status;
                badgeEstado.style.backgroundColor = data.status === 'Pagado' ? '#16a34a' : '#eab308';
            }
            
            trElemento.style.backgroundColor = "#eaffea";
            setTimeout(() => trElemento.style.backgroundColor = "", 600);
        } catch (error) {
            console.error("❌ Error en persistencia transaccional:", error);
            alert(`Error al guardar: ${error.message}`);
            cargarPagosSolicitados(); 
        }
    }

    async function guardarComentarioComprasEnBD(idOrden, comentarioTexto, trElemento) {
        try {
            const response = await fetch(`${API_BASE}/pagos/${idOrden}/monto-pagado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ compras_comment: comentarioTexto })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error al guardar el comentario.');

            const registroLocal = todosLosPagos.find(p => String(p.id_payment_order) === String(idOrden));
            if (registroLocal) {
                registroLocal.compras_comment = comentarioTexto;
            }

            trElemento.style.backgroundColor = "#eaffea";
            setTimeout(() => trElemento.style.backgroundColor = "", 600);
        } catch (error) {
            console.error("❌ Error al guardar comentario de compras:", error);
            alert(`Error al guardar comentario: ${error.message}`);
        }
    }
})();