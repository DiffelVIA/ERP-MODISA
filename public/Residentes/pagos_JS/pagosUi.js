// public/Finanzas/pagos_Js/pagosUi.js

export function limpiarTexto(texto) {
    if (!texto) return '';
    return texto
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function inicializarCamposFechas() {
    const inputFecha = document.getElementById('fecha');
    const inputSemana = document.getElementById('semana-fiscal');
    if (!inputFecha || !inputSemana) return;

    const hoy = new Date();
    const fechaLocal = hoy.toLocaleDateString('sv-SE');
    inputFecha.value = fechaLocal;

    const inicioAño = new Date(hoy.getFullYear(), 0, 1);
    const diasPasados = Math.floor((hoy - inicioAño) / (24 * 60 * 60 * 1000));
    const numeroSemana = Math.ceil((diasPasados + inicioAño.getDay() + 1) / 7);
    
    inputSemana.value = `Semana ${numeroSemana}`;
}

export function establecerSolicitanteLogueado() {
    const inputSolicitante = document.getElementById('solicitante');
    if (!inputSolicitante) return;

    try {
        const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        if (usuarioSesion && (usuarioSesion.id_employee || usuarioSesion.id)) {
            const idEmp = usuarioSesion.id_employee || usuarioSesion.id;
            const nombreEmp = usuarioSesion.nombre || usuarioSesion.name || "Usuario Activo";

            inputSolicitante.setAttribute('data-id', idEmp);

            if (inputSolicitante.tagName === 'SELECT') {
                inputSolicitante.innerHTML = `<option value="${idEmp}" selected>${nombreEmp}</option>`;
            } else {
                inputSolicitante.value = nombreEmp;
            }
        } else {
            asignarEstadoSolicitante(inputSolicitante, "", "Usuario Desconocido");
            console.error("❌ El objeto usuarioMODISA no contiene id_employee válido.");
        }
    } catch (e) {
        console.error("❌ Error al parsear sessionStorage.usuarioMODISA:", e);
        asignarEstadoSolicitante(inputSolicitante, "", "Error al recuperar sesión");
    }
}

export function asignarEstadoSolicitante(elemento, valorId, textoMostrar) {
    if (elemento.tagName === 'SELECT') {
        elemento.innerHTML = `<option value="${valorId}">${textoMostrar}</option>`;
    } else {
        elemento.value = textoMostrar;
    }
}

export function llenarSelect(id, lista) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">-- Selecciona --</option>`;
    lista.forEach(item => {
        const op = document.createElement('option');
        op.value = item.id;
        op.textContent = item.nombre;
        select.appendChild(op);
    });
}

export function llenarSelectSencillo(id, lista) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">-- Selecciona --</option>`;
    lista.forEach(item => {
        if(!item) return;
        const op = document.createElement('option');
        op.value = item;
        op.textContent = item;
        select.appendChild(op);
    });
}

export function inyectarOpcionBloqueada(idSelect, valor) {
    const el = document.getElementById(idSelect);
    if (!el) return;
    const val = valor ? valor.trim() : '---';
    el.innerHTML = `<option value="${val}" selected>${val}</option>`;
    el.disabled = true;
    el.style.backgroundColor = '#f1f5f9';
    el.style.cursor = 'not-allowed';
}

export function restaurarControlesCascada(contexto, limpiarTodo = false) {
    if (contexto) {
        contexto.idCategoryContratoActivo = null; 
        contexto.idContratoActivo = null;
    }
    ['grupo', 'categoria', 'subcategoria'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            el.style.backgroundColor = '';
            el.style.cursor = '';
            if (limpiarTodo) el.innerHTML = `<option value="">-- Selecciona --</option>`;
        }
    });
}

export function filtrarContratosPorProyectoActive(contratosCargados) {
    const idProyecto = document.getElementById('proyecto').value;
    const selectClave = document.getElementById('claveContrato');
    if (!selectClave) return;

    if (!idProyecto) {
        selectClave.innerHTML = `<option value="">-- Selecciona Proyecto Primero --</option>`;
        return;
    }

    const selectProyecto = document.getElementById('proyecto');
    const textoProyecto = selectProyecto.options[selectProyecto.selectedIndex].text;
    const ahora = new Date();

    const contratosFiltrados = contratosCargados.filter(c => {
        if (c.project_name !== textoProyecto) return false;

        const estadoCostos = c.estado_costos ? c.estado_costos.trim().toLowerCase() : 'pendiente';
        const statusDireccion = c.status_direccion ? c.status_direccion.trim().toLowerCase() : 'pendiente';
        const estadoFirma = c.firma ? c.firma.trim().toLowerCase() : 'pendiente';

        const estaRevisado = estadoCostos !== 'pendiente' && estadoCostos !== 'rechazado';
        const estaAutorizado = statusDireccion !== 'pendiente' && statusDireccion !== 'rechazado';

        if (!estaRevisado || !estaAutorizado) {
            return false;
        }

        if (estadoFirma === 'pendiente') {
            const fechaCreacionRaw = c.created_at || c.start_date;
            if (fechaCreacionRaw) {
                const fechaRegistro = new Date(fechaCreacionRaw);
                const diferenciaMilisegundos = ahora - fechaRegistro;
                const diasTranscurridos = diferenciaMilisegundos / (1000 * 60 * 60 * 24);

                if (diasTranscurridos > 5) {
                    return false;
                }
            }
        }

        return true;
    });

    selectClave.innerHTML = `<option value="">-- Selecciona Contrato --</option>` + 
        contratosFiltrados.map(c => `<option value="${c.id_contract}">${c.contract_key} (${c.supplier})</option>`).join('');
}

export function ejecutarCascadaFiltrosConceptos(categoriasCargadas) {
    const selectTipo = document.getElementById('tipo');
    const selectProyecto = document.getElementById('proyecto');
    
    if (selectProyecto && selectProyecto.value && selectTipo && selectTipo.value !== 'contratista' && categoriasCargadas.length > 0) {
        const gruposUnicos = [...new Set(categoriasCargadas.map(c => c.grupo))];
        llenarSelectSencillo('grupo', gruposUnicos);
        llenarSelectSencillo('categoria', []);
        llenarSelectSencillo('subcategoria', []);
    }
}

export function renderizarMiniTabla(listaConceptosPagos, alEliminarConcepto) {
    const contenedorVacio = document.getElementById('tabla-conceptos-vacia');
    const tablaElemento = document.getElementById('tabla-mini-conceptos');
    const cuerpoTabla = document.getElementById('cuerpo-mini-tabla');
    const selectProyecto = document.getElementById('proyecto');

    if (!cuerpoTabla) return;
    cuerpoTabla.innerHTML = '';

    if (listaConceptosPagos.length === 0) {
        if (contenedorVacio) contenedorVacio.style.display = 'block';
        if (tablaElemento) tablaElemento.style.display = 'none';

        if (selectProyecto) {
            selectProyecto.disabled = false;
            selectProyecto.style.backgroundColor = '';
            selectProyecto.style.cursor = '';
        }
        return;
    }

    if (selectProyecto) {
        selectProyecto.disabled = true;
        selectProyecto.style.backgroundColor = '#f1f5f9';
        selectProyecto.style.cursor = 'not-allowed';
    }

    if (contenedorVacio) contenedorVacio.style.display = 'none';
    if (tablaElemento) tablaElemento.style.display = 'table';

    listaConceptosPagos.forEach((concept, index) => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>
                <strong>[${concept.nombre_proyecto || 'Proyecto'}]</strong> ${concept.concept_description}<br>
                <small style="color: #666;">
                    Prov: ${concept.provider_name} | ${concept.payment_type} (${concept.payment_method})
                    ${concept.ticketFile ? ' 📸' : ''}
                    ${concept.excelFile ? ' 📊' : ''}
                </small>
            </td>
            <td class="txt-centro col-total" style="font-weight: bold; color: var(--text-dark);">$${concept.amount.toFixed(2)}</td>
            <td>${concept.commentary || '-'}</td>
            <td class="txt-centro col-accion">
                <button type="button" class="btn-eliminar-mini" data-index="${index}">❌</button>
            </td>
        `;

        tr.querySelector('.btn-eliminar-mini').addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            alEliminarConcepto(idx);
        });

        cuerpoTabla.appendChild(tr);
    });
}