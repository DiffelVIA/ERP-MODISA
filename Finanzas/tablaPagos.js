(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';
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
            renderizarTablaPagos(todosLosPagos);
        } catch (error) {
            console.error("❌ Error al cargar solicitudes:", error);
            const tbody = document.querySelector(".cuerpoTabla");
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="17" style="text-align:center; color:#dc2626; font-weight:bold; padding: 25px;">
                            ⚠️ Error al conectar con el servidor de pagos. Revisa la consola o el estado de tu backend.
                        </td>
                    </tr>`;
            }
        }
    }

    function renderizarTablaPagos(listaPagos) {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (!listaPagos || listaPagos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="17" style="text-align:center; font-weight:bold; color:#64748b; padding: 30px;">
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
            const estadoActual = pod.status || 'Pendiente';

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

            const cantidadFormateada = pod.quantity ? parseFloat(pod.quantity) : 0;
            const precioFormateado = pod.price_unit ? parseFloat(pod.price_unit) : 0;

            tr.innerHTML = `
                <td>${pod.project_name || '---'}</td>
                <td>${fechaFormateada}</td>
                <td style="text-align: center;">Semana ${pod.fiscal_week || '---'}</td>
                <td style="text-align: center;">${tipoPagoVisual}</td>
                <td><span class="badge-metodo" style="text-transform: capitalize;">${pod.payment_method || '---'}</span></td>
                <td>${pod.grupo || '---'}</td>
                <td>${pod.categoria || '---'}</td>
                <td>${pod.subcategoria || '---'}</td>
                <td>${pod.provider || '---'}</td>
                <td>${pod.concept_description || '---'}</td>
                <td style="text-align: center; font-weight: 500;">${cantidadFormateada > 0 ? cantidadFormateada : '---'}</td>
                <td style="text-align: center; color: #475569;">${pod.unit || '---'}</td>
                <td style="text-align: right; color: #475569;">${precioFormateado > 0 ? `$${precioFormateado.toLocaleString('es-MX', {minimumFractionDigits: 2})}` : '---'}</td>
                <td class="monto-total-celda" data-total="${montoConcepto}" style="font-weight: bold; color: #1e293b; text-align: right;">$${montoConcepto.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                ${celdaMontoPagadoHTML}
                <td style="text-align: center;"><strong class="porcentaje-celda" style="color: ${estadoActual === 'Pagado' ? '#16a34a' : '#1e293b'}">${estadoActual === 'Pagado' ? '100%' : '---'}</strong></td>
                <td style="text-align: center;">
                    <span class="badge-status-pago" style="padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #fff; background-color: ${estadoActual === 'Pagado' ? '#16a34a' : '#eab308'}">
                        ${estadoActual}
                    </span>
                </td>
            `;

            tbody.appendChild(tr);
        });
    }

    function configurarDelegacionEventos() {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        tbody.addEventListener('change', async (e) => {
            if (!e.target.classList.contains('input-monto-pagado')) return;

            const inputElement = e.target;
            const trFila = inputElement.closest('tr');
            if (!trFila) return;

            const idOrden = inputElement.getAttribute('data-id');
            const nuevoMontoPagado = parseFloat(inputElement.value) || 0;

            const cellTotal = trFila.querySelector('.monto-total-celda');
            const montoTotal = cellTotal ? parseFloat(cellTotal.getAttribute('data-total') || 0) : 0;

            const porcentajeActualizado = montoTotal > 0 ? Math.round((nuevoMontoPagado / montoTotal) * 100) : 0;
            
            const txtPorcentaje = trFila.querySelector('.porcentaje-celda');
            if (txtPorcentaje) {
                txtPorcentaje.textContent = `${porcentajeActualizado}%`;
                txtPorcentaje.style.color = porcentajeActualizado >= 100 ? '#16a34a' : '#1e293b';
            }

            await guardarMontoPagadoEnBD(idOrden, nuevoMontoPagado, trFila);
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
})();