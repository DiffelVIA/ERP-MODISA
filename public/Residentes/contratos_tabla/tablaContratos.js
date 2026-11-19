(() => {
    let todosLosContratos = [];
    const filasEnGuardado = new Set();

    document.addEventListener("DOMContentLoaded", () => {
        const { obtenerContextoPermisos, renderizarAccesoDenegado } = window.ContratosApp.Auth;
        const permisos = obtenerContextoPermisos();

        if (!permisos.tieneAcceso) {
            renderizarAccesoDenegado();
            return;
        }

        document.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('chk-obra') ||
                e.target.classList.contains('chk-direccion') ||
                e.target.classList.contains('chk-costos') ||
                e.target.classList.contains('chk-firma')
            ) {
                aplicarFiltrosYRenderizar();
            }
        });

        cargarContratos();
    });

    function aplicarFiltrosYRenderizar() {
        const { obtenerContextoPermisos } = window.ContratosApp.Auth;
        const { filtrarContratos } = window.ContratosApp.Filtros;
        const { renderizarTabla } = window.ContratosApp.Tabla;

        const filtrados = filtrarContratos(todosLosContratos);
        renderizarTabla(filtrados, todosLosContratos, obtenerContextoPermisos());
    }

    async function cargarContratos() {
        try {
            const { obtenerContratos } = window.ContratosApp.Api;
            const { generarOpcionesFiltros, configurarDropdowns } = window.ContratosApp.Filtros;

            todosLosContratos = await obtenerContratos();
            generarOpcionesFiltros(todosLosContratos);
            configurarDropdowns();
            aplicarFiltrosYRenderizar();
        } catch (error) {
            console.error("❌ Error al cargar contratos:", error);
        }
    }

    window.eliminarContrato = async function(idContract, claveContrato) {
        const confirmacion = confirm(`⚠️ ¿Estás seguro de que deseas eliminar permanentemente el contrato "${claveContrato}"?\n\nEsta acción no se puede deshacer.`);
        if (!confirmacion) return;

        try {
            const { eliminarContratoPorId } = window.ContratosApp.Api;
            const { ok, data } = await eliminarContratoPorId(idContract);

            if (ok && data.success) {
                alert(`✅ ${data.message}`);
                todosLosContratos = todosLosContratos.filter(c => Number(c.id_contract) !== Number(idContract));

                const trFila = document.getElementById(`fila-contrato-${idContract}`);
                if (trFila) {
                    trFila.style.transition = "all 0.4s ease";
                    trFila.style.opacity = "0";
                    setTimeout(() => trFila.remove(), 400);
                } else {
                    cargarContratos();
                }
            } else {
                alert(`⛔ No se pudo eliminar: ${data.error || "Ocurrió un error inesperado."}`);
            }
        } catch (error) {
            console.error("❌ Error en la petición DELETE de contrato:", error);
            alert("❌ Error de red al intentar eliminar el contrato.");
        }
    };

    window.autoGuardarFila = async function(id) {
        if (filasEnGuardado.has(id)) {
            setTimeout(() => window.autoGuardarFila(id), 150);
            return;
        }

        const cellPorcentaje = document.getElementById(`porcentaje-${id}`);
        if (!cellPorcentaje) return;
        const trFila = cellPorcentaje.closest('tr');
        if (!trFila) return;

        const cellTotal = trFila.querySelector('[data-campo="total"]');
        const cellMontoConsultar = trFila.querySelector('[data-campo="monto-consultar"]');
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
        const inputComentarioDireccion = document.getElementById(`comentario-direccion-${id}`);
        const inputComentarioAdministracion = document.getElementById(`comentario-administracion-${id}`);

        const totalFilaNum = inputTotal
            ? Number(inputTotal.value || 0)
            : (cellTotal ? Number(cellTotal.getAttribute('data-total') || 0) : 0);

        const contratoEnCache = todosLosContratos.find(c => Number(c.id_contract) === Number(id));
        const montoAnterior = contratoEnCache ? Number(contratoEnCache.total_amount || 0) : totalFilaNum;

        if (cellTotal) cellTotal.setAttribute('data-total', totalFilaNum);

        const montoPagado = cellMontoConsultar ? Number(cellMontoConsultar.getAttribute('data-monto-consultar') || 0) : 0;

        const comentarioCostosVal = inputComentarioCostos ? inputComentarioCostos.value : (contratoEnCache ? contratoEnCache.comentarios_costos : null);
        const comentarioDireccionVal = inputComentarioDireccion ? inputComentarioDireccion.value : (contratoEnCache ? contratoEnCache.comentarios_direccion : null);
        const comentarioAdministracionVal = inputComentarioAdministracion ? inputComentarioAdministracion.value : (contratoEnCache ? contratoEnCache.comentarios_administracion : null);

        let statusDireccion = selectDireccion
            ? selectDireccion.value
            : (contratoEnCache ? (contratoEnCache.status_direccion || "Pendiente") : "Pendiente");

        let statusGeneral = contratoEnCache ? (contratoEnCache.status || "Pendiente") : "Pendiente";

        let estadoCostos = selectCostos
            ? selectCostos.value
            : (contratoEnCache ? (contratoEnCache.estado_costos || "Pendiente") : "Pendiente");

        let firmaVal = "Pendiente";
        if (selectFirma) {
            firmaVal = selectFirma.value;
        } else if (contratoEnCache) {
            firmaVal = (contratoEnCache.firma === "Firmado" || contratoEnCache.firma === "Sí") ? "Firmado" : "Pendiente";
        }

        if (montoAnterior !== totalFilaNum) {
            statusDireccion = "Pendiente";
            firmaVal = "Pendiente";

            if (selectDireccion) selectDireccion.value = "Pendiente";
            if (selectFirma) {
                selectFirma.value = "Pendiente";
            } else if (cellFirma) {
                cellFirma.innerHTML = `<span>⏳ No</span>`;
            }
            if (cellStatusDireccion && !selectDireccion) {
                cellStatusDireccion.innerHTML = `<span>⏳ Pendiente</span>`;
            }
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
        } else if (estadoCostos === "Rechazado") {
            statusGeneral = "Rechazado";

            if (selectFirma) selectFirma.disabled = false;
        } else {
            if (selectFirma) selectFirma.disabled = false;

            if (statusGeneral === "Rechazado") {
                statusGeneral = "Pendiente";
            }
        }

        filasEnGuardado.add(id);
        try {
            const { actualizarControlContrato } = window.ContratosApp.Api;
            const response = await actualizarControlContrato(id, {
                status: statusGeneral,
                estado_costos: estadoCostos,
                status_direccion: statusDireccion,
                firma: firmaVal,
                total_amount: totalFilaNum,
                comentarios_costos: comentarioCostosVal,
                comentarios_direccion: comentarioDireccionVal,
                comentarios_administracion: comentarioAdministracionVal
            });

            if (response.ok) {
                const nuevoPorcentaje = totalFilaNum > 0 ? Math.round((montoPagado / totalFilaNum) * 100) : 0;
                cellPorcentaje.innerHTML = `<strong>${nuevoPorcentaje}%</strong>`;

                if (nuevoPorcentaje >= 100 && statusGeneral !== "Rechazado") {
                    statusGeneral = "Pagado";
                }

                const nuevoSaldoDinero = totalFilaNum - montoPagado;
                const nuevoSaldoPorcentaje = 100 - nuevoPorcentaje;

                if (cellSaldoDinero) cellSaldoDinero.innerText = `$${nuevoSaldoDinero.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
                if (cellSaldoPorcentaje) cellSaldoPorcentaje.innerText = `${nuevoSaldoPorcentaje}%`;

                if (contratoEnCache) {
                    contratoEnCache.status = statusGeneral;
                    contratoEnCache.estado_costos = estadoCostos;
                    contratoEnCache.status_direccion = statusDireccion;
                    contratoEnCache.firma = firmaVal;
                    contratoEnCache.total_amount = totalFilaNum;
                    contratoEnCache.comentarios_costos = comentarioCostosVal;
                    contratoEnCache.comentarios_direccion = comentarioDireccionVal;
                    contratoEnCache.comentarios_administracion = comentarioAdministracionVal;
                }

                trFila.style.backgroundColor = "#eaffea";
                setTimeout(() => { trFila.style.backgroundColor = ""; }, 600);
            } else {
                trFila.style.backgroundColor = "#ffdddd";
            }
        } catch (error) {
            console.error("❌ Error al guardar cambios de control en fila:", error);
        } finally {
            filasEnGuardado.delete(id);
        }
    };

    window.editarUrlContrato = async function(idContract, urlActual) {
        const nuevaUrl = prompt("Ingrese la nueva URL del contrato (Drive / Enlace):", urlActual);

        if (nuevaUrl === null) return;
        const urlLimpia = nuevaUrl.trim();

        if (urlLimpia === urlActual.trim()) return;

        const contratoEnCache = todosLosContratos.find(c => Number(c.id_contract) === Number(idContract));

        try {
            const { actualizarUrlContrato, actualizarControlContrato } = window.ContratosApp.Api;
            const { ok, data } = await actualizarUrlContrato(idContract, urlLimpia);

            if (ok && data.success) {
                await actualizarControlContrato(idContract, {
                    estado_costos: 'Pendiente',
                    status_direccion: 'Pendiente',
                    firma: 'Pendiente',
                    total_amount: contratoEnCache ? Number(contratoEnCache.total_amount || 0) : undefined,
                    comentarios_costos: contratoEnCache ? contratoEnCache.comentarios_costos : undefined,
                    comentarios_direccion: contratoEnCache ? contratoEnCache.comentarios_direccion : undefined,
                    comentarios_administracion: contratoEnCache ? contratoEnCache.comentarios_administracion : undefined
                });

                alert("✅ Enlace del contrato actualizado con éxito. Las autorizaciones se han reiniciado.");
                cargarContratos();
            } else {
                alert(`❌ Error: ${data.error || "No se pudo actualizar el enlace."}`);
            }
        } catch (error) {
            console.error("❌ Error al enviar nueva URL:", error);
            alert("❌ Ocurrió un error de red al intentar actualizar el enlace.");
        }
    };
})();