(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

    let esResidente = false;

    (() => {
        const rolUsuario = localStorage.getItem("userRol");
        const sesionRaw = sessionStorage.getItem("usuarioMODISA");
        const puestosAutorizados = [
            "Gerente Administración",
            "Compras",
            "Director General",
            "Director Operativo",
            "Gerente de Costos",
            "Auxiliar Costos",
            "Residente de Obra"
        ];

        if (!rolUsuario || !sesionRaw || !puestosAutorizados.includes(rolUsuario.trim())) {
            document.addEventListener('DOMContentLoaded', () => {
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
            });
            throw new Error("Acceso denegado: Usuario no autorizado para ver esta sección.");
        }

        if (rolUsuario.trim() === "Residente de Obra") {
            esResidente = true;
        }
    })();

    let concentradoMateriales = [];
    let materialesFiltrados = [];
    let listaProyectosGlobal = [];

    let filtroObra;
    let filtroSolicitante;
    let filtroEstado;
    let filtroProveedor;
    let filtroFecha;
    let filtroSemana;
    let cuerpoTabla;

    document.addEventListener('DOMContentLoaded', () => {
        cuerpoTabla = document.querySelector('.cuerpoTabla');
        filtroObra = document.getElementById("filtroObra");
        filtroSolicitante = document.getElementById("filtroSolicitante");
        filtroEstado = document.getElementById("filtroEstado");
        filtroProveedor = document.getElementById("filtroProveedor");
        filtroFecha = document.getElementById("filtroFecha");
        filtroSemana = document.getElementById("filtroSemana");

        inicializarDatos();
        configurarDropdowns();

        document.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('chk-obra') ||
                e.target.classList.contains('chk-solicitante') ||
                e.target.classList.contains('chk-estado') ||
                e.target.classList.contains('chk-proveedor') ||
                e.target.classList.contains('chk-fecha') ||
                e.target.classList.contains('chk-semana')
            ) {
                aplicarFiltros();
            }
        });

        const btnDescargar = document.getElementById("descargar");
        if (btnDescargar) {
            btnDescargar.removeEventListener('click', generarOrdenCompraPDF); 
            btnDescargar.addEventListener('click', generarOrdenCompraPDF);
        }

        if (esResidente) {
            if (btnDescargar) btnDescargar.style.display = "none";

            const filtroProvContenedor = document.getElementById("filtroProveedor")?.closest('.filtros');
            if (filtroProvContenedor) filtroProvContenedor.style.display = "none";

            const encabezados = document.querySelectorAll('thead th, table th');
            encabezados.forEach(th => {
                const texto = th.textContent.toLowerCase().trim();
                if (
                    texto.includes('proveedor') || 
                    texto.includes('precio') || 
                    texto.includes('monto') || 
                    texto.includes('total') || 
                    texto.includes('referencia')
                ) {
                    th.style.display = 'none';
                }
            });
        }
    });

    async function inicializarDatos() {
        try {
            cuerpoTabla.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 25px;">⏳ Cargando materiales desde la base de datos...</td></tr>`;

            const rolParaHeaders = localStorage.getItem("userRol") || '';

            const [resMateriales, resProyectos] = await Promise.all([
                fetch(`${API_URL}/materiales`, {
                    method: 'GET',
                    headers: {
                        'x-user-rol': rolParaHeaders
                    }
                }),
                fetch(`${API_URL}/proyectos`)
            ]);
            
            if (!resMateriales.ok || !resProyectos.ok) {
                throw new Error("Error en el servidor.");
            }

            concentradoMateriales = await resMateriales.json();
            listaProyectosGlobal = await resProyectos.json();

            materialesFiltrados = [...concentradoMateriales];

            generarOpcionesFiltros(concentradoMateriales);
            renderizarTabla(concentradoMateriales);
        } catch (error) {
            console.error("Error al conectar con el backend de materiales:", error);
            cuerpoTabla.innerHTML = `
                <tr>
                    <td colspan="15" style="text-align: center; color: red; padding: 25px; font-weight: bold;">
                        ❌ Error al cargar datos: ${error.message}. Verifica que el servidor esté encendido.
                    </td>
                </tr>
            `;
        }
    }

    function generarOpcionesFiltros(datos) {
        if (!datos || datos.length === 0) return;

        const obrasSeleccionadas = Array.from(document.querySelectorAll('.chk-obra:checked')).map(chk => chk.value);
        const solicitantesSeleccionados = Array.from(document.querySelectorAll('.chk-solicitante:checked')).map(chk => chk.value);
        const estadosSeleccionados = Array.from(document.querySelectorAll('.chk-estado:checked')).map(chk => chk.value);
        const proveedoresSeleccionados = Array.from(document.querySelectorAll('.chk-proveedor:checked')).map(chk => chk.value);
        const fechasSeleccionadas = Array.from(document.querySelectorAll('.chk-fecha:checked')).map(chk => chk.value);
        const semanasSeleccionadas = Array.from(document.querySelectorAll('.chk-semana:checked')).map(chk => chk.value);

        const obrasUnicas = [...new Set(datos.map(item => item.obra))].filter(Boolean).sort();
        const solicitantesUnicos = [...new Set(datos.map(item => item.solicitante))].filter(Boolean).sort();
        
        const fechasUnicas = [...new Set(
            datos
                .filter(item => semanasSeleccionadas.length === 0 || semanasSeleccionadas.includes(String(item.fiscal_week)))
                .map(item => item.order_date)
        )].filter(Boolean).sort();

        const semanasUnicas = [...new Set(datos.map(item => String(item.fiscal_week)))].filter(Boolean).sort((a, b) => Number(a) - Number(b));
        const proveedoresUnicos = [...new Set(datos.map(item => item.proveedor))].filter(p => p && p.trim() !== "" && p !== "-").sort();

        if (filtroObra) {
            filtroObra.innerHTML = obrasUnicas.map(o => `
                <label class="opcion-filtro">
                    <input type="checkbox" value="${o}" class="chk-obra" ${obrasSeleccionadas.includes(o) ? 'checked' : ''}> ${o}
                </label>
            `).join('');
        }

        if (filtroSolicitante) {
            filtroSolicitante.innerHTML = solicitantesUnicos.map(s => `
                <label class="opcion-filtro">
                    <input type="checkbox" value="${s}" class="chk-solicitante" ${solicitantesSeleccionados.includes(s) ? 'checked' : ''}> ${s}
                </label>
            `).join('');
        }

        if (filtroEstado) {
            const estados = [
                { val: 'pendiente', txt: '⏳ Pendiente' },
                { val: 'cotizado', txt: '📝 Cotizado' },
                { val: 'comprado', txt: '✅ Comprado' },
                { val: 'cancelado', txt: '❌ Cancelado' }
            ];
            filtroEstado.innerHTML = estados.map(e => `
                <label class="opcion-filtro">
                    <input type="checkbox" value="${e.val}" class="chk-estado" ${estadosSeleccionados.includes(e.val) ? 'checked' : ''}> ${e.txt}
                </label>
            `).join('');
        }

        if (filtroProveedor) {
            filtroProveedor.innerHTML = proveedoresUnicos.map(prov => `
                <label class="opcion-filtro">
                    <input type="checkbox" value="${prov}" class="chk-proveedor" ${proveedoresSeleccionados.includes(prov) ? 'checked' : ''}> ${prov}
                </label>
            `).join('');
        }

        if (filtroFecha) {
            if (semanasSeleccionadas.length === 0) {
                filtroFecha.innerHTML = `
                    <div style="padding: 10px; color: var(--text-muted); font-size: 11px; font-style: italic; text-align: center;">
                        ⚠️ Selecciona una semana primero
                    </div>
                `;
            } else {
                filtroFecha.innerHTML = fechasUnicas.map(f => `
                    <label class="opcion-filtro">
                        <input type="checkbox" value="${f}" class="chk-fecha" ${fechasSeleccionadas.includes(f) ? 'checked' : ''}> ${formatearFecha(f)}
                    </label>
                `).join('');
            }
        }

        if (filtroSemana) {
            filtroSemana.innerHTML = semanasUnicas.map(s => `
                <label class="opcion-filtro">
                    <input type="checkbox" value="${s}" class="chk-semana" ${semanasSeleccionadas.includes(s) ? 'checked' : ''}> Semana ${s}
                </label>
            `).join('');
        }
    }

    function obtenerClaseSemaforo(datosItem, totalFila) {
        if (datosItem.estado === 'pendiente' || datosItem.estado === 'cancelado') {
            return 'monto-pendiente';
        }

        const autorizado = parseFloat(datosItem.presupuesto_autorizado);
        
        if (isNaN(autorizado) || autorizado <= 0) {
            console.warn(
                `⚠️ Semáforo inactivo para "${datosItem.material_description}": ` +
                `Presupuesto autorizado es ${datosItem.presupuesto_autorizado} (¿problema de rol o base de datos?).`
            );
            return 'monto-pendiente';
        }

        const porcentajeConsumido = (totalFila / autorizado) * 100;

        if (porcentajeConsumido > 90) {
            return 'monto-rojo';
        } else if (porcentajeConsumido >= 75) {
            return 'monto-amarillo';
        } else {
            return 'monto-verde';
        }
    }

    function renderizarTabla(materialesAVer) {
        if (!cuerpoTabla) return;
        cuerpoTabla.innerHTML = '';

        if (materialesAVer.length === 0) {
            cuerpoTabla.innerHTML = `
                <tr>
                    <td colspan="15" style="text-align: center; color: var(--text-dark); padding: 25px; font-style: italic;">
                        📭 No hay solicitudes que coincidan con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }
        
        materialesAVer.forEach((item) => {
            const tr = document.createElement('tr');
            const montoCalculado = (item.quantity * (item.precio_unitario || 0)).toFixed(2);

            if (esResidente) {
                let estadoVisual = '-';
                if (item.estado === 'pendiente') estadoVisual = '⏳ Pendiente';
                else if (item.estado === 'cotizado') estadoVisual = '📝 Cotizado';
                else if (item.estado === 'comprado') estadoVisual = '✅ Comprado';
                else if (item.estado === 'cancelado') estadoVisual = '❌ Cancelado';

                tr.innerHTML = `
                    <td style="width: 6%; font-weight: bold;">${item.solicitante || 'Sin Nombre'}</td>
                    <td style="width: 8%;">${item.obra || 'Sin Obra'}</td>
                    <td style="width: 6%;">${formatearFecha(item.order_date)}</td>
                    <td style="width: 5%; color: var(--text-muted); text-align: center;">${item.fiscal_week}</td>
                    <td style="width: 6%;">${item.grupo || 'General'}</td>
                    <td style="width: 6%;">${item.categoria || 'General'}</td>
                    <td style="width: 7%;">${item.subcategoria || 'General'}</td>
                    <td style="width: 14%; font-weight: 500;">${item.material_description}</td>
                    <td style="width: 3%; text-align: center;">${item.unit}</td>
                    <td style="width: 3%; text-align: center; font-weight: bold;">${item.quantity}</td>
                    <td style="width: 12%; color: var(--text-muted); font-style: italic;">${item.commentary || '-'}</td>
                    
                    <!-- Columnas confidenciales ocultas para el residente -->
                    <td style="display: none;"></td>
                    <td style="display: none;"></td>
                    <td style="display: none;"></td>
                    <td style="display: none;"></td>
                    
                    <td style="width: 5%;">
                        <span>${estadoVisual}</span>
                    </td>
                `;
            } else {
                const totalFilaInicial = parseFloat(montoCalculado) || 0;
                const claseColorInicial = obtenerClaseSemaforo(item, totalFilaInicial);

                tr.innerHTML = `
                    <td style="width: 6%; font-weight: bold;">${item.solicitante || 'Sin Nombre'}</td>
                    <td style="width: 8%;">${item.obra || 'Sin Obra'}</td>
                    <td style="width: 6%;">${formatearFecha(item.order_date)}</td>
                    <td style="width: 5%; color: var(--text-muted); text-align: center;">${item.fiscal_week}</td>
                    <td style="width: 6%;">${item.grupo || 'General'}</td>
                    <td style="width: 6%;">${item.categoria || 'General'}</td>
                    <td style="width: 7%;">${item.subcategoria || 'General'}</td>
                    <td style="width: 14%; font-weight: 500;">${item.material_description}</td>
                    <td style="width: 3%; text-align: center;">${item.unit}</td>
                    <td style="width: 3%; text-align: center; font-weight: bold;">${item.quantity}</td>
                    <td style="width: 12%; color: var(--text-muted); font-style: italic;">${item.commentary || '-'}</td>
                    <td style="width: 9%;">
                        <input type="text" class="input-tabla proveedor-input" value="${item.proveedor || ''}" placeholder="Proveedor...">
                    </td>
                    <td style="width: 8%;">
                        <input type="text" class="input-tabla referencia-input" value="${item.referencia || ''}" placeholder="No. Referencia...">
                    </td>
                    <td style="width: 5%;">
                        <input type="number" class="input-tabla precio-input" value="${item.precio_unitario > 0 ? item.precio_unitario : ''}" step="any" placeholder="0.00">
                    </td>
                    <td style="width: 5%; font-weight: bold; text-align: right; padding-right: 10px;" class="monto-celda ${claseColorInicial}">$${montoCalculado}</td>
                    <td style="width: 5%;">
                        <select class="select-tabla estado-select" style="padding: 4px 4px;">
                            <option value="pendiente" ${item.estado === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                            <option value="cotizado" ${item.estado === 'cotizado' ? 'selected' : ''}>📝 Cotizado</option>
                            <option value="comprado" ${item.estado === 'comprado' ? 'selected' : ''}>✅ Comprado</option>
                            <option value="cancelado" ${item.estado === 'cancelado' ? 'selected' : ''}>❌ Cancelado</option>
                        </select>
                    </td>
                `;

                const inputProveedor = tr.querySelector('.proveedor-input');
                const inputReferencia = tr.querySelector('.referencia-input');
                const inputPrecio = tr.querySelector('.precio-input');
                const celdaMonto = tr.querySelector('.monto-celda');
                const selectEstado = tr.querySelector('.estado-select');

                let estadoGuardado = false;

                const actualizarFila = async () => {
                    if (estadoGuardado) return;
                    estadoGuardado = true;

                    try {
                        const nuevoProveedor = inputProveedor.value ? inputProveedor.value.trim() : '';
                        const nuevaReferencia = inputReferencia.value ? inputReferencia.value.trim() : '';
                        const precio = parseFloat(inputPrecio.value) || 0;
                        if (precio > 0 && selectEstado.value === 'pendiente') {
                            selectEstado.value = 'cotizado';
                        } else if (precio === 0 && inputPrecio.value === '') {
                            selectEstado.value = 'pendiente';
                        }
                        let estadoFinal = selectEstado.value;

                        const totalFilaCalculado = item.quantity * precio;
                        const nuevoMonto = totalFilaCalculado.toFixed(2);

                        item.proveedor = nuevoProveedor;
                        item.referencia = nuevaReferencia;
                        item.precio_unitario = precio;
                        item.estado = estadoFinal;

                        celdaMonto.textContent = `$${nuevoMonto}`;
                        celdaMonto.className = `monto-celda ${obtenerClaseSemaforo(item, totalFilaCalculado)}`;

                        const elementoGlobal = concentradoMateriales.find(m => m.id_detail === item.id_detail);
                        if (elementoGlobal) {
                            elementoGlobal.proveedor = nuevoProveedor;
                            elementoGlobal.referencia = nuevaReferencia;
                            elementoGlobal.precio_unitario = precio;
                            elementoGlobal.estado = estadoFinal;
                            
                            elementoGlobal.presupuesto_autorizado = item.presupuesto_autorizado;
                            elementoGlobal.monto_gastado_otros = item.monto_gastado_otros;
                        }

                        const respuesta = await fetch(`${API_URL}/materiales/detalle/${item.id_detail}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-user-rol': localStorage.getItem("userRol") || ''
                            },
                            body: JSON.stringify({
                                proveedor: nuevoProveedor,
                                referencia: nuevaReferencia,
                                precio_unitario: precio,
                                estado: estadoFinal
                            })
                        });

                        if (!respuesta.ok) {
                            throw new Error("No se pudo actualizar el registro en el servidor.");
                        }
                        console.log(`📡 Sincronizado id_detail ${item.id_detail} con éxito.`);
                        generarOpcionesFiltros(concentradoMateriales);
                    } catch (err) {
                        console.error("Error al actualizar material en MySQL a través de la API:", err);
                    } finally {
                        estadoGuardado = false;
                    }
                };

                inputPrecio.addEventListener('input', () => {
                    const precioTemporal = parseFloat(inputPrecio.value) || 0;
                    const totalTemporal = item.quantity * precioTemporal;
                    
                    let estadoTemp = selectEstado.value;
                    if (precioTemporal > 0 && estadoTemp === 'pendiente') {
                        estadoTemp = 'cotizado';
                    } else if (precioTemporal === 0 && inputPrecio.value === '') {
                        estadoTemp = 'pendiente';
                    }
                    
                    const itemTemporal = { ...item, estado: estadoTemp };
                    celdaMonto.textContent = `$${totalTemporal.toFixed(2)}`;
                    celdaMonto.className = `monto-celda ${obtenerClaseSemaforo(itemTemporal, totalTemporal)}`;
                });

                inputProveedor.addEventListener('blur', actualizarFila);
                inputReferencia.addEventListener('blur', actualizarFila);
                inputPrecio.addEventListener('blur', actualizarFila); 
                selectEstado.addEventListener('change', actualizarFila);
            }

            cuerpoTabla.appendChild(tr);
        });
    }

    function aplicarFiltros() {
        const obtenerValoresCheckboxes = (selector) => {
            return Array.from(document.querySelectorAll(selector))
                        .filter(chk => chk.checked)
                        .map(chk => chk.value);
        };

        const obrasSeleccionadas = obtenerValoresCheckboxes('.chk-obra');
        const solicitantesSeleccionados = obtenerValoresCheckboxes('.chk-solicitante');
        const estadosSeleccionadas = obtenerValoresCheckboxes('.chk-estado');
        const proveedoresSeleccionados = obtenerValoresCheckboxes('.chk-proveedor');
        const fechasSeleccionadas = obtenerValoresCheckboxes('.chk-fecha');
        const semanasSeleccionadas = obtenerValoresCheckboxes('.chk-semana');

        generarOpcionesFiltros(concentradoMateriales);

        const resultadoFiltrado = concentradoMateriales.filter((item) => {
            const estadoLimpio = item.estado ? item.estado.toLowerCase().trim() : '';

            const cumpleObra = obrasSeleccionadas.length === 0 || obrasSeleccionadas.includes(item.obra);
            const cumpleSolicitante = solicitantesSeleccionados.length === 0 || solicitantesSeleccionados.includes(item.solicitante);
            const cumpleEstado = estadosSeleccionadas.length === 0 || estadosSeleccionadas.includes(estadoLimpio);
            const cumpleProveedor = proveedoresSeleccionados.length === 0 || proveedoresSeleccionados.includes(item.proveedor);
            
            const cumpleFecha = fechasSeleccionadas.length === 0 || fechasSeleccionadas.includes(item.order_date);
            const cumpleSemana = semanasSeleccionadas.length === 0 || semanasSeleccionadas.includes(String(item.fiscal_week));

            return cumpleObra && cumpleSolicitante && cumpleEstado && cumpleProveedor && cumpleFecha && cumpleSemana;
        });

        materialesFiltrados = resultadoFiltrado;
        renderizarTabla(resultadoFiltrado);
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

    function formatearFecha(fechaString) {
        if (!fechaString) return "-";
        const fechaLimpia = fechaString.includes('T') ? fechaString.split('T')[0] : fechaString;
        const partes = fechaLimpia.split('-');
        if (partes.length !== 3) return fechaLimpia;
        const [año, mes, dia] = partes;
        return `${dia}/${mes}/${año}`;
    }

    function generarOrdenCompraPDF() {
        const idsVisibles = materialesFiltrados.map(m => m.id_detail);
        const materialesAProcesar = concentradoMateriales.filter(item => idsVisibles.includes(item.id_detail));
        
        if (materialesAProcesar.length === 0) {
            alert('⚠️ No hay materiales en la tabla para generar la Orden de Compra. Ajusta tus filtros primero.');
            return;
        }

        const materialesSoloCotizados = materialesFiltrados.filter(item => 
            item.estado && item.estado.toLowerCase().trim() === "cotizado"
        );

        if (materialesSoloCotizados.length === 0) {
            alert('⚠️ Ninguno de los materiales seleccionados tiene el estado "Cotizado". No se puede generar la Orden de Compra.');
            return;
        }

        let observacionUsuario = prompt("Escribe una observación para incluir en la Orden de Compra (Si no hay, puedes dejarla vacía):");
        if (observacionUsuario === null) observacionUsuario = "";
        observacionUsuario = observacionUsuario.trim();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'letter');

        const azulModisa = [6, 18, 30];
        const azulClaro = [59, 130, 246];
        const grisBorde = [203, 213, 225];
        const textoOscuro = [51, 65, 85];
        const grisFondo = [248, 250, 252];
        
        const margenIzquierdo = 40;
        let y = 45;

        const primerItem = materialesSoloCotizados[0];

        const ahora = new Date();
        const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
        const dias = Math.floor((ahora - inicioAnio) / (24 * 60 * 60 * 1000));
        const semanaActualDescarga = Math.ceil((dias + inicioAnio.getDay() + 1) / 7);

        const nombreProyecto = primerItem.obra || "MOD";
        const prefijoProyecto = nombreProyecto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3).toUpperCase();

        const nombreProveedor = primerItem.proveedor || "SIN PROV";
        let sufijoProveedor = "";
        const palabrasProv = nombreProveedor.trim().toUpperCase().split(/\s+/).filter(p => p !== "DE" && p !== "LA" && p !== "EL" && p !== "LOS" && p !== "Y");

        if (palabrasProv.length === 1) {
            sufijoProveedor = palabrasProv[0].substring(0, 3);
        } else {
            sufijoProveedor = palabrasProv.map(p => p[0]).join('').substring(0, 3);
        }

        const folioOC = `${semanaActualDescarga}${prefijoProyecto}${sufijoProveedor}`;

        doc.setFillColor(...azulModisa);
        doc.rect(margenIzquierdo, y, 532, 40, 'F'); 

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text("ORDEN DE COMPRA", margenIzquierdo + 15, y + 25);

        doc.setFontSize(11);
        doc.text(`FOLIO: ${folioOC}`, 450, y + 25);

        y += 60;

        const hoyIso = new Date().toISOString().split('T')[0];
        const fechaFormateada = formatearFecha(hoyIso);
        const proyectoEncontrado = listaProyectosGlobal.find(p => p.project_name === primerItem.obra);
        const ubicacionObra = proyectoEncontrado ? (proyectoEncontrado.direccion || "Dirección No Registrada") : "Obra no encontrada";
        const telefonoResidente = primerItem.telefono || "S/N";

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...azulModisa);
        doc.text("DATOS DE ENTREGA", margenIzquierdo, y);
        doc.setDrawColor(...grisBorde);
        doc.line(margenIzquierdo, y + 4, 260, y + 4);

        doc.setFontSize(8.5);
        doc.setTextColor(...textoOscuro);
        
        y += 20;
        doc.setFont("helvetica", "bold");
        doc.text("OBRA:", margenIzquierdo, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${primerItem.obra}`, margenIzquierdo + 70, y);

        y += 14;
        doc.setFont("helvetica", "bold");
        doc.text("UBICACIÓN:", margenIzquierdo, y);
        doc.setFont("helvetica", "normal");
        const lineasUbicacion = doc.splitTextToSize(ubicacionObra, 180);
        doc.text(lineasUbicacion, margenIzquierdo + 70, y);
        y += (lineasUbicacion.length - 1) * 11; 

        y += 14;
        doc.setFont("helvetica", "bold");
        doc.text("RECIBE:", margenIzquierdo, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${primerItem.solicitante}`, margenIzquierdo + 70, y);

        y += 14;
        doc.setFont("helvetica", "bold");
        doc.text("TELÉFONO:", margenIzquierdo, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${telefonoResidente}`, margenIzquierdo + 70, y);

        y += 14;
        doc.setFont("helvetica", "bold");
        doc.text("FECHA REQ:", margenIzquierdo, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${fechaFormateada}`, margenIzquierdo + 70, y);

        let yFinalEntrega = y;

        let xFacturacion = 295;
        let yFacturacion = 105; 

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...azulModisa);
        doc.text("DATOS DE FACTURACIÓN", xFacturacion, yFacturacion);
        doc.setDrawColor(...grisBorde);
        doc.line(xFacturacion, yFacturacion + 4, 572, yFacturacion + 4);

        doc.setFontSize(8.5);
        doc.setTextColor(...textoOscuro);
        
        yFacturacion += 20;

        const xValor = xFacturacion + 70;      
        const maxAnchoTexto = 572 - xValor;    

        const datosFacturacion = [
            { etiqueta: "RAZÓN SOCIAL:", valor: "Servicios Integrales de Construcción Modisa S.A. de C.V." },
            { etiqueta: "RFC:", valor: "SIC191202RT9" },
            { etiqueta: "USO CFDI:", valor: "Adquisición de Mercancías" },
            { etiqueta: "REGIMEN:", valor: "Régimen General de Ley Personas Morales" },
            { etiqueta: "DIRECCIÓN:", valor: "Av. Ventura Puente 999 Int. 35 Col Del Empleado 58280" }
        ];

        datosFacturacion.forEach(campo => {
            doc.setFont("helvetica", "bold");
            doc.text(campo.etiqueta, xFacturacion, yFacturacion);

            doc.setFont("helvetica", "normal");
            const lineasTexto = doc.splitTextToSize(campo.valor, maxAnchoTexto);
            doc.text(lineasTexto, xValor, yFacturacion);

            yFacturacion += (lineasTexto.length * 9.5) + 4.5;
        });

        y = Math.max(yFinalEntrega, yFacturacion) + 20;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...azulModisa);
        doc.text("MATERIAL A REQUERIR", margenIzquierdo, y);
        y += 10;

        const columnas = [
            { name: "Proveedor", w: 100 },
            { name: "Concepto / Descripción", w: 250 },
            { name: "Unidad", w: 50 },
            { name: "Cant.", w: 35 },
            { name: "P. Unitario", w: 52 },
            { name: "Total", w: 45 }
        ];

        doc.setFillColor(...azulModisa);
        doc.rect(margenIzquierdo, y, 532, 22, 'F');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        
        let xCurr = margenIzquierdo;
        columnas.forEach(col => {
            if (col.name === "P. Unitario" || col.name === "Total" || col.name === "Cant.") {
                doc.text(col.name, xCurr + col.w - 5, y + 14, { align: "right" });
            } else {
                doc.text(col.name, xCurr + 5, y + 14);
            }
            xCurr += col.w;
        });

        y += 22;
        let granTotal = 0;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        
        materialesSoloCotizados.forEach((item, index) => {
            if (y > 600) {
                doc.addPage();
                y = 50;
                doc.setFillColor(...azulModisa);
                doc.rect(margenIzquierdo, y, 532, 22, 'F');
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.5);
                doc.setTextColor(255, 255, 255);
                let xNew = margenIzquierdo;
                columnas.forEach(col => {
                    if (col.name === "P. Unitario" || col.name === "Total" || col.name === "Cant.") {
                        doc.text(col.name, xNew + col.w - 5, y + 14, { align: "right" });
                    } else {
                        doc.text(col.name, xNew + 5, y + 14);
                    }
                    xNew += col.w;
                });
                y += 22;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
            }

            if (index % 2 === 0) {
                doc.setFillColor(...grisFondo);
                doc.rect(margenIzquierdo, y, 532, 20, 'F');
            }

            doc.setDrawColor(...grisBorde);
            doc.setLineWidth(0.5);
            doc.line(margenIzquierdo, y + 20, margenIzquierdo + 532, y + 20);
            doc.setTextColor(...textoOscuro);

            const proveedorTxt = item.proveedor || "-";
            const cantidad = Number(item.quantity) || 0;
            const precioUnitario = Number(item.precio_unitario) || 0;
            const totalFila = cantidad * precioUnitario;
            granTotal += totalFila;

            let xPos = margenIzquierdo;
            
            doc.text(proveedorTxt, xPos + 5, y + 13, { maxWidth: 90, ellipsize: true});
            xPos += columnas[0].w;

            doc.text(item.material_description, xPos + 5, y + 13, { maxWidth: 240, ellipsize: true});
            xPos += columnas[1].w;

            doc.text(item.unit, xPos + 5, y + 13);
            xPos += columnas[2].w;

            doc.text(cantidad.toString(), xPos + columnas[3].w - 5, y + 13, { align: "right" });
            xPos += columnas[3].w;

            doc.text(`$${precioUnitario.toFixed(2)}`, xPos + columnas[4].w - 5, y + 13, { align: "right" });
            xPos += columnas[4].w;

            doc.text(`$${totalFila.toFixed(2)}`, xPos + columnas[5].w - 5, y + 13, { align: "right" });

            y += 20;
        });

        y += 10;
        doc.setFillColor(...azulModisa);
        doc.rect(420, y, 152, 22, 'F');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text("TOTAL GENERAL:", 425, y + 14);
        doc.text(`$${granTotal.toFixed(2)}`, 567, y + 14, { align: "right" });

        y += 35;

        if (observacionUsuario !== "") {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(...azulModisa);
            doc.text("OBSERVACIONES:", margenIzquierdo, y);
            y += 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(...textoOscuro);
            
            const lineasObs = doc.splitTextToSize(observacionUsuario, 520);
            doc.text(lineasObs, margenIzquierdo, y + 10);
            y += (lineasObs.length * 12) + 15;
        }

        if (y > 640) {
            doc.addPage();
            y = 50;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...azulModisa);
        doc.text("CONDICIONES DE ENTREGA:", margenIzquierdo, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...textoOscuro);

        const textoCondiciones = [
            "No se recibirá ningún material que sea incorrecto o este dañado, el material será revisado al momento de entrega"
        ];

        textoCondiciones.forEach(linea => {
            const parrafoSeparado = doc.splitTextToSize(linea, 532);
            doc.text(parrafoSeparado, margenIzquierdo, y + 10);
            y += (parrafoSeparado.length * 11);
        });

        y = 740;
        doc.setDrawColor(...azulClaro);
        doc.setLineWidth(1.5);
        doc.line(margenIzquierdo, y, margenIzquierdo + 532, y);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text("Servicios Integrales de Construcción MODISA S.A. de C.V. — Control Interno y Gestión de Almacén", margenIzquierdo, y + 15);

        const nombreLimpioObra = primerItem.obra.replace(/\s+/g, '_');
        doc.save(`Orden_Compra_Modisa_${nombreLimpioObra}.pdf`);
    }

})();