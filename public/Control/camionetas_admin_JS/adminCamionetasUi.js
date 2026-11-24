(() => {
    function escaparHTML(texto) {
        if (texto === null || texto === undefined) return '';
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function obtenerUrlSegura(url) {
        if (!url || typeof url !== 'string') return '#';
        const limpia = url.trim();
        if (limpia.startsWith('https://') || limpia.startsWith('http://')) {
            return escaparHTML(limpia);
        }
        return '#';
    }

    function formatearFechaHora(fechaIso) {
        if (!fechaIso) return '---';
        return new Date(fechaIso).toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function renderizarTarjetasUnidades(unidades) {
        const grid = document.getElementById('grid-unidades-admin');
        if (!grid) return;

        grid.innerHTML = unidades.map(u => {
            let claseEstado = 'estado-disponible';
            if (u.status === 'En uso') claseEstado = 'estado-en-uso';
            if (u.status === 'Mantenimiento') claseEstado = 'estado-mantenimiento';

            return `
                <article class="tarjeta-unidad">
                    <div class="tarjeta-unidad-encabezado">
                        <h3>${escaparHTML(u.unit_name)}</h3>
                        <span class="badge-estado ${claseEstado}">${escaparHTML(u.status)}</span>
                    </div>
                    <div class="tarjeta-unidad-detalle">
                        <p><strong>Placas:</strong> ${escaparHTML(u.plate)} — ${escaparHTML(u.brand_model)}</p>
                        <p><strong>Odómetro:</strong> ${Number(u.current_odometer || 0).toLocaleString('es-MX')} km | <strong>Tanque:</strong> ${escaparHTML(u.tank_capacity_liters)} L</p>
                        <p><strong>Conductor actual:</strong> ${escaparHTML(u.conductor_actual || 'En resguardo / Base')}</p>
                        <p><strong>Ubicación:</strong> ${escaparHTML(u.last_location || 'Oficina Central')}</p>
                    </div>
                    <button type="button" class="btn-secundario-unidad" data-action="editar-unidad" data-id="${escaparHTML(u.id_vehicle)}">Editar Unidad / Estado</button>
                </article>
            `;
        }).join('');
    }

    function renderizarTablaMovimientos(lista) {
        const tbody = document.getElementById('tbody-movimientos-admin');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="celda-vacia-tabla">No hay registros de movimientos con los filtros seleccionados.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(m => {
            const esEntrega = m.log_type === 'Entrega' || m.log_type === 'Resguardo_FinSemana';
            const claseTipo = esEntrega ? 'estado-disponible' : 'estado-neutro';
            const etiquetaTipo = esEntrega ? 'Entrega' : m.log_type;

            const alertaBadge = m.is_weekend_alert
                ? `<span class="badge-estado estado-alerta">Uso Fin de Semana</span>`
                : `<span class="texto-subdato">Normal</span>`;

            const urlTablero = obtenerUrlSegura(m.photo_dashboard_url);
            const urlExterior = obtenerUrlSegura(m.photo_exterior_url);
            const urlTraseraDer = obtenerUrlSegura(m.photo_exterior_rear_url);

            return `
                <tr>
                    <td>${formatearFechaHora(m.created_at)}</td>
                    <td><strong>${escaparHTML(m.unit_name)}</strong><span class="texto-subdato">${escaparHTML(m.plate)}</span></td>
                    <td><span class="badge-estado ${claseTipo}">${escaparHTML(etiquetaTipo)}</span></td>
                    <td>${escaparHTML(m.conductor_nombre)}</td>
                    <td>${escaparHTML(m.destination_or_origin)}</td>
                    <td class="texto-resaltado-num">${Number(m.odometer_reading).toLocaleString('es-MX')} km</td>
                    <td>${escaparHTML(m.fuel_level)}</td>
                    <td>
                        <a href="${urlTablero}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Tablero</a>
                        <a href="${urlExterior}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Delantera Izq.</a>
                        <a href="${urlTraseraDer}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Trasera Der.</a>
                    </td>
                    <td>${alertaBadge}</td>
                </tr>
            `;
        }).join('');
    }

    window.AdminCamionetasUi = {
        escaparHTML,
        renderizarTarjetasUnidades,
        renderizarTablaMovimientos
    };
})();