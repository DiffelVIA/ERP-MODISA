(() => {
    let listaUnidades = [];
    const fotosProcesadas = {
        tablero: null,
        exterior: null,
        traseraDer: null
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
            const unidades = await window.CamionetasApi.obtenerUnidades();
            listaUnidades = unidades;
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
        if (selMovUnidad) selMovUnidad.innerHTML = opcionesUnidades;
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

        vincularInputCamara('input-foto-tablero', 'preview-foto-tablero', 'tablero', 'mov-unidad', 'mov-tipo');
        vincularInputCamara('input-foto-exterior', 'preview-foto-exterior', 'exterior', 'mov-unidad', 'mov-tipo');
        vincularInputCamara('input-foto-trasera-der', 'preview-foto-trasera-der', 'traseraDer', 'mov-unidad', 'mov-tipo');

        const formMov = document.getElementById('form-movimiento-unidad');
        if (formMov) formMov.addEventListener('submit', manejarSubmitMovimiento);
    }

    function vincularInputCamara(inputId, previewId, claveFoto, selectUnidadId, selectMovimientoId) {
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
                    movimiento: obtenerTextoSelect(selectMovimientoId) || 'Sin seleccionar'
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
        const odometer = document.getElementById('mov-odometro').value;
        const fuelLevel = document.getElementById('mov-combustible').value;
        const notes = document.getElementById('mov-notas').value.trim();

        if (!idVehicle || !logType || !odometer || !fuelLevel) {
            mostrarMensaje('Por favor completa todos los campos obligatorios marcados con *.', true);
            return;
        }

        if (!fotosProcesadas.tablero || !fotosProcesadas.exterior || !fotosProcesadas.traseraDer) {
            mostrarMensaje('Debes capturar las 3 fotografías obligatorias (Tablero, Esquina delantera izquierda y Esquina trasera derecha) antes de guardar.', true);
            return;
        }

        const ubicacionCalculada = logType === 'Entrega'
            ? 'Oficina Central (Resguardo)'
            : 'Uso General / Comisión';

        const formData = new FormData();
        formData.append('id_vehicle', idVehicle);
        formData.append('id_employee', idEmpleado);
        formData.append('log_type', logType);
        formData.append('odometer_reading', odometer);
        formData.append('fuel_level', fuelLevel);
        formData.append('destination_or_origin', ubicacionCalculada);
        if (notes) formData.append('notes', notes);
        formData.append('gps_coordinates', window.CamionetasCamera.obtenerCoordenadasActuales());
        formData.append('photo_dashboard', fotosProcesadas.tablero);
        formData.append('photo_exterior', fotosProcesadas.exterior);
        formData.append('photo_exterior_rear', fotosProcesadas.traseraDer);

        btn.disabled = true;
        btn.textContent = 'Subiendo evidencias y guardando...';

        try {
            const resp = await window.CamionetasApi.enviarMovimiento(formData);
            mostrarMensaje(resp.message, false);
            e.target.reset();
            fotosProcesadas.tablero = null;
            fotosProcesadas.exterior = null;
            fotosProcesadas.traseraDer = null;
            limpiarPreviews(['preview-foto-tablero', 'preview-foto-exterior', 'preview-foto-trasera-der']);
            await cargarCatalogosIniciales();
        } catch (error) {
            mostrarMensaje(error.message, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Registro de Bitácora';
        }
    }
})();