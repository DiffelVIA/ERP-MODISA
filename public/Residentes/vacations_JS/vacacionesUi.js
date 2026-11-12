// MODIFICACIÓN SOLUCIÓN: Definición local de helpers utilitarios para saneamiento XSS y cálculo de días
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Parseo robusto concatenando hora local T00:00:00 para evitar desfases UTC/Local
function calcularDiasHabilesEfectivos(inicio, fin) {
  if (!inicio || !fin) return 0;
  
  const strInicio = String(inicio).split('T')[0];
  const strFin = String(fin).split('T')[0];

  const fInicio = new Date(`${strInicio}T00:00:00`);
  const fFin = new Date(`${strFin}T00:00:00`);

  if (isNaN(fInicio.getTime()) || isNaN(fFin.getTime()) || fInicio > fFin) return 0;

  let dias = 0;
  let cursor = new Date(fInicio);
  while (cursor <= fFin) {
    const diaSemana = cursor.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) { // Excluir sábados y domingos
      dias++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function formatearFechaCorta(fStr) {
  if (!fStr) return '-';
  const partes = String(fStr).split('T')[0].split('-');
  if (partes.length !== 3) return escapeHTML(fStr);
  return `${escapeHTML(partes[2])}/${escapeHTML(partes[1])}/${escapeHTML(partes[0])}`;
}

// Caché maestro por año para conservar totales globales aunque la vista esté filtrada
const cacheDatosCompletosPorAnio = {};

// Portal de Tooltip flotante global en document.body para escapar del overflow del scroll
function inicializarTooltipGlobalGantt() {
  let tooltipEl = document.getElementById('ganttTooltipFlotanteGlobal');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'ganttTooltipFlotanteGlobal';
    tooltipEl.className = 'gantt-tooltip-global';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
  }

  if (document.body.dataset.ganttTooltipDelegado === 'true') return;
  document.body.dataset.ganttTooltipDelegado = 'true';

  const mostrarTooltip = (barra) => {
    const htmlContenido = barra.getAttribute('data-tooltip-html');
    if (!htmlContenido) return;

    tooltipEl.innerHTML = htmlContenido;
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.opacity = '0';
    tooltipEl.style.display = 'block';

    const rectBarra = barra.getBoundingClientRect();
    const rectTooltip = tooltipEl.getBoundingClientRect();

    let left = rectBarra.left + (rectBarra.width / 2) - (rectTooltip.width / 2);
    const margenSeguridad = 12;
    if (left < margenSeguridad) left = margenSeguridad;
    if (left + rectTooltip.width > window.innerWidth - margenSeguridad) {
      left = window.innerWidth - rectTooltip.width - margenSeguridad;
    }

    const espacioArriba = rectBarra.top;
    const umbralSuperior = 165;

    if (espacioArriba < umbralSuperior) {
      tooltipEl.style.top = `${rectBarra.bottom + 8}px`;
      tooltipEl.classList.remove('flecha-abajo');
      tooltipEl.classList.add('flecha-arriba');
    } else {
      tooltipEl.style.top = `${rectBarra.top - rectTooltip.height - 8}px`;
      tooltipEl.classList.remove('flecha-arriba');
      tooltipEl.classList.add('flecha-abajo');
    }

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.visibility = 'visible';
    tooltipEl.style.opacity = '1';
  };

  const ocultarTooltip = () => {
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.opacity = '0';
  };

  document.addEventListener('mouseover', (e) => {
    const barra = e.target.closest('.gantt-barra[data-tooltip-html]');
    if (barra) mostrarTooltip(barra);
  });

  document.addEventListener('mouseout', (e) => {
    const barra = e.target.closest('.gantt-barra[data-tooltip-html]');
    if (barra && !barra.contains(e.relatedTarget)) {
      ocultarTooltip();
    }
  });

  document.addEventListener('focusin', (e) => {
    const barra = e.target.closest('.gantt-barra[data-tooltip-html]');
    if (barra) mostrarTooltip(barra);
  });

  document.addEventListener('focusout', (e) => {
    const barra = e.target.closest('.gantt-barra[data-tooltip-html]');
    if (barra) ocultarTooltip();
  });

  window.addEventListener('scroll', ocultarTooltip, true);
}

export function renderizarTabla(lista, datosVacaciones, obtenerDatosDesdeJWT) {
  const cuerpo = document.getElementById('cuerpoTablaVacaciones');
  if (!cuerpo) return;

  if (Array.isArray(datosVacaciones) && datosVacaciones.length > 0) {
    datosVacaciones.forEach(v => {
      const fStr = String(v.fecha_inicio || '');
      const anioReg = fStr.split('-')[0];
      if (anioReg && anioReg.length === 4) {
        cacheDatosCompletosPorAnio[anioReg] = datosVacaciones;
      }
    });
  }

  if (lista.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 20px;">No hay registros de vacaciones con el filtro seleccionado.</td></tr>`;
    return;
  }

  const jwtDatos = obtenerDatosDesdeJWT() || {};
  const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';
  const userRolNormalizado = userRolRaw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Extraer el ID del usuario en sesión desde el token JWT
  const idUsuarioSesion = jwtDatos.id_employee || jwtDatos.id || jwtDatos.userId || null;

  const esGerenteAdmin = (
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

  // Mapeo de días autorizados acumulados por empleado para calcular Días Faltantes
  const mapaGozadosAprobados = {};
  (datosVacaciones || lista).forEach(v => {
    const idEmp = String(v.id_employee);
    const estJefe = String(v.estado_jefe || 'pendiente').toLowerCase();
    const estDir = String(v.estado_director || 'pendiente').toLowerCase();
    const estGlobal = String(v.estado || 'pendiente').toLowerCase();

    const esTotalmenteAprobada = (
      ((estJefe === 'autorizada' || estJefe === 'aprobada') && (estDir === 'autorizada' || estDir === 'aprobada')) ||
      estGlobal === 'aprobada' || estGlobal === 'autorizada'
    );

    if (esTotalmenteAprobada) {
      const dTomados = (v.dias_tomados !== undefined && v.dias_tomados !== null && Number(v.dias_tomados) > 0)
        ? Number(v.dias_tomados)
        : ((v.fecha_inicio && v.fecha_fin) ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin) : 0);

      mapaGozadosAprobados[idEmp] = (mapaGozadosAprobados[idEmp] || 0) + dTomados;
    }
  });

  cuerpo.innerHTML = lista.map(item => {
    const idVacacion = item.id_vacacion;
    const empNombre = escapeHTML(item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
    const fechaSolicitud = escapeHTML(item.fecha_solicitud ? item.fecha_solicitud.split('T')[0] : (item.created_at ? item.created_at.split('T')[0] : '-'));
    const fechaInicio = escapeHTML(item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '-');
    const fechaFin = escapeHTML(item.fecha_fin ? item.fecha_fin.split('T')[0] : '-');

    const diasTomados = (item.dias_tomados !== undefined && item.dias_tomados !== null && Number(item.dias_tomados) > 0)
      ? Number(item.dias_tomados)
      : ((item.fecha_inicio && item.fecha_fin) ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin) : 0);

    const diasLey = Number(item.dias_vacaciones_ley || item.dias_ley || 0);
    const idEmpKey = String(item.id_employee);
    const totalGozados = mapaGozadosAprobados[idEmpKey] || 0;
    
    // Cálculo dinámico de Días Faltantes (Restantes por disfrutar)
    const diasFaltantes = Math.max(0, diasLey - totalGozados);

    const estadoJefe = String(item.estado_jefe || 'pendiente').toLowerCase();
    const estadoDir = String(item.estado_director || 'pendiente').toLowerCase();

    // Únicamente si AMBOS niveles están en 'autorizada' o 'aprobada' se aprueba globalmente
    const totalmenteAutorizada = (
      (estadoJefe === 'autorizada' || estadoJefe === 'aprobada') &&
      (estadoDir === 'autorizada' || estadoDir === 'aprobada')
    );

    const obtenerEstiloEstado = (estado) => {
      if (estado === 'autorizada' || estado === 'aprobada') return 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;';
      if (estado === 'rechazada') return 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;';
      return 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;'; // Pendiente
    };

    // MODIFICACIÓN SOLUCIÓN: Solo el jefe directo asignado (id_manager === idUsuarioSesion) puede editar Jefe Inmediato.
    // Gerente de Administración ya no tiene permiso global sobre esta columna, solo sobre sus subordinados directos.
    const esJefeAsignado = (
      idUsuarioSesion !== null &&
      item.id_manager !== null &&
      item.id_manager !== undefined &&
      String(item.id_manager) === String(idUsuarioSesion)
    );
    const puedeEditarJefe = esJefeAsignado;

    let selectJefeHTML = '';
    if (puedeEditarJefe) {
      selectJefeHTML = `
        <select class="select-estado-tabla" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this, 'jefe')" style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; ${obtenerEstiloEstado(estadoJefe)}">
          <option value="pendiente" ${estadoJefe === 'pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
          <option value="autorizada" ${estadoJefe === 'autorizada' || estadoJefe === 'aprobada' ? 'selected' : ''}>🟢 Autorizada</option>
          <option value="rechazada" ${estadoJefe === 'rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
        </select>`;
    } else {
      selectJefeHTML = `<span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; display: inline-block; ${obtenerEstiloEstado(estadoJefe)}">${escapeHTML(estadoJefe.toUpperCase())}</span>`;
    }

    // Solo Director Operativo puede editar la columna de Dirección Operativa
    let selectDirHTML = '';
    if (esDirectorOperativo) {
      selectDirHTML = `
        <select class="select-estado-tabla" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this, 'director')" style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; ${obtenerEstiloEstado(estadoDir)}">
          <option value="pendiente" ${estadoDir === 'pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
          <option value="autorizada" ${estadoDir === 'autorizada' || estadoDir === 'aprobada' ? 'selected' : ''}>🟢 Autorizada</option>
          <option value="rechazada" ${estadoDir === 'rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
        </select>`;
    } else {
      selectDirHTML = `<span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; display: inline-block; ${obtenerEstiloEstado(estadoDir)}">${escapeHTML(estadoDir.toUpperCase())}</span>`;
    }

    let expedienteHTML = '<span style="color:#94a3b8; font-size:12px;">---</span>';
    if (item.documento_firmado_url) {
      expedienteHTML = `<a href="${escapeHTML(item.documento_firmado_url)}" target="_blank" rel="noopener noreferrer" style="padding:4px 8px; background:#eff6ff; color:#2563eb; border-radius:4px; font-weight:bold; font-size:11px; text-decoration:none;">📎 Ver Expediente</a>`;
    } else if (totalmenteAutorizada) {
      if (esGerenteAdmin) {
        expedienteHTML = `
          <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
            <button type="button" onclick="window.generarPdfImpresion(${idVacacion})" style="padding:4px 8px; background:#1e293b; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">📄 Imprimir Formato</button>
            <label style="padding:4px 8px; background:#2563eb; color:#fff; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">
              📤 Subir Firmado
              <input type="file" accept="application/pdf" style="display:none;" onchange="window.subirExpedienteFirmado(${idVacacion}, this)">
            </label>
          </div>`;
      } else {
        expedienteHTML = `<span style="color:#2563eb; font-size:11px; font-weight:bold;">✅ Autorizada (Pendiente Impresión Admin)</span>`;
      }
    } else {
      expedienteHTML = `<span style="color:#94a3b8; font-size:11px; font-weight:600;">---</span>`;
    }

    return `
      <tr data-id="${idVacacion}">
        <td><strong>${empNombre}</strong></td>
        <td style="text-align: center;">${fechaSolicitud}</td>
        <td style="text-align: center; color: #2563eb; font-weight: bold;">${diasLey}</td>
        
        <td style="text-align: center; color: #16a34a; font-weight: bold;">${diasFaltantes}</td>
        
        <td style="text-align: center;">${fechaInicio}</td>
        <td style="text-align: center;">${fechaFin}</td>
        <td style="text-align: center;"><strong>${diasTomados}</strong></td>
        
        <td style="text-align: center;">${selectJefeHTML}</td>
        <td style="font-size: 11px; color: #475569;">${escapeHTML(item.observaciones_jefe || '-')}</td>

        <td style="text-align: center;">${selectDirHTML}</td>
        <td style="font-size: 11px; color: #475569;">${escapeHTML(item.observaciones_director || '-')}</td>

        <td style="text-align: center;">${expedienteHTML}</td> 
      </tr>
    `;
  }).join('');
}

// Función neutra para mantener compatibilidad si es invocada dinámicamente
export function renderizarVistaEstatus() {
  const contenedor = document.getElementById('contenedorVistaEstatus');
  if (contenedor) {
    contenedor.innerHTML = '';
  }
}

export function renderizarGanttVacaciones(datos, anio, opciones = {}) {
  const { ocultarSaldos = false, idEmpleadoActual = null, datosCompletos = null } = opciones;
  const grid = document.getElementById('ganttGrid');
  if (!grid) return;

  inicializarTooltipGlobalGantt();

  const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const anioActual = parseInt(anio, 10) || new Date().getFullYear();

  const diasPorMes = nombresMeses.map((_, idx) => new Date(anioActual, idx + 1, 0).getDate());
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

  if (!Array.isArray(datos) || datos.length === 0) {
    grid.innerHTML = htmlHeaderMeses + htmlHeaderDias + `<div style="padding: 20px; text-align: center; color: #64748b; grid-column: 1 / -1;">No hay vacaciones programadas para el filtro seleccionado en el año ${anioActual}.</div>`;
    return;
  }

  const fuenteGlobal = Array.isArray(datosCompletos) && datosCompletos.length > 0
    ? datosCompletos
    : (cacheDatosCompletosPorAnio[String(anioActual)] || datos);

  const mapaTotalComprometidoEmpleado = {};
  const solicitudesContadas = new Set();

  fuenteGlobal.forEach(item => {
    const fStr = String(item.fecha_inicio || '');
    if (!fStr.startsWith(String(anioActual))) return;

    if (item.id_vacacion !== undefined && item.id_vacacion !== null) {
      if (solicitudesContadas.has(item.id_vacacion)) return;
      solicitudesContadas.add(item.id_vacacion);
    }

    const estJefe = String(item.estado_jefe || 'pendiente').toLowerCase();
    const estDir = String(item.estado_director || 'pendiente').toLowerCase();
    const estGlobal = String(item.estado || 'pendiente').toLowerCase();

    if (estJefe === 'rechazada' || estDir === 'rechazada' || estGlobal === 'rechazada') return;

    let dVal = 0;
    if (item.dias_tomados !== undefined && item.dias_tomados !== null && Number(item.dias_tomados) > 0) {
      dVal = Number(item.dias_tomados);
    } else if (item.fecha_inicio && item.fecha_fin) {
      dVal = calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin);
    }

    const keyEmp = String(item.id_employee || item.nombre_empleado || item.empleado);
    mapaTotalComprometidoEmpleado[keyEmp] = (mapaTotalComprometidoEmpleado[keyEmp] || 0) + Math.max(1, dVal);
  });

  const vacacionesPorEmpleado = {};
  datos.forEach(item => {
    const nombreBase = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
    const esPropio = idEmpleadoActual !== null && Number(item.id_employee) === Number(idEmpleadoActual);
    const empNombre = esPropio ? `${nombreBase} (Tú)` : nombreBase;

    if (!vacacionesPorEmpleado[empNombre]) {
      vacacionesPorEmpleado[empNombre] = [];
    }
    vacacionesPorEmpleado[empNombre].push(item);
  });

  function fechaADiaAnual(fStr) {
    if (!fStr) return null;
    const partes = String(fStr).split('T')[0].split('-');
    if (partes.length !== 3) return null;
    
    const fAnio = parseInt(partes[0], 10);
    const fMes = parseInt(partes[1], 10) - 1; 
    const fDia = parseInt(partes[2], 10);

    if (fAnio !== anioActual) return null;
    
    let diaAcumulado = 0;
    for (let m = 0; m < fMes; m++) {
      diaAcumulado += diasPorMes[m];
    }
    return diaAcumulado + (fDia - 1);
  }

  let htmlFilasEmpleados = '';
  const listaEmpleadosClaves = Object.keys(vacacionesPorEmpleado).sort();

  listaEmpleadosClaves.forEach((empNombre) => {
    const empNombreEscaped = escapeHTML(empNombre);
    htmlFilasEmpleados += `<div class="gantt-fila-emp"><div class="gantt-emp-nombre" title="${empNombreEscaped}">${empNombreEscaped}</div>`;

    const mapaCeldasAnual = {};

    const solicitudesOrdenadas = [...vacacionesPorEmpleado[empNombre]].sort((a, b) =>
      String(a.fecha_inicio || '').localeCompare(String(b.fecha_inicio || ''))
    );
    let ultimoDiaOcupado = -1;

    solicitudesOrdenadas.forEach(v => {
      if (!v.fecha_inicio || !v.fecha_fin) return;

      const idxInicioOriginal = fechaADiaAnual(v.fecha_inicio);
      const idxFin = fechaADiaAnual(v.fecha_fin);

      if (idxInicioOriginal === null || idxFin === null || idxFin < idxInicioOriginal) return;

      const idxInicio = Math.max(idxInicioOriginal, ultimoDiaOcupado + 1);
      if (idxInicio > idxFin) return;
      ultimoDiaOcupado = idxFin;

      const duracion = (idxFin - idxInicio) + 1;
      const estadoJefe = String(v.estado_jefe || 'pendiente').toLowerCase();
      const estadoDir = String(v.estado_director || 'pendiente').toLowerCase();

      const esAutorizada = (
        (estadoJefe === 'autorizada' || estadoJefe === 'aprobada') &&
        (estadoDir === 'autorizada' || estadoDir === 'aprobada')
      );

      let diasTomadosGantt = 0;
      if (v.dias_tomados !== undefined && v.dias_tomados !== null && Number(v.dias_tomados) > 0) {
        diasTomadosGantt = Number(v.dias_tomados);
      } else {
        const habiles = calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin);
        diasTomadosGantt = Math.max(1, habiles);
      }

      const keyEmp = String(v.id_employee || v.nombre_empleado || v.empleado);
      const diasLeyGlobal = Number(v.dias_vacaciones_ley || v.dias_ley || 0);
      const totalTomadosComprometidos = mapaTotalComprometidoEmpleado[keyEmp] || diasTomadosGantt;
      const diasRestantesGlobales = Math.max(0, diasLeyGlobal - totalTomadosComprometidos);

      mapaCeldasAnual[idxInicio] = {
        duracion: duracion,
        estado: esAutorizada ? 'autorizada' : 'pendiente',
        diasTomados: diasTomadosGantt,
        diasLey: diasLeyGlobal,
        totalTomadosComprometidos: totalTomadosComprometidos,
        diasRestantes: diasRestantesGlobales,
        fechaInicio: String(v.fecha_inicio).split('T')[0],
        fechaFin: String(v.fecha_fin).split('T')[0]
      };
    });

    let d = 0;
    while (d < totalDiasAnio) {
      if (mapaCeldasAnual[d]) {
        const info = mapaCeldasAnual[d];
        const span = info.duracion;

        const nombreEstado = info.estado === 'autorizada' ? 'Autorizada' : 'Pendiente';
        const contenidoTooltip = ocultarSaldos
          ? `
                <strong style="color: #60a5fa; font-size: 12px;">${empNombreEscaped}</strong><br/>
                <span>📅 Del ${formatearFechaCorta(info.fechaInicio)} al ${formatearFechaCorta(info.fechaFin)}</span><br/>
                <span>🏖 Días hábiles: <strong>${info.diasTomados}</strong></span><br/>
                <span>📌 Estado: <strong>${nombreEstado}</strong></span>`
          : `
                <strong style="color: #60a5fa; font-size: 12px;">${empNombreEscaped}</strong><br/>
                <span>📜 Días por Ley: <strong>${info.diasLey}</strong></span><br/>
                <span>🏖 Días Tomados: <strong>${info.totalTomadosComprometidos}</strong></span><br/>
                <span>⏳ Días Pendientes: <strong>${info.diasRestantes}</strong></span>`;

        const tooltipEscapedAttr = escapeHTML(contenidoTooltip);
        const atributosAccesibilidad = `tabindex="0" role="img" aria-label="${escapeHTML(`${empNombre}: ${nombreEstado}, ${info.diasTomados} días hábiles, del ${info.fechaInicio} al ${info.fechaFin}`)}" data-tooltip-html="${tooltipEscapedAttr}"`;

        htmlFilasEmpleados += `
          <div class="gantt-celda-dia" style="grid-column: span ${span};">
            <div class="gantt-barra-container">
              <div class="gantt-barra ${info.estado}" ${atributosAccesibilidad}>
                ${info.diasTomados}d
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

  grid.innerHTML = `<div class="gantt-wrapper-anual" style="--total-dias-anio: ${totalDiasAnio};">` + htmlHeaderMeses + htmlHeaderDias + htmlFilasEmpleados + `</div>`;
}