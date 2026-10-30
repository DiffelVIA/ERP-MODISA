// public/Residentes/minutas_JS/minutasUi.js

export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizarTextoComp(texto) {
  if (!texto) return '';
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function formatearFechaHTML(fechaInput) {
  if (!fechaInput) return '';
  const partes = fechaInput.split('-');
  if (partes.length !== 3) return fechaInput;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export function extraerComentarios(textoComentario) {
  if (!textoComentario) return { residente: '', director: '' };
  
  let residente = '';
  let director = '';

  const matchResidente = textoComentario.match(/\[Residente:\s*([^\]]+)\]/);
  const matchDirector = textoComentario.match(/\[Director:\s*([^\]]+)\]/);

  if (matchResidente) residente = matchResidente[1].trim();
  if (matchDirector) director = matchDirector[1].trim();

  if (!matchResidente && !matchDirector) {
    director = textoComentario.trim();
  }

  return { residente, director };
}

export function construirComentarioFinal(comentarioResidente, comentarioDirector) {
  const partes = [];
  if (comentarioResidente && comentarioResidente.trim() !== '') {
    partes.push(`[Residente: ${comentarioResidente.trim()}]`);
  }
  if (comentarioDirector && comentarioDirector.trim() !== '') {
    partes.push(`[Director: ${comentarioDirector.trim()}]`);
  }
  return partes.join(' | ');
}

export function filtroOpciones(datos, elementosFiltro) {
  if (!datos || datos.length === 0) return;

  const { filtroProyecto, filtroEstado, filtroResponsable, filtroSemana } = elementosFiltro;

  const proyectosUnicos = [...new Set(datos.map(item => item.proyecto))].sort();
  const responsablesUnicos = [...new Set(datos.map(item => item.responsable))].sort();
  const semanasUnicas = [...new Set(datos.map(item => item.semana))].sort((a,b) => Number(a) - Number(b));

  if (filtroProyecto) {
    filtroProyecto.innerHTML = proyectosUnicos.map(p => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${escapeHTML(p)}" class="chk-proyecto"> ${escapeHTML(p)}
      </label>
    `).join('');
  }
  if (filtroEstado) {
    const estados = [
      { val: 'pendiente', txt: '⏳ Pendiente' },
      { val: 'atrasada', txt: '🚨 Atrasada' },
      { val: 'completada', txt: '✅ Completada' },
      { val: 'aplazada', txt: '📅 Aplazada' }
    ];
    filtroEstado.innerHTML = estados.map(e => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${e.val}" class="chk-estado"> ${e.txt}
      </label>
    `).join('');
  }
  if (filtroResponsable) {
    filtroResponsable.innerHTML = responsablesUnicos.map(r => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${escapeHTML(r)}" class="chk-responsable"> ${escapeHTML(r)}
      </label>
    `).join('');
  }
  if (filtroSemana) {
    filtroSemana.innerHTML = semanasUnicas.map(s => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${escapeHTML(s)}" class="chk-semana"> Semana ${escapeHTML(s)}
      </label>
    `).join('');
  }
}

export function renderizarTabla(actividadesAFiltrar, contexto) {
  const { cuerpoTabla, listaEmpleados, asignarEventosInteractivos } = contexto;
  if (!cuerpoTabla) return;
  cuerpoTabla.innerHTML = '';

  if (actividadesAFiltrar.length === 0) {
    cuerpoTabla.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748b;">No hay actividades registradas con estos filtros.</td></tr>`;
    return;
  }

  const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
  const rolUsuarioRaw = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol : '';
  const rolUsuarioLimpio = normalizarTextoComp(rolUsuarioRaw);

  let nombreUsuarioSesion = '';
  if (usuarioToken) {
    nombreUsuarioSesion = usuarioToken.nombre || usuarioToken.nombre_empleado || usuarioToken.name || usuarioToken.usuario || '';
  }
  if (!nombreUsuarioSesion) {
    try {
      const rawSesion = sessionStorage.getItem('usuarioMODISA');
      if (rawSesion && rawSesion.trim().startsWith('{')) {
        const parsed = JSON.parse(rawSesion);
        nombreUsuarioSesion = parsed.nombre || parsed.nombre_empleado || parsed.usuario || '';
      } else if (rawSesion) {
        nombreUsuarioSesion = rawSesion;
      }
    } catch (e) {
      console.error("Error al leer datos de sesión:", e);
    }
  }

  const nombreUsuarioLimpio = normalizarTextoComp(nombreUsuarioSesion);
  const esDirector = rolUsuarioLimpio.includes("director");
  const esResidente = rolUsuarioLimpio.includes("residente");

  actividadesAFiltrar.forEach((actividad) => {
    const fila = document.createElement('tr');
    const fechaLimpia = actividad.fecha ? actividad.fecha.split('T')[0] : '';
    const { residente: comRes, director: comDir } = extraerComentarios(actividad.comentarioDirector);

    const responsableTareaLimpio = normalizarTextoComp(actividad.responsable);
    const esElResponsable = (nombreUsuarioLimpio !== '' && responsableTareaLimpio !== '') && 
      (responsableTareaLimpio.includes(nombreUsuarioLimpio) || nombreUsuarioLimpio.includes(responsableTareaLimpio));

    const puedeModificarResponsable = esElResponsable || esResidente;

    let celdaResponsable = escapeHTML(actividad.responsable);
    if (esDirector) {
      let opcionesEmpleados = '<option value="">-- Selecciona --</option>';
      if (Array.isArray(listaEmpleados) && listaEmpleados.length > 0) {
        opcionesEmpleados += listaEmpleados.map(emp => {
          const nombreCompleto = `${emp.name || ''} ${emp.last_name || ''}`.trim();
          const esSeleccionado = normalizarTextoComp(nombreCompleto) === normalizarTextoComp(actividad.responsable) ? 'selected' : '';
          return `<option value="${escapeHTML(nombreCompleto)}" ${esSeleccionado}>${escapeHTML(nombreCompleto)}</option>`;
        }).join('');
      } else {
        opcionesEmpleados += `<option value="${escapeHTML(actividad.responsable)}" selected>${escapeHTML(actividad.responsable)}</option>`;
      }

      celdaResponsable = `
        <select 
          class="selector-responsable-director" 
          data-id="${actividad.id}" 
          style="width: 95%; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-family: inherit; font-size: 11.5px; box-sizing: border-box;"
        >
          ${opcionesEmpleados}
        </select>
      `;
    }

    let celdaReporteResidente = '';
    if (esDirector) {
      celdaReporteResidente = `
        <span style="font-size: 13px; font-weight: 600; color: ${actividad.avance >= 100 ? '#16a34a' : '#64748b'}; padding: 4px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; display: inline-block;">
          ${actividad.avance >= 100 ? '✅ Concluida' : '⏳ Pendiente'}
        </span>
      `;
    } else if (puedeModificarResponsable) {
      celdaReporteResidente = `
        <select class="selector-residente" data-id="${actividad.id}" style="width: 90%; padding: 4px 6px; border-radius: 4px; font-family: inherit; font-size: 13px;">
          <option value="0" ${actividad.avance < 100 ? 'selected' : ''}>⏳ Pendiente</option>
          <option value="100" ${actividad.avance >= 100 ? 'selected' : ''}>✅ Concluida</option>
        </select>
      `;
    } else {
      celdaReporteResidente = `
        <span style="font-size: 13px; font-weight: 600; color: ${actividad.avance >= 100 ? '#16a34a' : '#64748b'};">
          ${actividad.avance >= 100 ? '✅ Concluida' : '⏳ Pendiente'}
        </span>
      `;
    }

    const celdaEstadoDirector = esDirector ? `
      <select class="selector-estatus selector-director" data-id="${actividad.id}" style="width: 90%; padding: 4px 6px; border-radius: 4px; font-family: inherit; font-size: 13px; font-weight: 600;">
        <option value="pendiente" ${actividad.estado === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
        <option value="atrasada" ${actividad.estado === 'atrasada' ? 'selected' : ''}>🚨 Atrasada</option>
        <option value="completada" ${actividad.estado === 'completada' ? 'selected' : ''}>✅ Completada</option>
        <option value="aplazada" ${actividad.estado === 'aplazada' ? 'selected' : ''}>📅 Aplazada</option>
      </select>
    ` : `
      <span style="font-weight: 500; text-align: center;">
        ${actividad.estado === 'atrasada' ? '🚨 Atrasada' : (actividad.estado === 'completada' ? '✅ Completada' : (actividad.estado === 'aplazada' ? '📅 Aplazada' : '⏳ Pendiente'))}
      </span>
    `;

    let celdaComentarios = '';
    if (puedeModificarResponsable && !esDirector) {
      celdaComentarios = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <textarea
            class="input-comentario-residente"
            data-id="${actividad.id}"
            placeholder="Escribe reporte de responsable..."
            rows="2"
            style="width: 100%; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-family: inherit; font-size: 12px; resize: vertical; box-sizing: border-box;"
            >${escapeHTML(comRes)}</textarea>
          ${comDir ? `<small style="color:#0284c7; font-style:italic;">Dir: ${escapeHTML(comDir)}</small>` : ''}
        </div>
      `;
    } else if (esDirector) {
      celdaComentarios = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${comRes ? `<small style="color:#16a34a; font-weight:600;">Resp: ${escapeHTML(comRes)}</small>` : ''}
          <textarea
            class="input-comentario-director"
            data-id="${actividad.id}"
            placeholder="Añadir nota de dirección..."
            rows="2"
            style="width: 100%; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-family: inherit; font-size: 12px; resize: vertical; box-sizing: border-box;"
            >${escapeHTML(comDir)}</textarea>
        </div>
      `;
    } else {
      celdaComentarios = `
        <div style="font-size: 12px; word-break: break-word;">
          ${comRes ? `<div style="color:#16a34a; font-weight:600;">Resp: ${escapeHTML(comRes)}</div>` : ''}
          ${comDir ? `<div style="color:#334155; font-style:italic;">Dir: ${escapeHTML(comDir)}</div>` : ''}
          ${(!comRes && !comDir) ? '<span style="color:#94a3b8;">-</span>' : ''}
        </div>
      `;
    }

    fila.innerHTML = `
      <td style="word-break: break-word;"><strong>${escapeHTML(actividad.proyecto)}</strong></td>
      <td style="word-break: break-word;">${celdaResponsable}</td>
      <td style="text-align: center;"><span style="background-color: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #334155;">${escapeHTML(actividad.semana || 'N/A')}</span></td>
      <td style="text-align: center;">${formatearFechaHTML(fechaLimpia)}</td>
      <td style="text-align: left; word-break: break-word;">${escapeHTML(actividad.descripcion)}</td>
      <td style="text-align: center;">${celdaReporteResidente}</td>
      <td style="text-align: center;">${celdaEstadoDirector}</td>
      <td>${celdaComentarios}</td>
    `;

    cuerpoTabla.appendChild(fila);
  });

  asignarEventosInteractivos();
}

export function configurarDropdowns() {
  const dropdowns = document.querySelectorAll('.filtros');

  dropdowns.forEach(dropdown => {
    const boton = dropdown.querySelector('.btn-dropdown');
    const contenido = dropdown.querySelector('.contenido-dropdown');

    if (boton && contenido) {
      boton.addEventListener('click', (e) => {
        e.stopPropagation();
        
        document.querySelectorAll('.contenido-dropdown').forEach(c => {
          if (c !== contenido) c.classList.remove('mostrar');
        });
        
        contenido.classList.toggle('mostrar');
      });

      contenido.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.contenido-dropdown').forEach(c => {
      c.classList.remove('mostrar');
    });
  });
}

export function nuevaFechaEstado(actividad, selectElement, guardarEnNubeUrgente, aplicarFiltros) {
  const modalBg = document.createElement('div');
  modalBg.style.position = 'fixed';
  modalBg.style.top = '0';
  modalBg.style.left = '0';
  modalBg.style.width = '100vw';
  modalBg.style.height = '100vh';
  modalBg.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
  modalBg.style.display = 'flex';
  modalBg.style.justifyContent = 'center';
  modalBg.style.alignItems = 'center';
  modalBg.style.zIndex = '9999';

  const modalBox = document.createElement('div');
  modalBox.style.backgroundColor = '#ffffff';
  modalBox.style.padding = '24px';
  modalBox.style.borderRadius = '8px';
  modalBox.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
  modalBox.style.width = '90%';
  modalBox.style.maxWidth = '400px';
  modalBox.style.fontFamily = 'system-ui, -apple-system, sans-serif';

  modalBox.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 10px; color: #0f172a; font-size: 18px; display: flex; align-items: center; gap: 8px;">📅 Aplazar Actividad</h3>
    <p style="color: #475569; font-size: 14px; margin-bottom: 20px; line-height: 1.5;">
      Para cambiar el estatus a <strong>Aplazada</strong>, es obligatorio establecer una nueva fecha de entrega.
    </p>
    
    <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Nueva fecha límite:</label>
    <input type="date" id="modalFechaInput" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; margin-bottom: 24px; font-size: 14px; outline: none;">
    
    <div style="display: flex; justify-content: flex-end; gap: 12px;">
      <button id="btnModalCancelar" style="padding: 10px 16px; background-color: #f1f5f9; color: #334155; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;">Cancelar</button>
      <button id="btnModalGuardar" style="padding: 10px 16px; background-color: #0284c7; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;">Confirmar Cambio</button>
    </div>
  `;

  modalBg.appendChild(modalBox);
  document.body.appendChild(modalBg);

  const fechaIn = modalBox.querySelector('#modalFechaInput');
  if (actividad.fecha) {
    fechaIn.value = actividad.fecha.split('T')[0];
  }

  modalBox.querySelector('#btnModalCancelar').addEventListener('click', () => {
    selectElement.value = actividad.estado;
    document.body.removeChild(modalBg);
  });

  modalBox.querySelector('#btnModalGuardar').addEventListener('click', async () => {
    const nuevaFecha = fechaIn.value;

    if (!nuevaFecha) {
      alert('⚠️ Debes seleccionar una fecha para poder aplazar la actividad.');
      return;
    }

    actividad.estado = 'aplazada';
    actividad.fecha = nuevaFecha;

    document.body.removeChild(modalBg);

    await guardarEnNubeUrgente(actividad);
    aplicarFiltros();
  });
}