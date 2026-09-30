(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosKpi = [];
  let semanasSeleccionadas = new Set();
  let fechasSeleccionadas = new Set();
  let proyectosSeleccionados = new Set();
  let residentesSeleccionados = new Set();

  document.addEventListener('DOMContentLoaded', async () => {
    configurarDropdownsUI();
    await cargarDatosKpi();
  });

  async function cargarDatosKpi() {
    try {
      const token = localStorage.getItem('jwtToken') || '';
      const respuesta = await fetch(`${API_URL}/kpi`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!respuesta.ok) throw new Error('Error al consultar el histórico de KPIs');

      datosKpi = await respuesta.json();

      construirFiltrosIniciales();
      renderizarTabla(datosKpi);

    } catch (error) {
      console.error('Error al cargar datos KPI:', error);
    }
  }

  function configurarDropdownsUI() {
    document.querySelectorAll('.btn-dropdown').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // MODIFICACIÓN: Si el botón de filtro fecha está deshabilitado, muestra la alerta instructiva
        if (btn.disabled) {
          if (btn.id === 'btnFiltroFecha') {
            alert('Primero selecciona una semana');
          }
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

    if (!contenedorProyectos || !contenedorResidentes || !contenedorSemanas) return;

    const proyectosUnicos = [...new Set(datosKpi.map(item => item.project_name || `Proyecto #${item.id_project}`))].sort();
    contenedorProyectos.innerHTML = proyectosUnicos.map(p => `
      <label class="opcion-filtro"><input type="checkbox" value="${p}" class="chk-proyecto"> ${p}</label>
    `).join('');

    const residentesUnicos = [...new Set(datosKpi.map(item => item.employee_name || `Empleado #${item.id_employee}`))].sort();
    contenedorResidentes.innerHTML = residentesUnicos.map(r => `
      <label class="opcion-filtro"><input type="checkbox" value="${r}" class="chk-residente"> ${r}</label>
    `).join('');

    const semanasUnicas = [...new Set(datosKpi.map(item => item.semana))].sort((a, b) => a - b);
    contenedorSemanas.innerHTML = semanasUnicas.map(s => `
      <label class="opcion-filtro"><input type="checkbox" value="${s}" class="chk-semana"> Semana ${s}</label>
    `).join('');

    contenedorProyectos.addEventListener('change', actualizarFiltrosYTabla);
    contenedorResidentes.addEventListener('change', actualizarFiltrosYTabla);
    contenedorSemanas.addEventListener('change', () => {
      actualizarFiltroFechaPorSemana();
      actualizarFiltrosYTabla();
    });
  }

  function actualizarFiltroFechaPorSemana() {
    const btnFecha = document.getElementById('btnFiltroFecha');
    const contenedorFechas = document.getElementById('filtroFecha');
    
    semanasSeleccionadas = new Set(
      Array.from(document.querySelectorAll('.chk-semana:checked')).map(cb => cb.value)
    );

    if (semanasSeleccionadas.size === 0) {
      btnFecha.disabled = true;
      btnFecha.title = "Selecciona primero una semana";
      contenedorFechas.innerHTML = '';
      fechasSeleccionadas.clear();
      return;
    }

    btnFecha.disabled = false;
    btnFecha.title = "";

    const fechasFiltradas = [...new Set(
      datosKpi
        .filter(item => semanasSeleccionadas.has(String(item.semana)))
        .map(item => item.fecha ? item.fecha.split('T')[0] : '')
        .filter(Boolean)
    )].sort();

    contenedorFechas.innerHTML = fechasFiltradas.map(f => `
      <label class="opcion-filtro"><input type="checkbox" value="${f}" class="chk-fecha"> ${f}</label>
    `).join('');

    contenedorFechas.addEventListener('change', actualizarFiltrosYTabla);
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

    const filtrados = datosKpi.filter(item => {
      const pNombre = item.project_name || `Proyecto #${item.id_project}`;
      const rNombre = item.employee_name || `Empleado #${item.id_employee}`;
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
    const cuerpo = document.getElementById('cuerpoTablaKpi');
    if (!cuerpo) return;

    if (lista.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="13" style="text-align:center;">No hay registros de indicadores de rendimiento.</td></tr>`;
      return;
    }

    cuerpo.innerHTML = lista.map(item => {
      const pNombre = item.project_name || `Proyecto #${item.id_project}`;
      const rNombre = item.employee_name || `Empleado #${item.id_employee}`;
      const fechaCorta = item.fecha ? item.fecha.split('T')[0] : '';

      // MODIFICACIÓN: Ajuste en formatRubro para limpiar el texto cuando la opción es 'A tiempo' sin justificación
      const formatRubro = (opcion, justificacion) => {
        const op = opcion || 'N/A';
        const esATiempo = String(op).trim().toLowerCase() === 'a tiempo';
        
        if (esATiempo && !justificacion) {
          return `<div><strong>${op}</strong></div>`;
        }

        const just = justificacion ? `<span class="justificacion-txt"><b>Obs:</b> ${justificacion}</span>` : '';
        return `<div><strong>${op}</strong>${just}</div>`;
      };
      // FIN MODIFICACIÓN

      return `
        <tr>
          <td>${pNombre}</td>
          <td>${rNombre}</td>
          <td>Semana ${item.semana}</td>
          <td>${fechaCorta}</td>
          <td>${formatRubro(item.reporte_fotografico, item.justificacion_fotografico)}</td> 
          <td>${formatRubro(item.volumen_obra, item.justificacion_volumen)}</td>
          <td>${formatRubro(item.diagrama_gantt, item.justificacion_gantt)}</td>
          <td>${formatRubro(item.atencion_minutas, item.justificacion_minutas)}</td>
          <td>${formatRubro(item.planificacion_actividades, item.justificacion_planificacion)}</td>
          <td>${formatRubro(item.cumplimiento_actividades, item.justificacion_cumplimiento)}</td>
          <td><strong>Desfase:</strong> ${item.desfase || 0}d<br><strong>Extemp:</strong> ${item.extemporaneos || 0}</td>
          <td>${formatRubro(item.supervision, item.justificacion_supervision)}</td>
          <td><strong>${item.avance_fisico_obra || '0%'}</strong></td>
        </tr>
      `;
    }).join('');
  }

})();