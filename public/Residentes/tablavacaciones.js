(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosVacaciones = [];
  let empleadosSeleccionados = new Set();
  let estadosSeleccionados = new Set();
  let anioGanttSeleccionado = new Date().getFullYear();

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function obtenerDatosDesdeJWT() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("❌ Error al decodificar JWT:", e);
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    configurarDropdownsUI();
    configurarAlternadorVistasUI();
    await cargarDatosVacaciones();
  });

  // ==========================================
  // ALTERNADOR DE PESTAÑAS (TABLA / GANTT)
  // ==========================================
  function configurarAlternadorVistasUI() {
    const btnTabla = document.getElementById('btnVistaTabla');
    const btnGantt = document.getElementById('btnVistaGantt');
    const vistaTabla = document.getElementById('contenedorVistaTabla');
    const vistaGantt = document.getElementById('contenedorVistaGantt');
    const selectAnio = document.getElementById('selectAnioGantt');

    if (!btnTabla || !btnGantt || !vistaTabla || !vistaGantt) return;

    btnTabla.addEventListener('click', () => {
      btnTabla.classList.add('activa');
      btnTabla.style.background = '#2563eb';
      btnTabla.style.color = '#ffffff';

      btnGantt.classList.remove('activa');
      btnGantt.style.background = 'transparent';
      btnGantt.style.color = '#475569';

      vistaTabla.style.display = 'block';
      vistaGantt.style.display = 'none';
    });

    btnGantt.addEventListener('click', () => {
      btnGantt.classList.add('activa');
      btnGantt.style.background = '#2563eb';
      btnGantt.style.color = '#ffffff';

      btnTabla.classList.remove('activa');
      btnTabla.style.background = 'transparent';
      btnTabla.style.color = '#475569';

      vistaTabla.style.display = 'none';
      vistaGantt.style.display = 'block';
    });

    if (selectAnio) {
      selectAnio.addEventListener('change', (e) => {
        anioGanttSeleccionado = parseInt(e.target.value, 10);
        actualizarFiltrosYTabla();
      });
    }
  }

  async function cargarDatosVacaciones() {
    try {
      const token = localStorage.getItem('jwtToken') || '';
      const respuesta = await fetch(`${API_URL}/vacaciones`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!respuesta.ok) throw new Error('Error al consultar el histórico de vacaciones.');

      datosVacaciones = await respuesta.json();
      construirFiltrosIniciales();

    } catch (error) {
      console.error('❌ Error al cargar vacaciones:', error);
      const cuerpo = document.getElementById('cuerpoTablaVacaciones');
      if (cuerpo) {
        cuerpo.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red; padding: 20px;">❌ ${escapeHTML(error.message)}</td></tr>`;
      }
    }
  }

  function configurarDropdownsUI() {
    document.querySelectorAll('.btn-dropdown').forEach(btn => {
      btn.addEventListener('click', (e) => {
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
    const contenedorEmpleados = document.getElementById('filtroEmpleado');
    const contenedorEstados = document.getElementById('filtroEstado');
    const selectAnio = document.getElementById('selectAnioGantt');

    if (!contenedorEmpleados || !contenedorEstados) return;

    const empleadosUnicos = [...new Set(datosVacaciones.map(item => item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`))].sort();
    contenedorEmpleados.innerHTML = empleadosUnicos.map(emp => `
      <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(emp)}" class="chk-empleado"> ${escapeHTML(emp)}</label>
    `).join('');

    const estadosUnicos = ['pendiente', 'autorizada', 'rechazada'];
    contenedorEstados.innerHTML = estadosUnicos.map(est => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${est}" class="chk-estado" ${est === 'pendiente' ? 'checked' : ''}> 
        ${est.charAt(0).toUpperCase() + est.slice(1)}
      </label>
    `).join('');

    if (selectAnio) {
      const aniosExtraidos = datosVacaciones
        .map(v => v.fecha_inicio ? new Date(v.fecha_inicio).getFullYear() : null)
        .filter(a => a !== null);
      
      const aniosUnicos = [...new Set([new Date().getFullYear(), ...aniosExtraidos])].sort((a, b) => b - a);
      
      selectAnio.innerHTML = aniosUnicos.map(a => `
        <option value="${a}" ${a === anioGanttSeleccionado ? 'selected' : ''}>Año ${a}</option>
      `).join('');
    }

    contenedorEmpleados.addEventListener('change', actualizarFiltrosYTabla);
    contenedorEstados.addEventListener('change', actualizarFiltrosYTabla);
    
    actualizarFiltrosYTabla();
  }

  // ==========================================
  // FILTRADO MULTISELECTIVO (CORRECCIÓN ACUMULATIVA)
  // ==========================================
  function actualizarFiltrosYTabla() {
    empleadosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-empleado:checked')).map(cb => cb.value)
    );

    estadosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-estado:checked')).map(cb => cb.value)
    );

    const filtrados = datosVacaciones.filter(item => {
      const empNombre = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
      const estNombreRaw = String(item.estado || 'pendiente').toLowerCase();
      
      // Normalización estandarizada de sinónimos de estado
      const estNombre = (estNombreRaw === 'aprobada') ? 'autorizada' : estNombreRaw;

      const cumpleEmpleado = empleadosSeleccionados.size === 0 || empleadosSeleccionados.has(empNombre);
      const cumpleEstado = estadosSeleccionados.size === 0 || estadosSeleccionados.has(estNombre);

      return cumpleEmpleado && cumpleEstado;
    });

    renderizarTabla(filtrados);
    renderizarGanttVacaciones(filtrados);
  }

  function renderizarTabla(lista) {
    const cuerpo = document.getElementById('cuerpoTablaVacaciones');
    if (!cuerpo) return;

    if (lista.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px;">No hay registros de vacaciones con el filtro seleccionado.</td></tr>`;
      return;
    }

    const jwtDatos = obtenerDatosDesdeJWT() || {};
    const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';

    const userRolNormalizado = userRolRaw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esGerenteAdmin = (
      userRolNormalizado === 'gerente administracion' || 
      userRolNormalizado === 'gerente de administracion' ||
      (userRolNormalizado.includes('gerente') && userRolNormalizado.includes('administrac'))
    );

    cuerpo.innerHTML = lista.map(item => {
      const idVacacion = item.id_vacacion;
      const empNombre = escapeHTML(item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
      const fechaSolicitud = escapeHTML(item.created_at ? item.created_at.split('T')[0] : (item.fecha_solicitud || '-'));
      const fechaInicio = escapeHTML(item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '-');
      const fechaFin = escapeHTML(item.fecha_fin ? item.fecha_fin.split('T')[0] : '-');
      const diasTomados = Number(item.dias_tomados || 0);

      const diasLey = Number(item.dias_vacaciones_ley || 0);
      const diasRestantes = Number(item.dias_restantes || 0);
      
      const estadoRaw = String(item.estado || 'pendiente').toLowerCase();
      
      const esAprobadaOAutorizada = (estadoRaw === 'aprobada' || estadoRaw === 'autorizada');
      const esRechazada = (estadoRaw === 'rechazada');
      const esPendiente = (!esAprobadaOAutorizada && !esRechazada);

      const obsTexto = escapeHTML(item.observaciones || '');

      let selectEstadoHTML = '';
      if (esGerenteAdmin) {
        selectEstadoHTML = `
          <select class="select-estado-tabla" data-id="${idVacacion}" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this)" style="padding: 5px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 13px; color: #334155; font-weight: 500;">
            <option value="pendiente" ${esPendiente ? 'selected' : ''}>Pendiente</option>
            <option value="autorizada" ${esAprobadaOAutorizada ? 'selected' : ''}>Autorizada</option>
            <option value="rechazada" ${esRechazada ? 'selected' : ''}>Rechazada</option>
          </select>
        `;
      } else {
        const textoEstadoFormateado = esAprobadaOAutorizada ? 'Autorizada' : (esRechazada ? 'Rechazada' : 'Pendiente');
        const colorFondo = esAprobadaOAutorizada ? '#16a34a' : (esRechazada ? '#dc2626' : '#eab308');
        selectEstadoHTML = `<span class="badge-status-pago" style="padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #fff; background-color: ${colorFondo}">${textoEstadoFormateado}</span>`;
      }

      let obsHTML = '';
      if (esGerenteAdmin) {
        obsHTML = `<input type="text" value="${obsTexto}" placeholder="Agregar nota..." class="input-obs-tabla" onblur="window.actualizarObservacionVacacion(${idVacacion}, this.value, this)" style="width: 95%; padding: 5px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; color: #334155;">`;
      } else {
        obsHTML = `<span style="color: #475569; font-style: italic; font-size: 12px;">${obsTexto || '-'}</span>`;
      }

      return `
        <tr data-id="${idVacacion}">
          <td><strong>${empNombre}</strong></td>
          <td style="text-align: center;">${fechaSolicitud}</td>
          <td style="text-align: center; color: #2563eb; font-weight: bold;">${diasLey}</td>
          <td style="text-align: center; color: #059669; font-weight: bold;">${diasRestantes}</td>
          <td style="text-align: center;">${fechaInicio}</td>
          <td style="text-align: center;">${fechaFin}</td>
          <td style="text-align: center;"><strong>${diasTomados}</strong></td>
          <td style="text-align: center;">${selectEstadoHTML}</td>
          <td>${obsHTML}</td>
        </tr>
      `;
    }).join('');
  }

  // ==========================================
  // RENDERIZADO DEL DIAGRAMA GANTT ANUAL
  // ==========================================
  function renderizarGanttVacaciones(lista) {
    const contenedorGrid = document.getElementById('ganttGrid');
    if (!contenedorGrid) return;

    const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const anio = anioGanttSeleccionado;

    // Cálculo exacto de días por mes (soporta bisiestos)
    const diasPorMes = nombresMeses.map((_, idx) => new Date(anio, idx + 1, 0).getDate());
    const totalDiasAnio = diasPorMes.reduce((acc, d) => acc + d, 0);

    // 1. Cabecera de Meses
    let htmlHeaderMeses = `<div class="gantt-header-meses"><div class="gantt-col-emp-header">Empleado</div><div style="display:flex; flex-grow:1;">`;
    diasPorMes.forEach((dias, mIdx) => {
      const porcentajeAncho = (dias / totalDiasAnio) * 100;
      htmlHeaderMeses += `<div class="gantt-mes-title" style="width: ${porcentajeAncho}%;">${nombresMeses[mIdx]}</div>`;
    });
    htmlHeaderMeses += `</div></div>`;

    // 2. Cabecera de Días (1..N)
    let htmlHeaderDias = `<div class="gantt-header-dias"><div class="gantt-col-emp-header"></div>`;
    diasPorMes.forEach((dias) => {
      for (let d = 1; d <= dias; d++) {
        htmlHeaderDias += `<div class="gantt-dia-num">${d}</div>`;
      }
    });
    htmlHeaderDias += `</div>`;

    if (!lista || lista.length === 0) {
      contenedorGrid.innerHTML = htmlHeaderMeses + htmlHeaderDias + `<div style="padding: 20px; text-align: center; color: #64748b; grid-column: 1 / -1;">No hay vacaciones programadas para el filtro seleccionado en el año ${anio}.</div>`;
      return;
    }

    // Agrupación de vacaciones por empleado
    const vacacionesPorEmpleado = {};
    lista.forEach(item => {
      const empNombre = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
      if (!vacacionesPorEmpleado[empNombre]) {
        vacacionesPorEmpleado[empNombre] = [];
      }
      vacacionesPorEmpleado[empNombre].push(item);
    });

    // Convierte fecha ISO a índice absoluto (0 .. totalDiasAnio-1)
    function fechaADiaAnual(fStr) {
      if (!fStr) return null;
      const partes = fStr.split('T')[0].split('-');
      if (partes.length !== 3) return null;
      
      const fAnio = parseInt(partes[0], 10);
      const fMes = parseInt(partes[1], 10) - 1; 
      const fDia = parseInt(partes[2], 10);

      if (fAnio !== anio) return null;
      
      let diaAcumulado = 0;
      for (let m = 0; m < fMes; m++) {
        diaAcumulado += diasPorMes[m];
      }
      return diaAcumulado + (fDia - 1);
    }

    // 3. Renderizado de filas por empleado
    let htmlFilasEmpleados = '';
    const listaEmpleadosClaves = Object.keys(vacacionesPorEmpleado).sort();

    listaEmpleadosClaves.forEach((empNombre, filaIdx) => {
      const empNombreEscaped = escapeHTML(empNombre);
      htmlFilasEmpleados += `<div class="gantt-fila-emp"><div class="gantt-emp-nombre" title="${empNombreEscaped}">${empNombreEscaped}</div>`;

      const mapaCeldasAnual = {};

      vacacionesPorEmpleado[empNombre].forEach(v => {
        if (!v.fecha_inicio || !v.fecha_fin) return;

        const idxInicio = fechaADiaAnual(v.fecha_inicio);
        const idxFin = fechaADiaAnual(v.fecha_fin);

        if (idxInicio !== null && idxFin !== null && idxFin >= idxInicio) {
          const duracion = (idxFin - idxInicio) + 1;
          const estClase = String(v.estado || 'pendiente').toLowerCase();
          
          mapaCeldasAnual[idxInicio] = {
            duracion: duracion,
            estado: (estClase === 'aprobada' || estClase === 'autorizada') ? 'autorizada' : 'pendiente',
            diasTomados: Number(v.dias_tomados || 0),
            diasLey: Number(v.dias_vacaciones_ley || 0),
            diasRestantes: Number(v.dias_restantes || 0)
          };
        }
      });

      const claseTooltipPosicion = filaIdx < 2 ? 'tooltip-abajo' : '';

      let d = 0;
      while (d < totalDiasAnio) {
        if (mapaCeldasAnual[d]) {
          const info = mapaCeldasAnual[d];
          const span = info.duracion;
          
          htmlFilasEmpleados += `
            <div class="gantt-celda-dia" style="grid-column: span ${span};">
              <div class="gantt-barra-container">
                <div class="gantt-barra ${info.estado}">
                  ${info.diasTomados}d
                </div>
                <div class="gantt-tooltip ${claseTooltipPosicion}">
                  <strong style="color: #60a5fa; font-size: 12px;">${empNombreEscaped}</strong><br/>
                  <span>📜 Días por Ley: <strong>${info.diasLey}</strong></span><br/>
                  <span>🏖 Días Tomados: <strong>${info.diasTomados}</strong></span><br/>
                  <span>⏳ Días Pendientes: <strong>${info.diasRestantes}</strong></span>
                </div>
              </div>
            </div>
          `;
          d += span;
        } else {
          htmlFilasEmpleados += `<div class="gantt-celda-dia"></div>`;
          d++;
        }
      }

      htmlFilasEmpleados += '</div>';
    });

    contenedorGrid.innerHTML = `<div class="gantt-wrapper-anual" style="--total-dias-anio: ${totalDiasAnio};">` + htmlHeaderMeses + htmlHeaderDias + htmlFilasEmpleados + `</div>`;
  }

  // ==========================================
  // METODOS GLOBALES DE ACTUALIZACION DE ESTADO Y NOTAS
  // ==========================================
  window.actualizarEstadoVacacion = async function(idVacacion, nuevoEstado, elementoInput) {
    const token = localStorage.getItem('jwtToken') || '';

    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ estado: nuevoEstado })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo actualizar el estado.');
      }

      const itemLocal = datosVacaciones.find(item => item.id_vacacion === idVacacion);
      if (itemLocal) {
        itemLocal.estado = nuevoEstado;

        const idEmp = itemLocal.id_employee;
        const totalGozados = datosVacaciones
          .filter(v => v.id_employee === idEmp && (v.estado === 'aprobada' || v.estado === 'autorizada'))
          .reduce((sum, v) => sum + Number(v.dias_tomados || 0), 0);

        datosVacaciones.forEach(v => {
          if (v.id_employee === idEmp) {
            v.dias_gozados = totalGozados;
            v.dias_restantes = Math.max(0, Number(v.dias_vacaciones_ley || 0) - totalGozados);
          }
        });
      }

      actualizarFiltrosYTabla();

    } catch (err) {
      console.error("❌ Error al actualizar estado:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
      await cargarDatosVacaciones();
    }
  };

  window.actualizarObservacionVacacion = async function(idVacacion, nuevaObservacion, elementoInput) {
    const token = localStorage.getItem('jwtToken') || '';
    const trFila = elementoInput ? elementoInput.closest('tr') : document.querySelector(`tr[data-id="${idVacacion}"]`);

    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/observaciones`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ observaciones: nuevaObservacion })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo actualizar la observación.');
      }

      if (trFila) {
        trFila.style.backgroundColor = "#eaffea";
        setTimeout(() => { trFila.style.backgroundColor = ""; }, 600);
      }
    } catch (err) {
      console.error("❌ Error al guardar observación:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };

})();