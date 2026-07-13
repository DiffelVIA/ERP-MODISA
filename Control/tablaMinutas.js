let concentradoMinutas = [];
let actividadesFiltradas = [];

let filtroProyecto;
let filtroEstado;
let filtroResponsable;
let filtroSemana;

let cuerpoTabla;

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api' 
  : 'https://erp-modisa.onrender.com/api';

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

async function cargarActividades() {
  try {
    const respuesta = await fetch(`${API_URL}/tabla_minutas`);
    
    if (!respuesta.ok) {
      throw new Error('Error al conectar con el servidor');
    }

    const datosCrudos = await respuesta.json();

    console.log('Datos recibidos de Aiven:');
    console.table(datosCrudos);

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
    filtroOpciones(concentradoMinutas);
    renderizarTabla(concentradoMinutas);

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

  // Filtro de Proyectos
  if (filtroProyecto) {
    filtroProyecto.innerHTML = proyectosUnicos.map(p => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${p}" class="chk-proyecto"> ${p}
      </label>
    `).join('');
  }

  // Filtro de Estados
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

  // Filtro de Responsables
  if (filtroResponsable) {
    filtroResponsable.innerHTML = responsablesUnicos.map(r => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${r}" class="chk-responsable"> ${r}
      </label>
    `).join('');
  }

  // Filtro de Semanas
  if (filtroSemana) {
    filtroSemana.innerHTML = semanasUnicas.map(s => `
      <label class="opcion-filtro">
        <input type="checkbox" value="${s}" class="chk-semana"> Semana ${s}
      </label>
    `).join('');
  }
}

function renderizarTabla(actividadesAFiltrar) {
  if (!cuerpoTabla) return;
  cuerpoTabla.innerHTML = '';

  if (actividadesAFiltrar.length === 0) {
    cuerpoTabla.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748b;">No hay actividades registradas con estos filtros.</td></tr>`;
    return;
  }

  const rolUsuario = localStorage.getItem('userRol');
  const esDirector = (rolUsuario === "Director Operativo");

  actividadesAFiltrar.forEach((actividad) => {
    const fila = document.createElement('tr');
    const fechaLimpia = actividad.fecha ? actividad.fecha.split('T')[0] : '';

    if (!esDirector) {
      let estadoVisual = '⏳ Pendiente';
      if (actividad.estado === 'atrasada') estadoVisual = '🚨 Atrasada';
      else if (actividad.estado === 'completada') estadoVisual = '✅ Completada';
      else if (actividad.estado === 'aplazada') estadoVisual = '📅 Aplazada';

      fila.innerHTML = `
        <td><strong>${actividad.proyecto}</strong></td>
        <td>${actividad.responsable}</td>
        <td><span style="background-color: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #334155;">${actividad.semana || 'N/A'}</span></td>
        <td>${formatearFechaHTML(fechaLimpia)}</td>
        <td style="text-align: left;">${actividad.descripcion}</td>
        <td style="font-weight: 500; text-align: center;">${estadoVisual}</td>
        <td style="color: #64748b; font-style: italic; max-width: 220px; word-wrap: break-word;">${actividad.comentarioDirector || '-'}</td>
        <td><span style="font-weight: 600; color: #0284c7;">${actividad.avance}%</span></td>
      `;
    }

    else {
      fila.innerHTML = `
        <td><strong>${actividad.proyecto}</strong></td>
        <td>${actividad.responsable}</td>
        <td><span style="background-color: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #334155;">${actividad.semana || 'N/A'}</span></td>
        <td>${formatearFechaHTML(fechaLimpia)}</td>
        <td style="text-align: left;">${actividad.descripcion}</td>
        <td>
          <select class="selector-estatus" data-id="${actividad.id}" style="padding: 4px 6px; border-radius: 4px; font-family: inherit;">
            <option value="pendiente" ${actividad.estado === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
            <option value="atrasada" ${actividad.estado === 'atrasada' ? 'selected' : ''}>🚨 Atrasada</option>
            <option value="completada" ${actividad.estado === 'completada' ? 'selected' : ''}>✅ Completada</option>
            <option value="aplazada" ${actividad.estado === 'aplazada' ? 'selected' : ''}>📅 Aplazada</option>
          </select>
        </td>
        <td>
          <textarea
            class="input-comentario"
            data-id="${actividad.id}"
            placeholder="Añadir comentario..."
            rows="2"
            style="width: 100%; min-width: 140px; max-width: 220px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-family: inherit; font-size: 13px; resize: vertical; box-sizing: border-box;"
            >${actividad.comentarioDirector || ''}</textarea>
        </td>
        <td><span style="font-weight: 600; color: #0284c7;">${actividad.avance}%</span></td>
      `;
    }

    cuerpoTabla.appendChild(fila);
  });

  if (esDirector) {
    asignarEventosInteractivos();
  }
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
  renderizarTabla(resultadoFiltrado);
}

function configurarDropdowns() {
  const dropdowns = document.querySelectorAll('.filtros');

  dropdowns.forEach(dropdown => {
    const boton = dropdown.querySelector('.btn-dropdown');
    const contenido = dropdown.querySelector('.contenido-dropdown');

    if (boton && contenido) {
      boton.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Cerrar otros dropdowns abiertos
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

  // Cerrar al hacer clic fuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.contenido-dropdown').forEach(c => {
      c.classList.remove('mostrar');
    });
  });
}

function asignarEventosInteractivos() {
  cuerpoTabla.querySelectorAll('.selector-estatus').forEach((select) => {
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

  cuerpoTabla.querySelectorAll('.input-comentario').forEach((input) => {
    input.addEventListener('blur', async (e) => {
      const idActividad = e.target.getAttribute('data-id');
      const nuevoComentario = e.target.value;

      const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));

      if (actividad && actividad.comentarioDirector !== nuevoComentario) {
      actividad.comentarioDirector = nuevoComentario;
      await guardarEnNubeUrgente(actividad);
      }
    });
  });
}

async function guardarEnNubeUrgente(actividadActualizada) {
  try {
    const url = `${API_URL}/minutas`;

    const indice = concentradoMinutas.findIndex(item => String(item.id) === String(actividadActualizada.id));
    if (indice !== -1) {
      concentradoMinutas[indice] = {...actividadActualizada};
    }

    const numeroSemana = Number(actividadActualizada.semana);

    const objetoFormateado = {
      id: actividadActualizada.id,
      proyecto: actividadActualizada.proyecto,
      avance: actividadActualizada.avance || 0,
      responsable: actividadActualizada.responsable,
      semana: isNaN(numeroSemana) ? 1 : numeroSemana,
      fecha: actividadActualizada.fecha,
      descripcion: actividadActualizada.descripcion,
      estado: actividadActualizada.estado,
      comentariodirector: actividadActualizada.comentarioDirector || ''
    };

    const payloadParaBackend = [objetoFormateado];

    console.log("Enviando este payload corregido al servidor:", payloadParaBackend);

    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-rol': localStorage.getItem('userRol')
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