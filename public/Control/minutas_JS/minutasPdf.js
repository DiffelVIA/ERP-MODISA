import { formatearFechaHTML } from './minutasUi.js';

export function MinutasPDF(actividadesFiltradas) {
  const token = localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
  if (!token) {
    alert('Tu sesión ha expirado. Inicia sesión nuevamente para descargar el reporte.');
    return;
  }

  if (!Array.isArray(actividadesFiltradas) || actividadesFiltradas.length === 0) {
    alert('No hay actividades para generar el PDF. Aplica filtros que muestren actividades o elimina los filtros.');
    return;
  }

  let doc;
  if (window.jspdf && typeof window.jspdf.jsPDF === 'function') {
    doc = new window.jspdf.jsPDF('p', 'pt', 'a4');
  } else if (typeof window.jsPDF === 'function') {
    doc = new window.jsPDF('p', 'pt', 'a4');
  } else {
    alert('No se pudo inicializar el generador de PDF. Recarga la página e inténtalo de nuevo.');
    return;
  }

  const margenIzquierdo = 40;
  const anchoUtil = 510;
  const limiteInferior = 780;
  let y = 50;

  const verificarSaltoPagina = (alturaRequerida) => {
    if (y + alturaRequerida > limiteInferior) {
      doc.addPage();
      y = 55;
    }
  };

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
  const estadosSeleccionados = obtenerValoresCheckboxes('.chk-estado');
  const responsablesSeleccionados = obtenerValoresCheckboxes('.chk-responsable');

  const proyFormateado = proyectosSeleccionados.length === 0 ? "Todos" : proyectosSeleccionados.join(', ');
  const semFormateada = semanasSeleccionadas.length === 0 ? "Todas" : semanasSeleccionadas.map(s => `Semana ${s}`).join(', ');

  const partesFiltros = [
    `Proyecto: ${proyFormateado}`,
    semFormateada
  ];

  if (estadosSeleccionados.length > 0) {
    partesFiltros.push(`Estado: ${estadosSeleccionados.join(', ')}`);
  }

  if (responsablesSeleccionados.length > 0) {
    partesFiltros.push(`Responsable: ${responsablesSeleccionados.join(', ')}`);
  }

  const textoFiltros = `Filtros aplicados - ${partesFiltros.join(' | ')}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);

  const lineasFiltros = doc.splitTextToSize(textoFiltros, anchoUtil);
  doc.text(lineasFiltros, margenIzquierdo, y);
  y += (lineasFiltros.length * 14) + 6;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1.5);
  doc.line(margenIzquierdo, y, 550, y);

  y += 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text("Resumen de Actividades Asignadas", margenIzquierdo, y);

  y += 25;

  actividadesFiltradas.forEach((actividad, indice) => {
    const fechaLimpia = actividad.fecha ? String(actividad.fecha).split('T')[0] : '';
    const fechaFormateada = formatearFechaHTML(fechaLimpia);
    const textoEstatus = actividad.estado ? String(actividad.estado).toUpperCase() : 'PENDIENTE';
    const metadatos = `Proyecto: ${actividad.proyecto || 'Sin proyecto'} | Responsable: ${actividad.responsable || 'Sin responsable'} | Límite: ${fechaFormateada} | Estado: ${textoEstatus}`;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const metadatosLineas = doc.splitTextToSize(metadatos, 445);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const descTexto = String(actividad.descripcion || 'Sin descripción');
    const descLineas = doc.splitTextToSize(`Descripción: ${descTexto}`, anchoUtil);

    const tieneComentario = Boolean(actividad.comentarioDirector && String(actividad.comentarioDirector).trim() !== "");
    let comentarioLineas = [];
    if (tieneComentario) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9.5);
      comentarioLineas = doc.splitTextToSize(`Comentario: ${String(actividad.comentarioDirector)}`, anchoUtil);
    }

    const alturaBloque = (metadatosLineas.length * 13) + 6 + (descLineas.length * 13) + (tieneComentario ? (comentarioLineas.length * 13) : 0) + 40;
    verificarSaltoPagina(Math.min(alturaBloque, 140));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Actividad ${indice + 1}:`, margenIzquierdo, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(metadatosLineas, margenIzquierdo + 65, y);

    y += (metadatosLineas.length * 13) + 4;

    verificarSaltoPagina((descLineas.length * 13) + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(descLineas, margenIzquierdo, y);
    y += (descLineas.length * 13);

    if (tieneComentario) {
      verificarSaltoPagina((comentarioLineas.length * 13) + 10);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9.5);
      doc.setTextColor(2, 132, 199);
      doc.text(comentarioLineas, margenIzquierdo, y);
      y += (comentarioLineas.length * 13);
    }

    y += 12;

    verificarSaltoPagina(20);
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(1);
    doc.line(margenIzquierdo, y, 550, y);

    y += 28;
  });

  const nombreProyectoBase = proyectosSeleccionados.length === 0 ? 'General' : proyectosSeleccionados.join('_');

  const nombreProyectoLimpio = nombreProyectoBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 60) || 'General';

  const nombreArchivo = `Reporte_Minutas_${nombreProyectoLimpio}.pdf`;
  doc.save(nombreArchivo);
}