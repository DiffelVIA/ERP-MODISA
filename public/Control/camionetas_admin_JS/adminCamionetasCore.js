(() => {
    const token = localStorage.getItem('jwtToken') || '';
    if (!token || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/');
        return;
    }

    let unidades = [];
    let movimientos = [];
    let cargasCombustible = [];
    let tabActiva = 'movimientos';

    const rolesPermitidos = [
        'director operativo',
        'director general',
        'gerente administracion',
        'gerente administrativo',
        'subdirector de obra',
        'compras'
    ];

    function obtenerRolLimpio() {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')));
            const raw = payload.rol || payload.role || localStorage.getItem('userRol') || '';
            return String(raw).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ');
        } catch (e) {
            return '';
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const rol = obtenerRolLimpio();
        const tieneAcceso = rolesPermitidos.some(r => rol === r || (rol.includes('gerente') && rol.includes('administrac')));

        if (!tieneAcceso) {
            const main = document.getElementById('contenedor-principal-admin');
            if (main) {
                main.innerHTML = `
                    <div class="panel-card-flotilla">
                        <h2>Acceso Denegado</h2>
                        <p class="flotilla-subtitulo">No tienes permisos administrativos para consultar el Control de Flotilla.</p>
                    </div>
                `;
            }
            return;
        }

        configurarEventos();
        await cargarTodo();
    });

    async function cargarTodo() {
        try {
            const [resUnidades, resMovs, resComb] = await Promise.all([
                window.AdminCamionetasApi.obtenerUnidades(),
                window.AdminCamionetasApi.obtenerHistorialMovimientos(),
                window.AdminCamionetasApi.obtenerHistorialCombustible()
            ]);

            unidades = resUnidades;
            movimientos = resMovs;
            cargasCombustible = resComb;

            poblarFiltroUnidades();
            window.AdminCamionetasUi.renderizarTarjetasUnidades(unidades);
            aplicarFiltros();
        } catch (error) {
            alert(error.message);
        }
    }

    function poblarFiltroUnidades() {
        const sel = document.getElementById('filtro-admin-unidad');
        if (!sel) return;
        sel.innerHTML = ['<option value="">Todas las camionetas</option>'].concat(
            unidades.map(u => `<option value="${u.id_vehicle}">${u.unit_name} (${u.plate})</option>`)
        ).join('');
    }

    function aplicarFiltros() {
        const idUnidad = document.getElementById('filtro-admin-unidad')?.value || '';
        const texto = (document.getElementById('filtro-admin-busqueda')?.value || '').trim().toLowerCase();

        const movFiltrados = movimientos.filter(m => {
            const matchUnidad = !idUnidad || String(m.id_vehicle) === String(idUnidad);
            const matchTexto = !texto ||
                (m.conductor_nombre || '').toLowerCase().includes(texto) ||
                (m.project_name || '').toLowerCase().includes(texto) ||
                (m.destination_or_origin || '').toLowerCase().includes(texto);
            return matchUnidad && matchTexto;
        });

        const combFiltrados = cargasCombustible.filter(c => {
            const matchUnidad = !idUnidad || String(c.id_vehicle) === String(idUnidad);
            const matchTexto = !texto ||
                (c.conductor_nombre || '').toLowerCase().includes(texto) ||
                (c.project_name || '').toLowerCase().includes(texto) ||
                (c.voucher_or_card_ref || '').toLowerCase().includes(texto);
            return matchUnidad && matchTexto;
        });

        window.AdminCamionetasUi.renderizarTablaMovimientos(movFiltrados);
        window.AdminCamionetasUi.renderizarTablaCombustible(combFiltrados);
    }

    function configurarEventos() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');

            if (action === 'tab-admin') {
                tabActiva = btn.getAttribute('data-tab');
                document.querySelectorAll('.btn-tab-flotilla').forEach(b => b.classList.remove('activo'));
                btn.classList.add('activo');

                const secMov = document.getElementById('seccion-tabla-movimientos');
                const secComb = document.getElementById('seccion-tabla-combustible');
                if (tabActiva === 'movimientos') {
                    secMov.classList.remove('panel-oculto');
                    secComb.classList.add('panel-oculto');
                } else {
                    secMov.classList.add('panel-oculto');
                    secComb.classList.remove('panel-oculto');
                }
            } else if (action === 'abrir-modal-nueva-unidad') {
                abrirModalUnidad(null);
            } else if (action === 'editar-unidad') {
                const id = btn.getAttribute('data-id');
                const unidad = unidades.find(u => String(u.id_vehicle) === String(id));
                if (unidad) abrirModalUnidad(unidad);
            } else if (action === 'cerrar-modal-unidad') {
                document.getElementById('modal-unidad').classList.add('panel-oculto');
            } else if (action === 'exportar-excel-flotilla') {
                exportarReporteExcel();
            }
        });

        document.getElementById('filtro-admin-unidad')?.addEventListener('change', aplicarFiltros);
        document.getElementById('filtro-admin-busqueda')?.addEventListener('input', aplicarFiltros);

        document.getElementById('form-admin-unidad')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idVehicle = document.getElementById('edit-id-vehicle').value || null;
            const datos = {
                unit_name: document.getElementById('edit-unit-name').value.trim(),
                plate: document.getElementById('edit-plate').value.trim(),
                brand_model: document.getElementById('edit-brand-model').value.trim(),
                tank_capacity_liters: document.getElementById('edit-tank-capacity').value,
                current_odometer: document.getElementById('edit-odometer').value,
                status: document.getElementById('edit-status').value
            };

            try {
                await window.AdminCamionetasApi.guardarUnidad(datos, idVehicle);
                document.getElementById('modal-unidad').classList.add('panel-oculto');
                await cargarTodo();
            } catch (error) {
                alert(error.message);
            }
        });
    }

    function abrirModalUnidad(unidad) {
        const modal = document.getElementById('modal-unidad');
        const titulo = document.getElementById('titulo-modal-unidad');
        const grupoStatus = document.getElementById('grupo-edit-status');

        if (unidad) {
            titulo.textContent = `Editar ${unidad.unit_name}`;
            document.getElementById('edit-id-vehicle').value = unidad.id_vehicle;
            document.getElementById('edit-unit-name').value = unidad.unit_name;
            document.getElementById('edit-plate').value = unidad.plate;
            document.getElementById('edit-brand-model').value = unidad.brand_model;
            document.getElementById('edit-tank-capacity').value = unidad.tank_capacity_liters;
            document.getElementById('edit-odometer').value = unidad.current_odometer;
            document.getElementById('edit-status').value = unidad.status;
            grupoStatus.classList.remove('panel-oculto');
        } else {
            titulo.textContent = 'Registrar Nueva Camioneta';
            document.getElementById('form-admin-unidad').reset();
            document.getElementById('edit-id-vehicle').value = '';
            grupoStatus.classList.add('panel-oculto');
        }
        modal.classList.remove('panel-oculto');
    }

    function exportarReporteExcel() {
        const wb = XLSX.utils.book_new();

        const hojaMovs = movimientos.map(m => ({
            'Fecha': new Date(m.created_at).toLocaleString('es-MX'),
            'Camioneta': m.unit_name,
            'Placas': m.plate,
            'Movimiento': m.log_type,
            'Responsable': m.conductor_nombre,
            'Obra': m.project_name,
            'Destino/Entrega': m.destination_or_origin,
            'Odómetro (km)': m.odometer_reading,
            'Nivel Combustible': m.fuel_level,
            'GPS': m.gps_coordinates || '---',
            'Alerta Fin de Semana': m.is_weekend_alert ? 'SÍ' : 'NO'
        }));

        const hojaComb = cargasCombustible.map(c => ({
            'Fecha': new Date(c.created_at).toLocaleString('es-MX'),
            'Camioneta': c.unit_name,
            'Placas': c.plate,
            'Responsable': c.conductor_nombre,
            'Obra': c.project_name,
            'Odómetro (km)': c.odometer_reading,
            'Km Recorridos': c.km_recorridos ?? '---',
            'Litros': Number(c.liters),
            'Rendimiento (km/L)': c.rendimiento_km_l ?? '---',
            'Monto ($ MXN)': Number(c.total_amount),
            'Método Pago': c.payment_source,
            'Folio / Tarjeta': c.voucher_or_card_ref,
            'Exceso Tanque': c.over_capacity_alert ? 'SÍ' : 'NO'
        }));

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaMovs), 'Bitacora_Movimientos');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaComb), 'Cargas_Combustible');

        const fechaHoy = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Reporte_Flotilla_MODISA_${fechaHoy}.xlsx`);
    }
})();