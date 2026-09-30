(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosSupervision = [];
  let semanasSeleccionadas = new Set();
  let fechasSeleccionadas = new Set();
  let proyectosSeleccionados = new Set();
  let residentesSeleccionados = new Set();

  // MODIFICACIÓN: Función helper para sanitización de cadenas contra inyección XSS
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  // FIN MODIFICACIÓN

  document.addEventListener('DOMContentLoaded', async () => {
    configurarDropdownsUI();
    await cargarDatosSupervision();
  });

  async function cargarDatosSupervision() {
    try {
      const token = localStorage.getItem('jwtToken') || '';
      const respuesta = await fetch(`${API_URL}/supervision`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!respuesta.ok) throw new Error('Error al consultar el histórico de supervisión');

      datosSupervision = await respuesta.json();

      construirFiltrosIniciales();
      renderizarTabla(datosSupervision);

    } catch (error) {
      console.error('Error al cargar datos:', error);
    }
  }

  function configurarDropdownsUI() {
    document.querySelectorAll('.btn-dropdown').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // MODIFICACIÓN: Alerta interactiva cuando se intenta filtrar fecha sin seleccionar semana
        if (btn.id === 'btnFiltroFecha' && semanasSeleccionadas.size === 0) {
          alert('Primero selecciona una semana');
          return;
        }
        // FIN MODIFICACIÓN

        e.stopPropagation();
        const contenedor = btn.nextElementSibling;
        
        document.querySelectorAll('.contenido-dropdown').forEach(d => {
          if (d !== contenedor) d.classList.remove('mostrar');
        });

        contenedor.classList.toggle('mostrar');
      });
    });

    document.querySelectorAll('.contenido-dropdown').forEach(d => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.contenido-dropdown').forEach(d => d.classList.remove('mostrar'));
    });
  }

  function construirFiltrosIniciales() {
    const contenedorProyectos = document.getElementById('filtroProyecto');
    const contenedorResidentes = document.getElementById('filtroResidente');
    const contenedorSemanas = document.getElementById('filtroSemana');
    const contenedorFechas = document.getElementById('filtroFecha');

    if (!contenedorProyectos || !contenedorResidentes || !contenedorSemanas) return;

    const proyectosUnicos = [...new Set(datosSupervision.map(item => item.project_name || `Proyecto #${item.id_project}`))].sort();
    contenedorProyectos.innerHTML = proyectosUnicos.map(p => `
      <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(p)}" class="chk-proyecto"> ${escapeHTML(p)}</label>
    `).join('');

    const residentesUnicos = [...new Set(datosSupervision.map(item => item.residente || item.employee_name || `Empleado #${item.id_employee}`))].sort();
    contenedorResidentes.innerHTML = residentesUnicos.map(r => `
      <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(r)}" class="chk-residente"> ${escapeHTML(r)}</label>
    `).join('');

    const semanasUnicas = [...new Set(datosSupervision.map(item => item.semana))].sort((a, b) => a - b);
    contenedorSemanas.innerHTML = semanasUnicas.map(s => `
      <label class="opcion-filtro"><input type="checkbox" value="${s}" class="chk-semana"> Semana ${s}</label>
    `).join('');

    contenedorProyectos.addEventListener('change', actualizarFiltrosYTabla);
    contenedorResidentes.addEventListener('change', actualizarFiltrosYTabla);
    contenedorSemanas.addEventListener('change', () => {
      actualizarFiltroFechaPorSemana();
      actualizarFiltrosYTabla();
    });

    // MODIFICACIÓN: Asignación única del listener en contenedor de fechas para evitar duplicados
    if (contenedorFechas) {
      contenedorFechas.addEventListener('change', actualizarFiltrosYTabla);
    }
    // FIN MODIFICACIÓN
  }

  function actualizarFiltroFechaPorSemana() {
    const btnFecha = document.getElementById('btnFiltroFecha');
    const contenedorFechas = document.getElementById('filtroFecha');
    
    semanasSeleccionadas = new Set(
      Array.from(document.querySelectorAll('.chk-semana:checked')).map(cb => cb.value)
    );

    if (semanasSeleccionadas.size === 0) {
      btnFecha.title = "Selecciona primero una semana";
      btnFecha.classList.add('deshabilitado');
      contenedorFechas.innerHTML = '';
      fechasSeleccionadas.clear();
      return;
    }

    btnFecha.title = "";
    btnFecha.classList.remove('deshabilitado');

    const fechasFiltradas = [...new Set(
      datosSupervision
        .filter(item => semanasSeleccionadas.has(String(item.semana)))
        .map(item => item.fecha ? item.fecha.split('T')[0] : '')
        .filter(Boolean)
    )].sort();

    contenedorFechas.innerHTML = fechasFiltradas.map(f => `
      <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(f)}" class="chk-fecha"> ${escapeHTML(f)}</label>
    `).join('');
  }

  function actualizarFiltrosYTabla() {
    proyectosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-proyecto:checked')).map(cb => cb.value)
    );

    residentesSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-residente:checked')).map(cb => cb.value)
    );

    semanasSeleccionadas = new Set(
      Array.from(document.querySelectorAll('.chk-semana:checked')).map(cb => cb.value)
    );

    fechasSeleccionadas = new Set(
      Array.from(document.querySelectorAll('.chk-fecha:checked')).map(cb => cb.value)
    );

    const filtrados = datosSupervision.filter(item => {
      const pNombre = item.project_name || `Proyecto #${item.id_project}`;
      const rNombre = item.residente || item.employee_name || `Empleado #${item.id_employee}`;
      const fString = item.fecha ? item.fecha.split('T')[0] : '';

      const cumpleProyecto = proyectosSeleccionados.size === 0 || proyectosSeleccionados.has(pNombre);
      const cumpleResidente = residentesSeleccionados.size === 0 || residentesSeleccionados.has(rNombre);
      const cumpleSemana = semanasSeleccionadas.size === 0 || semanasSeleccionadas.has(String(item.semana));
      const cumpleFecha = fechasSeleccionadas.size === 0 || fechasSeleccionadas.has(fString);

      return cumpleProyecto && cumpleResidente && cumpleSemana && cumpleFecha;
    });

    renderizarTabla(filtrados);
  }

  function renderizarTabla(lista) {
    const cuerpo = document.getElementById('cuerpoTablaSupervision');
    if (!cuerpo) return;

    if (lista.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="11" style="text-align:center;">No hay registros de supervisión.</td></tr>`;
      return;
    }

    cuerpo.innerHTML = lista.map(item => {
      const pNombre = escapeHTML(item.project_name || `Proyecto #${item.id_project}`);
      const rNombre = escapeHTML(item.residente || item.employee_name || `Empleado #${item.id_employee}`);
      const fechaCorta = escapeHTML(item.fecha ? item.fecha.split('T')[0] : '');
      const porcentajeText = (Number(item.evaluacion || 0) * 100).toFixed(2) + '%';

      // MODIFICACIÓN: Separación clara mediante <br> y omitido de Obs cuando la opción es limpia
      const formatRubro = (opcion, justificacion) => {
        const op = escapeHTML(opcion || 'N/A');
        const esCumpleLimpio = String(opcion || '').trim().toLowerCase() === 'a tiempo' || String(opcion || '').trim().toLowerCase() === 'cumple';
        
        if (esCumpleLimpio && !justificacion) {
          return `<div><strong>${op}</strong></div>`;
        }

        const just = justificacion 
          ? `<br><span class="justificacion-txt"><b>Obs:</b> ${escapeHTML(justificacion)}</span>` 
          : '';
          
        return `<div><strong>${op}</strong>${just}</div>`;
      };
      // FIN MODIFICACIÓN

      return `
        <tr>
          <td>${pNombre}</td>
          <td>${rNombre}</td>
          <td>Semana ${item.semana}</td>
          <td>${fechaCorta}</td>
          <td>${formatRubro(item.cumplimiento_planos, item.justificacion_planos)}</td>
          <td>${formatRubro(item.calidad_obra, item.justificacion_calidad)}</td>
          <td>${formatRubro(item.personal_mano_obra, item.justificacion_personal)}</td>
          <td>${formatRubro(item.material_orden_seguridad, item.justificacion_material)}</td>
          <td>${formatRubro(item.cumplimiento_gestoria, item.justificacion_gestoria)}</td>
          <td><strong>${porcentajeText}</strong></td>
          <td>${escapeHTML(item.resultado || 'Sin resultado')}</td>
        </tr>
      `;
    }).join('');
  }

})();