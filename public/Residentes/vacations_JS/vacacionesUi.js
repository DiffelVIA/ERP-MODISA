
export function obtenerNthDiaDelMes(anio, mesZeroBased, diaSemanaDeseado, nOcurrencia) {
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

export function obtenerFestivosOficialesMexico(anio) {
  return new Set([
    `${anio}-01-01`, 
    `${anio}-05-01`,
    `${anio}-09-16`,
    `${anio}-12-25`,
    obtenerNthDiaDelMes(anio, 1, 1, 1),
    obtenerNthDiaDelMes(anio, 2, 1, 3),
    obtenerNthDiaDelMes(anio, 10, 1, 3)
  ]);
}

export function calcularDiasHabilesEfectivos(fInicioStr, fFinStr) {
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

export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderizarTabla(lista, datosVacaciones, obtenerDatosDesdeJWT) {
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

  const mapaGozadosPorEmpleado = {};
  datosVacaciones.forEach(v => {
    const idEmp = String(v.id_employee);
    const est = String(v.estado || 'pendiente').toLowerCase();
    
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

export function renderizarVistaEstatus(datosEstatusVacaciones, empleadosSeleccionados, obtenerDatosDesdeJWT) {
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

export function renderizarGanttVacaciones(lista, anioGanttSeleccionado) {
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