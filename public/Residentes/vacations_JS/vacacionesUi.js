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

function calcularDiasHabilesEfectivos(inicio, fin) {
  if (!inicio || !fin) return 0;
  const fInicio = new Date(inicio);
  const fFin = new Date(fin);
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

export function renderizarTabla(lista, datosVacaciones, obtenerDatosDesdeJWT) {
  const cuerpo = document.getElementById('cuerpoTablaVacaciones');
  if (!cuerpo) return;

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

  cuerpo.innerHTML = lista.map(item => {
    const idVacacion = item.id_vacacion;
    const empNombre = escapeHTML(item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
    const fechaSolicitud = escapeHTML(item.fecha_solicitud ? item.fecha_solicitud.split('T')[0] : (item.created_at ? item.created_at.split('T')[0] : '-'));
    const fechaInicio = escapeHTML(item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '-');
    const fechaFin = escapeHTML(item.fecha_fin ? item.fecha_fin.split('T')[0] : '-');

    const diasTomados = (item.fecha_inicio && item.fecha_fin)
      ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin)
      : Number(item.dias_tomados || 0);

    const diasLey = Number(item.dias_vacaciones_ley || item.dias_ley || 0);
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

    // Seguridad: Solo el jefe directo asignado (e.id_manager) o Admin puede interactuar con el select
    const esJefeAsignado = String(item.id_manager) === String(idUsuarioSesion);
    const puedeEditarJefe = esJefeAsignado || esGerenteAdmin;

    let selectJefeHTML = '';
    if (puedeEditarJefe) {
      selectJefeHTML = `
        <select class="select-estado-tabla" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this, 'jefe')" style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; ${obtenerEstiloEstado(estadoJefe)}">
          <option value="pendiente" ${estadoJefe === 'pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
          <option value="autorizada" ${estadoJefe === 'autorizada' || estadoJefe === 'aprobada' ? 'selected' : ''}>🟢 Autorizada</option>
          <option value="rechazada" ${estadoJefe === 'rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
        </select>`;
    } else {
      selectJefeHTML = `<span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; display: inline-block; ${obtenerEstiloEstado(estadoJefe)}">${estadoJefe.toUpperCase()}</span>`;
    }

    // Solo Director Operativo o Admin pueden editar la columna de Dirección Operativa
    let selectDirHTML = '';
    if (esDirectorOperativo) {
      selectDirHTML = `
        <select class="select-estado-tabla" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this, 'director')" style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; ${obtenerEstiloEstado(estadoDir)}">
          <option value="pendiente" ${estadoDir === 'pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
          <option value="autorizada" ${estadoDir === 'autorizada' || estadoDir === 'aprobada' ? 'selected' : ''}>🟢 Autorizada</option>
          <option value="rechazada" ${estadoDir === 'rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
        </select>`;
    } else {
      selectDirHTML = `<span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; display: inline-block; ${obtenerEstiloEstado(estadoDir)}">${estadoDir.toUpperCase()}</span>`;
    }

    let expedienteHTML = '<span style="color:#94a3b8; font-size:12px;">---</span>';
    if (item.documento_firmado_url) {
      expedienteHTML = `<a href="${escapeHTML(item.documento_firmado_url)}" target="_blank" style="padding:4px 8px; background:#eff6ff; color:#2563eb; border-radius:4px; font-weight:bold; font-size:11px; text-decoration:none;">📎 Ver Expediente</a>`;
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
        <td style="text-align: center; color: #059669; font-weight: bold;">-</td>
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

// MODIFICACIÓN SOLUCIÓN: Tacómetro SVG recuperado para la vista de estatus
export function generarHTMLTacometroIndividual(emp, esDirectorOperativo) {
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

// MODIFICACIÓN SOLUCIÓN: Reconstrucción de la vista estatus conservando roles y tacómetro
export function renderizarVistaEstatus(datosEstatus, empleadosSeleccionados, obtenerDatosDesdeJWT) {
  const contenedor = document.getElementById('contenedorVistaEstatus');
  if (!contenedor) return;

  if (!datosEstatus || datosEstatus.length === 0) {
    contenedor.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;">No hay datos de estatus de vacaciones disponibles.</div>`;
    return;
  }

  const jwtDatos = obtenerDatosDesdeJWT() || {};
  const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';
  const userRolNormalizado = userRolRaw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

  const puedeVerEstatusGlobal = esGerenteAdmin || esDirectorOperativo;
  const idUsuarioLogueado = jwtDatos.id_employee || jwtDatos.id || jwtDatos.userId;

  if (puedeVerEstatusGlobal) {
    const arrSeleccionados = Array.from(empleadosSeleccionados || []);

    if (arrSeleccionados.length === 1) {
      const nombreBuscado = arrSeleccionados[0];
      const empDatos = datosEstatus.find(emp => (emp.nombre_empleado || emp.empleado) === nombreBuscado);

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
    const empDatosPropio = datosEstatus.find(emp => Number(emp.id_employee) === Number(idUsuarioLogueado)) || datosEstatus[0];
    
    if (empDatosPropio) {
      contenedor.innerHTML = `
        <div style="max-width: 450px; margin: 0 auto;">
          ${generarHTMLTacometroIndividual(empDatosPropio, false)}
        </div>`;
    } else {
      contenedor.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;">No se encontraron registros de vacaciones para su usuario.</div>`;
    }
  }
}

// MODIFICACIÓN SOLUCIÓN: Reconstrucción del Gantt con barras nativas y tooltips/emergentes CSS
export function renderizarGanttVacaciones(datos, anio, opciones = {}) {
  const { ocultarSaldos = false, idEmpleadoActual = null } = opciones;
  const grid = document.getElementById('ganttGrid');
  if (!grid) return;

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
    const partes = fStr.split('T')[0].split('-');
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

  listaEmpleadosClaves.forEach((empNombre, filaIdx) => {
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
      const estadoGlobal = String(v.estado || 'pendiente').toLowerCase();

      const esAutorizada = (
        (estadoJefe === 'autorizada' || estadoJefe === 'aprobada') &&
        (estadoDir === 'autorizada' || estadoDir === 'aprobada')
      ) || estadoGlobal === 'aprobada' || estadoGlobal === 'autorizada';

      const diasTomadosGantt = (v.fecha_inicio && v.fecha_fin)
        ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin)
        : Number(v.dias_tomados || 0);

      mapaCeldasAnual[idxInicio] = {
        duracion: duracion,
        estado: esAutorizada ? 'autorizada' : 'pendiente',
        diasTomados: diasTomadosGantt,
        diasLey: Number(v.dias_vacaciones_ley || v.dias_ley || 0),
        diasRestantes: Math.max(0, Number(v.dias_vacaciones_ley || v.dias_ley || 0) - diasTomadosGantt),
        fechaInicio: String(v.fecha_inicio).split('T')[0],
        fechaFin: String(v.fecha_fin).split('T')[0]
      };
    });

    const totalEmpleados = listaEmpleadosClaves.length;
    let claseTooltipPosicion = '';

    if (totalEmpleados === 1 || filaIdx === 0) {
      claseTooltipPosicion = 'tooltip-abajo';
    } else {
      claseTooltipPosicion = 'tooltip-arriba';
    }

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
                <span>🏖 Días Tomados: <strong>${info.diasTomados}</strong></span><br/>
                <span>⏳ Días Pendientes: <strong>${info.diasRestantes}</strong></span>`;

        const atributosAccesibilidad = `tabindex="0" role="img" aria-label="${escapeHTML(`${empNombre}: ${nombreEstado}, ${info.diasTomados} días hábiles, del ${info.fechaInicio} al ${info.fechaFin}`)}"`;

        htmlFilasEmpleados += `
          <div class="gantt-celda-dia" style="grid-column: span ${span};">
            <div class="gantt-barra-container">
              <div class="gantt-barra ${info.estado}" ${atributosAccesibilidad}>
                ${info.diasTomados}d
              </div>
              <div class="gantt-tooltip ${claseTooltipPosicion}">${contenidoTooltip}
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