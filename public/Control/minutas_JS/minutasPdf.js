// public/Residentes/minutas_JS/minutasPdf.js
import { formatearFechaHTML } from './minutasUi.js';

export function MinutasPDF(actividadesFiltradas) {
  if (actividadesFiltradas.length === 0) {
    alert('No hay actividades para generar el PDF. Aplica filtros que muestren actividades o elimina los filtros.');
    return;
  }

  let doc;
  try {
    const { jsPDF } = window.jspdf;
    doc = new jsPDF('p','pt','a4');
  } catch (e) {
    try {
      doc = new window.jsPDF('p','pt','a4');
    } catch(e2) {
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
    if (y > 720) {
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

    if (actividad.comentarioDirector && actividad.comentarioDirector.trim() !== "") {
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

  const nombreArchivo = `Reporte_Minutas_${nombreProyectoLimpio}.pdf`;
  doc.save(nombreArchivo);
}