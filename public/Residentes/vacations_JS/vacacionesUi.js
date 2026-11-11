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

  const esJefeInmediato = (
    userRolNormalizado.includes('jefe') || 
    userRolNormalizado.includes('gerente') || 
    userRolNormalizado.includes('coordinador') ||
    userRolNormalizado.includes('supervisor') ||
    esDirectorOperativo
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
    const estadoGlobal = String(item.estado || 'pendiente').toLowerCase();

    // Solicitud totalmente aprobada por ambos niveles
    const estaTotalmenteAprobada = (estadoGlobal === 'aprobada' || estadoGlobal === 'autorizada' || (estadoJefe === 'autorizada' && estadoDir === 'autorizada'));

    // Helper para obtener estilo de badge según el estado
    const obtenerEstiloEstado = (estado) => {
      if (estado === 'autorizada' || estado === 'aprobada') return 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;';
      if (estado === 'rechazada') return 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;';
      return 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;'; // Pendiente
    };

    // Selector interactivo o badge para Jefe Inmediato
    let selectJefeHTML = '';
    if (esJefeInmediato) {
      selectJefeHTML = `
        <select class="select-estado-tabla" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this, 'jefe')" style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; ${obtenerEstiloEstado(estadoJefe)}">
          <option value="pendiente" ${estadoJefe === 'pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
          <option value="autorizada" ${estadoJefe === 'autorizada' || estadoJefe === 'aprobada' ? 'selected' : ''}>🟢 Autorizada</option>
          <option value="rechazada" ${estadoJefe === 'rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
        </select>`;
    } else {
      selectJefeHTML = `<span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; display: inline-block; ${obtenerEstiloEstado(estadoJefe)}">${estadoJefe.toUpperCase()}</span>`;
    }

    // Selector interactivo o badge para Dirección Operativa
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
    } else if (estaTotalmenteAprobada) {
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
        
        <!-- Estado y Observaciones Jefe Inmediato -->
        <td style="text-align: center;">${selectJefeHTML}</td>
        <td style="font-size: 11px; color: #475569;">${escapeHTML(item.observaciones_jefe || '-')}</td>

        <!-- Estado y Observaciones Dirección Operativa -->
        <td style="text-align: center;">${selectDirHTML}</td>
        <td style="font-size: 11px; color: #475569;">${escapeHTML(item.observaciones_director || '-')}</td>

        <td style="text-align: center;">${expedienteHTML}</td> 
      </tr>
    `;
  }).join('');
}

// MODIFICACIÓN SOLUCIÓN: Reconstrucción de la vista estatus para mostrar el desglose de días consumidos y restantes
export function renderizarVistaEstatus(datosEstatus, empleadosSeleccionados, obtenerDatosDesdeJWT) {
  const contenedor = document.getElementById('contenedorVistaEstatus');
  if (!contenedor) return;

  if (!Array.isArray(datosEstatus) || datosEstatus.length === 0) {
    contenedor.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #64748b; font-weight: 500;">
        No hay información de estatus de vacaciones disponible.
      </div>`;
    return;
  }

  const filtrados = datosEstatus.filter(item => {
    const empNombre = item.nombre_empleado || `Empleado ID #${item.id_employee}`;
    return empleadosSeleccionados.size === 0 || empleadosSeleccionados.has(empNombre);
  });

  if (filtrados.length === 0) {
    contenedor.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #64748b; font-weight: 500;">
        No hay registros que coincidan con el filtro seleccionado.
      </div>`;
    return;
  }

  let htmlTabla = `
    <div style="overflow-x: auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 600;">
            <th style="padding: 12px 16px;">Colaborador</th>
            <th style="padding: 12px 16px; text-align: center;">Días Ley</th>
            <th style="padding: 12px 16px; text-align: center;">Días Tomados</th>
            <th style="padding: 12px 16px; text-align: center;">Días Restantes</th>
            <th style="padding: 12px 16px; text-align: center;">Estado General</th>
          </tr>
        </thead>
        <tbody>
  `;

  htmlTabla += filtrados.map(item => {
    const empNombre = escapeHTML(item.nombre_empleado || `Empleado ID #${item.id_employee}`);
    const diasLey = Number(item.dias_ley || 0);
    const diasTomados = Number(item.dias_tomados || 0);
    const diasRestantes = Number(item.dias_restantes !== undefined ? item.dias_restantes : Math.max(0, diasLey - diasTomados));

    let estiloBadge = 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;';
    let textoBadge = 'Disponible';

    if (diasRestantes <= 0) {
      estiloBadge = 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;';
      textoBadge = 'Agotado';
    } else if (diasRestantes <= 3) {
      estiloBadge = 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;';
      textoBadge = 'Por Agotar';
    }

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 16px; font-weight: 600; color: #1e293b;">${empNombre}</td>
        <td style="padding: 12px 16px; text-align: center; color: #2563eb; font-weight: bold;">${diasLey}</td>
        <td style="padding: 12px 16px; text-align: center; color: #059669; font-weight: bold;">${diasTomados}</td>
        <td style="padding: 12px 16px; text-align: center; color: #d97706; font-weight: bold;">${diasRestantes}</td>
        <td style="padding: 12px 16px; text-align: center;">
          <span style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; ${estiloBadge}">
            ${textoBadge}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  htmlTabla += `
        </tbody>
      </table>
    </div>
  `;

  contenedor.innerHTML = htmlTabla;
}

// MODIFICACIÓN SOLUCIÓN: Reconstrucción del calendario Gantt anual con barra de tiempo horizontal de 12 meses
export function renderizarGanttVacaciones(datos, anio, opciones = {}) {
  const grid = document.getElementById('ganttGrid');
  if (!grid) return;

  if (!Array.isArray(datos) || datos.length === 0) {
    grid.innerHTML = `
      <div style="padding: 30px; text-align: center; color: #64748b; font-weight: 500;">
        📅 No hay periodos de vacaciones registrados para el año ${anio}.
      </div>`;
    return;
  }

  const anioActual = parseInt(anio, 10) || new Date().getFullYear();
  const esBisiesto = (anioActual % 4 === 0 && anioActual % 100 !== 0) || (anioActual % 400 === 0);
  const totalDiasAno = esBisiesto ? 366 : 365;

  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const diasPorMes = [31, esBisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let htmlGantt = `
    <div style="overflow-x: auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <!-- Encabezado de Meses -->
      <div style="display: flex; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 12px; font-weight: bold; color: #475569; font-size: 12px; min-width: 800px;">
        <div style="width: 220px; flex-shrink: 0; padding-left: 8px;">Empleado</div>
        <div style="flex-grow: 1; display: flex; text-align: center;">
          ${mesesNombres.map((m, idx) => {
            const pctMes = ((diasPorMes[idx] / totalDiasAno) * 100).toFixed(2);
            return `<div style="width: ${pctMes}%; border-right: 1px solid #f1f5f9; padding: 2px 0;">${m}</div>`;
          }).join('')}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px; min-width: 800px;">
  `;

  const inicioAno = new Date(anioActual, 0, 1);

  htmlGantt += datos.map(item => {
    const empNombre = escapeHTML(item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
    const fechaInicioStr = item.fecha_inicio ? item.fecha_inicio.split('T')[0] : null;
    const fechaFinStr = item.fecha_fin ? item.fecha_fin.split('T')[0] : null;

    if (!fechaInicioStr || !fechaFinStr) return '';

    const [yI, mI, dI] = fechaInicioStr.split('-').map(Number);
    const [yF, mF, dF] = fechaFinStr.split('-').map(Number);

    const fInicio = new Date(yI, mI - 1, dI);
    const fFin = new Date(yF, mF - 1, dF);

    // Ajustar si cruza límites del año
    const fInicioClamp = fInicio < inicioAno ? inicioAno : fInicio;
    const finAno = new Date(anioActual, 11, 31);
    const fFinClamp = fFin > finAno ? finAno : fFin;

    if (fFinClamp < inicioAno || fInicioClamp > finAno) return '';

    const diffDiasInicio = Math.max(0, Math.floor((fInicioClamp - inicioAno) / (1000 * 60 * 60 * 24)));
    const diffDiasDuracion = Math.max(1, Math.floor((fFinClamp - fInicioClamp) / (1000 * 60 * 60 * 24)) + 1);

    const leftPct = ((diffDiasInicio / totalDiasAno) * 100).toFixed(2);
    const widthPct = Math.min(100 - parseFloat(leftPct), (diffDiasDuracion / totalDiasAno) * 100).toFixed(2);

    const estLimpio = String(item.estado || 'pendiente').toLowerCase();
    const esAutorizada = (estLimpio === 'autorizada' || estLimpio === 'aprobada');

    const colorBarra = esAutorizada ? '#10b981' : '#f59e0b';
    const textoEstado = esAutorizada ? 'Autorizada' : 'Pendiente';

    return `
      <div style="display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid #f8fafc;">
        <div style="width: 220px; flex-shrink: 0; font-size: 12px; font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; whitespace: nowrap; padding-left: 8px;" title="${empNombre}">
          ${empNombre}
        </div>
        <div style="flex-grow: 1; position: relative; height: 26px; background: #f8fafc; border-radius: 4px; border: 1px solid #f1f5f9;">
          <div 
            style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 2px; bottom: 2px; background: ${colorBarra}; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 10px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1); overflow: hidden; cursor: pointer;"
            title="${empNombre} (${fechaInicioStr} al ${fechaFinStr}) - ${textoEstado}"
          >
            <span style="padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${fechaInicioStr.slice(5)} al ${fechaFinStr.slice(5)}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  htmlGantt += `
      </div>
    </div>
  `;

  grid.innerHTML = htmlGantt;
}