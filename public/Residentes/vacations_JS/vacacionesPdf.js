import { escapeHTML, calcularDiasHabilesEfectivos } from './vacacionesUi.js';

const LOGO_MODISA_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYUAAABkCAYAAACpI4qQAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFn0lEQVR4nO3dX2wcVR3A8e/O3R13vR63XmuttIBSShsKKkX5C2KxPhS1IpoY3xS0PqBvvhA1JvpEoyb6IAn6YgwR9A0T3/SBRBOjJhp/pEawhIItGGlba0tbS+v3f6/X/XE+mIah4Lbe3e5dvt/k0tzunf3NZ/5m5zczu7sCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/n348/EicXb8d3/J7eX8SxxI1fR1L1p/EkURNEP4/SdLkeU+ShD3/j5Ik+d+SpMnSJHkfR+/7/D3qD0U6EkeTrf5A/UwcG/6yPnT9sfpA/mE9mH9o1A5043jS6sbxZN3vj2d9b93X/mXf8xf/aV/yF/9e3w/39/1wH2/vfR6L3seSpEmeP313/N72m64/1/1l6x8fX/z5y3vfe+u323s619p2bKdt3/x97463fXf7R4v/9+3X3f6eP3L76+3mOa0/aN/S/ln3d9r3/Oa+543uX/v3/93a10v4d/1T/x/7G/4S3unf8c1uLz31bfe39m/7+f49f/G/29/zd+23f6fv/9H/Yf/Sfp3X+/5/6P/x/99+5y9/p0/a9/4X32e4d++nfdM3+k/+vf33f/P3+M3/o/9p380f3u/4c/9M3/y3+037l/s9f9/v+2f/nr/j53/S733pPfX19/U/93pX/r32Xf4+/4s3+1+e9+/0S173+u+S6y/tf+z/fN8L++/2l3/H/++/7V/4a/ut3/Qv/8y339/4y3++X+3v2L/1m3/b37L/bFf7975+8+/6Xf9yv/Pz+m/v+jUvf4u3+H2f+v6eXvb3/E3/9v/6e/8f/+/311/f/72f8XN/5S/37f37f37f2P/6z99d/++/0y++5l9+z433vfrrXvXv8+/26/3s9a/6R32xX/q7fp/9fV77C7/r33/P6v38d/y/3/13+X7/vbf7m3/n//0vv+p3vnL6vf+G/x/X+194xS995d/3Tz9/8y97zfe4/7/xO/7jXv2Kf+s/6l/ybf/s396X/y1/za/73f62973s//z/f34f2//a2/1K39u/4Vv2fV72e/z8zfaev3rf5fe8yfe+3vf0Tz/f1fe96nd+8l3/k/93+sXf0P/s3+43f11/6L3/2+/2Kz15X9O/9R3ve6nv61f4k293f9nv2/ff217eP/f622437RvdX3pne9k/szv+f34y3+k/4+960y++wPf/L/uH/uLf3p/yS309/2zffy//v3e5v/eHfvZ3/c7+Ea/74n/wH/f2e++7vd13382vevn/6eN3/A/a//g93/s//x/26z/3p/0Jb/snf/tLvvUv3ff7I3v3fP9bf8/rfu+/02/2J33Lfb+/5O9/i7/yvf+9v/yjfrmf+Uv9833v2+/9e/+0/f3f/B3+7r/2p/+F//u3/sH223+7//I9X/P9/Ovf8e96k/++/S37S3a1/aT/L9v+uW3/vF996O/9y32XX/Y/e+f/v9vv4V+8/W3/1vvt//75/w/33m39tf9zvdv/9u79+b+9/+/2y3v+3t22f6fv3e2n/Tve6Uf9bL7bb3/vv+Uv2/83f//+63vdvv8ffLvf+X/7Rvv33s7+5u/ze/y3P+9/91/sS174N31vv/L9/Xv/3d74N//4l7/zV773tfe/9Kfe+L1v+37/yR/53f6ef+/dvd0P+mne3n2mX+X/vOn/9nve7+3b33X/I9/jS1/q3+mffbvv+mfev33D727/xrf9xT/9zfdLfeuf/9zX326f/30+fO7P+g//l387e3f7vX2v3/j3+Sfe+/L+T/8D"
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

    // =========================================================================
    // MODIFICACIÓN CON LOGOTIPO VECTORIAL OFICIAL MODISA (INICIO)
    // =========================================================================
    
    // 1. Dibuja el fondo azul oficial MODISA
    doc.setFillColor(6, 18, 30);
    doc.rect(15, 12, 186, 16, 'F'); // Bloque relleno de 16mm de alto

    // 2. Inserta el Isotipo/Logotipo oficial vectorizado transparente sobre la barra azul
    try {
      doc.addImage(LOGO_MODISA_BASE64, 'PNG', 75.5, 15.75, 65, 8.5);
    } catch (e) {
      console.error("⚠️ No se pudo renderizar la imagen del logo Base64, usando respaldo tipográfico:", e);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.text("MODISA", 108, 22.5, { align: "center" });
    }

    // 3. Subtítulo oficial limpio debajo de la barra azul
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(6, 18, 30);
    doc.text("SOLICITUD DE VACACIONES", 108, 36, { align: "center" });

    // Línea separadora inferior
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, 42, 201, 42);

    // =========================================================================
    // MODIFICACIÓN CON LOGOTIPO VECTORIAL OFICIAL MODISA (FIN)
    // =========================================================================

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