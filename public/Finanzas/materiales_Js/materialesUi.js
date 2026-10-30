// public/Finanzas/materiales_Js/materialesUi.js

export const limpiarTexto = (texto) => {
    if (!texto) return '';
    return texto
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

export function formatearFecha(fechaString) {
    if (!fechaString) return "-";
    const fechaLimpia = fechaString.includes('T') ? fechaString.split('T')[0] : fechaString;
    const partes = fechaLimpia.split('-');
    if (partes.length !== 3) return fechaLimpia;
    const [año, mes, dia] = partes;
    return `${dia}/${mes}/${año}`;
}

export function generarOpcionesFiltros(datos, elementosFiltro) {
    if (!datos || datos.length === 0) return;

    const { filtroObra, filtroSolicitante, filtroEstado, filtroProveedor, filtroFecha, filtroSemana } = elementosFiltro;

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

export function obtenerClaseSemaforo(datosItem, totalFila) {
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

export function renderizarTabla(materialesAVer, contexto) {
    const { cuerpoTabla, esResidente, concentradoMateriales, actualizarMaterialNotif, elementosFiltro } = contexto;
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

    const materialesOrdenados = [...materialesAVer].sort((a, b) => (a.id_detail || 0) - (b.id_detail || 0));

    const acumuladosPorSubcategoria = {};
    const mapaClasesSemaforo = {};

    materialesOrdenados.forEach(item => {
        const llaveSubcat = `${item.obra || 'S/O'}-${item.grupo || 'G'}-${item.categoria || 'C'}-${item.subcategoria || 'S'}`;
        const precio = parseFloat(item.precio_unitario) || 0;
        const totalFila = (parseFloat(item.quantity) || 0) * precio;

        acumuladosPorSubcategoria[llaveSubcat] = (acumuladosPorSubcategoria[llaveSubcat] || 0) + totalFila;
        const acumuladoHastaEstaSolicitud = acumuladosPorSubcategoria[llaveSubcat];

        mapaClasesSemaforo[item.id_detail] = obtenerClaseSemaforo(item, acumuladoHastaEstaSolicitud);
    });
    
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
                
                <td style="display: none;"></td>
                <td style="display: none;"></td>
                <td style="display: none;"></td>
                <td style="display: none;"></td>
                
                <td style="width: 5%;">
                    <span>${estadoVisual}</span>
                </td>
            `;
        } else {
            const claseColorInicial = mapaClasesSemaforo[item.id_detail] || 'monto-pendiente';

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

                    const elementoGlobal = concentradoMateriales.find(m => m.id_detail === item.id_detail);
                    if (elementoGlobal) {
                        elementoGlobal.proveedor = nuevoProveedor;
                        elementoGlobal.referencia = nuevaReferencia;
                        elementoGlobal.precio_unitario = precio;
                        elementoGlobal.estado = estadoFinal;
                        
                        elementoGlobal.presupuesto_autorizado = item.presupuesto_autorizado;
                        elementoGlobal.monto_gastado_otros = item.monto_gastado_otros;
                    }

                    renderizarTabla(materialesAVer, contexto);

                    await actualizarMaterialNotif(item.id_detail, {
                        proveedor: nuevoProveedor,
                        referencia: nuevaReferencia,
                        precio_unitario: precio,
                        estado: estadoFinal
                    });

                    generarOpcionesFiltros(concentradoMateriales, elementosFiltro);
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
                
                item.precio_unitario = precioTemporal;
                item.estado = estadoTemp;
                celdaMonto.textContent = `$${totalTemporal.toFixed(2)}`;
            });

            inputProveedor.addEventListener('blur', actualizarFila);
            inputReferencia.addEventListener('blur', actualizarFila);
            inputPrecio.addEventListener('blur', actualizarFila); 
            selectEstado.addEventListener('change', actualizarFila);
        }

        cuerpoTabla.appendChild(tr);
    });
}

export function configurarDropdowns() {
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