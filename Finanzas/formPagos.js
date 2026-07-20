(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

    let listaConceptosPagos = [];
    let categoriasCargadas = [];
    let contratosCargados = [];
    let idCategoryContratoActivo = null;

    document.addEventListener('DOMContentLoaded', () => {
        inicializarCamposFechas();
        establecerSolicitanteLogueado();
        cargarSelectoresIniciales();
        configurarEventos();
        renderizarMiniTabla();
    });

    function inicializarCamposFechas() {
        const inputFecha = document.getElementById('fecha');
        const inputSemana = document.getElementById('semana-fiscal');
        if (!inputFecha || !inputSemana) return;

        const hoy = new Date();
        const año = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        
        inputFecha.value = `${año}-${mes}-${dia}`;

        const inicioAño = new Date(año, 0, 1);
        const diasPasados = Math.floor((hoy - inicioAño) / (24 * 60 * 60 * 1000));
        const numeroSemana = Math.ceil((diasPasados + inicioAño.getDay() + 1) / 7);
        
        inputSemana.value = `Semana ${numeroSemana}`;
    }

    function establecerSolicitanteLogueado() {
        const inputSolicitante = document.getElementById('solicitante');
        if (!inputSolicitante) return;

        try {
            const usuarioSesion = JSON.parse(sessionStorage.getItem('usuarioMODISA'));
            
            if (usuarioSesion && usuarioSesion.id_employee) {
                inputSolicitante.setAttribute('data-id', usuarioSesion.id_employee);

                if (inputSolicitante.tagName === 'SELECT') {
                    inputSolicitante.innerHTML = `<option value="${usuarioSesion.id_employee}" selected>${usuarioSesion.nombre}</option>`;
                } else {
                    inputSolicitante.value = usuarioSesion.nombre;
                }
            } else {
                if (inputSolicitante.tagName === 'SELECT') {
                    inputSolicitante.innerHTML = `<option value="">Usuario Desconocido</option>`;
                } else {
                    inputSolicitante.value = "Usuario Desconocido";
                }
                console.error("❌ No se encontró el id_employee en sessionStorage.");
            }
        } catch (e) {
            console.error("❌ Error al parsear sessionStorage.usuarioMODISA:", e);
            if (inputSolicitante.tagName === 'SELECT') {
                inputSolicitante.innerHTML = `<option value="">Error al recuperar sesión</option>`;
            } else {
                inputSolicitante.value = "Error al recuperar sesión";
            }
        }
    }

    async function cargarSelectoresIniciales() {
        try {

            const resProyectos = await fetch(`${API_URL}/proyectos`);
            if (resProyectos.ok) {
                const proyectos = await resProyectos.json();
                const lista = proyectos.map(p => ({ 
                    id: p.id_project,
                    nombre: p.project_name
                }));
                llenarSelect('proyecto', lista);
            }

            const resContratos = await fetch(`${API_URL}/contratos`);
            if (resContratos.ok) {
                contratosCargados = await resContratos.json();
            }
        } catch (error) {
            console.error("❌ Error inicial:", error);
        }
    }

    function configurarEventos() {
        const selectTipo = document.getElementById('tipo');
        const selectProyecto = document.getElementById('proyecto');
        const selectGrupo = document.getElementById('grupo');
        const selectCategoria = document.getElementById('categoria');
        const btnPago = document.getElementById('btn-pago');
        const formRequisicion = document.getElementById('form-requisicion');

        if (selectTipo) {
            selectTipo.addEventListener('change', (e) => {
                const tipoSeleccionado = e.target.value;
                const bloqueClave = document.getElementById('bloque-clave-contrato');
                const bloqueTicket = document.getElementById('bloque-ticket');
                const inputTicket = document.getElementById('ticketFile');
                const inputProveedor = document.getElementById('proveedor');
                
                restaurarControlesCascada(true);

                if (tipoSeleccionado === 'cajaChica') {
                    if (bloqueTicket) bloqueTicket.style.display = 'block';
                    if (inputTicket) inputTicket.required = true;
                } else {
                    if (bloqueTicket) bloqueTicket.style.display = 'none';
                    if (inputTicket) {
                        inputTicket.required = false;
                        inputTicket.value = '';
                    }
                }

                if (tipoSeleccionado === 'contratista') {
                    if (bloqueClave) bloqueClave.style.display = 'block';
                    if (inputProveedor) {
                        inputProveedor.value = '';
                        inputProveedor.readOnly = true;
                        inputProveedor.style.backgroundColor = '#f1f5f9';
                        inputProveedor.style.cursor = 'not-allowed';
                        inputProveedor.placeholder = "Se autocompletará mediante el contrato";
                    }
                    filtrarContratosPorProyectoActive();
                } else {
                    if (bloqueClave) bloqueClave.style.display = 'none';
                    const selectClave = document.getElementById('claveContrato');
                    if (selectClave) selectClave.value = '';
                    
                    if (inputProveedor) {
                        inputProveedor.value = '';
                        inputProveedor.readOnly = false;
                        inputProveedor.style.backgroundColor = '';
                        inputProveedor.style.cursor = '';
                        inputProveedor.placeholder = "Nombre del proveedor o comercio";
                    }

                    ejecutarCascadaFiltrosConceptos();
                }
            });
        }

        const selectClaveContrato = document.getElementById('claveContrato');
        if (selectClaveContrato) {
            selectClaveContrato.addEventListener('change', (e) => {
                const idContratoSelected = e.target.value;
                const contrato = contratosCargados.find(c => String(c.id_contract) === String(idContratoSelected));

                if (!contrato) {
                    restaurarControlesCascada(true);
                    const provInput = document.getElementById('proveedor');
                    if (provInput) provInput.value = '';
                    idCategoryContratoActivo = null; 
                    return;
                }

                const provInput = document.getElementById('proveedor');
                if (provInput) provInput.value = contrato.supplier || '';
                
                idCategoryContratoActivo = contrato.id_project_category || null;

                inyectarOpcionBloqueada('grupo', contrato.grupo);
                inyectarOpcionBloqueada('categoria', contrato.categoria);
                inyectarOpcionBloqueada('subcategoria', contrato.subcategoria);
            });
        }

        const calcularMonto = () => {
            const cantidadInput = document.getElementById('cantidad');
            const precioInput = document.getElementById('precioUnitario');
            const montoInput = document.getElementById('monto');
            
            const cantidad = cantidadInput ? parseFloat(cantidadInput.value) || 0 : 0;
            const precio = precioInput ? parseFloat(precioInput.value) || 0 : 0;
            
            if (montoInput) {
                montoInput.value = (cantidad > 0 && precio > 0) ? (cantidad * precio).toFixed(2) : '';
            }
        };

        const inputCantidad = document.getElementById('cantidad');
        const inputPrecioUnitario = document.getElementById('precioUnitario');
        if (inputCantidad) inputCantidad.addEventListener('input', calcularMonto);
        if (inputPrecioUnitario) inputPrecioUnitario.addEventListener('input', calcularMonto);

        if (selectProyecto) {
            selectProyecto.addEventListener('change', async (e) => {
                const idProyecto = e.target.value;
                const inputProveedor = document.getElementById('proveedor');
                if (!idProyecto) {
                    restaurarControlesCascada(true);
                    return;
                }

                if (selectTipo && selectTipo.value === 'contratista') {
                    filtrarContratosPorProyectoActive();
                    restaurarControlesCascada(true);
                    if (inputProveedor) inputProveedor.value = '';
                    return;
                }

                try {
                    const res = await fetch(`${API_URL}/proyectos/${idProyecto}/categorias`);

                    if (res.ok) {
                        categoriasCargadas = await res.json();
                        ejecutarCascadaFiltrosConceptos();
                    }
                } catch (error) {
                    console.error("❌ Error al cargar categorías de la obra:", error);
                }
            });
        }

        if (selectGrupo) {
            selectGrupo.addEventListener('change', (e) => {
                if (selectTipo && selectTipo.value === 'contratista') return;
                const grupoSeleccionado = e.target.value;
                
                const filtradas = categoriasCargadas.filter(c => String(c.grupo) === String(grupoSeleccionado));
                const categoriesUnicas = [...new Set(filtradas.map(c => c.categoria))];
                
                llenarSelectSencillo('categoria', categoriesUnicas);
                llenarSelectSencillo('subcategoria', []);
            });
        }

        if (selectCategoria) {
            selectCategoria.addEventListener('change', (e) => {
                if (selectTipo && selectTipo.value === 'contratista') return;
                const catSeleccionada = e.target.value;
                const selectGrupoElem = document.getElementById('grupo');
                const grupoSeleccionado = selectGrupoElem ? selectGrupoElem.value : '';
                
                const filtradas = categoriasCargadas.filter(c => 
                    String(c.grupo) === String(grupoSeleccionado) && 
                    String(c.categoria) === String(catSeleccionada)
                );
                const subcategoriasUnicas = [...new Set(filtradas.map(c => c.subcategoria))];
                
                llenarSelectSencillo('subcategoria', subcategoriasUnicas);
            });
        }

        if (btnPago) btnPago.addEventListener('click', añadirConceptoALista);
        if (formRequisicion) formRequisicion.addEventListener('submit', enviarSolicitudFinal);
    }

    function añadirConceptoALista(e) {
        if (e) e.preventDefault();

        const inputConcepto = document.getElementById('conceptoPago');
        const inputUnidad = document.getElementById('unidad');
        const inputCantidad = document.getElementById('cantidad');
        const inputPrecio = document.getElementById('precioUnitario');
        const inputMonto = document.getElementById('monto');
        const inputComentario = document.getElementById('comentario');
        
        const inputGrupo = document.getElementById('grupo');
        const inputCategoria = document.getElementById('categoria');
        const inputSubcategoria = document.getElementById('subcategoria');
        const inputProveedor = document.getElementById('proveedor');
        const selectTipo = document.getElementById('tipo');

        const concepto = inputConcepto ? inputConcepto.value.trim() : '';
        const unidad = inputUnidad ? inputUnidad.value : '';
        const cantidad = inputCantidad ? parseFloat(inputCantidad.value) : 0;
        const precioUnitario = inputPrecio ? parseFloat(inputPrecio.value) : 0;
        const monto = inputMonto ? parseFloat(inputMonto.value) : 0;
        const comentario = inputComentario ? inputComentario.value.trim() : '';
        
        const grupo = inputGrupo ? inputGrupo.value : '';
        const categoria = inputCategoria ? inputCategoria.value : '';
        const subcategoria = inputSubcategoria ? inputSubcategoria.value : '';
        const proveedor = inputProveedor ? inputProveedor.value.trim() : '';
        const tipo = selectTipo ? selectTipo.value : '';

        if (!concepto || isNaN(cantidad) || cantidad <= 0 || isNaN(precioUnitario) || precioUnitario <= 0 || !grupo || !categoria || !subcategoria || !proveedor) {
            alert('⚠️ Error: Completa todos los campos obligatorios del concepto (Grupo, Categoría, Subcategoría, Proveedor, Concepto, Cantidad y Precio).');
            return;
        }

        let idCategoryFinal = null;
        if (tipo === 'contratista') {
            idCategoryFinal = idCategoryContratoActivo;
        } else {
            const registroMatch = categoriasCargadas.find(c => 
                String(c.grupo).trim() === String(grupo).trim() && 
                String(c.categoria).trim() === String(categoria).trim() && 
                String(c.subcategoria).trim() === String(subcategoria).trim()
            );
            idCategoryFinal = registroMatch ? registroMatch.id_project_category : null;
        }

        const nuevoConcepto = {
            id_project_category: idCategoryFinal, 
            provider_name: proveedor,
            concept_description: concepto,
            unit: unidad,
            quantity: cantidad,
            price_unit: precioUnitario, 
            amount: monto,
            commentary: comentario || null
        };

        listaConceptosPagos.push(nuevoConcepto);
        renderizarMiniTabla();

        if (inputConcepto) inputConcepto.value = '';
        if (inputCantidad) inputCantidad.value = '';
        if (inputPrecio) inputPrecio.value = '';
        if (inputMonto) inputMonto.value = '';
        if (inputComentario) inputComentario.value = '';
        
        if (tipo !== 'contratista' && inputProveedor) {
            inputProveedor.value = '';
        }
        if (inputUnidad) inputUnidad.value = 'PZA';
    }

    async function enviarSolicitudFinal(e) {
        if (e) e.preventDefault(); 

        if (listaConceptosPagos.length === 0) {
            alert('❌ Error: No has añadido ningún concepto a la lista.');
            return;
        }

        const idProyecto = document.getElementById('proyecto').value;
        
        const inputSolicitanteElem = document.getElementById('solicitante');
        const idSolicitante = inputSolicitanteElem 
            ? (inputSolicitanteElem.getAttribute('data-id') || inputSolicitanteElem.value)
            : null;

        const tipo = document.getElementById('tipo').value;
        const formaPago = document.getElementById('formaPago').value;
        const fileInput = document.getElementById('ticketFile');
        const fecha = document.getElementById('fecha').value;
        const semanaTexto = document.getElementById('semana-fiscal').value;

        if (!idProyecto || !idSolicitante || !tipo || !formaPago || !fecha || !semanaTexto) {
            alert('⚠️ Campos de orden incompletos: Valida que Proyecto, Solicitante, Tipo y Forma de pago estén seleccionados.');
            return;
        }

        if (tipo === 'cajaChica' && (!fileInput.files || fileInput.files.length === 0)) {
            alert('❌ Error: Es obligatorio cargar la fotografía del ticket para Caja Chica.');
            return;
        }

        const semanaNumero = parseInt(semanaTexto.replace(/[^0-9]/g, '')) || 0;

        const formData = new FormData();
        formData.append('id_project', parseInt(idProyecto));
        formData.append('id_employee', parseInt(idSolicitante));
        formData.append('request_date', fecha);
        formData.append('fiscal_week', semanaNumero);
        formData.append('payment_type', tipo);
        formData.append('payment_method', formaPago);
        formData.append('conceptos', JSON.stringify(listaConceptosPagos));

        if (tipo === 'cajaChica' && fileInput.files[0]) {
            formData.append('ticketFile', fileInput.files[0]);
        }

        try {
            const res = await fetch(`${API_URL}/pagos`, {
                method: 'POST',
                body: formData
            });

            const datos = await res.json();
            if (!res.ok) throw new Error(datos.error || 'Error en el servidor.');

            alert(`🚀 ¡Solicitud de pago y ticket guardados con éxito!`);
            
            listaConceptosPagos = [];
            document.getElementById('form-requisicion').reset();
            
            // MODIFICADO: Restablecemos los valores del solicitante logueado tras el reset del formulario
            establecerSolicitanteLogueado();

            restaurarControlesCascada(true);
            
            const bloqueTicket = document.getElementById('bloque-ticket');
            const bloqueClave = document.getElementById('bloque-clave-contrato');
            if (bloqueTicket) bloqueTicket.style.display = 'none';
            if (bloqueClave) bloqueClave.style.display = 'none';

            const inputProveedor = document.getElementById('proveedor');
            if (inputProveedor) {
                inputProveedor.value = '';
                inputProveedor.readOnly = false;
                inputProveedor.style.backgroundColor = '';
                inputProveedor.style.cursor = '';
                inputProveedor.placeholder = "Nombre del proveedor o comercio";
            }
            
            inicializarCamposFechas();
            renderizarMiniTabla();
        } catch (error) {
            alert(`❌ Error al guardar la solicitud: ${error.message}`);
        }
    }

    function renderizarMiniTabla() {
        const contenedorVacio = document.getElementById('tabla-conceptos-vacia');
        const tablaElemento = document.getElementById('tabla-mini-conceptos');
        const cuerpoTabla = document.getElementById('cuerpo-mini-tabla');

        if (!cuerpoTabla) return;
        cuerpoTabla.innerHTML = '';

        if (listaConceptosPagos.length === 0) {
            if (contenedorVacio) contenedorVacio.style.display = 'block';
            if (tablaElemento) tablaElemento.style.display = 'none';
            return;
        }

        if (contenedorVacio) contenedorVacio.style.display = 'none';
        if (tablaElemento) tablaElemento.style.display = 'table';

        listaConceptosPagos.forEach((concept, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${concept.concept_description}</strong><br>
                    <small style="color: #666;">Prov: ${concept.provider_name}</small>
                </td>
                <td class="txt-centro">${concept.quantity}</td>
                <td class="txt-centro">${concept.unit}</td>
                <td class="txt-centro">$${concept.price_unit.toFixed(2)}</td>
                <td class="txt-centro" style="font-weight: bold; color: var(--text-dark);">$${concept.amount.toFixed(2)}</td>
                <td>${concept.commentary || '-'}</td>
                <td class="txt-centro">
                    <button type="button" class="btn-eliminar-mini" data-index="${index}">❌</button>
                </td>
            `;

            tr.querySelector('.btn-eliminar-mini').addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                listaConceptosPagos.splice(idx, 1);
                renderizarMiniTabla();
            });

            cuerpoTabla.appendChild(tr);
        });
    }

    function filtrarContratosPorProyectoActive() {
        const idProyecto = document.getElementById('proyecto').value;
        const selectClave = document.getElementById('claveContrato');
        if (!selectClave) return;

        if (!idProyecto) {
            selectClave.innerHTML = `<option value="">-- Selecciona Proyecto Primero --</option>`;
            return;
        }

        const selectProyecto = document.getElementById('proyecto');
        const textoProyecto = selectProyecto.options[selectProyecto.selectedIndex].text;
        const contratosFiltrados = contratosCargados.filter(c => c.project_name === textoProyecto);

        selectClave.innerHTML = `<option value="">-- Selecciona Contrato --</option>` + 
            contratosFiltrados.map(c => `<option value="${c.id_contract}">${c.contract_key} (${c.supplier})</option>`).join('');
    }

    function inyectarOpcionBloqueada(idSelect, valor) {
        const el = document.getElementById(idSelect);
        if (!el) return;
        const val = valor ? valor.trim() : '---';
        el.innerHTML = `<option value="${val}" selected>${val}</option>`;
        el.disabled = true;
        el.style.backgroundColor = '#f1f5f9';
        el.style.cursor = 'not-allowed';
    }

    function restaurarControlesCascada(limpiarTodo = false) {
        idCategoryContratoActivo = null; 
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

    function llenarSelect(id, lista) {
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

    function llenarSelectSencillo(id, lista) {
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

    function ejecutarCascadaFiltrosConceptos() {
        const selectTipo = document.getElementById('tipo');
        const selectProyecto = document.getElementById('proyecto');
        
        if (selectProyecto && selectProyecto.value && selectTipo && selectTipo.value !== 'contratista' && categoriasCargadas.length > 0) {
            const gruposUnicos = [...new Set(categoriasCargadas.map(c => c.grupo))];
            llenarSelectSencillo('grupo', gruposUnicos);
            llenarSelectSencillo('categoria', []);
            llenarSelectSencillo('subcategoria', []);
        }
    }
})();