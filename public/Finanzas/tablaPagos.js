(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    const ROL_RAW = localStorage.getItem('userRol');
    const ROL_USUARIO = ROL_RAW ? ROL_RAW.trim().toLowerCase() : 'residente';

    const mapaTiposPago = {
    'contratista': '👷 Contratista',
    'maquinariaEquipo': '🚜 M. y Equipo',
    'cajaChica': '💵 Caja Chica',
    'caja chica': '💵 Caja Chica',
    'maquinaria y equipo': '🚜 Maquinaria y Equipo',
    'manoObra': '👷 Mano de Obra',
    'mano de obra': '👷 Mano de Obra',
    'material': '📦 Materiales',
    'materiales': '📦 Materiales',
    };

    let todosLosPagos = [];
    let pagosFiltradosActuales = [];

    document.addEventListener('DOMContentLoaded', () => {
        verificarPermisosDeAcceso();
        cargarPagosSolicitados();
        configurarDelegacionEventos();
        inicializarEventosFiltros();
        inicializarEventoExportarExcel();
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

    function poblarFiltrosEfectivos(lista) {
        const extraerUnicos = (keyExtractor) => Array.from(new Set(lista.map(keyExtractor).filter(Boolean))).sort();
        const obras = extraerUnicos(i => i.project_name);
        const formas = extraerUnicos(i => i.payment_method);
        const estados = extraerUnicos(i => i.status || 'Pendiente');
        const semanas = extraerUnicos(i => i.fiscal_week ? `Semana ${i.fiscal_week}` : null);
        const tipos = extraerUnicos(i => i.payment_type);
        llenarDropdownHTML('filtroObra', obras, 'obra');
        llenarDropdownHTML('filtroTipo', tipos, 'tipo');
        llenarDropdownHTML('filtroForma', formas, 'forma');
        llenarDropdownHTML('filtroEstado', estados, 'estado');
        llenarDropdownHTML('filtroSemana', semanas, 'semana');
        poblarFiltroFecha(lista);
    }

    function poblarFiltroFecha(lista) {
        const contenedorFecha = document.getElementById('filtroFecha');
        if (!contenedorFecha) return;

        const semanasSeleccionadas = Array.from(
            document.querySelectorAll('.filtro-chk[data-group="semana"]:checked')
        ).map(c => c.value);

        const fechasPreviamenteSeleccionadas = Array.from(
            document.querySelectorAll('.filtro-chk[data-group="fecha"]:checked')
        ).map(c => c.value);

        if (semanasSeleccionadas.length === 0) {
            contenedorFecha.innerHTML = `
                <div style="padding: 10px; color: #64748b; font-size: 11px; font-style: italic; text-align: center;">
                    ⚠️ Selecciona una semana primero
                </div>
            `;
            return;
        }

        const pagosFiltradosPorSemana = lista.filter(item => {
            const semanaTxt = item.fiscal_week ? `Semana ${item.fiscal_week}` : '';
            return semanasSeleccionadas.includes(semanaTxt);
        });

        const fechasUnicas = Array.from(
            new Set(
                pagosFiltradosPorSemana
                    .map(i => i.request_date ? formatearFechaLocal(i.request_date) : null)
                    .filter(Boolean)
            )
        ).sort();

        llenarDropdownHTML('filtroFecha', fechasUnicas, 'fecha', fechasPreviamenteSeleccionadas);
    }

    function llenarDropdownHTML(containerId, listaOpciones, dataGroup, seleccionadosPrevios = []) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (listaOpciones.length === 0) {
            container.innerHTML = '<p style="padding: 8px; color: #94a3b8; font-size: 13px;">Sin opciones</p>';
            return;
        }

        container.innerHTML = listaOpciones.map(opcion => {
            const estaMarcado = seleccionadosPrevios.includes(opcion) ? 'checked' : '';
            return `
                <label style="display: block; padding: 6px 12px; cursor: pointer; font-size: 13px; color: #334155;">
                    <input type="checkbox" class="filtro-chk" data-group="${dataGroup}" value="${opcion}" ${estaMarcado} style="margin-right: 8px;">
                    ${opcion}
                </label>
            `;
        }).join('');
    }

    function aplicarFiltrosMultiples() {
        poblarFiltroFecha(todosLosPagos);
        const obtenerSeleccionados = (group) => 
            Array.from(document.querySelectorAll(`.filtro-chk[data-group="${group}"]:checked`)).map(c => c.value);
        const selObras = obtenerSeleccionados('obra');
        const selFormas = obtenerSeleccionados('forma');
        const selEstados = obtenerSeleccionados('estado');
        const selFechas = obtenerSeleccionados('fecha');
        const selSemanas = obtenerSeleccionados('semana');
        const selTipos = obtenerSeleccionados('tipo');
        const filtrados = todosLosPagos.filter(item => {
            const fechaTxt = item.request_date ? formatearFechaLocal(item.request_date) : '';
            const semanaTxt = item.fiscal_week ? `Semana ${item.fiscal_week}` : '';
            const estadoTxt = item.status || 'Pendiente';
            const matchObra = selObras.length === 0 || selObras.includes(item.project_name);
            const matchForma = selFormas.length === 0 || selFormas.includes(item.payment_method);
            const matchEstado = selEstados.length === 0 || selEstados.includes(estadoTxt);
            const matchFecha = selFechas.length === 0 || selFechas.includes(fechaTxt);
            const matchSemana = selSemanas.length === 0 || selSemanas.includes(semanaTxt);
            const matchTipo = selTipos.length === 0 || selTipos.includes(item.payment_type);
            return matchObra && matchForma && matchEstado && matchFecha && matchSemana && matchTipo;
        });
        pagosFiltradosActuales = filtrados;
        renderizarTablaPagos(filtrados);
    }

    function inicializarEventoExportarExcel() {
        const btnDescargar = document.getElementById('descargar');
        if (!btnDescargar) return;

        btnDescargar.addEventListener('click', () => {
            const datosAExportar = pagosFiltradosActuales.length > 0 ? pagosFiltradosActuales : todosLosPagos;

            if (!datosAExportar || datosAExportar.length === 0) {
                alert('⚠️ No hay información de pagos disponible para exportar.');
                return;
            }

            const filasExcel = datosAExportar.map(item => {
                const montoConcepto = parseFloat(item.amount || 0);
                const montoPagado = parseFloat(item.monto_pagado || 0);
                const porcentaje = montoConcepto > 0 ? Math.round((montoPagado / montoConcepto) * 100) : 0;

                return {
                    "Obra": item.project_name || '---',
                    "Fecha": formatearFechaLocal(item.request_date),
                    "Semana": item.fiscal_week ? `Semana ${item.fiscal_week}` : '---',
                    "Tipo de Pago": item.payment_type || '---',
                    "Forma de Pago": item.payment_method || '---',
                    "Comentario Solicitante": item.commentary || item.resident_comment || item.comentario || '---',
                    "Grupo": item.grupo || '---',
                    "Categoría": item.categoria || '---',
                    "Subcategoría": item.subcategoria || '---',
                    "Proveedor": item.provider || '---',
                    "Concepto": item.concept_description || '---',
                    "Monto Total": montoConcepto,
                    "Monto Pagado": montoPagado,
                    "% Pagado": `${porcentaje}%`,
                    "Estado": item.status || 'Pendiente',
                    "Comentario Compras": item.compras_comment || '---'
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(filasExcel);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte_Pagos");

            const fechaHoy = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `Reporte_Pagos_MODISA_${fechaHoy}.xlsx`);
        });
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

    function calcularSemaforoPresupuesto(montoPagado, montoConcepto) {
        if (!montoConcepto || montoConcepto <= 0) {
            return { color: '#1e293b', porcentaje: 0 };
        }

        const porcentajeConsumido = (montoPagado / montoConcepto) * 100;
        const porcentajeRedondeado = Math.round(porcentajeConsumido);

        let colorSemaforo = '#16a34a';

        if (porcentajeConsumido > 100) {
            colorSemaforo = '#dc2626';
        } else if (porcentajeConsumido > 75) {
            colorSemaforo = '#d97706';
        } else if (porcentajeConsumido === 0) {
            colorSemaforo = '#64748b';
        }

        return {
            color: colorSemaforo,
            porcentaje: porcentajeRedondeado
        };
    }

    
    function formatearFechaLocal(fechaCadena) {
        if (!fechaCadena) return '---';
        const fechaLimpia = String(fechaCadena).split('T')[0];
        const partes = fechaLimpia.split('-');
        if (partes.length === 3) {
            const [anio, mes, dia] = partes;
            return `${parseInt(dia, 10)}/${parseInt(mes, 10)}/${anio}`;
        }
        return new Date(fechaCadena).toLocaleDateString('es-MX');
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
            actualizarPieTablaTotales([]);
            return;
        }

        const puedeModificarRol = ['compras', 'gerente_administrativo', 'gerente administración'].includes(ROL_USUARIO);
        const pagosOrdenados = [...listaPagos].sort((a, b) => (a.id_payment_detail || 0) - (b.id_payment_detail || 0));
        const acumuladosMontoTotal = {};
        const mapaColoresMontoTotal = {};

        pagosOrdenados.forEach(pod => {
            const claveSubcat = `${pod.project_name || ''}_${pod.grupo || ''}_${pod.categoria || ''}_${pod.subcategoria || ''}`;
            const monto = parseFloat(pod.amount || 0);
            const autorizado = parseFloat(pod.presupuesto_autorizado || 0);

            acumuladosMontoTotal[claveSubcat] = (acumuladosMontoTotal[claveSubcat] || 0) + monto;
            const acumuladoProgresivo = acumuladosMontoTotal[claveSubcat];

            let colorMontoTotal = '#16a34a';
            if (autorizado > 0) {
                const porcentaje = (acumuladoProgresivo / autorizado) * 100;
                if (porcentaje > 100) {
                    colorMontoTotal = '#dc2626';
                } else if (porcentaje > 75) {
                    colorMontoTotal = '#d97706';
                }
            }
            mapaColoresMontoTotal[pod.id_payment_detail] = colorMontoTotal;
        });

        listaPagos.forEach(pod => {
            const tr = document.createElement("tr");

            const montoConcepto = parseFloat(pod.amount || 0);
            const montoPagado = parseFloat(pod.monto_pagado || 0);
            const presupuestoAutorizado = parseFloat(pod.presupuesto_autorizado || 0);
            const estadoActual = pod.status || 'Pendiente';
            const semaforo = calcularSemaforoPresupuesto(montoPagado, montoConcepto);
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
                                data-id="${pod.id_payment_detail}" 
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

            const fechaFormateada = formatearFechaLocal(pod.request_date);

            const claveTipo = (pod.payment_type || '').trim();
            const tipoTextoPlano = mapaTiposPago[claveTipo] 
                || mapaTiposPago[claveTipo.toLowerCase()] 
                || `💳 ${claveTipo || 'No definido'}`;

            // =========================================================================
            // INICIO MODIFICACIÓN: Enlace únicamente para Materiales, Caja Chica y Maquinaria
            // =========================================================================
            const tiposConComprobanteClickeable = [
                'cajaChica', 'caja chica', 
                'material', 'materiales', 
                'maquinariaEquipo', 'maquinaria y equipo', 'maquinaria'
            ];

            const esTipoConTicket = tiposConComprobanteClickeable.includes(claveTipo) || 
                                    tiposConComprobanteClickeable.includes(claveTipo.toLowerCase());

            let tipoPagoVisual = `<span style="white-space: nowrap; font-weight: bold;">${tipoTextoPlano}</span>`;

            if (esTipoConTicket && pod.ticket_url) {
                tipoPagoVisual = `
                    <a href="${pod.ticket_url}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="enlace-ticket-drive" 
                       title="Ver comprobante en Google Drive"
                       style="color: #2563eb; text-decoration: underline; font-weight: bold; cursor: pointer; white-space: nowrap;">
                       ${tipoTextoPlano}
                    </a>`;
            }
            // =========================================================================
            // FIN MODIFICACIÓN
            // =========================================================================

            const comentarioResidente = pod.commentary || pod.resident_comment || pod.comentario || '-';
            const comentarioComprasVal = pod.compras_comment || '';
            let celdaComentarioComprasHTML = '';

            if (puedeModificarRol) {
                celdaComentarioComprasHTML = `
                    <td style="text-align: center;">
                        <input type="text" 
                            class="input-compras-comment" 
                            data-id="${pod.id_payment_detail}" 
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

            const colorMontoTotalCalculado = mapaColoresMontoTotal[pod.id_payment_detail] || '#1e293b';

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
                
                <td class="monto-total-celda" data-total="${montoConcepto}" style="font-weight: bold; color: ${colorMontoTotalCalculado}; text-align: right;">
                    $${montoConcepto.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                </td>
                
                ${celdaMontoPagadoHTML}
                
                <td style="text-align: center;">
                    <strong class="porcentaje-celda" style="color: ${semaforo.color}">${semaforo.porcentaje}%</strong>
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

        actualizarPieTablaTotales(listaPagos);
    }

    function configurarDelegacionEventos() {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        tbody.addEventListener('focusin', (e) => {
            if (e.target.classList.contains('input-monto-pagado')) {
                e.target.select();
            }
        });

        tbody.addEventListener('focusout', (e) => {
            if (e.target.classList.contains('input-monto-pagado')) {
                const valorLimpio = e.target.value.trim();
                if (valorLimpio === '' || isNaN(valorLimpio)) {
                    e.target.value = 0;
                } else {
                    e.target.value = parseFloat(valorLimpio);
                }
            }
        });

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
                const semaforo = calcularSemaforoPresupuesto(nuevoMontoPagado, montoTotal);

                const tdPorcentaje = trFila.querySelector('.porcentaje-celda')?.closest('td');
                if (tdPorcentaje) {
                    tdPorcentaje.innerHTML = `
                        <strong class="porcentaje-celda" style="color: ${semaforo.color}">${semaforo.porcentaje}%</strong>
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

            const registroLocal = todosLosPagos.find(p => String(p.id_payment_detail) === String(idOrden));
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

    async function guardarComentarioComprasEnBD(idDetalle, comentarioTexto, trElemento) {
        try {
            const response = await fetch(`${API_BASE}/pagos/${idDetalle}/monto-pagado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ compras_comment: comentarioTexto })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error al guardar el comentario.');

            const registroLocal = todosLosPagos.find(p => String(p.id_payment_detail) === String(idDetalle));
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

    function actualizarPieTablaTotales(listaFiltrada) {
        const tabla = document.querySelector(".main-tabla table") || document.querySelector("table");
        if (!tabla) return;

        let tfoot = tabla.querySelector("tfoot");
        if (!tfoot) {
            tfoot = document.createElement("tfoot");
            tabla.appendChild(tfoot);
        }

        const sumaTotal = listaFiltrada.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
        const sumaPagado = listaFiltrada.reduce((acc, item) => acc + (parseFloat(item.monto_pagado) || 0), 0);

        tfoot.innerHTML = `
            <tr style="background-color: #f8fafc; color: #1e293b; font-weight: bold; font-size: 13px; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #e2e8f0;">
                <td colspan="11" style="text-align: right; padding: 12px 15px; color: #334155; font-size: 12px; letter-spacing: 0.5px;">TOTALES:</td>
                <td style="text-align: right; padding: 12px 10px; color: #0284c7; font-weight: 800;">$${sumaTotal.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right; padding: 12px 10px; color: #16a34a; font-weight: 800;">$${sumaPagado.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td colspan="3"></td>
            </tr>
        `;
    }
})();