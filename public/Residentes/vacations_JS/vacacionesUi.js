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

    // MODIFICACIÓN SOLUCIÓN: Selector interactivo o badge para Jefe Inmediato
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

    // MODIFICACIÓN SOLUCIÓN: Selector interactivo o badge para Dirección Operativa
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

export function renderizarVistaEstatus(datosEstatus, empleadosSeleccionados, obtenerDatosDesdeJWT) {
  const contenedor = document.getElementById('contenedorVistaEstatus');
  if (!contenedor) return;
}

export function renderizarGanttVacaciones(datos, anio, opciones = {}) {
  const grid = document.getElementById('ganttGrid');
  if (!grid) return;
}