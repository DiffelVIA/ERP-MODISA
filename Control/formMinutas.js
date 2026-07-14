const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api' 
  : 'https://erp-modisa.onrender.com/api';

let actividadesAcumuladas = [];

document.addEventListener('DOMContentLoaded', () => {

  const rolUsuario = localStorage.getItem('userRol');
  
  if (rolUsuario !== "Director Operativo") {
    const mainContent = document.querySelector('.form_main');
    if (mainContent) {
      mainContent.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
          <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
          <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px; font-weight: bold;">Acceso Denegado</h1>
          <p style="color: #64748b; font-size: 16px; max-width: 400px; margin: 0 auto 30px auto; line-height: 1.5;">
            No tienes los permisos necesarios para ver esta sección.
          </p>
        </div>
      `;
      return;
    }
  }

  cargarResponsablesDesdeNube();
  cargarProyectosDesdeNube();
  configurarBotonGuardarAlterno();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      window.location.reload();
    }
  });
});

async function cargarResponsablesDesdeNube() {
  const selectResponsable = document.getElementById('responsable');
  if (!selectResponsable) return;

  try {
    const respuesta = await fetch(`${API_URL}/empleados`);
    if (!respuesta.ok) throw new Error('Error al traer empleados');

    const empleados = await respuesta.json();
    selectResponsable.innerHTML = '<option value="">-- Selecciona un responsable --</option>';

    empleados.forEach(empleado => {
      const nombreCompleto = `${empleado.name} ${empleado.last_name}`;
      const option = document.createElement('option');
      option.value = nombreCompleto;
      option.textContent = nombreCompleto;
      selectResponsable.appendChild(option);
    });
    console.log('Responsables cargados desde Aiven');
  } catch (error) {
    console.error('Error al llenar responsables:', error);
  }
}

async function cargarProyectosDesdeNube() {
  const selectProyecto = document.getElementById('proyecto');
  if (!selectProyecto) return;

  try {
    const respuesta = await fetch(`${API_URL}/proyectos`);
    if (!respuesta.ok) throw new Error('Error al obtener los proyectos');

    const proyectos = await respuesta.json();

    selectProyecto.innerHTML = '<option value="">-- Selecciona un proyecto --</option>';

    proyectos.forEach(p => {
      const option = document.createElement('option');
      option.value = p.project_name;
      option.textContent = p.project_name;
      selectProyecto.appendChild(option);
    });
    
    console.log('¡Proyectos cargados con éxito desde la tabla projects!');
  } catch (error) {
    console.error('Error al rellenar el select de proyectos:', error);
  }
}

const botonAgregar = document.getElementById('agregar');

if (botonAgregar) {
  botonAgregar.addEventListener('click', function(event) {
  const actividad = document.getElementById('actividad').value.trim();
  const responsable = document.getElementById('responsable').value;
  const proyecto = document.getElementById('proyecto').value;
  const fecha = document.getElementById('fecha').value;

  if(!actividad || !responsable || !proyecto || !fecha) {
    alert('Por favor, añade los campos antes de guardar la actividad');
    return;
  }

  const fechaHoy = new Date();
  const semanaFiscalCalculada = obtenerNumeroSemana(fechaHoy);
  const inputAvance = document.getElementById('avance');
  const comentario = document.getElementById('comentarioDirector');
  const avanceValor = inputAvance ? parseFloat(inputAvance.value) || 0 : 0;
  const comentarioValor = comentario ? comentario.value.trim() : '';

  const actividadNueva = {
    id: 'id_' + Math.random().toString(36).substr(2, 9),
    proyecto: proyecto,
    responsable: responsable,
    semana: semanaFiscalCalculada,
    fecha: fecha,
    descripcion: actividad,
    estado: 'pendiente',
    avance: avanceValor,
    comentarioDirector: comentarioValor
  };

  actividadesAcumuladas.push(actividadNueva);
  alert('Actividad registrada temporalmente');

  document.getElementById('actividad').value = '';
  document.getElementById('responsable').value = '';
  document.getElementById('fecha').value='';
  document.getElementById('comentarioDirector').value = '';
  document.getElementById('actividad').focus();
  });
}

document.querySelector('form').addEventListener('submit', function(event) {event.preventDefault();
  
  const actividadFlotante = document.getElementById('actividad').value.trim();
  const responsableFlotante = document.getElementById('responsable').value;
  const proyectoFlotante = document.getElementById('proyecto').value;
  const fechaFlotante = document.getElementById('fecha').value;

  if (actividadesAcumuladas.length === 0){
    if(actividadFlotante && responsableFlotante && proyectoFlotante && fechaFlotante) {
      const fechaHoy = new Date();
      const semanaFiscal = obtenerNumeroSemana(fechaHoy);
      const inputAvance = document.getElementById('avance');
      const comentario = document.getElementById('comentarioDirector');
      const avanceValor = inputAvance ? parseFloat(inputAvance.value) || 0 : 0;
      const comentarioValor = comentario ? comentario.value.trim() : '';

      const ultimaActividad = {
        id:'id_' + Math.random().toString(36).substr(2,9),
        proyecto : proyectoFlotante,
        responsable : responsableFlotante,
        semana: semanaFiscal,
        fecha : fechaFlotante,
        descripcion: actividadFlotante,
        estado: 'pendiente',
        avance: avanceValor,
        comentarioDirector: comentarioValor
      };
      actividadesAcumuladas.push(ultimaActividad);
    }
  }    

  if(actividadesAcumuladas.length === 0) { 
    alert('Por favor, agrega al menos una actividad');
    return;
  }

  const actividadesParaPDF = [...actividadesAcumuladas];

  ejecutarGeneracionPDF(actividadesParaPDF);
  procesarEnvioNube(actividadesParaPDF);
});

function ejecutarGeneracionPDF(actividadesParaPDF) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();

  const semanaFiscalCalculada = actividadesParaPDF[0].semana;
  const proyectoBase = actividadesParaPDF[0].proyecto;
  const proyectoSinEspacios = proyectoBase.replace(/ /g,'_');

  const fechaHoy= new Date();
  const primeraFechaAnio = new Date(fechaHoy.getFullYear(), 0, 1);
  const diasPasados = Math.floor((fechaHoy - primeraFechaAnio) / (1000 * 60 * 60 * 24));
  const semanaFiscalHoy = Math.ceil((diasPasados + primeraFechaAnio.getDay() + 1) / 7);

  const rutaLogoLocal = '../img/logo-negro.png';
  const img = new Image();

  function procesarEstructuraPDF() {
    doc.addImage(img, 'PNG', 15, 12, 40, 12);
    doc.setTextColor(6, 18, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Minuta_${proyectoSinEspacios}_Semana:${semanaFiscalHoy}`, 75, 22);
    doc.setDrawColor(203,213,225);
    doc.setLineWidth(0.5);
    doc.line(15,38,195,38);

    armarCuerpoPDF(doc, actividadesParaPDF);
    doc.save(`Minuta_${proyectoSinEspacios}_semana_${semanaFiscalHoy}.pdf`);
  }

  img.onload = function() {
    procesarEstructuraPDF();
  };

  img.onerror = function() {
    console.warn("Logo no encontrado. Se genera PDF son Logo");
    procesarEstructuraPDF();
  };

  img.src = rutaLogoLocal;
}

function armarCuerpoPDF(doc, listaDeActividades) {
  doc.setTextColor(51, 65, 85);
  let coordenadaY = 55;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen de Actividades Asignadas", 15, coordenadaY);
  coordenadaY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const proyectoGeneral = listaDeActividades[0] ? listaDeActividades[0].proyecto : 'Sin Proyecto';
  const avanceGeneral = listaDeActividades[0] ? listaDeActividades[0].avance : 0;
  doc.text(`Proyecto: ${proyectoGeneral} | Avance: ${avanceGeneral}%`, 15, coordenadaY);
  coordenadaY += 10;

  listaDeActividades.forEach(function(item, indice) {
    if (coordenadaY > 260) {
      doc.addPage();
      coordenadaY = 25;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Actividad ${indice + 1}:`, 15, coordenadaY);

    doc.setFont("helvetica", "normal");
    doc.text(`Responsable: ${item.responsable} | Límite: ${item.fecha}`, 42, coordenadaY);

    coordenadaY +=6;
    let textoCompleto = `Descripción: ${item.descripcion}`;
    if (item.comentarioDirector && item.comentarioDirector.trim() !== "") {
      textoCompleto += `\nComentario: ${item.comentarioDirector}`;
    }

    const textoAjustado = doc.splitTextToSize(textoCompleto ,175); 
    doc.text(textoAjustado,15,coordenadaY);
    coordenadaY += (textoAjustado.length * 5) + 10;

    doc.setDrawColor(226,232,240);
    doc.line(15, coordenadaY - 5, 195, coordenadaY-5);
  });
}

async function procesarEnvioNube(listaDeActividades) {
  try {
    const respuesta = await fetch(`${API_URL}/tabla_minutas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-rol': localStorage.getItem('userRol')
      },
      body: JSON.stringify(listaDeActividades)
    });

    if (!respuesta.ok) {
      throw new Error('Error en la respuesta del servidor');
    }

    const resultado = await respuesta.json();
    console.log('Respuesta del servidor:', resultado);

    actividadesAcumuladas = [];

    const formulario = document.querySelector('form');
    if (formulario) formulario.reset();

    document.getElementById('actividad').focus();
    alert('¡Minuta guardada con éxito en la nube!');
  } catch (error) {
    console.error('Error al conectar el backend:', error);
    alert('❌ Error al conectar con la base de datos. Se generó PDF local de respaldo');
  }
}

function configurarBotonGuardarAlterno(){
  const botonGuardar = document.getElementById('guardar') || document.getElementById('guardarMinuta');
  if (botonGuardar) {
    botonGuardar.addEventListener('click',(evento) => {
      evento.preventDefault();
      document.querySelector('form').dispatchEvent(new Event('submit'));
    });
  }
}

function obtenerNumeroSemana(fecha){
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dianNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dianNum);
  const anioInicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - anioInicio) / 86400000) + 1) / 7);
}