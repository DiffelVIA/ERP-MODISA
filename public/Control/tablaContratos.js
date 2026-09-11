(() => {

    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

    let todosLosContratos = [];

    document.addEventListener("DOMContentLoaded", () => {
        const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const rolUsuario = (userToken && userToken.rol) ? userToken.rol.trim().toLowerCase() : null;

        const rolesPermitidos = [
            "gerente administración", "compras", "director general", 
            "director operativo", "subdirector de obra", 
            "gerente de costos", "auxiliar costos", "residente de obra"
        ];

        if (!rolUsuario || !rolesPermitidos.includes(rolUsuario)) {
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
            if (e.target.classList.contains('chk-obra') || e.target.classList.contains('chk-estado')) {
                aplicarFiltrosCruzados();
            }
        });

        cargarContratos();
    });

    async function cargarContratos() {
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const response = await fetch(`${API_BASE}/contratos`,{
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            if (!response.ok) throw new Error("Error al obtener los contratos");

            todosLosContratos = await response.json();
            generarOpcionesFiltros(todosLosContratos);
            configurarDropdowns();
            renderizarTabla(todosLosContratos);
        } catch (error) {
            console.error("❌ Error al cargar contratos:", error);
        }
    }

    function renderizarTabla(listaContratos) {
        const tbody = document.querySelector(".cuerpoTabla");
        if (!tbody) return;

        const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const rolUsuario = (userToken && userToken.rol) ? userToken.rol.trim().toLowerCase() : "";

        tbody.innerHTML = "";

        if (listaContratos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="19" style="text-align:center;">🚫 No se encontraron contratos con los filtros seleccionados.</td></tr>`;
            return;
        }

        const contratosOrdenadosCronologicamente = [...listaContratos].sort((a, b) => a.id_contract - b.id_contract);

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

        listaContratos.forEach(c => {
            const tr = document.createElement("tr");

            const total = Number(c.total_amount || 0);
            const pagado = Number(c.monto_pagado || 0);
            const colorFuente = mapaColoresContratos[c.id_contract] || '#16a34a';
            
            const porcentajePagado = total > 0 ? Math.round((pagado / total) * 100) : 0;
            const saldoPendienteDinero = total - pagado;
            const saldoPendientePorcentaje = 100 - porcentajePagado;

            const fechaFormateada = c.start_date ? new Date(c.start_date).toLocaleDateString('es-MX') : '---';
            const fechaRef = c.start_date ? new Date(c.start_date) : new Date();
            const inicioAño = new Date(fechaRef.getFullYear(), 0, 1);
            const diasPasados = Math.floor((fechaRef - inicioAño) / (24 * 60 * 60 * 1000));
            const numeroSemana = Math.ceil((diasPasados + inicioAño.getDay() + 1) / 7);

            const esCostos = (rolUsuario === 'gerente de costos' || rolUsuario === 'costos');

            const botonEditarUrl = esCostos 
                ? `<button type="button" onclick="editarUrlContrato(${c.id_contract}, '${c.contract_file_url || ''}')" title="Editar enlace de contrato" style="background:none; border:none; cursor:pointer; font-size:14px; margin-left:4px;">✏️</button>`
                : '';

            const enlaceTexto = c.contract_file_url
                ? `<a href="${c.contract_file_url}" target="_blank" style="color: #007bff; text-decoration: underline;"><strong>${c.contract_key}</strong></a>`
                : `<strong>${c.contract_key}</strong>`;
            
            const celdaClave = `${enlaceTexto}${botonEditarUrl}`;

            const currentStatus = c.status || "Pendiente";
            const currentCostos = c.estado_costos || "Pendiente";
            const currentComentarioCostos = c.comentarios_costos || "";
            const currentDireccion = c.status_direccion || "Pendiente";
            const currentFirma = c.firma || "Pendiente";

            const mapaStatus = { "Pendiente": "⏳ Pendiente", "Pagado": "💰 Pagado", "Rechazado": "❌ Rechazado" };
            const mapaCostos = { "Pendiente": "⏳ Pendiente", "Revisado": "🔍 Revisado", "Rechazado": "❌ Rechazado" };
            const mapaDireccion = { "Pendiente": "⏳ Pendiente", "Autorizado": "✔️ Autorizado", "Rechazado": "❌ Rechazado" };
            const mapaFirma = { "Pendiente": "⏳ No", "No": "⏳ No", "Firmado": "✅ Sí", "Sí": "✅ Sí" };

            const celdaMontoPagado = `<span>$${pagado.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>`;
            const celdaStatusPago = `<span>${mapaStatus[currentStatus] || mapaStatus["Pendiente"]}</span>`;

            const celdaTotal = esCostos
                ? `<input type="number" step="0.01" id="total-${c.id_contract}" class="input-tabla" value="${total}" onchange="autoGuardarFila(${c.id_contract})" style="width: 110px; font-weight: 700; color: ${colorFuente}; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;">`
                : `$${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;

            const celdaCostos = esCostos
                ? `<select id="costos-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentCostos === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="Revisado" ${currentCostos === 'Revisado' ? 'selected' : ''}>🔍 Revisado</option>
                        <option value="Rechazado" ${currentCostos === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                   </select>`
                : `<span>${mapaCostos[currentCostos] || currentCostos}</span>`;

            const celdaComentarioCostos = esCostos
                ? `<textarea id="comentario-costos-${c.id_contract}" onchange="autoGuardarFila(${c.id_contract})" placeholder="Escribe un comentario..." style="width: 100%; height: 50px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-family: inherit; font-size: 12px; box-sizing: border-box; word-break: break-word; overflow-wrap: break-word; vertical-align: middle;">${currentComentarioCostos || ''}</textarea>`
                : `<span style="white-space: pre-wrap; font-size: 13px; color: #334155; word-break: break-word; overflow-wrap: break-word;">${currentComentarioCostos || '---'}</span>`;
                
            const celdaDireccion = (rolUsuario === 'director operativo')
                ? `<select id="direccion-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentDireccion === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="Autorizado" ${currentDireccion === 'Autorizado' ? 'selected' : ''}>✔️ Autorizado</option>
                        <option value="Rechazado" ${currentDireccion === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                   </select>`
                : `<span>${mapaDireccion[currentDireccion] || currentDireccion}</span>`;

            const firmaDeshabilitada = (currentDireccion === 'Rechazado') ? 'disabled' : '';

            const celdaFirma = (rolUsuario === 'compras')
                ? `<select id="firma-${c.id_contract}" class="select-tabla" ${firmaDeshabilitada} onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentFirma === 'Pendiente' || currentFirma === 'No' ? 'selected' : ''}>⏳ No</option>
                        <option value="Firmado" ${currentFirma === 'Firmado' || currentFirma === 'Sí' ? 'selected' : ''}>✅ Sí</option>
                   </select>`
                : `<span>${mapaFirma[currentFirma] || currentFirma}</span>`;

            tr.innerHTML = `
                <td>${c.project_name || 'Sin Proyecto'}</td>
                <td><span style="font-weight: 500; color: #475569;">${c.grupo || '---'}</span></td>
                <td>${c.categoria || '---'}</td>
                <td>${c.subcategoria || '---'}</td>
                <td>${fechaFormateada}</td>
                <td>Semana ${numeroSemana}</td>
                <td>${celdaClave}</td>
                <td>${c.Concept || 'Sin descripción'}</td>
                <td>${c.supplier}</td>
                <td data-campo="total" data-total="${total}" style="color: ${colorFuente}; font-weight: 700;">${celdaTotal}</td>
                <td data-campo="monto-consultar" data-monto-consultar="${pagado}">${celdaMontoPagado}</td>
                <td id="porcentaje-${c.id_contract}"><strong>${porcentajePagado}%</strong></td>
                <td data-campo="saldo-dinero" style="color: #64748b; font-weight: 500;">$${saldoPendienteDinero.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                <td data-campo="saldo-porcentaje" style="color: #64748b; font-weight: bold;">${saldoPendientePorcentaje}%</td>
                <td data-campo="status-pago" data-valor-real="${currentStatus}">${celdaStatusPago}</td>
                <td data-campo="estado-costos">${celdaCostos}</td>
                <td data-campo="comentarios-costos" style="width: 220px; min-width: 220px; max-width: 220px; vertical-align: middle;">${celdaComentarioCostos}</td>
                <td data-campo="status-direccion">${celdaDireccion}</td>
                <td data-campo="firma">${celdaFirma}</td>
            `;
 
            tbody.appendChild(tr);
        });
    }

    function generarOpcionesFiltros(contratos) {
        const contenedorObra = document.getElementById("filtroObra");
        const contenedorEstado = document.getElementById("filtroEstado");

        if (!contenedorObra || !contenedorEstado) return;

        const obrasUnicas = [...new Set(contratos.map(c => c.project_name).filter(Boolean))].sort();
        const estadosUnicos = [...new Set(contratos.map(c => c.status).filter(Boolean))].sort();

        contenedorObra.innerHTML = obrasUnicas.map(obra => `
          <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
            <input type="checkbox" value="${obra}" class="chk-obra"> ${obra}
          </label>
        `).join('');

        contenedorEstado.innerHTML = estadosUnicos.map(estado => `
          <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
            <input type="checkbox" value="${estado}" class="chk-estado"> ${estado}
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
        const obtenerValoresCheckboxes = (selector) => {
            return Array.from(document.querySelectorAll(selector)).filter(chk => chk.checked).map(chk => chk.value);
        };

        const obrasSeleccionadas = obtenerValoresCheckboxes('.chk-obra');
        const estadosSeleccionados = obtenerValoresCheckboxes('.chk-estado');

        const resultadoFiltrado = todosLosContratos.filter(c => {
            const cumpleObra = obrasSeleccionadas.length === 0 || obrasSeleccionadas.includes(c.project_name);
            const cumpleEstado = estadosSeleccionados.length === 0 || estadosSeleccionados.includes(c.status);
            return cumpleObra && cumpleEstado;
        });

        renderizarTabla(resultadoFiltrado);
    }

    window.autoGuardarFila = async function(id) {
        const cellPorcentaje = document.getElementById(`porcentaje-${id}`);
        if (!cellPorcentaje) return;
        const trFila = cellPorcentaje.closest('tr');
        if (!trFila) return;
        
        const cellTotal = trFila.querySelector('[data-campo="total"]');
        const cellMontoConsultar = trFila.querySelector('[data-campo="monto-consultar"]');
        const cellStatusPago = trFila.querySelector('[data-campo="status-pago"]');
        const cellEstadoCostos = trFila.querySelector('[data-campo="estado-costos"]');
        const cellStatusDireccion = trFila.querySelector('[data-campo="status-direccion"]');
        const cellFirma = trFila.querySelector('[data-campo="firma"]');

        const cellSaldoDinero = trFila.querySelector('[data-campo="saldo-dinero"]');
        const cellSaldoPorcentaje = trFila.querySelector('[data-campo="saldo-porcentaje"]');

        const selectCostos = document.getElementById(`costos-${id}`);
        const selectDireccion = document.getElementById(`direccion-${id}`);
        const selectFirma = document.getElementById(`firma-${id}`);
        
        const inputTotal = document.getElementById(`total-${id}`);
        const inputComentarioCostos = document.getElementById(`comentario-costos-${id}`);

        const totalFilaNum = inputTotal ? Number(inputTotal.value || 0) : (cellTotal ? Number(cellTotal.getAttribute('data-total') || 0) : 0);
        if (cellTotal) cellTotal.setAttribute('data-total', totalFilaNum);

        const montoPagado = cellMontoConsultar ? Number(cellMontoConsultar.getAttribute('data-monto-consultar') || 0) : 0;
        const comentarioCostosVal = inputComentarioCostos ? inputComentarioCostos.value : null;

        let statusDireccion = selectDireccion ? selectDireccion.value : (cellStatusDireccion ? cellStatusDireccion.innerText.replace(/[⏳✔️❌\s]/g, "") : "Pendiente");
        let statusGeneral   = cellStatusPago ? (cellStatusPago.getAttribute('data-valor-real') || "Pendiente") : "Pendiente";
        let estadoCostos    = selectCostos ? selectCostos.value : (cellEstadoCostos ? cellEstadoCostos.innerText.replace(/[⏳🔍❌\s]/g, "") : "Pendiente");

        let firmaVal = "Pendiente";
        if (selectFirma) {
            firmaVal = selectFirma.value;
        } else if (cellFirma) {
            firmaVal = cellFirma.innerText.includes("Sí") ? "Firmado" : "Pendiente";
        }

        if (statusDireccion === "Rechazado") {
            statusGeneral = "Rechazado";
            estadoCostos = "Rechazado";
            firmaVal = "Pendiente";

            if (selectCostos) selectCostos.value = "Rechazado";
            if (!selectCostos && cellEstadoCostos) cellEstadoCostos.innerHTML = `<span>❌ Rechazado</span>`;

            if (selectFirma) {
                selectFirma.value = "Pendiente";
                selectFirma.disabled = true;
            } else if (cellFirma) {
                cellFirma.innerHTML = `<span>⏳ No</span>`;
            }

            cellStatusPago.innerHTML = `<span>❌ Rechazado</span>`;
            cellStatusPago.setAttribute('data-valor-real', "Rechazado");
        } 
        else if (estadoCostos === "Rechazado") {
            statusGeneral = "Rechazado";
            cellStatusPago.innerHTML = `<span>❌ Rechazado</span>`;
            cellStatusPago.setAttribute('data-valor-real', "Rechazado");

            if (selectFirma) selectFirma.disabled = false;
        } 
        else {
            if (selectFirma) selectFirma.disabled = false;

            if (statusGeneral === "Rechazado") {
                statusGeneral = "Pendiente";
                cellStatusPago.innerHTML = `<span>⏳ Pendiente</span>`;
                cellStatusPago.setAttribute('data-valor-real', "Pendiente");
            }
        }

        try {
            const token = localStorage.getItem('jwtToken') || '';
            const response = await fetch(`${API_BASE}/contratos/${id}/actualizar-control`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    status: statusGeneral, 
                    estado_costos: estadoCostos,
                    status_direccion: statusDireccion,
                    firma: firmaVal,
                    total_amount: totalFilaNum,
                    comentarios_costos: comentarioCostosVal
                })
            });

            if (response.ok) {
                const nuevoPorcentaje = totalFilaNum > 0 ? Math.round((montoPagado / totalFilaNum) * 100) : 0;
                cellPorcentaje.innerHTML = `<strong>${nuevoPorcentaje}%</strong>`;
                
                if (nuevoPorcentaje >= 100 && statusGeneral !== "Rechazado") {
                    cellStatusPago.innerHTML = `<span>💰 Pagado</span>`;
                    cellStatusPago.setAttribute('data-valor-real', "Pagado");
                    statusGeneral = "Pagado";
                }

                const nuevoSaldoDinero = totalFilaNum - montoPagado;
                const nuevoSaldoPorcentaje = 100 - nuevoPorcentaje;
                
                if (cellSaldoDinero) cellSaldoDinero.innerText = `$${nuevoSaldoDinero.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
                if (cellSaldoPorcentaje) cellSaldoPorcentaje.innerText = `${nuevoSaldoPorcentaje}%`;

                const contratoEnCache = todosLosContratos.find(c => c.id_contract === id);
                if (contratoEnCache) {
                    contratoEnCache.status = statusGeneral;
                    contratoEnCache.estado_costos = estadoCostos;
                    contratoEnCache.status_direccion = statusDireccion;
                    contratoEnCache.firma = firmaVal;
                    contratoEnCache.total_amount = totalFilaNum;
                    contratoEnCache.comentarios_costos = comentarioCostosVal;
                }
                
                trFila.style.backgroundColor = "#eaffea";
                setTimeout(() => trFila.style.backgroundColor = "", 600);
            } else {
                trFila.style.backgroundColor = "#ffdddd";
            }
        } catch (error) {
            console.error("❌ Error al guardar cambios de control en fila:", error);
        }
    };

    window.editarUrlContrato = async function(idContract, urlActual) {
        const nuevaUrl = prompt("Ingrese la nueva URL del contrato (Drive / Enlace):", urlActual);
        
        if (nuevaUrl === null) return; // Cancela prompt
        
        const token = localStorage.getItem('jwtToken') || '';

        try {
            const response = await fetch(`${API_BASE}/contratos/${idContract}/actualizar-url`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ contract_file_url: nuevaUrl.trim() })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert("✅ Enlace del contrato actualizado con éxito.");
                cargarContratos();
            } else {
                alert(`❌ Error: ${data.error || "No se pudo actualizar el enlace."}`);
            }
        } catch (error) {
            console.error("❌ Error al enviar nueva URL:", error);
            alert("❌ Ocurrió un error de red al intentar actualizar el enlace.");
        }
    };

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

})();