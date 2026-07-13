const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api' 
  : 'https://erp-modisa.onrender.com/api';

let todosLosCreditos = [];

document.addEventListener('DOMContentLoaded', () => {
    // --- 🔒 BLINDAJE DE SEGURIDAD Y ROLES ---
    const rolRaw = localStorage.getItem("userRol");
    const rolUsuario = rolRaw ? rolRaw.trim().toLowerCase() : null;

    // Solo estos roles pueden ver esta sección
    const rolesPermitidosCreditos = [
        "gerente administración", 
        "director operativo", 
        "director general", 
        "compras"
    ];

    if (!rolUsuario || !rolesPermitidosCreditos.includes(rolUsuario)) {
        // Busca el contenedor principal de la página (ajusta la clase si usas otra como .main-creditos)
        const mainContent = document.querySelector('.main-tabla') || document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
                    <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px; font-weight: bold;">Acceso Denegado</h1>
                    <p style="color: #64748b; font-size: 16px; max-width: 400px; margin: 0 auto 30px auto; line-height: 1.5;">
                        No tienes los permisos necesarios para ver la sección de Créditos.
                    </p>
                </div>
            `;
        }
        return; // Corta la ejecución del script por completo
    }
    // ----------------------------------------

    // Si pasa el filtro, se ejecuta el resto con normalidad
    fetchCreditos();
    configurarEventosFiltros();
});

async function fetchCreditos() {
    try {
        const response = await fetch(`${API_URL}/creditos`);
        if (!response.ok) throw new Error('Error en la API');
        
        todosLosCreditos = await response.json();
        renderTabla(todosLosCreditos);
        generarFiltrosDropdown(todosLosCreditos);
        
    } catch (error) {
        console.error(error);
        document.getElementById('cuerpo-tabla-creditos').innerHTML = 
            `<tr><td colspan="10" style="text-align:center; color:red; padding:20px;">Error al cargar datos.</td></tr>`;
    }
}

function renderTabla(datos) {
    const tbody = document.getElementById('cuerpo-tabla-creditos');
    tbody.innerHTML = '';

    if (datos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px;">No hay registros.</td></tr>`;
        return;
    }

    const rolRaw = localStorage.getItem("userRol");
    const rolUsuario = rolRaw ? rolRaw.trim().toLowerCase() : "";
    // Solo estos dos roles tienen permiso de escribir/modificar montos y estatus
    const puedeEditar = (rolUsuario === "compras" || rolUsuario === "gerente administración");

    datos.forEach(credito => {
        const tr = document.createElement('tr');
        
        const fechaEmision = credito.emission_date ? new Date(credito.emission_date).toLocaleDateString('es-MX') : '-';
        const fechaVencimiento = credito.due_date ? new Date(credito.due_date).toLocaleDateString('es-MX') : '-';
        const total = parseFloat(credito.amount || 0);
        const pagado = parseFloat(credito.amount_paid || 0);

        let claseTiempo = 'badge-activo';
        let emojiTiempo = '⏳'; 

        if (credito.status === 'Cancelado') {
            claseTiempo = 'badge-cancelado';
            emojiTiempo = '❌';
        } else if (credito.status === 'Pagado') {
            claseTiempo = 'badge-pagado';
            emojiTiempo = '✅';
        } else if (credito.tiempo_credito === 'Vencido') {
            claseTiempo = 'badge-vencido';
            emojiTiempo = '🚨';
        }

        const textoEstatusTiempo = credito.status === 'Cancelado' || credito.status === 'Pagado' ? credito.status : credito.tiempo_credito;

        tr.innerHTML = `
            <td><strong>${credito.provider_name}</strong></td>
            <td><small>${credito.reference_invoice || '-'}</small></td>
            <td>${fechaEmision}</td>
            <td>${fechaVencimiento}</td>
            <td><span class="badge-tiempo ${claseTiempo}">${emojiTiempo} ${textoEstatusTiempo}</span></td>
            <td>${credito.project_name}</td>
            <td><strong>$${total.toFixed(2)}</strong></td>
            <td>
                <input type="number" step="0.01" class="input-tabla input-pago" 
                       value="${pagado.toFixed(2)}" id="pago-${credito.id_credit}">
            </td>
            <td>
                <select class="select-tabla" id="status-${credito.id_credit}">
                    <option value="Pendiente" ${credito.status === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                    <option value="Pagado" ${credito.status === 'Pagado' ? 'selected' : ''}>✅ Pagado</option>
                    <option value="Cancelado" ${credito.status === 'Cancelado' ? 'selected' : ''}>❌ Cancelado</option>
                </select>
            </td>
            <td>
                <input type="text" class="input-tabla input-obs" 
                       value="${credito.observations || ''}" placeholder="Añadir nota..." id="obs-${credito.id_credit}">
            </td>
        `;

        const inputPago = tr.querySelector(`#pago-${credito.id_credit}`);
        const selectStatus = tr.querySelector(`#status-${credito.id_credit}`);
        const inputObs = tr.querySelector(`#obs-${credito.id_credit}`);

        // Si no tiene permisos de edición, deshabilitamos los inputs en la fila
        if (!puedeEditar) {
            if (inputPago) inputPago.disabled = true;
            if (selectStatus) selectStatus.disabled = true;
            if (inputObs) inputObs.disabled = true;
        }

        const ejecutarActualizacionAutomatica = async () => {
            if (!puedeEditar) return; // Protección extra a nivel lógico

            const currentPago = parseFloat(inputPago.value) || 0;
            let currentStatus = selectStatus.value;
            const currentObs = inputObs.value.trim();

            if (currentStatus !== 'Cancelado') {
                if (currentPago >= total && total > 0) {
                    currentStatus = 'Pagado';
                    selectStatus.value = 'Pagado';
                } else {
                    currentStatus = 'Pendiente';
                    selectStatus.value = 'Pendiente';
                }
            }

            const creditoEnListaMaestra = todosLosCreditos.find(c => c.id_credit === credito.id_credit);
            if (creditoEnListaMaestra) {
                creditoEnListaMaestra.amount_paid = currentPago;
                creditoEnListaMaestra.status = currentStatus;
                creditoEnListaMaestra.observations = currentObs;
            }

            const badgeTiempo = tr.querySelector('.badge-tiempo');
            if (badgeTiempo) {
                badgeTiempo.classList.remove('badge-activo', 'badge-pagado', 'badge-cancelado', 'badge-vencido');
                
                if (currentStatus === 'Cancelado') {
                    badgeTiempo.classList.add('badge-cancelado');
                    badgeTiempo.innerHTML = `❌ Cancelado`;
                } else if (currentStatus === 'Pagado') {
                    badgeTiempo.classList.add('badge-pagado');
                    badgeTiempo.innerHTML = `✅ Pagado`;
                } else {
                    if (credito.tiempo_credito === 'Vencido') {
                        badgeTiempo.classList.add('badge-vencido');
                        badgeTiempo.innerHTML = `🚨 Vencido`;
                    } else {
                        badgeTiempo.classList.add('badge-activo');
                        badgeTiempo.innerHTML = `⏳ Activo`;
                    }
                }
            }

            try {
                await fetch(`${API_URL}/creditos/${credito.id_credit}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount_paid: currentPago, status: currentStatus, observations: currentObs })
                });
            } catch (err) {
                console.error('Error en actualización automática:', err);
            }
        };

        inputPago.addEventListener('blur', ejecutarActualizacionAutomatica);
        selectStatus.addEventListener('change', ejecutarActualizacionAutomatica);
        inputObs.addEventListener('blur', ejecutarActualizacionAutomatica);

        tbody.appendChild(tr);
    });
}

function generarFiltrosDropdown(datos) {
    const obras = [...new Set(datos.map(d => d.project_name))].sort();
    const proveedores = [...new Set(datos.map(d => d.provider_name))].sort();
    const estados = ['Pendiente', 'Pagado', 'Cancelado', 'Vencido', 'Activo'];

    llenarContenedorFiltro('filtroObra', obras, 'obra');
    llenarContenedorFiltro('filtroProveedor', proveedores, 'proveedor');
    llenarContenedorFiltro('filtroEstado', estados, 'estado');
}

function llenarContenedorFiltro(idContenedor, elementos, tipo) {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;
    contenedor.innerHTML = elementos.map(elem => `
        <label class="opcion-filtro">
            <input type="checkbox" value="${elem}" data-tipo="${tipo}" class="filtro-check">
            <span>${elem}</span>
        </label>
    `).join('');
    
    contenedor.querySelectorAll('.filtro-check').forEach(check => {
        check.addEventListener('change', aplicarFiltrosCombinados);
    });
}

function aplicarFiltrosCombinados() {
    const checks = Array.from(document.querySelectorAll('.filtro-check:checked'));
    if (checks.length === 0) {
        renderTabla(todosLosCreditos);
        return;
    }

    const filtrosSeleccionados = { obra: [], proveedor: [], estado: [] };
    checks.forEach(c => filtrosSeleccionados[c.dataset.tipo].push(c.value));

    const datosFiltrados = todosLosCreditos.filter(item => {
        const matchObra = filtrosSeleccionados.obra.length === 0 || filtrosSeleccionados.obra.includes(item.project_name);
        const matchProv = filtrosSeleccionados.proveedor.length === 0 || filtrosSeleccionados.proveedor.includes(item.provider_name);
        const estadoActual = item.status === 'Cancelado' || item.status === 'Pagado' ? item.status : item.tiempo_credito;
        const matchEstado = filtrosSeleccionados.estado.length === 0 || filtrosSeleccionados.estado.includes(estadoActual) || filtrosSeleccionados.estado.includes(item.status);

        return matchObra && matchProv && matchEstado;
    });

    renderTabla(datosFiltrados);
}

function configurarEventosFiltros() {
    document.querySelectorAll('.btn-dropdown').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const contenido = e.target.nextElementSibling;
            if (!contenido) return;
            const estaAbierto = contenido.style.display === 'block';
            document.querySelectorAll('.contenido-dropdown').forEach(d => d.style.display = 'none');
            contenido.style.display = estaAbierto ? 'none' : 'block';
            e.stopPropagation();
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.contenido-dropdown').forEach(d => d.style.display = 'none');
    });
    
    document.querySelectorAll('.contenido-dropdown').forEach(d => {
        d.addEventListener('click', (e) => e.stopPropagation());
    });
}