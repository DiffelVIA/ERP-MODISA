(() => {
    // Control de acceso: Redirigir a la página principal si no ha iniciado sesión
    if (!localStorage.getItem('userRol')) {
    window.location.replace('/');
    }
    
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000/api' 
      : 'https://erp-modisa.onrender.com/api';

    let proyectosOriginales = [];

    document.addEventListener("DOMContentLoaded", () => {
        obtenerYRenderizarProyectos();
        configurarDropdowns();
    });

    async function obtenerYRenderizarProyectos() {
        const cuerpoTabla = document.querySelector(".cuerpoTabla");
        if (!cuerpoTabla) return;

        try {
            cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">⏳ Cargando proyectos desde el servidor...</td></tr>`;

            // 🔄 CORRECCIÓN APLICADA: Uso de la constante absoluta local
            const response = await fetch(`${API_BASE_URL}/projects-report`);
            if (!response.ok) throw new Error(`Error en el servidor: ${response.status}`);

            proyectosOriginales = await response.json();

            if (proyectosOriginales.length === 0) {
                cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">📭 No hay proyectos registrados actualmente.</td></tr>`;
                return;
            }

            generarOpcionesFiltros(proyectosOriginales);
            renderizarTabla(proyectosOriginales);

        } catch (error) {
            console.error("❌ Error crítico al construir la tabla de proyectos:", error);
            cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #d9534f; font-weight: bold; padding: 20px;">⚠️ Ocurrió un error al cargar el reporte de proyectos. Revisa la consola.</td></tr>`;
        }
    }

    function renderizarTabla(datos) {
        const cuerpoTabla = document.querySelector(".cuerpoTabla");
        if (!cuerpoTabla) return;

        cuerpoTabla.innerHTML = "";

        if (datos.length === 0) {
            cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">No hay proyectos que coincidan con los filtros seleccionados.</td></tr>`;
            return;
        }

        const rolUsuario = localStorage.getItem('userRol');
        const esDirector = (rolUsuario === "Director Operativo");

        const traduccionEstados = {
            'Active': 'Activo',
            'On Hold': 'En Espera',
            'Completed': 'Finalizado',
            'Cancelled': 'Cancelado'
        };

        datos.forEach(proy => {
            const fila = document.createElement("tr");

            const fInicio = new Date(proy.start_date);
            const fFin = new Date(proy.finish_date);
            
            const opcionesFecha = { year: 'numeric', month: '2-digit', day: '2-digit' };
            const fInicioFormateada = fInicio.toLocaleDateString('es-MX', opcionesFecha);
            const fFinFormateada = fFin.toLocaleDateString('es-MX', opcionesFecha);

            const fFinISO = proy.finish_date ? proy.finish_date.split('T')[0] : ''; 

            const porcentaje = calcularPorcentajeTiempo(fInicio, fFin, proy.status);
            const estadoEspañol = traduccionEstados[proy.status] || proy.status;

            // 🟢 TU LÓGICA: Si no es director, renderiza texto plano (Solo lectura)
            if (!esDirector) {
                fila.innerHTML = `
                    <td><strong>${proy.project_name}</strong></td>
                    <td>${proy.responsable_name || "<i>Sin asignar</i>"}</td>
                    <td>${proy.location || "N/A"}</td>
                    <td><span class="badge-status status-${proy.status.toLowerCase().replace(/\s+/g, '')}">${estadoEspañol}</span></td>
                    <td>${fInicioFormateada}</td>
                    <td>${fFinFormateada}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="background-color: #e2eaf0; width: 120px; height: 10px; border-radius: 5px; overflow: hidden; border: 1px solid #cfdbe6;">
                                <div style="background-color: #0b132b; width: ${porcentaje}%; height: 100%; transition: width 0.4s ease-out;"></div>
                            </div>
                            <span style="font-size: 13px; font-weight: 600; color: #0b132b;">${porcentaje}%</span>
                        </div>
                    </td>
                `;
            } else {
                // 🟢 TU LÓGICA: Si es director operativo, habilita controles inputs interactivos
                fila.innerHTML = `
                    <td><strong>${proy.project_name}</strong></td>
                    <td>${proy.responsable_name || "<i>Sin asignar</i>"}</td>
                    <td>${proy.location || "N/A"}</td>
                    <td>
                        <select class="selector-estatus" data-id="${proy.id_project}" style="padding: 4px 6px; border-radius: 4px; font-family: inherit; font-weight: 600;">
                            <option value="Active" ${proy.status === 'Active' ? 'selected' : ''}>Activo</option>
                            <option value="On Hold" ${proy.status === 'On Hold' ? 'selected' : ''}>En Espera</option>
                            <option value="Completed" ${proy.status === 'Completed' ? 'selected' : ''}>Finalizado</option>
                            <option value="Cancelled" ${proy.status === 'Cancelled' ? 'selected' : ''}>Cancelado</option>
                        </select>
                    </td>
                    <td>${fInicioFormateada}</td>
                    <td>
                        <input type="date" class="input-fecha-fin" data-id="${proy.id_project}" value="${fFinISO}" style="padding: 4px; border-radius: 4px; border: 1px solid #cbd5e1; font-family: inherit;">
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="background-color: #e2eaf0; width: 120px; height: 10px; border-radius: 5px; overflow: hidden; border: 1px solid #cfdbe6;">
                                <div style="background-color: #0b132b; width: ${porcentaje}%; height: 100%; transition: width 0.4s ease-out;"></div>
                            </div>
                            <span style="font-size: 13px; font-weight: 600; color: #0b132b;">${porcentaje}%</span>
                        </div>
                    </td>
                `;
            }

            cuerpoTabla.appendChild(fila);
        });

        if (esDirector) {
            asignarEventosInteractivos();
        }
    }

    function asignarEventosInteractivos() {
        document.querySelectorAll(".selector-estatus").forEach(select => {
            select.addEventListener("change", async (e) => {
                const idProject = e.target.dataset.id;
                const nuevoEstado = e.target.value;
                const fila = e.target.closest("tr");
                
                // 🛡️ CORRECCIÓN ANTICRASH: Se previene la lectura nula si el input fecha-fin no existe en la fila actual
                const inputFecha = fila.querySelector(".input-fecha-fin");
                const fechaFinActual = inputFecha ? inputFecha.value : new Date().toISOString().split('T')[0];

                await procesarActualizacionRenglon(idProject, nuevoEstado, fechaFinActual);
            });
        });

        document.querySelectorAll(".input-fecha-fin").forEach(input => {
            input.addEventListener("change", async (e) => {
                const idProject = e.target.dataset.id;
                const nuevaFechaFin = e.target.value;
                const fila = e.target.closest("tr");
                const selector = fila.querySelector(".selector-estatus");

                const hoyLocal = new Date().toLocaleDateString('fr-CA', { timeZone: 'America/Mexico_City' });
                const nuevaFechaClean = nuevaFechaFin.split('T')[0];

                let estadoAutomatico = 'Completed';
                if (nuevaFechaClean >= hoyLocal) {
                    estadoAutomatico = 'Active';
                }

                if (selector) selector.value = estadoAutomatico;

                await procesarActualizacionRenglon(idProject, estadoAutomatico, nuevaFechaFin);
            });
        });
    }

    async function procesarActualizacionRenglon(id, status, finishDate) {
        try {
            // 🔄 CORRECCIÓN APLICADA: Conexión con puerto 3000 con inyección del Header con el Rol actual
            const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "x-user-rol": localStorage.getItem('userRol') || '' 
                },
                body: JSON.stringify({ status, finish_date: finishDate })
            });

            if (!response.ok) throw new Error("Fallo al actualizar el registro en el servidor.");

            await obtenerYRenderizarProyectos();

        } catch (error) {
            console.error("❌ Error en actualización interactiva:", error);
            alert("No se pudieron guardar las modificaciones del proyecto o no cuentas con los permisos de edición.");
        }
    }

    function generarOpcionesFiltros(datos) {
        const filtroProyecto = document.getElementById("filtroProyecto");
        const filtroEstado = document.getElementById("filtroEstado");
        const filtroResponsable = document.getElementById("filtroResponsable");

        const proyectosUnicos = [...new Set(datos.map(item => item.project_name).filter(Boolean))].sort();
        const responsablesUnicos = [...new Set(datos.map(item => item.responsable_name).filter(Boolean))].sort();

        if (filtroProyecto) {
            filtroProyecto.innerHTML = proyectosUnicos.map(p => `
                <label class="opcion-filtro" style="display: block; padding: 4px 12px; cursor: pointer;">
                    <input type="checkbox" value="${p}" class="chk-proyecto"> ${p}
                </label>
            `).join('');
        }

        if (filtroEstado) {
            const estados = [
                { val: 'active', txt: 'Activo' },
                { val: 'on hold', txt: 'En Espera' },
                { val: 'completed', txt: 'Finalizado' }
            ];
            
            filtroEstado.innerHTML = estados.map(e => `
                <label class="opcion-filtro" style="display: block; padding: 4px 12px; cursor: pointer;">
                    <input type="checkbox" value="${e.val}" class="chk-estado"> ${e.txt}
                </label>
            `).join('');
        }

        if (filtroResponsable) {
            filtroResponsable.innerHTML = responsablesUnicos.map(r => `
                <label class="opcion-filtro" style="display: block; padding: 4px 12px; cursor: pointer;">
                    <input type="checkbox" value="${r}" class="chk-responsable"> ${r}
                </label>
            `).join('');
        }

        document.querySelectorAll('.contenido-dropdown input[type="checkbox"]').forEach(chk => {
            chk.removeEventListener('change', aplicarFiltros);
            chk.addEventListener('change', aplicarFiltros);
        });
    }

    function aplicarFiltros() {
        const obtenerValoresCheckboxes = (selector) => {
            return Array.from(document.querySelectorAll(selector))
                        .filter(chk => chk.checked)
                        .map(chk => chk.value);
        };

        const proyectosSeleccionados = obtenerValoresCheckboxes('.chk-proyecto');
        const estadosSeleccionados = obtenerValoresCheckboxes('.chk-estado');
        const responsablesSeleccionados = obtenerValoresCheckboxes('.chk-responsable');

        const resultadoFiltrado = proyectosOriginales.filter(proy => {
            const cumpleProyecto = proyectosSeleccionados.length === 0 || proyectosSeleccionados.includes(proy.project_name);
            const cumpleEstado = estadosSeleccionados.length === 0 || estadosSeleccionados.includes(proy.status.toLowerCase().trim());
            const cumpleResponsable = responsablesSeleccionados.length === 0 || responsablesSeleccionados.includes(proy.responsable_name);

            return cumpleProyecto && cumpleEstado && cumpleResponsable;
        });

        renderizarTabla(resultadoFiltrado);
    }

    function calcularPorcentajeTiempo(fechaInicio, fechaFin, status) {
        if (status === 'Completed' || status === 'Cancelled') return 100;

        const hoy = new Date();
        if (hoy < fechaInicio) return 0;
        if (hoy > fechaFin) return 100;

        const tiempoTotalPlazo = fechaFin - fechaInicio;
        const tiempoConsumidoAlDiaDeHoy = hoy - fechaInicio;

        if (tiempoTotalPlazo <= 0) return 0;

        const resultadoPorcentaje = (tiempoConsumidoAlDiaDeHoy / tiempoTotalPlazo) * 100;
        return Math.round(resultadoPorcentaje);
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
                        if (c !== contenido) c.classList.remove('mostrar');
                    });
                    
                    contenido.classList.toggle('mostrar');
                });

                contenido.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.contenido-dropdown').forEach(c => {
                c.classList.remove('mostrar');
            });
        });
    }
})();