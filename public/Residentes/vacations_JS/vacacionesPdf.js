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

// MODIFICACIÓN SOLUCIÓN: Parseo robusto concatenando hora local T00:00:00 para evitar desfases UTC/Local (ej. 5 días en vez de 4)
function calcularDiasHabilesEfectivos(inicio, fin) {
  if (!inicio || !fin) return 0;

  const strInicio = String(inicio).split('T')[0];
  const strFin = String(fin).split('T')[0];

  const fInicio = new Date(`${strInicio}T00:00:00`);
  const fFin = new Date(`${strFin}T00:00:00`);

  if (isNaN(fInicio.getTime()) || isNaN(fFin.getTime()) || fInicio > fFin) return 0;

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
    
    // MODIFICACIÓN SOLUCIÓN (Ciberseguridad & UX): Normalizar acentos antes de sanear caracteres para evitar nombres de archivo vacíos
    const primerNombreLimpio = String(nombreEmpleadoVal)
      .trim()
      .split(' ')[0]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
    const primerNombreVal = primerNombreLimpio || `Empleado_${item.id_employee}`;

    const fechaSolicitudVal = item.fecha_solicitud ? String(item.fecha_solicitud).split('T')[0] : (item.created_at ? String(item.created_at).split('T')[0] : '---');
    const fechaInicioVal = item.fecha_inicio ? String(item.fecha_inicio).split('T')[0] : '---';
    const fechaFinVal = item.fecha_fin ? String(item.fecha_fin).split('T')[0] : '---';
    const periodoVal = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // MODIFICACIÓN SOLUCIÓN: Priorizar días hábiles locales reales o el valor validado de MySQL para consistencia exacta con Gantt y Tabla
    const diasHabilesRango = (item.fecha_inicio && item.fecha_fin)
      ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin)
      : 0;
    const diasTomadosActual = diasHabilesRango > 0
      ? diasHabilesRango
      : Number(item.dias_tomados || 0);

    // MODIFICACIÓN SOLUCIÓN: Calcular acumulado de días autorizados del empleado en el periodo para obtener los Días Restantes a Gozar
    const idEmpActual = String(item.id_employee);
    let totalDiasAutorizadosEmpleado = 0;

    datosVacaciones.forEach(v => {
      if (String(v.id_employee) !== idEmpActual) return;

      const estJefe = String(v.estado_jefe || 'pendiente').toLowerCase();
      const estDir = String(v.estado_director || 'pendiente').toLowerCase();
      const estGlobal = String(v.estado || 'pendiente').toLowerCase();

      const esAprobada = (
        ((estJefe === 'autorizada' || estJefe === 'aprobada') && (estDir === 'autorizada' || estDir === 'aprobada')) ||
        estGlobal === 'aprobada' || estGlobal === 'autorizada' ||
        String(v.id_vacacion) === String(idVacacion)
      );

      if (esAprobada) {
        const dHabiles = (v.fecha_inicio && v.fecha_fin)
          ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin)
          : 0;
        const dRegistro = dHabiles > 0 ? dHabiles : Number(v.dias_tomados || 0);
        totalDiasAutorizadosEmpleado += dRegistro;
      }
    });

    const diasLeyEmpleado = Number(item.dias_vacaciones_ley || item.dias_ley || 0);
    const diasRestantesGozar = Math.max(0, diasLeyEmpleado - totalDiasAutorizadosEmpleado);

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

    // MODIFICACIÓN SOLUCIÓN: Se agrega la fila 'Días Restantes a Gozar:' manteniendo intactas todas las demás etiquetas
    const datosTabla = [
      ["Nombre del Empleado:", nombreEmpleadoVal],
      ["Fecha de Solicitud:", fechaSolicitudVal],
      ["Periodo Correspondiente:", periodoVal],
      ["Días Solicitados:", `${diasTomadosActual} día(s)`],
      ["Días Restantes a Gozar:", `${diasRestantesGozar} día(s)`],
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

      // Ajuste de texto para evitar desbordamiento horizontal en observaciones largas
      const lineasTexto = doc.splitTextToSize(String(colValue), 115);
      doc.text(lineasTexto[0] || '', 83, currentY + 7);
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
    const idVacacionNum = parseInt(idVacacion, 10);
    if (!Number.isInteger(idVacacionNum) || idVacacionNum <= 0) {
      alert("⚠️ ID de solicitud inválido.");
      return;
    }

    if (!inputElement || !inputElement.files || inputElement.files.length === 0) return;
    const archivo = inputElement.files[0];

    // Validación previa del archivo en cliente
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
      const res = await fetch(`${API_URL}/vacaciones/${idVacacionNum}/expediente`, {
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