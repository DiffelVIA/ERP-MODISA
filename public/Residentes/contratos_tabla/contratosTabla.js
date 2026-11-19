(() => {
    window.ContratosApp = window.ContratosApp || {};

    function obtenerColorTextoContrato(montoContrato, montoAutorizado) {
        if (!montoAutorizado || montoAutorizado <= 0) {
            return '#dc2626';
        }
        const porcentaje = (montoContrato / montoAutorizado) * 100;

        if (porcentaje >= 90) {
            return '#dc2626';
        } else if (porcentaje >= 75) {
            return '#ca8a04';
        } else {
            return '#16a34a';
        }
    }

    function calcularMapaColores(todosLosContratos) {
        const contratosOrdenadosCronologicamente = [...todosLosContratos].sort((a, b) => a.id_contract - b.id_contract);
        const acumuladosPorCategoria = {};
        const mapaColoresContratos = {};

        contratosOrdenadosCronologicamente.forEach(c => {
            const llaveCategoria = c.id_project_category || `${c.project_name}-${c.grupo}-${c.categoria}-${c.subcategoria}`;
            const autorizado = Number(c.contratos_aut || 0);
            const total = Number(c.total_amount || 0);

            acumuladosPorCategoria[llaveCategoria] = (acumuladosPorCategoria[llaveCategoria] || 0) + total;
            const acumuladoHastaHoy = acumuladosPorCategoria[llaveCategoria];

            mapaColoresContratos[c.id_contract] = obtenerColorTextoContrato(acumuladoHastaHoy, autorizado);
        });

        return mapaColoresContratos;
    }

    function parsearFechaLocal(fechaRaw) {
        if (!fechaRaw) return null;
        const soloFecha = String(fechaRaw).split('T')[0];
        const partes = soloFecha.split('-');
        if (partes.length === 3) {
            const anio = Number(partes[0]);
            const mes = Number(partes[1]) - 1;
            const dia = Number(partes[2]);
            if (!Number.isNaN(anio) && !Number.isNaN(mes) && !Number.isNaN(dia)) {
                return new Date(anio, mes, dia);
            }
        }
        const fechaFallback = new Date(fechaRaw);
        return Number.isNaN(fechaFallback.getTime()) ? null : fechaFallback;
    }

    function obtenerDatosFechaYSemana(startDate) {
        const fechaParsed = parsearFechaLocal(startDate);
        const fechaFormateada = fechaParsed ? fechaParsed.toLocaleDateString('es-MX') : '---';
        const fechaRef = fechaParsed || new Date();
        const inicioAnio = new Date(fechaRef.getFullYear(), 0, 1);
        const diasPasados = Math.floor((fechaRef - inicioAnio) / (24 * 60 * 60 * 1000));
        const numeroSemana = Math.ceil((diasPasados + inicioAnio.getDay() + 1) / 7);
        return { fechaFormateada, numeroSemana };
    }

    function renderizarTabla(listaContratos, todosLosContratos, permisos) {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        const { escapeHTML } = window.ContratosApp.Auth;
        const { esCostos, esDireccion, esCompras, puedeEliminar } = permisos;

        tbody.innerHTML = "";

        if (listaContratos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="18" style="text-align:center; padding: 20px;">🚫 No se encontraron contratos con los filtros seleccionados.</td></tr>`;
            return;
        }

        const universoColores = (todosLosContratos && todosLosContratos.length > 0) ? todosLosContratos : listaContratos;
        const mapaColoresContratos = calcularMapaColores(universoColores);

        const mapaStatus = { "Pendiente": "⏳ Pendiente", "Pagado": "💰 Pagado", "Rechazado": "❌ Rechazado" };
        const mapaCostos = { "Pendiente": "⏳ Pendiente", "Revisado": "🔍 Revisado", "Rechazado": "❌ Rechazado" };
        const mapaDireccion = { "Pendiente": "⏳ Pendiente", "Autorizado": "✔️ Autorizado", "Rechazado": "❌ Rechazado" };
        const mapaFirma = { "Pendiente": "⏳ No", "No": "⏳ No", "Firmado": "✅ Sí", "Sí": "✅ Sí" };

        listaContratos.forEach(c => {
            const tr = document.createElement("tr");
            tr.id = `fila-contrato-${c.id_contract}`;

            const total = Number(c.total_amount || 0);
            const pagado = Number(c.monto_pagado || 0);
            const colorFuente = mapaColoresContratos[c.id_contract] || '#16a34a';

            const porcentajePagado = total > 0 ? Math.round((pagado / total) * 100) : 0;
            const saldoPendienteDinero = total - pagado;
            const saldoPendientePorcentaje = 100 - porcentajePagado;

            const { fechaFormateada, numeroSemana } = obtenerDatosFechaYSemana(c.start_date);

            const botonEditarUrl = esCostos
                ? `<button type="button" class="btn-editar-url-contrato" data-id="${Number(c.id_contract)}" title="Editar enlace de contrato" style="background:none; border:none; cursor:pointer; font-size:14px; margin-left:4px;">✏️</button>`
                : '';

            const botonEliminar = puedeEliminar
                ? `<button type="button" class="btn-eliminar-contrato" data-id="${Number(c.id_contract)}" title="Eliminar contrato" style="background:none; border:none; cursor:pointer; font-size:13px; margin-left:6px; color:#ef4444; font-weight:bold;">❌</button>`
                : '';

            const urlSegura = c.contract_file_url && /^https?:\/\//i.test(c.contract_file_url.trim()) ? escapeHTML(c.contract_file_url.trim()) : '';

            const enlaceTexto = urlSegura
                ? `<a href="${urlSegura}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;"><strong>${escapeHTML(c.contract_key)}</strong></a>`
                : `<strong>${escapeHTML(c.contract_key)}</strong>`;

            const celdaClave = `${enlaceTexto}${botonEditarUrl}${botonEliminar}`;

            const currentStatus = c.status || "Pendiente";
            const currentCostos = c.estado_costos || "Pendiente";
            const currentComentarioCostos = c.comentarios_costos || "";
            const currentDireccion = c.status_direccion || "Pendiente";
            const currentComentarioDireccion = c.comentarios_direccion || "";
            const currentComentarioAdministracion = c.comentarios_administracion || "";
            const currentFirma = c.firma || "Pendiente";

            const celdaMontoPagado = `<span>$${pagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>`;
            const celdaStatusPago = `<span>${mapaStatus[currentStatus] || mapaStatus["Pendiente"]}</span>`;

            const celdaTotal = esCostos
                ? `<input type="number" step="0.01" id="total-${c.id_contract}" class="input-tabla" value="${total}" onchange="autoGuardarFila(${c.id_contract})" style="width: 100%; font-weight: 700; color: ${colorFuente}; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; text-align: right; font-size: 13px;">`
                : `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

            const celdaCostos = esCostos
                ? `<select id="costos-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentCostos === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="Revisado" ${currentCostos === 'Revisado' ? 'selected' : ''}>🔍 Revisado</option>
                        <option value="Rechazado" ${currentCostos === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                   </select>`
                : `<span>${mapaCostos[currentCostos] || currentCostos}</span>`;

            const celdaComentarioCostos = esCostos
                ? `<textarea id="comentario-costos-${c.id_contract}" onchange="autoGuardarFila(${c.id_contract})" placeholder="Comentario Costos..." style="width: 100%; height: 50px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-family: inherit; font-size: 12px; box-sizing: border-box; word-break: break-word; overflow-wrap: break-word; vertical-align: middle;">${escapeHTML(currentComentarioCostos)}</textarea>`
                : `<span style="white-space: pre-wrap; font-size: 13px; color: #334155; word-break: break-word; overflow-wrap: break-word;">${escapeHTML(currentComentarioCostos) || '---'}</span>`;

            const celdaDireccion = esDireccion
                ? `<select id="direccion-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentDireccion === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="Autorizado" ${currentDireccion === 'Autorizado' ? 'selected' : ''}>✔️ Autorizado</option>
                        <option value="Rechazado" ${currentDireccion === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                   </select>`
                : `<span>${mapaDireccion[currentDireccion] || currentDireccion}</span>`;

            const celdaComentarioDireccion = esDireccion
                ? `<textarea id="comentario-direccion-${c.id_contract}" onchange="autoGuardarFila(${c.id_contract})" placeholder="Comentario Dirección..." style="width: 100%; height: 50px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-family: inherit; font-size: 12px; box-sizing: border-box; word-break: break-word; overflow-wrap: break-word; vertical-align: middle;">${escapeHTML(currentComentarioDireccion)}</textarea>`
                : `<span style="white-space: pre-wrap; font-size: 13px; color: #334155; word-break: break-word; overflow-wrap: break-word;">${escapeHTML(currentComentarioDireccion) || '---'}</span>`;

            const celdaComentarioAdministracion = esCompras
                ? `<textarea id="comentario-administracion-${c.id_contract}" onchange="autoGuardarFila(${c.id_contract})" placeholder="Comentario..." style="width: 100%; height: 50px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-family: inherit; font-size: 12px; box-sizing: border-box; word-break: break-word; overflow-wrap: break-word; vertical-align: middle;">${escapeHTML(currentComentarioAdministracion)}</textarea>`
                : `<span style="white-space: pre-wrap; font-size: 13px; color: #334155; word-break: break-word; overflow-wrap: break-word;">${escapeHTML(currentComentarioAdministracion) || '---'}</span>`;

            const firmaDeshabilitada = (currentDireccion === 'Rechazado') ? 'disabled' : '';

            const celdaFirma = esCompras
                ? `<select id="firma-${c.id_contract}" class="select-tabla" ${firmaDeshabilitada} onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentFirma === 'Pendiente' || currentFirma === 'No' ? 'selected' : ''}>⏳ No</option>
                        <option value="Firmado" ${currentFirma === 'Firmado' || currentFirma === 'Sí' ? 'selected' : ''}>✅ Sí</option>
                   </select>`
                : `<span>${mapaFirma[currentFirma] || currentFirma}</span>`;

            tr.innerHTML = `
                <td style="vertical-align: middle;">${escapeHTML(c.project_name) || 'Sin Proyecto'}</td>
                <td style="vertical-align: middle;">${fechaFormateada}</td>
                <td style="vertical-align: middle; text-align: center;">Semana ${numeroSemana}</td>
                <td style="vertical-align: middle;">${celdaClave}</td>
                <td style="vertical-align: middle; word-break: break-word; overflow-wrap: break-word;">${escapeHTML(c.Concept) || 'Sin descripción'}</td>
                <td style="vertical-align: middle; word-break: break-word; overflow-wrap: break-word;">${escapeHTML(c.supplier)}</td>
                <td data-campo="total" data-total="${total}" style="color: ${colorFuente}; font-weight: 700; vertical-align: middle; text-align: right;">${celdaTotal}</td>
                <td data-campo="monto-consultar" data-monto-consultar="${pagado}" style="vertical-align: middle; text-align: right;">${celdaMontoPagado}</td>
                <td id="porcentaje-${c.id_contract}" style="vertical-align: middle; text-align: center;"><strong>${porcentajePagado}%</strong></td>
                <td data-campo="saldo-dinero" style="color: #64748b; font-weight: 500; vertical-align: middle; text-align: right;">$${saldoPendienteDinero.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                <td data-campo="saldo-porcentaje" style="color: #64748b; font-weight: bold; vertical-align: middle; text-align: center;">${saldoPendientePorcentaje}%</td>
                <td data-campo="status-pago" data-valor-real="${escapeHTML(currentStatus)}" style="vertical-align: middle; text-align: center;">${celdaStatusPago}</td>
                <td data-campo="estado-costos" style="vertical-align: middle; text-align: center;">${celdaCostos}</td>
                <td data-campo="comentarios-costos" style="vertical-align: middle; word-break: break-word; overflow-wrap: break-word;">${celdaComentarioCostos}</td>
                <td data-campo="status-direccion" style="vertical-align: middle; text-align: center;">${celdaDireccion}</td>
                <td data-campo="comentarios-direccion" style="vertical-align: middle; word-break: break-word; overflow-wrap: break-word;">${celdaComentarioDireccion}</td>
                <td data-campo="comentarios-administracion" style="vertical-align: middle; word-break: break-word; overflow-wrap: break-word;">${celdaComentarioAdministracion}</td>
                <td data-campo="firma" style="vertical-align: middle; text-align: center;">${celdaFirma}</td>
            `;

            const btnEditarEl = tr.querySelector('.btn-editar-url-contrato');
            if (btnEditarEl) {
                btnEditarEl.addEventListener('click', () => {
                    window.editarUrlContrato(Number(c.id_contract), c.contract_file_url || '');
                });
            }

            const btnEliminarEl = tr.querySelector('.btn-eliminar-contrato');
            if (btnEliminarEl) {
                btnEliminarEl.addEventListener('click', () => {
                    window.eliminarContrato(Number(c.id_contract), c.contract_key || '');
                });
            }

            tbody.appendChild(tr);
        });
    }

    window.ContratosApp.Tabla = {
        renderizarTabla
    };
})();