(() => {
    let listaUnidades = [];
    let listaProyectos = [];
    const fotosProcesadas = {
        tablero: null,
        exterior: null,
        ticket: null,
        bomba: null
    };

    document.addEventListener('DOMContentLoaded', async () => {
        inicializarGPS();
        configurarEventosUI();
        await cargarCatalogosIniciales();
    });

    function inicializarGPS() {
        const lblGps = document.getElementById('texto-estado-gps');
        window.CamionetasCamera.actualizarCoordenadasGPS((texto) => {
            if (lblGps) lblGps.textContent = `📍 Ubicación certificada: ${texto}`;
        });
    }

    function mostrarMensaje(texto, esError = false) {
        const box = document.getElementById('contenedor-mensaje-estado');
        if (!box) return;
        box.textContent = texto;
        box.className = `mensaje-flotilla ${esError ? 'error' : 'exito'}`;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function ocultarMensaje() {
        const box = document.getElementById('contenedor-mensaje-estado');
        if (box) box.className = 'mensaje-flotilla panel-oculto';
    }

    async function cargarCatalogosIniciales() {
        try {
            const [unidades, proyectos] = await Promise.all([
                window.CamionetasApi.obtenerUnidades(),
                window.CamionetasApi.obtenerProyectos()
            ]);
            listaUnidades = unidades;
            listaProyectos = proyectos;
            renderizarTarjetasUnidades();
            poblarSelects();
        } catch (error) {
            mostrarMensaje(error.message, true);
        }
    }

    function renderizarTarjetasUnidades() {
        const grid = document.getElementById('grid-estado-unidades');
        if (!grid) return;
        const { escaparHTML } = window.CamionetasAuth;

        grid.innerHTML = listaUnidades.map(u => {
            let claseEstado = 'estado-disponible';
            if (u.status === 'En uso') claseEstado = 'estado-en-uso';
            if (u.status === 'Mantenimiento') claseEstado = 'estado-mantenimiento';

            return `
                <article class="tarjeta-unidad">
                    <div class="tarjeta-unidad-encabezado">
                        <h2>${escaparHTML(u.unit_name)}</h2>
                        <span class="badge-estado ${claseEstado}">${escaparHTML(u.status)}</span>
                    </div>
                    <div class="tarjeta-unidad-detalle">
                        <p><strong>Placas:</strong> ${escaparHTML(u.plate)} (${escaparHTML(u.brand_model)})</p>
                        <p><strong>Odómetro:</strong> ${Number(u.current_odometer || 0).toLocaleString('es-MX')} km</p>
                        <p><strong>Responsable:</strong> ${escaparHTML(u.conductor_actual || 'Disponible en base')}</p>
                        <p><strong>Ubicación:</strong> ${escaparHTML(u.last_location || 'Oficina Central')}</p>
                    </div>
                </article>
            `;
        }).join('');
    }

    function poblarSelects() {
        const { escaparHTML } = window.CamionetasAuth;
        const opcionesUnidades = ['<option value="">Selecciona una unidad...</option>'].concat(
            listaUnidades.map(u => `<option value="${u.id_vehicle}">${escaparHTML(u.unit_name)} — ${escaparHTML(u.plate)} (${escaparHTML(u.status)})</option>`)
        ).join('');

        const selMovUnidad = document.getElementById('mov-unidad');
        const selCombUnidad = document.getElementById('comb-unidad');
        if (selMovUnidad) selMovUnidad.innerHTML = opcionesUnidades;
        if (selCombUnidad) selCombUnidad.innerHTML = opcionesUnidades;

        const opcionesProyectos = ['<option value="">Selecciona obra / proyecto...</option>'].concat(
            listaProyectos.map(p => `<option value="${p.id_project}">${escaparHTML(p.project_name)}</option>`)
        ).join('');

        const selMovProy = document.getElementById('mov-proyecto');
        const selCombProy = document.getElementById('comb-proyecto');
        if (selMovProy) selMovProy.innerHTML = opcionesProyectos;
        if (selCombProy) selCombProy.innerHTML = opcionesProyectos;
    }

    function obtenerTextoSelect(idSelect) {
        const el = document.getElementById(idSelect);
        if (!el || !el.value) return '';
        return el.options[el.selectedIndex]?.text || '';
    }

    function limpiarPreviews(idsPreviews) {
        idsPreviews.forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.src = '';
                img.classList.add('panel-oculto');
            }
        });
    }

    function configurarEventosUI() {
        document.addEventListener('click', (e) => {
            const btnAction = e.target.closest('[data-action]');
            if (!btnAction) return;

            const accion = btnAction.getAttribute('data-action');
            if (accion === 'actualizar-gps') {
                inicializarGPS();
            } else if (accion === 'cambiar-tab') {
                ocultarMensaje();
                const tab = btnAction.getAttribute('data-tab');
                document.querySelectorAll('.btn-tab-flotilla').forEach(b => b.classList.remove('activo'));
                btnAction.classList.add('activo');

                const panelMov = document.getElementById('panel-movimiento');
                const panelComb = document.getElementById('panel-combustible');
                if (tab === 'movimiento') {
                    panelMov.classList.remove('panel-oculto');
                    panelComb.classList.add('panel-oculto');
                } else {
                    panelMov.classList.add('panel-oculto');
                    panelComb.classList.remove('panel-oculto');
                }
            }
        });

        const selMovUnidad = document.getElementById('mov-unidad');
        if (selMovUnidad) {
            selMovUnidad.addEventListener('change', () => {
                const unidad = listaUnidades.find(u => String(u.id_vehicle) === String(selMovUnidad.value));
                const hint = document.getElementById('hint-odometro-mov');
                const inputOdo = document.getElementById('mov-odometro');
                if (unidad && hint && inputOdo) {
                    hint.textContent = `Último odómetro registrado: ${Number(unidad.current_odometer).toLocaleString('es-MX')} km`;
                    inputOdo.min = unidad.current_odometer;
                }
            });
        }

        const selMovTipo = document.getElementById('mov-tipo');
        if (selMovTipo) {
            selMovTipo.addEventListener('change', () => {
                const inputDestino = document.getElementById('mov-destino');
                if (!inputDestino) return;
                if (selMovTipo.value === 'Resguardo_FinSemana') {
                    inputDestino.value = 'Oficina Central (Resguardo Fin de Semana)';
                } else if (selMovTipo.value === 'Entrega') {
                    inputDestino.value = 'Oficina Central';
                }
            });
        }

        const selCombUnidad = document.getElementById('comb-unidad');
        if (selCombUnidad) {
            selCombUnidad.addEventListener('change', () => {
                const unidad = listaUnidades.find(u => String(u.id_vehicle) === String(selCombUnidad.value));
                const hintOdo = document.getElementById('hint-odometro-comb');
                const hintTanque = document.getElementById('hint-tanque-comb');
                const inputOdo = document.getElementById('comb-odometro');
                if (unidad) {
                    if (hintOdo) hintOdo.textContent = `Último odómetro: ${Number(unidad.current_odometer).toLocaleString('es-MX')} km`;
                    if (hintTanque) hintTanque.textContent = `Capacidad nominal del tanque: ${unidad.tank_capacity_liters} litros`;
                    if (inputOdo) inputOdo.min = unidad.current_odometer;
                }
            });
        }

        vincularInputCamara('input-foto-tablero', 'preview-foto-tablero', 'tablero', 'mov-unidad', 'mov-proyecto');
        vincularInputCamara('input-foto-exterior', 'preview-foto-exterior', 'exterior', 'mov-unidad', 'mov-proyecto');
        vincularInputCamara('input-foto-ticket', 'preview-foto-ticket', 'ticket', 'comb-unidad', 'comb-proyecto');
        vincularInputCamara('input-foto-bomba', 'preview-foto-bomba', 'bomba', 'comb-unidad', 'comb-proyecto');

        const formMov = document.getElementById('form-movimiento-unidad');
        if (formMov) formMov.addEventListener('submit', manejarSubmitMovimiento);

        const formComb = document.getElementById('form-combustible-unidad');
        if (formComb) formComb.addEventListener('submit', manejarSubmitCombustible);
    }

    function vincularInputCamara(inputId, previewId, claveFoto, selectUnidadId, selectProyectoId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!input || !preview) return;

        input.addEventListener('change', async () => {
            const archivo = input.files && input.files[0];
            if (!archivo) return;

            try {
                const { nombre } = window.CamionetasAuth.obtenerDatosUsuarioSesion();
                const metadatos = {
                    usuario: nombre,
                    unidad: obtenerTextoSelect(selectUnidadId) || 'Sin seleccionar',
                    proyecto: obtenerTextoSelect(selectProyectoId) || 'Sin obra'
                };
                const { archivoFinal, previewUrl } = await window.CamionetasCamera.procesarFotoConMarcaAgua(archivo, metadatos);
                fotosProcesadas[claveFoto] = archivoFinal;
                preview.src = previewUrl;
                preview.classList.remove('panel-oculto');
            } catch (error) {
                mostrarMensaje(error.message, true);
            }
        });
    }

    async function manejarSubmitMovimiento(e) {
        e.preventDefault();
        ocultarMensaje();

        const btn = document.getElementById('btn-submit-movimiento');
        const { idEmpleado } = window.CamionetasAuth.obtenerDatosUsuarioSesion();

        if (!idEmpleado) {
            mostrarMensaje('No se pudo identificar tu usuario de empleado. Vuelve a iniciar sesión.', true);
            return;
        }

        const idVehicle = document.getElementById('mov-unidad').value;
        const logType = document.getElementById('mov-tipo').value;
        const idProject = document.getElementById('mov-proyecto').value;
        const odometer = document.getElementById('mov-odometro').value;
        const fuelLevel = document.getElementById('mov-combustible').value;
        const destination = document.getElementById('mov-destino').value.trim();
        const notes = document.getElementById('mov-notas').value.trim();

        if (!idVehicle || !logType || !odometer || !fuelLevel || !destination) {
            mostrarMensaje('Por favor completa todos los campos obligatorios marcados con *.', true);
            return;
        }

        if (!fotosProcesadas.tablero || !fotosProcesadas.exterior) {
            mostrarMensaje('Debes capturar ambas fotografías (Tablero y Exterior) antes de guardar.', true);
            return;
        }

        const formData = new FormData();
        formData.append('id_vehicle', idVehicle);
        formData.append('id_employee', idEmpleado);
        if (idProject) formData.append('id_project', idProject);
        formData.append('log_type', logType);
        formData.append('odometer_reading', odometer);
        formData.append('fuel_level', fuelLevel);
        formData.append('destination_or_origin', destination);
        if (notes) formData.append('notes', notes);
        formData.append('gps_coordinates', window.CamionetasCamera.obtenerCoordenadasActuales());
        formData.append('photo_dashboard', fotosProcesadas.tablero);
        formData.append('photo_exterior', fotosProcesadas.exterior);

        btn.disabled = true;
        btn.textContent = 'Subiendo evidencias y guardando...';

        try {
            const resp = await window.CamionetasApi.enviarMovimiento(formData);
            mostrarMensaje(resp.message, false);
            e.target.reset();
            fotosProcesadas.tablero = null;
            fotosProcesadas.exterior = null;
            limpiarPreviews(['preview-foto-tablero', 'preview-foto-exterior']);
            await cargarCatalogosIniciales();
        } catch (error) {
            mostrarMensaje(error.message, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Registro de Bitácora';
        }
    }

    async function manejarSubmitCombustible(e) {
        e.preventDefault();
        ocultarMensaje();

        const btn = document.getElementById('btn-submit-combustible');
        const { idEmpleado } = window.CamionetasAuth.obtenerDatosUsuarioSesion();

        if (!idEmpleado) {
            mostrarMensaje('No se pudo identificar tu usuario de empleado. Vuelve a iniciar sesión.', true);
            return;
        }

        const idVehicle = document.getElementById('comb-unidad').value;
        const idProject = document.getElementById('comb-proyecto').value;
        const odometer = document.getElementById('comb-odometro').value;
        const liters = document.getElementById('comb-litros').value;
        const totalAmount = document.getElementById('comb-monto').value;
        const paymentSource = document.getElementById('comb-metodo').value;
        const reference = document.getElementById('comb-referencia').value.trim();
        const station = document.getElementById('comb-estacion').value.trim();

        if (!idVehicle || !odometer || !liters || !totalAmount || !paymentSource || !reference) {
            mostrarMensaje('Por favor completa todos los campos obligatorios de la carga de gasolina.', true);
            return;
        }

        if (!fotosProcesadas.ticket || !fotosProcesadas.bomba) {
            mostrarMensaje('Debes capturar la foto del Ticket y la foto de Bomba/Tablero.', true);
            return;
        }

        const formData = new FormData();
        formData.append('id_vehicle', idVehicle);
        formData.append('id_employee', idEmpleado);
        if (idProject) formData.append('id_project', idProject);
        formData.append('odometer_reading', odometer);
        formData.append('liters', liters);
        formData.append('total_amount', totalAmount);
        formData.append('payment_source', paymentSource);
        formData.append('voucher_or_card_ref', reference);
        if (station) formData.append('station_name', station);
        formData.append('gps_coordinates', window.CamionetasCamera.obtenerCoordenadasActuales());
        formData.append('photo_ticket', fotosProcesadas.ticket);
        formData.append('photo_pump', fotosProcesadas.bomba);

        btn.disabled = true;
        btn.textContent = 'Guardando ticket y carga...';

        try {
            const resp = await window.CamionetasApi.enviarCombustible(formData);
            mostrarMensaje(resp.message, Boolean(resp.over_capacity_alert));
            e.target.reset();
            fotosProcesadas.ticket = null;
            fotosProcesadas.bomba = null;
            limpiarPreviews(['preview-foto-ticket', 'preview-foto-bomba']);
            await cargarCatalogosIniciales();
        } catch (error) {
            mostrarMensaje(error.message, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Carga de Combustible';
        }
    }
})();