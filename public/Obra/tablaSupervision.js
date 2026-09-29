(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosSupervision = [];
  let semanasSeleccionadas = new Set();
  let fechasSeleccionadas = new Set();
  let proyectosSeleccionados = new Set();
  let residentesSeleccionados = new Set();

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

  // Configuración de los desplegables de filtro
  function configurarDropdownsUI() {
    document.querySelectorAll('.btn-dropdown').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.disabled) return;
        e.stopPropagation();
        const contenedor = btn.nextElementSibling;
        
        document.querySelectorAll('.contenido-dropdown').forEach(d => {
          if (d !== contenedor) d.classList.remove('show');
        });

        contenedor.classList.toggle('show');
      });
    });

    // Evita que el dropdown se cierre si el usuario hace clic adentro de las opciones
    document.querySelectorAll('.contenido-dropdown').forEach(d => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.contenido-dropdown').forEach(d => d.classList.remove('show'));
    });
  }

  function construirFiltrosIniciales() {
    const contenedorProyectos = document.getElementById('filtroProyecto');
    const contenedorResidentes = document.getElementById('filtroResidente');
    const contenedorSemanas = document.getElementById('filtroSemana');

    if (!contenedorProyectos || !contenedorResidentes || !contenedorSemanas) return;

    // INICIO MODIFICACIÓN: Mapeo correcto utilizando el alias "residente" devuelto por el backend
    const proyectosUnicos = [...new Set(datosSupervision.map(item => item.project_name || `Proyecto #${item.id_project}`))].sort();
    contenedorProyectos.innerHTML = proyectosUnicos.map(p => `
      <label><input type="checkbox" value="${p}" class="chk-proyecto"> ${p}</label>
    `).join('');

    const residentesUnicos = [...new Set(datosSupervision.map(item => item.residente || item.employee_name || `Empleado #${item.id_employee}`))].sort();
    contenedorResidentes.innerHTML = residentesUnicos.map(r => `
      <label><input type="checkbox" value="${r}" class="chk-residente"> ${r}</label>
    `).join('');

    const semanasUnicas = [...new Set(datosSupervision.map(item => item.semana))].sort((a, b) => a - b);
    contenedorSemanas.innerHTML = semanasUnicas.map(s => `
      <label><input type="checkbox" value="${s}" class="chk-semana"> Semana ${s}</label>
    `).join('');
    // FIN MODIFICACIÓN

    contenedorProyectos.querySelectorAll('.chk-proyecto').forEach(input => {
      input.addEventListener('change', actualizarFiltrosYTabla);
    });

    contenedorResidentes.querySelectorAll('.chk-residente').forEach(input => {
      input.addEventListener('change', actualizarFiltrosYTabla);
    });

    contenedorSemanas.querySelectorAll('.chk-semana').forEach(input => {
      input.addEventListener('change', () => {
        actualizarFiltroFechaPorSemana();
        actualizarFiltrosYTabla();
      });
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
      datosSupervision
        .filter(item => semanasSeleccionadas.has(String(item.semana)))
        .map(item => item.fecha ? item.fecha.split('T')[0] : '')
        .filter(Boolean)
    )].sort();

    contenedorFechas.innerHTML = fechasFiltradas.map(f => `
      <label><input type="checkbox" value="${f}" class="chk-fecha"> ${f}</label>
    `).join('');

    contenedorFechas.querySelectorAll('.chk-fecha').forEach(input => {
      input.addEventListener('change', actualizarFiltrosYTabla);
    });
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
      // INICIO MODIFICACIÓN: Búsqueda del residente por su nombre concatenado devuelto de la BD
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

  // INICIO MODIFICACIÓN: Renderizado detallado con evaluaciones punto por punto y comentarios/justificaciones
  function renderizarTabla(lista) {
    const cuerpo = document.getElementById('cuerpoTablaSupervision');
    if (!cuerpo) return;

    if (lista.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="11" style="text-align:center;">No hay registros de supervisión.</td></tr>`;
      return;
    }

    cuerpo.innerHTML = lista.map(item => {
      const pNombre = item.project_name || `Proyecto #${item.id_project}`;
      const rNombre = item.residente || item.employee_name || `Empleado #${item.id_employee}`;
      const fechaCorta = item.fecha ? item.fecha.split('T')[0] : '';
      const porcentajeText = (Number(item.evaluacion || 0) * 100).toFixed(2) + '%';

      // Auxiliar para formatear opción y su justificación si existe
      const formatRubro = (opcion, justificacion) => {
        const op = opcion || 'N/A';
        const just = justificacion ? `<span class="justificacion-txt"><b>Obs:</b> ${justificacion}</span>` : '';
        return `<div><strong>${op}</strong>${just}</div>`;
      };

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
          <td>${item.resultado || 'Sin resultado'}</td>
        </tr>
      `;
    }).join('');
  }
  // FIN MODIFICACIÓN

})();