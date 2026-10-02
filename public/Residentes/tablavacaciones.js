(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosVacaciones = [];
  let datosEstatusVacaciones = [];
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
    await cargarDatosEstatus();
  });

  function configurarAlternadorVistasUI() {
    const btnTabla = document.getElementById('btnVistaTabla');
    const btnGantt = document.getElementById('btnVistaGantt');
    const btnEstatus = document.getElementById('btnVistaEstatus');

    const vistaTabla = document.getElementById('contenedorVistaTabla');
    const vistaGantt = document.getElementById('contenedorVistaGantt');
    const vistaEstatus = document.getElementById('contenedorVistaEstatus');

    const selectAnio = document.getElementById('selectAnioGantt');

    if (!btnTabla || !btnGantt || !vistaTabla || !vistaGantt) return;

    const jwtDatos = obtenerDatosDesdeJWT() || {};
    const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';

    const userRolNormalizado = userRolRaw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esLaura = (
      userRolNormalizado === 'gerente administracion' || 
      userRolNormalizado === 'gerente de administracion' ||
      (userRolNormalizado.includes('gerente') && userRolNormalizado.includes('administrac'))
    );

    const esLuis = (
      userRolNormalizado === 'director operativo' ||
      (userRolNormalizado.includes('director') && userRolNormalizado.includes('operativ'))
    );

    const puedeVerGantt = esLaura || esLuis;

    if (!puedeVerGantt) {
      btnGantt.style.display = 'none';
    }

    function resetearBotones() {
      [btnTabla, btnGantt, btnEstatus].forEach(btn => {
        if (btn) {
          btn.classList.remove('activa');
          btn.style.background = 'transparent';
          btn.style.color = '#475569';
        }
      });
      if (vistaTabla) vistaTabla.style.display = 'none';
      if (vistaGantt) vistaGantt.style.display = 'none';
      if (vistaEstatus) vistaEstatus.style.display = 'none';
    }

    btnTabla.addEventListener('click', () => {
      resetearBotones();
      btnTabla.classList.add('activa');
      btnTabla.style.background = '#2563eb';
      btnTabla.style.color = '#ffffff';
      vistaTabla.style.display = 'block';
    });

    if (puedeVerGantt) {
      btnGantt.addEventListener('click', () => {
        resetearBotones();
        btnGantt.classList.add('activa');
        btnGantt.style.background = '#2563eb';
        btnGantt.style.color = '#ffffff';
        vistaGantt.style.display = 'block';
      });
    }

    if (btnEstatus && vistaEstatus) {
      btnEstatus.addEventListener('click', () => {
        resetearBotones();
        btnEstatus.classList.add('activa');
        btnEstatus.style.background = '#2563eb';
        btnEstatus.style.color = '#ffffff';
        vistaEstatus.style.display = 'block';
        renderizarVistaEstatus();
      });
    }

    if (selectAnio) {
      selectAnio.addEventListener('change', (e) => {
        anioGanttSeleccionado = parseInt(e.target.value, 10);
        actualizarFiltrosYTabla();
      });
    }
  }

  async function cargarDatosVacaciones() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const token = localStorage.getItem('jwtToken') || '';
      const respuesta = await fetch(`${API_URL}/vacaciones`, {
        signal: controller.signal,
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!respuesta.ok) {
        let mensajeServidor = 'Error al consultar el histórico de vacaciones.';
        try {
          const errorJson = await respuesta.json();
          if (errorJson && errorJson.error) {
            mensajeServidor = errorJson.error;
          }
        } catch (_) {
          mensajeServidor = `Error ${respuesta.status}: ${respuesta.statusText || 'Error interno del servidor'}`;
        }
        throw new Error(mensajeServidor);
      }

      datosVacaciones = await respuesta.json();
      construirFiltrosIniciales();

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('❌ Error al cargar vacaciones:', error);

      const cuerpo = document.getElementById('cuerpoTablaVacaciones');
      if (cuerpo) {
        const msg = error.name === 'AbortError' 
          ? 'La solicitud ha superado el tiempo de espera. Por favor, reintente.' 
          : error.message;

        cuerpo.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; color: #dc2626; padding: 24px; font-weight: 500;">
              ❌ ${escapeHTML(msg)}
            </td>
          </tr>`;
      }
    }
  }

  async function cargarDatosEstatus() {
    try {
      const token = localStorage.getItem('jwtToken') || '';
      const res = await fetch(`${API_URL}/vacaciones/estatus`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        datosEstatusVacaciones = await res.json();
        // MEJORA: Reconstruir filtros iniciales al cargar estatus para incluir plantilla completa
        construirFiltrosIniciales();
      }
    } catch (err) {
      console.error('❌ Error al cargar estatus de vacaciones:', err);
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

  // ==========================================
  // INICIO PARTE MODIFICADA: OPCIÓN 1 (FILTRO UNIFICADO GLOBAL)
  // ==========================================

  // Modificación en construirFiltrosIniciales para combinar empleados de solicitudes y plantilla completa
  function construirFiltrosIniciales() {
    const contenedorEmpleados = document.getElementById('filtroEmpleado');
    const contenedorEstados = document.getElementById('filtroEstado');
    const selectAnio = document.getElementById('selectAnioGantt');

    if (!contenedorEmpleados || !contenedorEstados) return;

    // MEJORA UX Y DATOS: Obtener empleados de las solicitudes
    const empleadosDesdeVacaciones = datosVacaciones.map(item => item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
    
    // MEJORA UX Y DATOS: Obtener empleados de la plantilla completa (estatus) para no omitir a quienes no han solicitado vacaciones
    const empleadosDesdeEstatus = datosEstatusVacaciones.map(item => item.nombre_empleado);

    // Unificación y eliminación de duplicados de forma segura
    const empleadosUnicos = [...new Set([...empleadosDesdeVacaciones, ...empleadosDesdeEstatus])].filter(Boolean).sort();

    // Renderizado seguro con escapeHTML para prevención de vulnerabilidades XSS
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

    contenedorEmpleados.addEventListener('change', () => {
      actualizarFiltrosYTabla();
      // MEJORA UX: Sincronización en tiempo real de la vista Estatus si está activa
      const vistaEstatus = document.getElementById('contenedorVistaEstatus');
      if (vistaEstatus && vistaEstatus.style.display !== 'none') {
        renderizarVistaEstatus();
      }
    });
    
    contenedorEstados.addEventListener('change', actualizarFiltrosYTabla);
    
    actualizarFiltrosYTabla();
  }

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

    const esLaura = (
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
      if (esLaura) {
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
      if (esLaura) {
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

  // Modificación en renderizarVistaEstatus para acoplarse directamente al "Filtro Empleado" superior
  function renderizarVistaEstatus() {
    const contenedor = document.getElementById('contenedorVistaEstatus');
    if (!contenedor) return;

    if (!datosEstatusVacaciones || datosEstatusVacaciones.length === 0) {
      contenedor.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;">No hay datos de estatus de vacaciones disponibles.</div>`;
      return;
    }

    const jwtDatos = obtenerDatosDesdeJWT() || {};
    const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';
    const userRolNormalizado = userRolRaw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const esLaura = (
      userRolNormalizado === 'gerente administracion' || 
      userRolNormalizado === 'gerente de administracion' ||
      (userRolNormalizado.includes('gerente') && userRolNormalizado.includes('administrac'))
    );

    const idUsuarioLogueado = jwtDatos.id_employee || jwtDatos.id || jwtDatos.userId;

    if (esLaura) {
      const arrSeleccionados = Array.from(empleadosSeleccionados);

      // MEJORA UX: Renderizado dinámico directo desde el filtro superior
      if (arrSeleccionados.length === 1) {
        const nombreBuscado = arrSeleccionados[0];
        const empDatos = datosEstatusVacaciones.find(emp => emp.nombre_empleado === nombreBuscado);

        if (empDatos) {
          contenedor.innerHTML = generarHTMLTacometroIndividual(empDatos, true);
        } else {
          contenedor.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
              ⚠️ No se encontraron acumulados de días para el empleado seleccionado.
            </div>`;
        }
      } else {
        // Estado informativo cuando hay 0 o más de 1 empleados seleccionados
        contenedor.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
            👆 Por favor, selecciona un empleado para visualizar su estado.
          </div>`;
      }

    } else {
      // UX ROLES REGULARES: Renderizado automático exclusivo de sus propios datos
      const empDatosPropio = datosEstatusVacaciones.find(emp => Number(emp.id_employee) === Number(idUsuarioLogueado)) || datosEstatusVacaciones[0];
      
      if (empDatosPropio) {
        contenedor.innerHTML = `
          <div style="max-width: 450px; margin: 0 auto;">
            ${generarHTMLTacometroIndividual(empDatosPropio, false)}
          </div>
        `;
      } else {
        contenedor.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;">No se encontraron registros de vacaciones para su usuario.</div>`;
      }
    }
  }

  function generarHTMLTacometroIndividual(emp, esLaura) {
    const diasLey = Number(emp.dias_ley || 0);
    const diasTomados = Number(emp.dias_tomados || 0);
    const diasRestantes = Math.max(0, diasLey - diasTomados);

    const porcentaje = diasLey > 0 ? Math.min(100, Math.max(0, (diasTomados / diasLey) * 100)) : 0;

    return `
      <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); text-align: center; max-width: 450px; margin: 0 auto;">
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1e293b; font-weight: 600;">${escapeHTML(emp.nombre_empleado)}</h3>
        
        <!-- Tacómetro SVG Semi-circular -->
        <div style="position: relative; width: 180px; height: 105px; margin: 0 auto;">
          <svg width="180" height="100" viewBox="0 0 160 90">
            <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="#e2e8f0" stroke-width="14" stroke-linecap="round" />
            <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="#2563eb" stroke-width="14" stroke-linecap="round" 
              stroke-dasharray="220" stroke-dashoffset="${220 - (220 * porcentaje) / 100}" />
          </svg>
          <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); font-size: 22px; font-weight: bold; color: #1e293b;">
            ${diasRestantes} <span style="font-size: 11px; color: #64748b; font-weight: normal;">días rest.</span>
          </div>
        </div>

        <!-- Métricas -->
        <div style="display: flex; justify-content: space-around; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px; font-size: 13px;">
          <div>
            <span style="color: #64748b; display: block; font-size: 11px;">Por Ley</span>
            <strong style="color: #2563eb; font-size: 16px;">${diasLey}</strong>
          </div>
          <div>
            <span style="color: #64748b; display: block; font-size: 11px;">Gozados</span>
            <strong style="color: #dc2626; font-size: 16px;">${diasTomados}</strong>
          </div>
          <div>
            <span style="color: #64748b; display: block; font-size: 11px;">Disponibles</span>
            <strong style="color: #16a34a; font-size: 16px;">${diasRestantes}</strong>
          </div>
        </div>

        ${esLaura ? `
          <!-- Botón unificado utilizando las reglas CSS globales (.btn y [data-action]) -->
          <div style="margin-top: 20px;">
            <button type="button" class="btn" data-action="renovar" onclick="window.forzarRenovacionDias(${emp.id_employee}, '${escapeHTML(emp.nombre_empleado)}')">
              🔄 Forzar Renovación de Días
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  window.forzarRenovacionDias = async function(idEmployee, nombreEmpleado) {
    if (!confirm(`⚠️ ¿Estás segura de forzar la renovación de días para "${nombreEmpleado}"?\n\nEsto restablecerá sus días gozados eliminando las solicitudes registradas del periodo.`)) {
      return;
    }

    const token = localStorage.getItem('jwtToken') || '';

    try {
      const res = await fetch(`${API_URL}/vacaciones/renovar/${idEmployee}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo realizar la renovación.');
      }

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();
      await cargarDatosEstatus();
      renderizarVistaEstatus();

    } catch (err) {
      console.error("❌ Error al renovar días:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };

  function renderizarGanttVacaciones(lista) {
    const contenedorGrid = document.getElementById('ganttGrid');
    if (!contenedorGrid) return;

    const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const anio = anioGanttSeleccionado;

    const diasPorMes = nombresMeses.map((_, idx) => new Date(anio, idx + 1, 0).getDate());
    const totalDiasAnio = diasPorMes.reduce((acc, d) => acc + d, 0);

    let htmlHeaderMeses = `<div class="gantt-header-meses"><div class="gantt-col-emp-header">Empleado</div>`;
    diasPorMes.forEach((dias, mIdx) => {
      htmlHeaderMeses += `<div class="gantt-mes-title" style="grid-column: span ${dias};">${nombresMeses[mIdx]}</div>`;
    });
    htmlHeaderMeses += `</div>`;

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

    const vacacionesPorEmpleado = {};
    lista.forEach(item => {
      const empNombre = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
      if (!vacacionesPorEmpleado[empNombre]) {
        vacacionesPorEmpleado[empNombre] = [];
      }
      vacacionesPorEmpleado[empNombre].push(item);
    });

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

      const totalEmpleados = listaEmpleadosClaves.length;
      let claseTooltipPosicion = '';

      if (totalEmpleados === 1) {
        claseTooltipPosicion = 'tooltip-arriba';
      } else if (filaIdx === 0) {
        claseTooltipPosicion = 'tooltip-abajo';
      } else if (filaIdx === totalEmpleados - 1) {
        claseTooltipPosicion = 'tooltip-arriba';
      } else {
        claseTooltipPosicion = 'tooltip-arriba';
      }

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
      await cargarDatosEstatus();

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