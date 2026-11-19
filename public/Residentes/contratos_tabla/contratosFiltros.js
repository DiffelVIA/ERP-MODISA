(() => {
    window.ContratosApp = window.ContratosApp || {};

    let dropdownsInicializados = false;

    function generarOpcionesFiltros(contratos) {
        const { escapeHTML } = window.ContratosApp.Auth;
        const contenedorObra = document.getElementById("filtroObra");
        const contenedorDireccion = document.getElementById("filtroDireccion");
        const contenedorCostos = document.getElementById("filtroCostos");
        const contenedorFirma = document.getElementById("filtroFirma");

        if (!contenedorObra) return;

        const obrasUnicas = [...new Set(contratos.map(c => c.project_name).filter(Boolean))].sort();
        const direccionUnicos = [...new Set(contratos.map(c => c.status_direccion || 'Pendiente').filter(Boolean))].sort();
        const costosUnicos = [...new Set(contratos.map(c => c.estado_costos || 'Pendiente').filter(Boolean))].sort();
        const firmaUnicos = [...new Set(contratos.map(c => (c.firma === 'Firmado' || c.firma === 'Sí') ? 'Firmado' : 'Pendiente').filter(Boolean))].sort();

        contenedorObra.innerHTML = obrasUnicas.map(obra => `
          <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
            <input type="checkbox" value="${escapeHTML(obra)}" class="chk-obra"> ${escapeHTML(obra)}
          </label>
        `).join('');

        if (contenedorDireccion) {
            contenedorDireccion.innerHTML = direccionUnicos.map(d => `
              <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
                <input type="checkbox" value="${escapeHTML(d)}" class="chk-direccion"> ${escapeHTML(d)}
              </label>
            `).join('');
        }

        if (contenedorCostos) {
            contenedorCostos.innerHTML = costosUnicos.map(c => `
              <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
                <input type="checkbox" value="${escapeHTML(c)}" class="chk-costos"> ${escapeHTML(c)}
              </label>
            `).join('');
        }

        if (contenedorFirma) {
            contenedorFirma.innerHTML = firmaUnicos.map(f => `
              <label class="opcion-filtro" style="display: block; padding: 6px 12px; cursor: pointer; color: #1e293b;">
                <input type="checkbox" value="${escapeHTML(f)}" class="chk-firma"> ${escapeHTML(f)}
              </label>
            `).join('');
        }
    }

    function configurarDropdowns() {
        if (dropdownsInicializados) return;
        dropdownsInicializados = true;

        const dropdowns = document.querySelectorAll('.filtros');
        dropdowns.forEach(dropdown => {
            const boton = dropdown.querySelector('.btn-dropdown');
            const contenido = dropdown.querySelector('.contenido-dropdown');

            if (boton && contenido) {
                boton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.contenido-dropdown').forEach(c => {
                        if (c !== contenido) {
                            c.classList.remove('mostrar', 'show');
                        }
                    });
                    contenido.classList.toggle('mostrar');
                    contenido.classList.toggle('show');
                });
                contenido.addEventListener('click', (e) => e.stopPropagation());
            }
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.contenido-dropdown').forEach(c => c.classList.remove('mostrar', 'show'));
        });
    }

    function filtrarContratos(todosLosContratos) {
        const obtenerValoresCheckboxes = (selector) => {
            return Array.from(document.querySelectorAll(selector)).filter(chk => chk.checked).map(chk => chk.value);
        };

        const obrasSeleccionadas = obtenerValoresCheckboxes('.chk-obra');
        const direccionSeleccionada = obtenerValoresCheckboxes('.chk-direccion');
        const costosSeleccionados = obtenerValoresCheckboxes('.chk-costos');
        const firmaSeleccionada = obtenerValoresCheckboxes('.chk-firma');

        return todosLosContratos.filter(c => {
            const cumpleObra = obrasSeleccionadas.length === 0 || obrasSeleccionadas.includes(c.project_name);

            const dirValor = c.status_direccion || 'Pendiente';
            const cumpleDireccion = direccionSeleccionada.length === 0 || direccionSeleccionada.includes(dirValor);

            const cosValor = c.estado_costos || 'Pendiente';
            const cumpleCostos = costosSeleccionados.length === 0 || costosSeleccionados.includes(cosValor);

            const firValor = (c.firma === 'Firmado' || c.firma === 'Sí') ? 'Firmado' : 'Pendiente';
            const cumpleFirma = firmaSeleccionada.length === 0 || firmaSeleccionada.includes(firValor);

            return cumpleObra && cumpleDireccion && cumpleCostos && cumpleFirma;
        });
    }

    window.ContratosApp.Filtros = {
        generarOpcionesFiltros,
        configurarDropdowns,
        filtrarContratos
    };
})();