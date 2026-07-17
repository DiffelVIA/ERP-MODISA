(() => {

    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

    let todosLosContratos = [];

    document.addEventListener("DOMContentLoaded", () => {
        const rolRaw = localStorage.getItem("userRol");
        const rolUsuario = rolRaw ? rolRaw.trim().toLowerCase() : null;

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
            const response = await fetch(`${API_BASE}/contratos`);
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

        const rolRaw = localStorage.getItem("userRol");
        const rolUsuario = rolRaw ? rolRaw.trim().toLowerCase() : "";

        tbody.innerHTML = "";

        if (listaContratos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="18" style="text-align:center;">🚫 No se encontraron contratos con los filtros seleccionados.</td></tr>`;
            return;
        }

        listaContratos.forEach(c => {
            const tr = document.createElement("tr");

            const total = Number(c.total_amount || 0);
            const pagado = Number(c.monto_pagado || 0);
            
            const porcentajePagado = total > 0 ? Math.round((pagado / total) * 100) : 0;
            const saldoPendienteDinero = total - pagado;
            const saldoPendientePorcentaje = 100 - porcentajePagado;

            const fechaFormateada = c.start_date ? new Date(c.start_date).toLocaleDateString('es-MX') : '---';
            const fechaRef = c.start_date ? new Date(c.start_date) : new Date();
            const inicioAño = new Date(fechaRef.getFullYear(), 0, 1);
            const diasPasados = Math.floor((fechaRef - inicioAño) / (24 * 60 * 60 * 1000));
            const numeroSemana = Math.ceil((diasPasados + inicioAño.getDay() + 1) / 7);

            const celdaClave = c.contract_file_url 
                ? `<a href="${c.contract_file_url}" target="_blank" style="color: #007bff; text-decoration: underline;"><strong>${c.contract_key}</strong></a>`
                : `<strong>${c.contract_key}</strong>`;

            const currentStatus = c.status || "Pendiente";
            const currentCostos = c.estado_costos || "Pendiente";
            const currentDireccion = c.status_direccion || "Pendiente";
            const currentFirma = c.firma || "Pendiente";

            const mapaStatus = { "Pendiente": "⏳ Pendiente", "Pagado": "💰 Pagado", "Rechazado": "❌ Rechazado" };
            const mapaCostos = { "Pendiente": "⏳ Pendiente", "Revisado": "🔍 Revisado", "Rechazado": "❌ Rechazado" };
            const mapaDireccion = { "Pendiente": "⏳ Pendiente", "Autorizado": "✔️ Autorizado", "Rechazado": "❌ Rechazado" };
            const mapaFirma = { "Pendiente": "⏳ No", "No": "⏳ No", "Firmado": "✅ Sí", "Sí": "✅ Sí" };

            const celdaMontoPagado = `<span>$${pagado.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>`;
            const celdaStatusPago = `<span>${mapaStatus[currentStatus] || mapaStatus["Pendiente"]}</span>`;

            const celdaCostos = (rolUsuario === 'gerente de costos' || rolUsuario === 'costos')
                ? `<select id="costos-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentCostos === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="Revisado" ${currentCostos === 'Revisado' ? 'selected' : ''}>🔍 Revisado</option>
                        <option value="Rechazado" ${currentCostos === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                   </select>`
                : `<span>${mapaCostos[currentCostos] || currentCostos}</span>`;

            const celdaDireccion = (rolUsuario === 'director operativo')
                ? `<select id="direccion-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
                        <option value="Pendiente" ${currentDireccion === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                        <option value="Autorizado" ${currentDireccion === 'Autorizado' ? 'selected' : ''}>✔️ Autorizado</option>
                        <option value="Rechazado" ${currentDireccion === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                   </select>`
                : `<span>${mapaDireccion[currentDireccion] || currentDireccion}</span>`;

            const celdaFirma = (rolUsuario === 'compras')
                ? `<select id="firma-${c.id_contract}" class="select-tabla" onchange="autoGuardarFila(${c.id_contract})">
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
                <td data-campo="total" data-total="${total}">$${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                <td data-campo="monto-consultar" data-monto-consultar="${pagado}">${celdaMontoPagado}</td>
                <td id="porcentaje-${c.id_contract}"><strong>${porcentajePagado}%</strong></td>
                <td data-campo="saldo-dinero" style="color: #64748b; font-weight: 500;">$${saldoPendienteDinero.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                <td data-campo="saldo-porcentaje" style="color: #64748b; font-weight: bold;">${saldoPendientePorcentaje}%</td>
                <td data-campo="status-pago" data-valor-real="${currentStatus}">${celdaStatusPago}</td>
                <td data-campo="estado-costos">${celdaCostos}</td>
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

        const totalFilaNum = cellTotal ? Number(cellTotal.getAttribute('data-total') || 0) : 0;
        const montoPagado = cellMontoConsultar ? Number(cellMontoConsultar.getAttribute('data-monto-consultar') || 0) : 0;

        let statusDireccion = selectDireccion ? selectDireccion.value : (cellStatusDireccion ? cellStatusDireccion.innerText.replace(/[⏳✔️❌\s]/g, "") : "Pendiente");
        let statusGeneral   = cellStatusPago ? (cellStatusPago.getAttribute('data-valor-real') || "Pendiente") : "Pendiente";
        let estadoCostos    = selectCostos ? selectCostos.value : (cellEstadoCostos ? cellEstadoCostos.innerText.replace(/[⏳🔍❌\s]/g, "") : "Pendiente");

        if (statusDireccion === "Rechazado") {
            statusGeneral = "Rechazado";
            estadoCostos = "Rechazado";

            if (selectCostos) selectCostos.value = "Rechazado";
            cellStatusPago.innerHTML = `<span>❌ Rechazado</span>`;
            cellStatusPago.setAttribute('data-valor-real', "Rechazado");
            if (!selectCostos) cellEstadoCostos.innerHTML = `<span>❌ Rechazado</span>`;
        }
        else if (statusDireccion === "Pendiente" && statusGeneral === "Rechazado") {
            statusGeneral = "Pendiente";
            estadoCostos = "Pendiente";

            if (selectCostos) selectCostos.value = "Pendiente";
            cellStatusPago.innerHTML = `<span>⏳ Pendiente</span>`;
            cellStatusPago.setAttribute('data-valor-real', "Pendiente");
            if (!selectCostos) cellEstadoCostos.innerHTML = `<span>⏳ Pendiente</span>`;
        }
        
        let firmaVal = "Pendiente";
        if (selectFirma) {
            firmaVal = selectFirma.value;
        } else if (cellFirma) {
            firmaVal = cellFirma.innerText.includes("Sí") ? "Firmado" : "Pendiente";
        }

        try {
            const response = await fetch(`${API_BASE}/contratos/${id}/actualizar-control`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: statusGeneral, 
                    estado_costos: estadoCostos,
                    status_direccion: statusDireccion,
                    firma: firmaVal
                })
            });

            if (response.ok) {
                const nuevoPorcentaje = totalFilaNum > 0 ? Math.round((montoPagado / totalFilaNum) * 100) : 0;
                cellPorcentaje.innerHTML = `<strong>${nuevoPorcentaje}%</strong>`;
                
                if (nuevoPorcentaje >= 100 && statusGeneral !== "Rechazado") {
                    cellStatusPago.innerHTML = `<span>💰 Pagado</span>`;
                    cellStatusPago.setAttribute('data-valor-real', "Pagado");
                }

                const nuevoSaldoDinero = totalFilaNum - montoPagado;
                const nuevoSaldoPorcentaje = 100 - nuevoPorcentaje;
                
                if (cellSaldoDinero) cellSaldoDinero.innerText = `$${nuevoSaldoDinero.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
                if (cellSaldoPorcentaje) cellSaldoPorcentaje.innerText = `${nuevoSaldoPorcentaje}%`;

                const contratoEnCache = todosLosContratos.find(c => c.id_contract === id);
                if (contratoEnCache) {
                    contratoEnCache.status = (nuevoPorcentaje >= 100 && statusGeneral !== "Rechazado") ? "Pagado" : statusGeneral;
                    contratoEnCache.estado_costos = estadoCostos;
                    contratoEnCache.status_direccion = statusDireccion;
                    contratoEnCache.firma = firmaVal;
                }
                
                trFila.style.backgroundColor = "#eaffea";
                setTimeout(() => trFila.style.backgroundColor = "", 600);
            } else {
                trFila.style.backgroundColor = "#ffdddd";
            }
        } catch (error) {
            console.error("❌ Error al guardar cambios de control en fila:", error);
        }
    }

})();