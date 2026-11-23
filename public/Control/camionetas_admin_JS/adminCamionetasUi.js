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

    function formatearFechaHora(fechaIso) {
        if (!fechaIso) return '---';
        return new Date(fechaIso).toLocaleString('es-MX', {
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
                        <p><strong>Odómetro:</strong> ${Number(u.current_odometer || 0).toLocaleString('es-MX')} km | <strong>Tanque:</strong> ${u.tank_capacity_liters} L</p>
                        <p><strong>Conductor actual:</strong> ${escaparHTML(u.conductor_actual || 'En resguardo / Base')}</p>
                        <p><strong>Obra / Ubicación:</strong> ${escaparHTML(u.proyecto_actual || u.last_location || 'Oficina Central')}</p>
                    </div>
                    <button type="button" class="btn-secundario-unidad" data-action="editar-unidad" data-id="${u.id_vehicle}">Editar Unidad / Estado</button>
                </article>
            `;
        }).join('');
    }

    function renderizarTablaMovimientos(lista) {
        const tbody = document.getElementById('tbody-movimientos-admin');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="celda-vacia-tabla">No hay registros de movimientos con los filtros seleccionados.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(m => {
            let claseTipo = 'estado-neutro';
            if (m.log_type === 'Resguardo_FinSemana') claseTipo = 'estado-disponible';

            const alertaBadge = m.is_weekend_alert
                ? `<span class="badge-estado estado-alerta">Uso Fin de Semana</span>`
                : `<span class="texto-subdato">Normal</span>`;

            return `
                <tr>
                    <td>${formatearFechaHora(m.created_at)}</td>
                    <td><strong>${escaparHTML(m.unit_name)}</strong><span class="texto-subdato">${escaparHTML(m.plate)}</span></td>
                    <td><span class="badge-estado ${claseTipo}">${escaparHTML(m.log_type.replace('_', ' '))}</span></td>
                    <td>${escaparHTML(m.conductor_nombre)}</td>
                    <td>${escaparHTML(m.project_name)}</td>
                    <td>${escaparHTML(m.destination_or_origin)}</td>
                    <td class="texto-resaltado-num">${Number(m.odometer_reading).toLocaleString('es-MX')} km</td>
                    <td>${escaparHTML(m.fuel_level)}</td>
                    <td>
                        <a href="${escaparHTML(m.photo_dashboard_url)}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Tablero</a>
                        <a href="${escaparHTML(m.photo_exterior_url)}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Exterior</a>
                    </td>
                    <td>${alertaBadge}</td>
                </tr>
            `;
        }).join('');
    }

    function renderizarTablaCombustible(lista) {
        const tbody = document.getElementById('tbody-combustible-admin');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="celda-vacia-tabla">No hay cargas de combustible registradas con los filtros seleccionados.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(c => {
            const alertaBadge = c.over_capacity_alert
                ? `<span class="badge-estado estado-alerta">Excede Tanque (${c.tank_capacity_liters}L)</span>`
                : `<span class="monto-celda monto-verde">OK</span>`;

            const rendimientoTxt = c.rendimiento_km_l !== null ? `${c.rendimiento_km_l} km/L` : '---';
            const kmRecTxt = c.km_recorridos !== null ? `${c.km_recorridos.toLocaleString('es-MX')} km` : '---';

            return `
                <tr>
                    <td>${formatearFechaHora(c.created_at)}</td>
                    <td><strong>${escaparHTML(c.unit_name)}</strong><span class="texto-subdato">${escaparHTML(c.plate)}</span></td>
                    <td>${escaparHTML(c.conductor_nombre)}</td>
                    <td>${escaparHTML(c.project_name)}</td>
                    <td class="texto-resaltado-num">${Number(c.odometer_reading).toLocaleString('es-MX')} km</td>
                    <td>${kmRecTxt}</td>
                    <td>${Number(c.liters).toFixed(2)} L</td>
                    <td class="texto-resaltado-num">${rendimientoTxt}</td>
                    <td class="monto-celda monto-verde">$${Number(c.total_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td>${escaparHTML(c.payment_source)}<span class="texto-subdato">${escaparHTML(c.voucher_or_card_ref)}</span></td>
                    <td>
                        <a href="${escaparHTML(c.photo_ticket_url)}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Ticket</a>
                        <a href="${escaparHTML(c.photo_pump_url)}" target="_blank" rel="noopener noreferrer" class="enlace-evidencia">Bomba</a>
                    </td>
                    <td>${alertaBadge}</td>
                </tr>
            `;
        }).join('');
    }

    window.AdminCamionetasUi = {
        renderizarTarjetasUnidades,
        renderizarTablaMovimientos,
        renderizarTablaCombustible
    };
})();