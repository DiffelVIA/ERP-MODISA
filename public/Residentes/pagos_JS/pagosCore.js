// public/Finanzas/pagos_Js/pagosCore.js
import { 
    limpiarTexto, 
    inicializarCamposFechas, 
    establecerSolicitanteLogueado, 
    llenarSelect, 
    llenarSelectSencillo, 
    inyectarOpcionBloqueada, 
    restaurarControlesCascada, 
    filtrarContratosPorProyectoActive, 
    ejecutarCascadaFiltrosConceptos, 
    renderizarMiniTabla 
} from './pagosUi.js';

import { 
    cargarSelectoresIniciales, 
    obtenerSaldoContrato, 
    obtenerCategoriasProyecto, 
    enviarPagosServidor 
} from './pagosNotif.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

let listaConceptosPagos = [];
let categoriasCargadas = [];
let contratosCargados = [];
let idCategoryContratoActivo = null;
let idContratoActivo = null;

function obtenerRolDesdeJWT() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return '';
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return '';
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        return payload.rol || payload.role || payload.job_title || '';
    } catch (e) {
        console.error("❌ Error al decodificar JWT:", e);
        return '';
    }
}

function obtenerRolActualLimpio() {
    const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const ROL_RAW = (usuarioSesion && usuarioSesion.rol) 
        ? usuarioSesion.rol 
        : (obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '');
    return limpiarTexto(ROL_RAW);
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarCamposFechas();
    establecerSolicitanteLogueado();
    
    const resInicial = await cargarSelectoresIniciales(API_URL, obtenerRolActualLimpio, obtenerRolDesdeJWT, llenarSelect);
    contratosCargados = resInicial.contratos;

    configurarEventos();
    renderizarMiniTabla(listaConceptosPagos, eliminarConcepto);
});

function eliminarConcepto(index) {
    listaConceptosPagos.splice(index, 1);
    renderizarMiniTabla(listaConceptosPagos, eliminarConcepto);
}

function configurarEventos() {
    const selectTipo = document.getElementById('tipo');
    const selectProyecto = document.getElementById('proyecto');
    const selectGrupo = document.getElementById('grupo');
    const selectCategoria = document.getElementById('categoria');
    const btnPago = document.querySelector('[data-action="añadir"]');
    const formRequisicion = document.getElementById('form-requisicion');

    if (selectTipo) {
        selectTipo.addEventListener('change', (e) => {
            const tipoSeleccionado = e.target.value;
            const bloqueClave = document.getElementById('bloque-clave-contrato');
            const bloqueTicket = document.getElementById('bloque-ticket');
            const bloqueExcel = document.getElementById('bloque-excel');
            const inputTicket = document.getElementById('ticketFile');
            const inputExcel = document.getElementById('excelFile');
            const inputProveedor = document.getElementById('proveedor');
            
            restaurarControlesCascada({ idCategoryContratoActivo, idContratoActivo }, true);

            if (tipoSeleccionado === 'cajaChica' || tipoSeleccionado === 'maquinariaEquipo' || tipoSeleccionado === 'maquinaria') {
                if (bloqueTicket) bloqueTicket.style.display = 'block';
                if (inputTicket) inputTicket.required = true;
            } else {
                if (bloqueTicket) bloqueTicket.style.display = 'none';
                if (inputTicket) {
                    inputTicket.required = false;
                    inputTicket.value = '';
                }
            }

            if (tipoSeleccionado === 'manoObra') {
                if (bloqueExcel) bloqueExcel.style.display = 'block';
                if (inputExcel) inputExcel.required = true;
            } else {
                if (bloqueExcel) bloqueExcel.style.display = 'none';
                if (inputExcel) { inputExcel.required = false; inputExcel.value = ''; }
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
                filtrarContratosPorProyectoActive(contratosCargados);
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

                ejecutarCascadaFiltrosConceptos(categoriasCargadas);
            }
        });
    }

    const selectClaveContrato = document.getElementById('claveContrato');
    if (selectClaveContrato) {
        selectClaveContrato.addEventListener('change', (e) => {
            const idContratoSelected = e.target.value;
            const contrato = contratosCargados.find(c => String(c.id_contract) === String(idContratoSelected));

            if (!contrato) {
                restaurarControlesCascada({ idCategoryContratoActivo, idContratoActivo }, true);
                const provInput = document.getElementById('proveedor');
                if (provInput) provInput.value = '';
                idCategoryContratoActivo = null; 
                idContratoActivo = null;
                return;
            }

            const provInput = document.getElementById('proveedor');
            if (provInput) provInput.value = contrato.supplier || '';
        
            idContratoActivo = contrato.id_contract ? parseInt(contrato.id_contract) : null;
            idCategoryContratoActivo = contrato.id_project_category ? parseInt(contrato.id_project_category) : null;

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
                restaurarControlesCascada({ idCategoryContratoActivo, idContratoActivo }, true);
                return;
            }

            if (selectTipo && selectTipo.value === 'contratista') {
                filtrarContratosPorProyectoActive(contratosCargados);
                restaurarControlesCascada({ idCategoryContratoActivo, idContratoActivo }, true);
                if (inputProveedor) inputProveedor.value = '';
                return;
            }

            try {
                categoriasCargadas = await obtenerCategoriasProyecto(API_URL, idProyecto);
                ejecutarCascadaFiltrosConceptos(categoriasCargadas);
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

async function añadirConceptoALista(e) {
    if (e) e.preventDefault();
    
    const selectProyecto = document.getElementById('proyecto');
    const idProyectoSel = selectProyecto ? selectProyecto.value : '';
    const nombreProyectoSel = (selectProyecto && selectProyecto.selectedIndex >= 0) 
        ? selectProyecto.options[selectProyecto.selectedIndex].text 
        : '';

    const inputConcepto = document.getElementById('conceptoPago');
    const inputMonto = document.getElementById('monto');
    const inputComentario = document.getElementById('comentario');
    const inputGrupo = document.getElementById('grupo');
    const inputCategoria = document.getElementById('categoria');
    const inputSubcategoria = document.getElementById('subcategoria');
    const inputProveedor = document.getElementById('proveedor');
    const selectTipo = document.getElementById('tipo');
    const selectFormaPago = document.getElementById('formaPago');
    const inputTicketFile = document.getElementById('ticketFile');
    const inputExcelFile = document.getElementById('excelFile');
    const concepto = inputConcepto ? inputConcepto.value.trim() : '';
    const monto = inputMonto ? parseFloat(inputMonto.value) : 0;
    const comentario = inputComentario ? inputComentario.value.trim() : '';
    const grupo = inputGrupo ? inputGrupo.value : '';
    const categoria = inputCategoria ? inputCategoria.value : '';
    const subcategoria = inputSubcategoria ? inputSubcategoria.value : '';
    const proveedor = inputProveedor ? inputProveedor.value.trim() : '';
    const tipo = selectTipo ? selectTipo.value : '';
    const formaPago = selectFormaPago ? selectFormaPago.value : '';

    if (!idProyectoSel || !tipo || !formaPago || !concepto || isNaN(monto) || monto <= 0 || !proveedor) {
        alert('⚠️ Error: Completa todos los campos obligatorios (Proyecto, Tipo, Forma de Pago, Proveedor, Concepto y Monto).');
        return;
    }

    if (tipo === 'contratista' && idContratoActivo) {
        const contratoSel = contratosCargados.find(c => String(c.id_contract) === String(idContratoActivo));
        if (contratoSel) {
            const montoTotalContrato = parseFloat(contratoSel.total_amount) || 0;
            
            const montoTemporalMiniTabla = listaConceptosPagos
                .filter(item => String(item.id_contract) === String(idContratoActivo))
                .reduce((acc, item) => acc + item.amount, 0);

            try {
                const montoAcumuladoBD = await obtenerSaldoContrato(API_URL, idContratoActivo);
                const saldoDisponible = montoTotalContrato - (montoAcumuladoBD + montoTemporalMiniTabla);

                if (monto > saldoDisponible) {
                    alert(`❌ No se puede solicitar $${monto.toLocaleString('es-MX', {minimumFractionDigits: 2})}.\n\n` +
                          `• Monto Total del Contrato: $${montoTotalContrato.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n` +
                          `• Acumulado Solicitado/Pagado: $${(montoAcumuladoBD + montoTemporalMiniTabla).toLocaleString('es-MX', {minimumFractionDigits: 2})}\n` +
                          `• Saldo Disponible Real: $${Math.max(0, saldoDisponible).toLocaleString('es-MX', {minimumFractionDigits: 2})}` +
                          `\n\nPor favor, comunicate con el área de administración`);
                    return;
                }
            } catch (errSaldo) {
                console.error(" Error al verificar saldo del contrato:", errSaldo);
            }
        }
    }

    if (tipo === 'manoObra' && (!inputExcelFile.files || inputExcelFile.files.length === 0)) {
        alert('❌ Error: Es obligatorio cargar el Excel de desglose para Mano de Obra.');
        return;
    }

    const requiereTicket = (tipo === 'cajaChica' || tipo === 'maquinariaEquipo' || tipo === 'maquinaria');

    if (requiereTicket) {
        if (!inputTicketFile.files || inputTicketFile.files.length === 0) {
            alert('❌ Error: Es obligatorio cargar la fotografía o PDF del ticket.');
            return;
        }

        const archivoTicket = inputTicketFile.files[0];
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        const esPdfPorExt = archivoTicket.name.toLowerCase().endsWith('.pdf');

        if (!tiposPermitidos.includes(archivoTicket.type) && !esPdfPorExt) {
            alert('❌ Error: El comprobante debe ser una imagen (JPG, PNG) o un archivo PDF.');
            return;
        }
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
        id_project: parseInt(idProyectoSel),
        nombre_proyecto: nombreProyectoSel,
        id_project_category: idCategoryFinal, 
        id_contract: (tipo === 'contratista') ? idContratoActivo : null,
        payment_type: tipo,
        payment_method: formaPago,
        provider_name: proveedor,
        concept_description: concepto,
        amount: monto,
        commentary: comentario || null,
        ticketFile: (requiereTicket && inputTicketFile.files[0]) ? inputTicketFile.files[0] : null,
        excelFile: (tipo === 'manoObra' && inputExcelFile.files[0]) ? inputExcelFile.files[0] : null
    };

    listaConceptosPagos.push(nuevoConcepto);
    renderizarMiniTabla(listaConceptosPagos, eliminarConcepto);

    if (inputConcepto) inputConcepto.value = '';
    if (inputMonto) inputMonto.value = '';
    if (inputComentario) inputComentario.value = '';
    if (selectTipo) selectTipo.value = '';
    if (selectFormaPago) selectFormaPago.value = '';
    if (inputTicketFile) inputTicketFile.value = '';
    
    if (inputProveedor) {
        inputProveedor.value = '';
        inputProveedor.readOnly = false;
        inputProveedor.style.backgroundColor = '';
        inputProveedor.style.cursor = '';
        inputProveedor.placeholder = "Nombre del proveedor o comercio";
    }

    const bloqueTicket = document.getElementById('bloque-ticket');
    const bloqueClave = document.getElementById('bloque-clave-contrato');
    if (bloqueTicket) bloqueTicket.style.display = 'none';
    if (bloqueClave) bloqueClave.style.display = 'none';

    const selectClave = document.getElementById('claveContrato');
    if (selectClave) selectClave.value = '';

    restaurarControlesCascada({ idCategoryContratoActivo, idContratoActivo }, true);
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
    const fecha = document.getElementById('fecha').value;
    const semanaTexto = document.getElementById('semana-fiscal').value;

    if (!idProyecto || !idSolicitante || !fecha || !semanaTexto) {
        alert('⚠️ Campos de orden incompletos: Valida que Proyecto, Solicitante y Fecha estén seleccionados.');
        return;
    }

    const btnEnviar = document.querySelector('[data-action="enviar"]');
    const textoOriginalBtn = btnEnviar ? btnEnviar.innerHTML : '🚀 Enviar Solicitud';

    if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '⏳ Guardando Solicitud...';
    }

    const semanaNumero = parseInt(semanaTexto.replace(/[^0-9]/g, '')) || 0;
    const primerConcepto = listaConceptosPagos[0];
    const paymentTypeHeader = primerConcepto.payment_type || '';
    const paymentMethodHeader = primerConcepto.payment_method || '';

    const conceptosMapeados = listaConceptosPagos.map(({ ticketFile, excelFile, ...resto }, index) => ({
        ...resto,
        hasTicket: !!(ticketFile && ticketFile instanceof File),
        ticketKey: (ticketFile && ticketFile instanceof File) ? `ticketFile_${index}` : null
    }));

    const formData = new FormData();
    formData.append('id_project', parseInt(idProyecto));
    formData.append('id_employee', parseInt(idSolicitante));
    formData.append('request_date', fecha);
    formData.append('fiscal_week', semanaNumero);
    formData.append('payment_type', paymentTypeHeader);
    formData.append('payment_method', paymentMethodHeader);
    formData.append('conceptos', JSON.stringify(conceptosMapeados));

    listaConceptosPagos.forEach((item, index) => {
        if (item.ticketFile && item.ticketFile instanceof File) {
            formData.append(`ticketFile_${index}`, item.ticketFile, item.ticketFile.name);
        }
    });

    const conceptoExcel = listaConceptosPagos.find(item => item.excelFile && item.excelFile instanceof File);
    if (conceptoExcel && conceptoExcel.excelFile) {
        formData.append('excelFile', conceptoExcel.excelFile, conceptoExcel.excelFile.name);
    }

    try {
        await enviarPagosServidor(API_URL, formData);

        alert(`🚀 ¡Solicitud de pago guardada con éxito!`);
        
        listaConceptosPagos = [];
        document.getElementById('form-requisicion').reset();
        
        establecerSolicitanteLogueado();
        restaurarControlesCascada({ idCategoryContratoActivo, idContratoActivo }, true);
        
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
        renderizarMiniTabla(listaConceptosPagos, eliminarConcepto);
    } catch (error) {
        alert(`❌ Error al guardar la solicitud: ${error.message}`);
    } finally {
        if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = textoOriginalBtn;
        }
    }
}