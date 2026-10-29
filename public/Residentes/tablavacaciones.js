(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosVacaciones = [];
  let datosEstatusVacaciones = [];
  let empleadosSeleccionados = new Set();
  let estadosSeleccionados = new Set();
  // MODIFICACIÓN (Filtros UX): Estado para el nuevo filtro de expedientes
  let expedientesSeleccionados = new Set();
  let anioGanttSeleccionado = new Date().getFullYear();

  function obtenerNthDiaDelMes(anio, mesZeroBased, diaSemanaDeseado, nOcurrencia) {
    let fecha = new Date(anio, mesZeroBased, 1);
    let conteo = 0;
    while (fecha.getMonth() === mesZeroBased) {
      if (fecha.getDay() === diaSemanaDeseado) {
        conteo++;
        if (conteo === nOcurrencia) {
          const m = String(mesZeroBased + 1).padStart(2, '0');
          const d = String(fecha.getDate()).padStart(2, '0');
          return `${anio}-${m}-${d}`;
        }
      }
      fecha.setDate(fecha.getDate() + 1);
    }
    return null;
  }

  function obtenerFestivosOficialesMexico(anio) {
    const festivos = new Set([
      `${anio}-01-01`, // Año Nuevo
      `${anio}-05-01`, // Día del Trabajo
      `${anio}-09-16`, // Día de la Independencia
      `${anio}-12-25`, // Navidad
      // Lunes conmemorativos según Art. 74 LFT:
      obtenerNthDiaDelMes(anio, 1, 1, 1), // Aniversario Constitución (1er lunes de Feb)
      obtenerNthDiaDelMes(anio, 2, 1, 3), // Natalicio Benito Juárez (3er lunes de Mar)
      obtenerNthDiaDelMes(anio, 10, 1, 3) // Revolución Mexicana (3er lunes de Nov)
    ]);
    return festivos;
  }

  function calcularDiasHabilesEfectivos(fInicioStr, fFinStr) {
    if (!fInicioStr || !fFinStr) return 0;

    const inicio = new Date(`${fInicioStr.split('T')[0]}T00:00:00`);
    const fin = new Date(`${fFinStr.split('T')[0]}T00:00:00`);

    if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || inicio > fin) return 0;

    let diasHabiles = 0;
    const fechaActual = new Date(inicio);
    const cacheFestivosAnio = {};

    while (fechaActual <= fin) {
      const diaSemana = fechaActual.getDay();
      const anio = fechaActual.getFullYear();
      const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
      const dia = String(fechaActual.getDate()).padStart(2, '0');
      const fechaClave = `${anio}-${mes}-${dia}`;

      if (!cacheFestivosAnio[anio]) {
        cacheFestivosAnio[anio] = obtenerFestivosOficialesMexico(anio);
      }

      if (diaSemana !== 0 && diaSemana !== 6 && !cacheFestivosAnio[anio].has(fechaClave)) {
        diasHabiles++;
      }

      fechaActual.setDate(fechaActual.getDate() + 1);
    }

    return diasHabiles;
  }

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
      userRolNormalizado === 'director general' ||
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
      
      // MODIFICACIÓN (UX / Estado de Filtros): Solo construir filtros la primera vez si el DOM está vacío
      const contenedorExpediente = document.getElementById('filtroExpediente');
      if (!contenedorExpediente || contenedorExpediente.children.length === 0) {
        construirFiltrosIniciales();
      } else {
        actualizarFiltrosYTabla();
      }

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
            <td colspan="10" style="text-align: center; color: #dc2626; padding: 24px; font-weight: 500;">
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

        const vistaEstatus = document.getElementById('contenedorVistaEstatus');
        if (vistaEstatus && vistaEstatus.style.display !== 'none') {
          renderizarVistaEstatus();
        }
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

  // MODIFICACIÓN (UX / Filtros): Removida la preselección inicial y agregado el Filtro Expediente
  function construirFiltrosIniciales() {
    const contenedorEmpleados = document.getElementById('filtroEmpleado');
    const contenedorEstados = document.getElementById('filtroEstado');
    const contenedorExpediente = document.getElementById('filtroExpediente');
    const selectAnio = document.getElementById('selectAnioGantt');

    if (!contenedorEmpleados || !contenedorEstados) return;

    const empleadosDesdeVacaciones = datosVacaciones.map(item => item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
    const empleadosDesdeEstatus = datosEstatusVacaciones.map(item => item.nombre_empleado);

    const empleadosUnicos = [...new Set([...empleadosDesdeVacaciones, ...empleadosDesdeEstatus])].filter(Boolean).sort();

    contenedorEmpleados.innerHTML = empleadosUnicos.map(emp => `
      <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(emp)}" class="chk-empleado"> ${escapeHTML(emp)}</label>
    `).join('');

    // Se remueve 'checked' para no preseleccionar nada al cargar/refrescar la página
    const estadosUnicos = ['pendiente', 'autorizada', 'rechazada'];
    contenedorEstados.innerHTML = estadosUnicos.map(est => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${est}" class="chk-estado"> 
        ${est.charAt(0).toUpperCase() + est.slice(1)}
      </label>
    `).join('');

    // Inyección de opciones para Filtro Expediente
    if (contenedorExpediente) {
      contenedorExpediente.innerHTML = `
        <label class="opcion-filtro">
          <input type="checkbox" value="pendiente" class="chk-expediente"> Pendiente de archivo
        </label>
        <label class="opcion-filtro">
          <input type="checkbox" value="archivado" class="chk-expediente"> Archivado
        </label>
      `;
      contenedorExpediente.addEventListener('change', actualizarFiltrosYTabla);
    }

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
      const vistaEstatus = document.getElementById('contenedorVistaEstatus');
      if (vistaEstatus && vistaEstatus.style.display !== 'none') {
        renderizarVistaEstatus();
      }
    });
    
    contenedorEstados.addEventListener('change', actualizarFiltrosYTabla);
    
    actualizarFiltrosYTabla();
  }

  // MODIFICACIÓN (UX / Filtros): Evaluación combinada de empleados, estados y expedientes
  function actualizarFiltrosYTabla() {
    const posicionScroll = window.scrollY || document.documentElement.scrollTop;

    empleadosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-empleado:checked')).map(cb => cb.value)
    );

    estadosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-estado:checked')).map(cb => cb.value)
    );

    expedientesSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-expediente:checked')).map(cb => cb.value)
    );

    const filtrados = datosVacaciones.filter(item => {
      const empNombre = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
      const estNombreRaw = String(item.estado || 'pendiente').toLowerCase();
      const estNombre = (estNombreRaw === 'aprobada') ? 'autorizada' : estNombreRaw;

      // Clasificación de Expediente
      const tieneExpediente = Boolean(item.documento_firmado_url);
      const estExpediente = tieneExpediente ? 'archivado' : 'pendiente';

      const cumpleEmpleado = empleadosSeleccionados.size === 0 || empleadosSeleccionados.has(empNombre);
      const cumpleEstado = estadosSeleccionados.size === 0 || estadosSeleccionados.has(estNombre);
      const cumpleExpediente = expedientesSeleccionados.size === 0 || expedientesSeleccionados.has(estExpediente);

      return cumpleEmpleado && cumpleEstado && cumpleExpediente;
    });

    renderizarTabla(filtrados);
    renderizarGanttVacaciones(filtrados);
    window.scrollTo(0, posicionScroll);
  }

  function renderizarTabla(lista) {
    const cuerpo = document.getElementById('cuerpoTablaVacaciones');
    if (!cuerpo) return;

    if (lista.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px;">No hay registros de vacaciones con el filtro seleccionado.</td></tr>`;
      return;
    }

    const jwtDatos = obtenerDatosDesdeJWT() || {};
    const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';

    const userRolNormalizado = userRolRaw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esDirectorOperativo = (
      userRolNormalizado === 'director operativo' || 
      userRolNormalizado === 'director_operativo' ||
      userRolNormalizado === 'director general' ||
      (userRolNormalizado.includes('director') && userRolNormalizado.includes('operativ'))
    );

    const esGerenteAdmin = (
      userRolNormalizado === 'gerente administracion' || 
      userRolNormalizado === 'gerente de administracion' ||
      (userRolNormalizado.includes('gerente') && userRolNormalizado.includes('administrac'))
    );

    // MODIFICACIÓN (Acumulado de Días): Calcular el total acumulado de días tomados por cada empleado (excluyendo rechazadas)
    const mapaGozadosPorEmpleado = {};
    datosVacaciones.forEach(v => {
      const idEmp = String(v.id_employee);
      const est = String(v.estado || 'pendiente').toLowerCase();
      
      // Se acumulan los días si la solicitud está en estado pendiente, aprobada o autorizada (no rechazada)
      if (est !== 'rechazada') {
        const dTomados = (v.fecha_inicio && v.fecha_fin)
          ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin)
          : Number(v.dias_tomados || 0);

        mapaGozadosPorEmpleado[idEmp] = (mapaGozadosPorEmpleado[idEmp] || 0) + dTomados;
      }
    });

    cuerpo.innerHTML = lista.map(item => {
      const idVacacion = item.id_vacacion;
      const empNombre = escapeHTML(item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
      const fechaSolicitud = escapeHTML(item.created_at ? item.created_at.split('T')[0] : (item.fecha_solicitud || '-'));
      const fechaInicio = escapeHTML(item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '-');
      const fechaFin = escapeHTML(item.fecha_fin ? item.fecha_fin.split('T')[0] : '-');

      const diasTomados = (item.fecha_inicio && item.fecha_fin)
        ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin)
        : Number(item.dias_tomados || 0);

      const diasLey = Number(item.dias_vacaciones_ley || item.dias_ley || 0);

      // MODIFICACIÓN: Restar el acumulado total del empleado a los días por ley
      const idEmpKey = String(item.id_employee);
      const totalGozadosEmpleado = mapaGozadosPorEmpleado[idEmpKey] || 0;
      const diasRestantes = Math.max(0, diasLey - totalGozadosEmpleado);
      
      const estadoRaw = String(item.estado || 'pendiente').toLowerCase();
      const esAprobadaOAutorizada = (estadoRaw === 'aprobada' || estadoRaw === 'autorizada');
      const esRechazada = (estadoRaw === 'rechazada');
      const esPendiente = (!esAprobadaOAutorizada && !esRechazada);

      const obsTexto = escapeHTML(item.observaciones || '');
      const documentoUrl = item.documento_firmado_url || '';

      let selectEstadoHTML = '';
      if (esDirectorOperativo) {
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
      if (esDirectorOperativo) {
        obsHTML = `<input type="text" value="${obsTexto}" placeholder="Agregar nota..." class="input-obs-tabla" onblur="window.actualizarObservacionVacacion(${idVacacion}, this.value, this)" style="width: 95%; padding: 5px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; color: #334155;">`;
      } else {
        obsHTML = `<span style="color: #475569; font-style: italic; font-size: 12px;">${obsTexto || '-'}</span>`;
      }

      let expedienteHTML = '<span style="color:#94a3b8; font-size:12px;">---</span>';
      if (documentoUrl) {
        expedienteHTML = `<a href="${escapeHTML(documentoUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:4px; padding:4px 8px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:4px; font-weight:bold; text-decoration:none; font-size:12px;">📎 Ver Expediente</a>`;
      } else if (esAprobadaOAutorizada) {
        if (esGerenteAdmin || esDirectorOperativo) {
          expedienteHTML = `
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
              <button type="button" onclick="window.generarPdfImpresion(${idVacacion})" style="padding:4px 8px; background:#1e293b; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">📄 Imprimir Formato</button>
              <label style="padding:4px 8px; background:#2563eb; color:#fff; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600; text-align:center;">
                📤 Subir Firmado
                <input type="file" accept="application/pdf" style="display:none;" onchange="window.subirExpedienteFirmado(${idVacacion}, this)">
              </label>
            </div>
          `;
        } else {
          expedienteHTML = `<span style="color:#d97706; font-size:12px; font-weight:500;">⏳ Pendiente Firma</span>`;
        }
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
          <td style="text-align: center;">${expedienteHTML}</td> 
        </tr>
      `;
    }).join('');
  }

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

    const esDirectorOperativo = (
      userRolNormalizado === 'director operativo' || 
      userRolNormalizado === 'director_operativo' ||
      userRolNormalizado === 'director general' ||
      (userRolNormalizado.includes('director') && userRolNormalizado.includes('operativ'))
    );

    const puedeVerEstatusGlobal = esLaura || esDirectorOperativo;
    const idUsuarioLogueado = jwtDatos.id_employee || jwtDatos.id || jwtDatos.userId;

    if (puedeVerEstatusGlobal) {
      const arrSeleccionados = Array.from(empleadosSeleccionados);

      if (arrSeleccionados.length === 1) {
        const nombreBuscado = arrSeleccionados[0];
        const empDatos = datosEstatusVacaciones.find(emp => emp.nombre_empleado === nombreBuscado);

        if (empDatos) {
          contenedor.innerHTML = generarHTMLTacometroIndividual(empDatos, esDirectorOperativo);
        } else {
          contenedor.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
              ⚠️ No se encontraron acumulados de días para el empleado seleccionado.
            </div>`;
        }
      } else {
        contenedor.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
            👆 Por favor, selecciona un empleado para visualizar su estado.
          </div>`;
      }

    } else {
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

  function generarHTMLTacometroIndividual(emp, esDirectorOperativo) {
    const diasLey = Number(emp.dias_ley || 0);
    const diasTomados = Number(emp.dias_tomados || 0);
    const diasRestantes = Math.max(0, diasLey - diasTomados);

    const porcentaje = diasLey > 0 ? Math.min(100, Math.max(0, (diasTomados / diasLey) * 100)) : 0;
    const dashOffset = 220 * ((100 - porcentaje) / 100);

    return `
      <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); text-align: center; max-width: 450px; margin: 0 auto;">
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1e293b; font-weight: 600;">${escapeHTML(emp.nombre_empleado)}</h3>
        
        <div style="position: relative; width: 180px; height: 105px; margin: 0 auto;">
          <svg width="180" height="100" viewBox="0 0 160 90">
            <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="#e2e8f0" stroke-width="14" stroke-linecap="round" />
            <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="#2563eb" stroke-width="14" stroke-linecap="round" 
                  stroke-dasharray="220" stroke-dashoffset="${dashOffset}" />
          </svg>
          <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); font-size: 22px; font-weight: bold; color: #1e293b;">
            ${diasRestantes} <span style="font-size: 11px; color: #64748b; font-weight: normal;">días rest.</span>
          </div>
        </div>

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

        ${esDirectorOperativo ? `
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
          
          const diasTomadosGantt = (v.fecha_inicio && v.fecha_fin)
            ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin)
            : Number(v.dias_tomados || 0);

          mapaCeldasAnual[idxInicio] = {
            duracion: duracion,
            estado: (estClase === 'aprobada' || estClase === 'autorizada') ? 'autorizada' : 'pendiente',
            diasTomados: diasTomadosGantt,
            diasLey: Number(v.dias_vacaciones_ley || 0),
            diasRestantes: Math.max(0, Number(v.dias_vacaciones_ley || 0) - diasTomadosGantt)
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
          .reduce((sum, v) => {
            const dHabiles = (v.fecha_inicio && v.fecha_fin)
              ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin)
              : Number(v.dias_tomados || 0);
            return sum + dHabiles;
          }, 0);

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

  window.generarPdfImpresion = function(idVacacion) {
    const item = datosVacaciones.find(v => String(v.id_vacacion) === String(idVacacion));
    if (!item) {
      alert("⚠️ No se encontró la información de la solicitud de vacaciones.");
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("❌ La librería jsPDF no está cargada correctamente en el navegador. Por favor recargue la página.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter'
    });

    const nombreEmpleadoVal = item.nombre_empleado || `Empleado ID #${item.id_employee}`;
    const primerNombreVal = String(nombreEmpleadoVal).trim().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const fechaIngresoVal = item.hire_date ? String(item.hire_date).split('T')[0] : '---';
    const fechaInicioVal = item.fecha_inicio ? String(item.fecha_inicio).split('T')[0] : '---';
    const fechaFinVal = item.fecha_fin ? String(item.fecha_fin).split('T')[0] : '---';
    const periodoVal = item.periodo || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    const diasTomadosVal = (item.fecha_inicio && item.fecha_fin)
      ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin)
      : Number(item.dias_tomados || 0);

    const diasLeyVal = Number(item.dias_vacaciones_ley || item.dias_ley || 0);
    const diasRestantesVal = Math.max(0, diasLeyVal - diasTomadosVal);

    doc.setFillColor(6, 18, 30);
    doc.rect(15, 12, 186, 12, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(6, 18, 30);
    doc.text("MODISA - CONSTANCIA DE VACACIONES", 108, 32, { align: "center" });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, 42, 201, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const textoIntro = "En atención a la solicitud presentada, se autoriza el periodo vacacional correspondiente al colaborador según las siguientes especificaciones:";
    doc.text(doc.splitTextToSize(textoIntro, 186), 15, 50);

    let startY = 62;
    const filaAltura = 12;

    const datosTabla = [
      ["Nombre del Empleado:", nombreEmpleadoVal],
      ["Fecha de Ingreso:", fechaIngresoVal],
      ["Periodo Correspondiente:", periodoVal],
      ["Días Solicitados:", `${diasTomadosVal} día(s)`],
      ["Días Restantes a Gozar:", `${diasRestantesVal} día(s)`],
      ["Fecha de Inicio:", fechaInicioVal],
      ["Fecha de Término:", fechaFinVal]
    ];

    datosTabla.forEach(([colLabel, colValue], index) => {
      const currentY = startY + (index * filaAltura);

      doc.setFillColor(248, 250, 252);
      doc.rect(15, currentY, 65, filaAltura, 'F');
      
      doc.setDrawColor(203, 213, 225);
      doc.rect(15, currentY, 65, filaAltura, 'D');
      doc.rect(80, currentY, 121, filaAltura, 'D');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(colLabel, 18, currentY + 7.5);

      doc.setFont("helvetica", index === 0 || index === 3 || index === 4 ? "bold" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(String(colValue), 83, currentY + 7.5);
    });

    const finalTablaY = startY + (datosTabla.length * filaAltura) + 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const textoCompromiso = "El empleado se compromete a reincorporarse a sus labores habituales al día hábil siguiente del término de su periodo vacacional autorizado.";
    doc.text(doc.splitTextToSize(textoCompromiso, 186), 15, finalTablaY);

    const firmasY = finalTablaY + 45;

    doc.setDrawColor(6, 18, 30);
    doc.setLineWidth(0.6);
    doc.line(18, firmasY, 68, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(doc.splitTextToSize(nombreEmpleadoVal, 50), 43, firmasY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Firma del Empleado", 43, firmasY + 13, { align: "center" });

    doc.setDrawColor(6, 18, 30);
    doc.line(78, firmasY, 128, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Gerencia de Administración", 103, firmasY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Revisado y Registrado", 103, firmasY + 13, { align: "center" });

    doc.setDrawColor(6, 18, 30);
    doc.line(138, firmasY, 188, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Dirección Operativa", 163, firmasY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Autorizado", 163, firmasY + 13, { align: "center" });

    const nombreArchivo = `Constancia_Vacaciones_${primerNombreVal}_${periodoVal}.pdf`;
    doc.save(nombreArchivo);
  };

  window.subirExpedienteFirmado = async function(idVacacion, inputElement) {
    if (!inputElement || !inputElement.files || inputElement.files.length === 0) return;

    const archivo = inputElement.files[0];

    if (archivo.type !== 'application/pdf') {
      alert("❌ Únicamente se permiten archivos en formato PDF.");
      inputElement.value = '';
      return;
    }

    if (archivo.size > 10 * 1024 * 1024) {
      alert("❌ El archivo supera el límite máximo permitido de 10 MB.");
      inputElement.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('expediente', archivo);

    const token = localStorage.getItem('jwtToken') || '';

    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/expediente`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al subir el expediente firmado.');
      }

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();

    } catch (err) {
      console.error("❌ Error al subir expediente firmado:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
      inputElement.value = '';
    }
  };

})();