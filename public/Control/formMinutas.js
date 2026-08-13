(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

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

  function crearEstructuraActividad(actividadText, responsableVal, proyectoVal, fechaVal) {
    const fechaHoy = new Date();
    const semanaFiscalCalculada = obtenerNumeroSemana(fechaHoy);
    const comentarioInput = document.getElementById('comentarioDirector');
    const comentario = comentarioInput ? comentarioInput.value.trim() : '';

    return {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      proyecto: proyectoVal,
      responsable: responsableVal,
      semana: semanaFiscalCalculada,
      fecha: fechaVal,
      descripcion: actividadText,
      estado: 'pendiente',
      comentarioDirector: comentario
    };
  }

  async function cargarResponsablesDesdeNube() {
    const selectResponsable = document.getElementById('responsable');
    if (!selectResponsable) return;

    try {
      const token = localStorage.getItem('token') || '';
      const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
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
      const token = localStorage.getItem('token') || '';
      const respuesta = await fetch(`${API_URL}/proyectos`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
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
      console.error('Error al rellenar proyectos:', error);
    }
  }

  const botonAgregar = document.getElementById('agregar');

  if (botonAgregar) {
    botonAgregar.addEventListener('click', function(event) {
      const actividad = document.getElementById('actividad')?.value.trim() || '';
      const responsable = document.getElementById('responsable')?.value || '';
      const proyecto = document.getElementById('proyecto')?.value || '';
      const fecha = document.getElementById('fecha')?.value || '';

      if(!actividad || !responsable || !proyecto || !fecha) {
        alert('Por favor, añade los campos antes de guardar la actividad');
        return;
      }

      const actividadNueva = crearEstructuraActividad(actividad, responsable, proyecto, fecha);

      actividadesAcumuladas.push(actividadNueva);
      alert('Actividad registrada temporalmente');

      document.getElementById('actividad').value = '';
      document.getElementById('responsable').value = '';
      document.getElementById('fecha').value = '';
      document.getElementById('comentarioDirector').value = '';
      document.getElementById('actividad').focus();
    });
  }

  document.querySelector('form').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const actividadFlotante = document.getElementById('actividad')?.value.trim() || '';
    const responsableFlotante = document.getElementById('responsable')?.value || '';
    const proyectoFlotante = document.getElementById('proyecto')?.value || '';
    const fechaFlotante = document.getElementById('fecha')?.value || '';

    if (actividadesAcumuladas.length === 0) {
      if(actividadFlotante && responsableFlotante && proyectoFlotante && fechaFlotante) {
        const ultimaActividad = crearEstructuraActividad(actividadFlotante, responsableFlotante, proyectoFlotante, fechaFlotante);
        actividadesAcumuladas.push(ultimaActividad);
      }
    }    

    if(actividadesAcumuladas.length === 0) { 
      alert('Por favor, agrega al menos una actividad');
      return;
    }

    const actividadesParaEnviar = [...actividadesAcumuladas];

    procesarEnvioNube(actividadesParaEnviar);
  });

  async function procesarEnvioNube(listaDeActividades) {
    try {
      const datosSanitizados = listaDeActividades.map(act => ({
        ...act,
        avance: Number(act.avance) || 0,
        comentarioDirector: act.comentarioDirector ? String(act.comentarioDirector).trim() : ''
      }));

      const token = localStorage.getItem('token') || '';

      const respuesta = await fetch(`${API_URL}/tabla_minutas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(datosSanitizados)
      });

      if (!respuesta.ok) {
        const errorBackend = await respuesta.json().catch(() => ({}));
        throw new Error(errorBackend.detalle || 'Error en la respuesta del servidor');
      }

      const resultado = await respuesta.json();
      console.log('Respuesta del servidor:', resultado);

      actividadesAcumuladas = [];

      const formulario = document.querySelector('form');
      if (formulario) formulario.reset();

      document.getElementById('actividad').focus();
      alert('¡Minuta guardada con éxito');
    } catch (error) {
      console.error('Error al conectar el backend:', error);
      alert('❌ Error al conectar con la base de datos.');
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
})();