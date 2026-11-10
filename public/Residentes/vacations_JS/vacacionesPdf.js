// MODIFICACIÓN SOLUCIÓN: Se definen funciones utilitarias y de saneamiento localmente para eliminar dependencias de importación obsoletas que rompen ES6
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
    if (diaSemana !== 0 && diaSemana !== 6) { // Excluir sábados (6) y domingos (0)
      dias++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

export function inicializarHandlersPDF(API_URL, getDatosVacaciones, cargarDatosVacaciones) {

  window.generarPdfImpresion = function(idVacacion) {
    const datosVacaciones = getDatosVacaciones() || [];
    const item = datosVacaciones.find(v => String(v.id_vacacion) === String(idVacacion));
    if (!item) {
      alert("⚠️ No se encontró la información de la solicitud.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

    const nombreEmpleadoVal = item.nombre_empleado || `Empleado ID #${item.id_employee}`;
    const primerNombreVal = String(nombreEmpleadoVal).trim().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const fechaSolicitudVal = item.fecha_solicitud ? String(item.fecha_solicitud).split('T')[0] : (item.created_at ? String(item.created_at).split('T')[0] : '---');
    const fechaInicioVal = item.fecha_inicio ? String(item.fecha_inicio).split('T')[0] : '---';
    const fechaFinVal = item.fecha_fin ? String(item.fecha_fin).split('T')[0] : '---';
    const periodoVal = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    const diasTomadosActual = (item.fecha_inicio && item.fecha_fin)
      ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin)
      : Number(item.dias_tomados || 0);

    doc.setFillColor(6, 18, 30);
    doc.rect(15, 12, 186, 12, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(6, 18, 30);
    doc.text("MODISA - CONSTANCIA DE VACACIONES", 108, 32, { align: "center" });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, 42, 201, 42);

    let startY = 52;
    const filaAltura = 11;

    const datosTabla = [
      ["Nombre del Empleado:", nombreEmpleadoVal],
      ["Fecha de Solicitud:", fechaSolicitudVal],
      ["Periodo Correspondiente:", periodoVal],
      ["Días Solicitados:", `${diasTomadosActual} día(s)`],
      ["Fecha de Inicio:", fechaInicioVal],
      ["Fecha de Término:", fechaFinVal],
      ["Obs. Jefe Inmediato:", item.observaciones_jefe || "Sin observaciones"],
      ["Obs. Dirección Operativa:", item.observaciones_director || "Sin observaciones"]
    ];

    datosTabla.forEach(([colLabel, colValue], index) => {
      const currentY = startY + (index * filaAltura);
      doc.setFillColor(248, 250, 252);
      doc.rect(15, currentY, 65, filaAltura, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.rect(15, currentY, 65, filaAltura, 'D');
      doc.rect(80, currentY, 121, filaAltura, 'D');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      doc.text(colLabel, 18, currentY + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(String(colValue), 83, currentY + 7);
    });

    const firmasY = startY + (datosTabla.length * filaAltura) + 35;

    // Firmas: Empleado, Jefe Inmediato, Dirección Operativa
    doc.setDrawColor(6, 18, 30);
    doc.line(18, firmasY, 68, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(nombreEmpleadoVal, 43, firmasY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("Firma Empleado", 43, firmasY + 10, { align: "center" });

    doc.line(78, firmasY, 128, firmasY);
    doc.setFont("helvetica", "bold");
    doc.text("Jefe Inmediato", 103, firmasY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("Vo.Bo. Autorizado", 103, firmasY + 10, { align: "center" });

    doc.line(138, firmasY, 188, firmasY);
    doc.setFont("helvetica", "bold");
    doc.text("Dirección Operativa", 163, firmasY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("Autorización Final", 163, firmasY + 10, { align: "center" });

    doc.save(`Constancia_Vacaciones_${primerNombreVal}_${periodoVal}.pdf`);
  };

  window.subirExpedienteFirmado = async function(idVacacion, inputElement) {
    if (!inputElement || !inputElement.files || inputElement.files.length === 0) return;
    const archivo = inputElement.files[0];

    // MODIFICACIÓN SOLUCIÓN (Ciberseguridad y UX): Validación previa del archivo en cliente
    if (archivo.type !== 'application/pdf') {
      alert("⚠️ Solo se permiten archivos en formato PDF.");
      inputElement.value = '';
      return;
    }

    const maxTamanoBytes = 5 * 1024 * 1024; // Límite de 5 MB
    if (archivo.size > maxTamanoBytes) {
      alert("⚠️ El archivo es demasiado grande. El tamaño máximo permitido es de 5 MB.");
      inputElement.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('expediente', archivo);

    const token = localStorage.getItem('jwtToken') || '';
    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/expediente`, {
        method: 'POST',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir expediente.');

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();
    } catch (err) {
      console.error("❌ Error:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };
}