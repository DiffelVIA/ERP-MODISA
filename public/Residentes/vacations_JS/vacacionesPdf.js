import { escapeHTML, calcularDiasHabilesEfectivos } from './vacacionesUi.js';

export function inicializarHandlersPDF(API_URL, getDatosVacaciones, cargarDatosVacaciones) {

  window.generarPdfImpresion = function(idVacacion) {
    const datosVacaciones = getDatosVacaciones();
    const item = datosVacaciones.find(v => String(v.id_vacacion) === String(idVacacion));
    if (!item) {
      alert("⚠️ No se encontró la información de la solicitud de vacaciones.");
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("❌ La librería jsPDF no está cargada correctamente en el navegador. Por favor recargue la página.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter'
    });

    const nombreEmpleadoVal = item.nombre_empleado || `Empleado ID #${item.id_employee}`;
    const primerNombreVal = String(nombreEmpleadoVal).trim().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const fechaIngresoVal = item.hire_date ? String(item.hire_date).split('T')[0] : '---';
    const fechaInicioVal = item.fecha_inicio ? String(item.fecha_inicio).split('T')[0] : '---';
    const fechaFinVal = item.fecha_fin ? String(item.fecha_fin).split('T')[0] : '---';
    const periodoVal = item.periodo || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    const diasTomadosVal = (item.fecha_inicio && item.fecha_fin)
      ? calcularDiasHabilesEfectivos(item.fecha_inicio, item.fecha_fin)
      : Number(item.dias_tomados || 0);

    const diasLeyVal = Number(item.dias_vacaciones_ley || item.dias_ley || 0);
    const diasRestantesVal = Math.max(0, diasLeyVal - diasTomadosVal);

    doc.setFillColor(6, 18, 30);
    doc.rect(15, 12, 186, 12, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(6, 18, 30);
    doc.text("MODISA - CONSTANCIA DE VACACIONES", 108, 32, { align: "center" });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, 42, 201, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const textoIntro = "En atención a la solicitud presentada, se autoriza el periodo vacacional correspondiente al colaborador según las siguientes especificaciones:";
    doc.text(doc.splitTextToSize(textoIntro, 186), 15, 50);

    let startY = 62;
    const filaAltura = 12;

    const datosTabla = [
      ["Nombre del Empleado:", nombreEmpleadoVal],
      ["Fecha de Ingreso:", fechaIngresoVal],
      ["Periodo Correspondiente:", periodoVal],
      ["Días Solicitados:", `${diasTomadosVal} día(s)`],
      ["Días Restantes a Gozar:", `${diasRestantesVal} día(s)`],
      ["Fecha de Inicio:", fechaInicioVal],
      ["Fecha de Término:", fechaFinVal]
    ];

    datosTabla.forEach(([colLabel, colValue], index) => {
      const currentY = startY + (index * filaAltura);

      doc.setFillColor(248, 250, 252);
      doc.rect(15, currentY, 65, filaAltura, 'F');
      
      doc.setDrawColor(203, 213, 225);
      doc.rect(15, currentY, 65, filaAltura, 'D');
      doc.rect(80, currentY, 121, filaAltura, 'D');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(colLabel, 18, currentY + 7.5);

      doc.setFont("helvetica", index === 0 || index === 3 || index === 4 ? "bold" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(String(colValue), 83, currentY + 7.5);
    });

    const finalTablaY = startY + (datosTabla.length * filaAltura) + 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const textoCompromiso = "El empleado se compromete a reincorporarse a sus labores habituales al día hábil siguiente del término de su periodo vacacional autorizado.";
    doc.text(doc.splitTextToSize(textoCompromiso, 186), 15, finalTablaY);

    const firmasY = finalTablaY + 45;

    doc.setDrawColor(6, 18, 30);
    doc.setLineWidth(0.6);
    doc.line(18, firmasY, 68, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(doc.splitTextToSize(nombreEmpleadoVal, 50), 43, firmasY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Firma del Empleado", 43, firmasY + 13, { align: "center" });

    doc.setDrawColor(6, 18, 30);
    doc.line(78, firmasY, 128, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Gerencia de Administración", 103, firmasY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Revisado y Registrado", 103, firmasY + 13, { align: "center" });

    doc.setDrawColor(6, 18, 30);
    doc.line(138, firmasY, 188, firmasY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Dirección Operativa", 163, firmasY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Autorizado", 163, firmasY + 13, { align: "center" });

    const nombreArchivo = `Constancia_Vacaciones_${primerNombreVal}_${periodoVal}.pdf`;
    doc.save(nombreArchivo);
  };

  window.subirExpedienteFirmado = async function(idVacacion, inputElement) {
    if (!inputElement || !inputElement.files || inputElement.files.length === 0) return;

    const archivo = inputElement.files[0];

    if (archivo.type !== 'application/pdf') {
      alert("❌ Únicamente se permiten archivos en formato PDF.");
      inputElement.value = '';
      return;
    }

    if (archivo.size > 10 * 1024 * 1024) {
      alert("❌ El archivo supera el límite máximo permitido de 10 MB.");
      inputElement.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('expediente', archivo);

    const token = localStorage.getItem('jwtToken') || '';

    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/expediente`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al subir el expediente firmado.');
      }

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();

    } catch (err) {
      console.error("❌ Error al subir expediente firmado:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
      inputElement.value = '';
    }
  };
}