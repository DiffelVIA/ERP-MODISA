(() => {
  let concentradoMinutas = [];
  let actividadesFiltradas = [];
  let filtroProyecto;
  let filtroEstado;
  let filtroResponsable;
  let filtroSemana;
  let cuerpoTabla;
  let criterioOrden = 'proyecto'; 

  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

  // MODIFICACIÓN (Ciberseguridad): Sanitización contra ataques XSS
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // MODIFICACIÓN (Lógica ABAC): Helper para normalización de texto y comparación de nombres
  function normalizarTextoComp(texto) {
    if (!texto) return '';
    return String(texto)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  document.addEventListener('DOMContentLoaded', () => {
    cuerpoTabla = document.querySelector('.cuerpoTabla');
    filtroProyecto = document.getElementById("filtroProyecto");
    filtroEstado = document.getElementById("filtroEstado");
    filtroResponsable = document.getElementById("filtroResponsable");
    filtroSemana = document.getElementById("filtroSemana");

    if(!cuerpoTabla) return;

    cargarActividades();
    configurarDropdowns();

    document.addEventListener('change', (e) => {
      if (
        e.target.classList.contains('chk-proyecto') ||
        e.target.classList.contains('chk-estado') ||
        e.target.classList.contains('chk-responsable') ||
        e.target.classList.contains('chk-semana')
      ){
        console.log(`Filtro cambiado: ${e.target.value} -> Estado actual: ${e.target.checked}`); 
        aplicarFiltros();
      }
    });

    const btnDescargar = document.getElementById("descargar");
    if (btnDescargar) {
      btnDescargar.addEventListener('click', MinutasPDF); 
    }
  });

  function ordenarDatos(lista) {
    if (criterioOrden === 'proyecto') {
      lista.sort((a, b) => a.proyecto.localeCompare(b.proyecto, 'es', { sensitivity: 'base' }));
    } else if (criterioOrden === 'alfabetico') {
      lista.sort((a, b) => a.responsable.localeCompare(b.responsable, 'es', { sensitivity: 'base' }));
    } else if (criterioOrden === 'fecha') {
      lista.sort((a, b) => {
        const fechaA = a.fecha ? new Date(a.fecha) : new Date(0);
        const fechaB = b.fecha ? new Date(b.fecha) : new Date(0);
        return fechaB - fechaA;
      });
    }
  }

  async function cargarActividades() {
    try {
      const token = localStorage.getItem('jwtToken') || '';
      const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
      const rolActual = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol.trim() : '';
      const respuesta = await fetch(`${API_URL}/tabla_minutas`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      
      if (!respuesta.ok) {
        throw new Error('Error al conectar con el servidor');
      }

      const datosCrudos = await respuesta.json();

      if (!Array.isArray(datosCrudos)) {
        concentradoMinutas = [];
      } else { 
        concentradoMinutas = datosCrudos.map(item => {
          const comentario = item.comentariodirector || item.comentarioDirector || '';
          const avance = item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0;
          return {
            id: item.id,
            proyecto: item.proyecto || 'Sin proyecto',
            avance: avance,
            responsable: item.responsable || 'Sin responsable',
            semana: item.semana !== undefined && item.semana !== null ? String(item.semana) : '1',
            fecha: item.fecha || '',
            descripcion: item.descripcion || '',
            estado: item.estado ? String(item.estado).toLowerCase().trim() : 'pendiente',
            comentarioDirector: comentario
          };
        });
      }

      actividadesFiltradas = [...concentradoMinutas];
      
      ordenarDatos(actividadesFiltradas);
      filtroOpciones(concentradoMinutas);
      procesarFiltrosUrl();
      renderizarTabla(actividadesFiltradas);

    } catch (error) {
      console.error("Error al cargar minutas desde Aiven:", error);
      if (cuerpoTabla) {
        cuerpoTabla.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:red; font-weight:bold;">Error al conectar con la base de datos en la nube. Revisa el backend.</td></tr>`;
      }
    }
  }

  function filtroOpciones(datos){
    if (!datos || datos.length === 0) return;

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

  function extraerComentarios(textoComentario) {
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

  function construirComentarioFinal(comentarioResidente, comentarioDirector) {
    const partes = [];
    if (comentarioResidente && comentarioResidente.trim() !== '') {
      partes.push(`[Residente: ${comentarioResidente.trim()}]`);
    }
    if (comentarioDirector && comentarioDirector.trim() !== '') {
      partes.push(`[Director: ${comentarioDirector.trim()}]`);
    }
    return partes.join(' | ');
  }

  // ==========================================
  // MODIFICACIÓN FRONTEND: Ajuste ABAC para "Estado Responsable"
  // ==========================================
  function renderizarTabla(actividadesAFiltrar) {
    if (!cuerpoTabla) return;
    cuerpoTabla.innerHTML = '';

    if (actividadesAFiltrar.length === 0) {
      cuerpoTabla.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748b;">No hay actividades registradas con estos filtros.</td></tr>`;
      return;
    }

    const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const rolUsuarioRaw = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol : '';
    const rolUsuarioLimpio = normalizarTextoComp(rolUsuarioRaw);

    // MODIFICACIÓN (Identificación del Usuario Actual para ABAC):
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

      // MODIFICACIÓN (ABAC): Permite editar si es el usuario asignado como responsable O si es Residente / Director
      const responsableTareaLimpio = normalizarTextoComp(actividad.responsable);
      const esElResponsable = (nombreUsuarioLimpio !== '' && responsableTareaLimpio !== '') && 
        (responsableTareaLimpio.includes(nombreUsuarioLimpio) || nombreUsuarioLimpio.includes(responsableTareaLimpio));

      const puedeModificarResponsable = esElResponsable || esResidente || esDirector;

      // COLUMNA 6: Estado Responsable (Mapeado a 'avance': 0=Pendiente, 100=Concluida)
      const celdaReporteResidente = puedeModificarResponsable ? `
        <select class="selector-residente" data-id="${actividad.id}" style="width: 90%; padding: 4px 6px; border-radius: 4px; font-family: inherit; font-size: 13px;">
          <option value="0" ${actividad.avance < 100 ? 'selected' : ''}>⏳ Pendiente</option>
          <option value="100" ${actividad.avance >= 100 ? 'selected' : ''}>✅ Concluida</option>
        </select>
      ` : `<span style="font-size: 13px; font-weight: 600; color: ${actividad.avance >= 100 ? '#16a34a' : '#64748b'};">${actividad.avance >= 100 ? '✅ Concluida' : '⏳ Pendiente'}</span>`;

      // COLUMNA 7: Estatus Dirección
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

      // COLUMNA 8: Comentarios Estructurados por Rol / Responsable
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
        <td style="word-break: break-word;">${escapeHTML(actividad.responsable)}</td>
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

  function aplicarFiltros() {
    const obtenerValoresCheckboxes = (selector) => {
      return Array.from(document.querySelectorAll(selector))
                  .filter(chk => chk.checked)
                  .map(chk => chk.value);
    };

    const proyectosSeleccionados = obtenerValoresCheckboxes('.chk-proyecto');
    const estadosSeleccionados = obtenerValoresCheckboxes('.chk-estado');
    const responsablesSeleccionados = obtenerValoresCheckboxes('.chk-responsable');
    const semanasSeleccionadas = obtenerValoresCheckboxes('.chk-semana');

    const resultadoFiltrado = concentradoMinutas.filter((actividad) => {
      const cumpleProyecto = proyectosSeleccionados.length === 0 || proyectosSeleccionados.includes(actividad.proyecto);
      const cumpleEstado = estadosSeleccionados.length === 0 || estadosSeleccionados.includes(actividad.estado.toLowerCase().trim());
      const cumpleResponsable = responsablesSeleccionados.length === 0 || responsablesSeleccionados.includes(actividad.responsable);
      const cumpleSemana = semanasSeleccionadas.length === 0 || semanasSeleccionadas.includes(String(actividad.semana).trim());

      return cumpleProyecto && cumpleEstado && cumpleResponsable && cumpleSemana;
    });

    actividadesFiltradas = resultadoFiltrado;
    
    ordenarDatos(actividadesFiltradas);
    
    renderizarTabla(actividadesFiltradas);
  }

  function configurarDropdowns() {
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

  function asignarEventosInteractivos() {
    // Evento para estatus del Responsable (Guarda en la columna 'avance')
    cuerpoTabla.querySelectorAll('.selector-residente').forEach((select) => {
      select.addEventListener('change', async (e) => {
        const idActividad = e.target.getAttribute('data-id');
        const nuevoAvance = Number(e.target.value);

        const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
        if (actividad) {
          actividad.avance = nuevoAvance;
          await guardarEnNubeUrgente(actividad);
          aplicarFiltros();
        }
      });
    });

    // Evento para estatus del Director Operativo
    cuerpoTabla.querySelectorAll('.selector-director').forEach((select) => {
      select.addEventListener('change', async (e) => {
        const idActividad = e.target.getAttribute('data-id');
        const nuevoEstado = e.target.value;

        const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
        if (actividad) {
          if (nuevoEstado === 'aplazada') {
            nuevaFechaEstado(actividad, e.target);
          } else {
            actividad.estado = nuevoEstado;
            await guardarEnNubeUrgente(actividad);
            aplicarFiltros();
          }
        }
      });
    });

    // Evento para comentario del Responsable
    cuerpoTabla.querySelectorAll('.input-comentario-residente').forEach((input) => {
      input.addEventListener('blur', async (e) => {
        const idActividad = e.target.getAttribute('data-id');
        const nuevoComentarioRes = e.target.value;

        const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
        if (actividad) {
          const { director } = extraerComentarios(actividad.comentarioDirector);
          const comentarioEnsamblado = construirComentarioFinal(nuevoComentarioRes, director);

          if (actividad.comentarioDirector !== comentarioEnsamblado) {
            actividad.comentarioDirector = comentarioEnsamblado;
            await guardarEnNubeUrgente(actividad);
          }
        }
      });
    });

    // Evento para comentario del Director Operativo
    cuerpoTabla.querySelectorAll('.input-comentario-director').forEach((input) => {
      input.addEventListener('blur', async (e) => {
        const idActividad = e.target.getAttribute('data-id');
        const nuevoComentarioDir = e.target.value;

        const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
        if (actividad) {
          const { residente } = extraerComentarios(actividad.comentarioDirector);
          const comentarioEnsamblado = construirComentarioFinal(residente, nuevoComentarioDir);

          if (actividad.comentarioDirector !== comentarioEnsamblado) {
            actividad.comentarioDirector = comentarioEnsamblado;
            await guardarEnNubeUrgente(actividad);
          }
        }
      });
    });
  }

  async function guardarEnNubeUrgente(actividadActualizada) {
    try {
      const url = `${API_URL}/tabla_minutas`;

      const indice = concentradoMinutas.findIndex(item => String(item.id) === String(actividadActualizada.id));
      if (indice !== -1) {
        concentradoMinutas[indice] = {...actividadActualizada};
      }

      const numeroSemana = Number(actividadActualizada.semana);

      const objetoFormateado = {
        id: actividadActualizada.id,
        proyecto: actividadActualizada.proyecto,
        avance: actividadActualizada.avance !== undefined ? Number(actividadActualizada.avance) : 0,
        responsable: actividadActualizada.responsable,
        semana: isNaN(numeroSemana) ? 1 : numeroSemana,
        fecha: actividadActualizada.fecha,
        descripcion: actividadActualizada.descripcion,
        estado: actividadActualizada.estado,
        comentariodirector: actividadActualizada.comentarioDirector || ''
      };

      const payloadParaBackend = [objetoFormateado];

      console.log("Enviando este payload corregido al servidor:", payloadParaBackend);

      const token = localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(payloadParaBackend)
      });

      if (!respuesta.ok) {
        throw new Error('Error al actualizar datos en el servidor');
      }

      const resultado = await respuesta.json();
      console.log('Sincronización exitosa con Aiven:', resultado);
      
    } catch (error) {
      console.error('Error al guardar cambios en la nube:', error);
      alert('No se pudieron guardar los cambios en la nube.');
    }
  }

  function formatearFechaHTML(fechaInput) {
    if (!fechaInput) return '';
    const partes = fechaInput.split('-');
    if (partes.length !== 3) return fechaInput;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function MinutasPDF() {
    if (actividadesFiltradas.length === 0) {
      alert('No hay actividades para generar el PDF. Aplica filtros que muestren actividades o elimina los filtros.');
      return;
    }

    let doc;
    try{
      const { jsPDF } = window.jspdf;
      doc = new jsPDF('p','pt','a4');
    } catch (e){
      try{
        doc = new window.jsPDF('p','pt','a4');
      } catch(e2){
        doc = new jspdf.jsPDF('p','pt','a4');
      }
    }

    const margenIzquierdo = 40;
    let y = 50;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(15, 23, 42);
    doc.text("Minutas Filtradas", margenIzquierdo, y);

    y += 22;

    const obtenerValoresCheckboxes = (selector) => {
      return Array.from(document.querySelectorAll(selector))
                  .filter(chk => chk.checked)
                  .map(chk => chk.value);
    };

    const proyectosSeleccionados = obtenerValoresCheckboxes('.chk-proyecto');
    const semanasSeleccionadas = obtenerValoresCheckboxes('.chk-semana');

    const proyFormateado = proyectosSeleccionados.length === 0 ? "Todos" : proyectosSeleccionados.join(', ');
    const semFormateada = semanasSeleccionadas.length === 0 ? "Todas" : semanasSeleccionadas.map(s => `Semana ${s}`).join(', ');
    
    const textoFiltros = `Filtros aplicados - Proyecto: ${proyFormateado} | ${semFormateada}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text(textoFiltros, margenIzquierdo, y);

    y += 15;

    doc.setDrawColor(226,232,240);
    doc.setLineWidth(1.5);
    doc.line(margenIzquierdo, y, 550, y);

    y += 35;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30,41,59);
    doc.text("Resumen de Actividades Asignadas", margenIzquierdo, y);

    y+= 25;

    actividadesFiltradas.forEach((actividad, indice) => {
      if (y > 720){
        doc.addPage();
        y = 60;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30,41,59);
      doc.text(`Actividad ${indice + 1}:`, margenIzquierdo, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);

      const fechaLimpia = actividad.fecha ? actividad.fecha.split('T')[0] : '';
      const fechaFormateada = formatearFechaHTML(fechaLimpia);
      const textoEstatus = actividad.estado ? actividad.estado.toUpperCase() : 'PENDIENTE';

      const metadatos = `Proyecto: ${actividad.proyecto} | Responsable: ${actividad.responsable} | Límite: ${fechaFormateada} | Estado: ${textoEstatus}`;
      doc.text(metadatos, margenIzquierdo + 65, y);

      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);

      const descTexto = String(actividad.descripcion || 'Sin descripción');
      const descLineas = doc.splitTextToSize(`Descripción: ${descTexto}`, 510);
      doc.text(descLineas, margenIzquierdo, y);
      y += (descLineas.length * 13);

      if (actividad.comentarioDirector && actividad.comentarioDirector.trim() !=="" ) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9.5);
        doc.setTextColor(2, 132, 199);

        const comentarioTexto = String(actividad.comentarioDirector);
        const comentarioLineas = doc.splitTextToSize(`Comentario: ${comentarioTexto}`, 510);
        doc.text(comentarioLineas, margenIzquierdo, y);
        y += (comentarioLineas.length * 13);
      }

      y += 12;

      doc.setDrawColor(241,245,249);
      doc.setLineWidth(1);
      doc.line(margenIzquierdo, y, 550, y);

      y += 28;
    });

    const nombreProyectoBase = proyectosSeleccionados.length === 0 ? 'General' : proyectosSeleccionados.join('_');
    
    const nombreProyectoLimpio = nombreProyectoBase
      .replace(/á/g, 'a')
      .replace(/é/g, 'e')
      .replace(/í/g, 'i')
      .replace(/ó/g, 'o')
      .replace(/ú/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/\s+/g, '_');

    const nombreArchivo = `Reporte_Minutas_${nombreProyectoLimpio}.pdf`
    doc.save(nombreArchivo);
  }

  function nuevaFechaEstado(actividad, selectElement) {
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

  function procesarFiltrosUrl() {
    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const origenParam = urlParams.get('origen');

      const obtenerRolDesdeJWT = () => {
        const token = localStorage.getItem('jwtToken') || '';
        if (!token) return '';
        
        try {
          const base64Url = token.split('.')[1];
          if (!base64Url) return '';
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const payload = JSON.parse(jsonPayload);
          return (payload.rol || payload.role || '').toLowerCase();
        } catch (e) {
          return '';
        }
      };

      const esResidente = origenParam === 'residentes' || obtenerRolDesdeJWT().includes('residente');
      
      if (esResidente) {
        document.addEventListener('click', (e) => {
          const objetivo = e.target.closest('a, button, .btn, div[onclick]');
          if (!objetivo) return;

          const texto = (objetivo.innerText || objetivo.textContent || '').toLowerCase();
          const href = (objetivo.getAttribute('href') || '').toLowerCase();

          if (
            texto.includes('regresar') || 
            texto.includes('volver') || 
            texto.includes('panel') || 
            href.includes('principal') || 
            href.includes('control')
          ) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '../principal.html?panel=residentes';
          }
        }, true);
      }
      
      let estadoParam = urlParams.get('estado');
      let responsableParam = urlParams.get('responsable');

      const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
      const rolUsuario = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol.trim() : '';
      const esDirector = (rolUsuario.toLowerCase() === "director operativo" || rolUsuario.toLowerCase() === "director_operativo");

      if (!responsableParam && !esDirector) {
        try {
          const rawSesion = sessionStorage.getItem('usuarioMODISA');
          if (rawSesion && rawSesion.trim().startsWith('{')) {
            const parsed = JSON.parse(rawSesion);
            responsableParam = parsed.nombre || parsed.nombre_empleado || parsed.usuario || '';
          } else if (rawSesion) {
            responsableParam = rawSesion;
          }
        } catch (e) {
          console.error("Error al leer sesión:", e);
        }
      }

      let hayFiltrosUrl = false;

      const normalizarTexto = (texto) => {
        if (!texto) return '';
        return decodeURIComponent(texto)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      };

      if (estadoParam) {
        const estadoLimpio = normalizarTexto(estadoParam);
        const checkboxesEstado = document.querySelectorAll('.chk-estado');
        checkboxesEstado.forEach(chk => {
          if (normalizarTexto(chk.value) === estadoLimpio) {
            chk.checked = true;
            hayFiltrosUrl = true;
          }
        });
      }

      if (responsableParam) {
        const respLimpio = normalizarTexto(responsableParam);
        const checkboxesResp = document.querySelectorAll('.chk-responsable');

        if (respLimpio !== '') {
          checkboxesResp.forEach(chk => {
            const valorChkLimpio = normalizarTexto(chk.value);
            
            if (
              valorChkLimpio === respLimpio ||
              valorChkLimpio.includes(respLimpio) ||
              respLimpio.includes(valorChkLimpio)
            ) {
              chk.checked = true;
              hayFiltrosUrl = true;
            }
          });
        }
      }

      if (hayFiltrosUrl) {
        aplicarFiltros();
      }
    }, 50);
  }
})();