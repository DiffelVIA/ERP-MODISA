(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

  let actividadesAcumuladas = [];

  document.addEventListener('DOMContentLoaded', () => {

    const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const rawRol = (userToken && userToken.rol) ? String(userToken.rol).trim() : '';
    const rolNormalizado = rawRol.toLowerCase().replace(/_/g, ' ');

    if (rolNormalizado !== "director operativo") {
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
    renderizarMiniTabla();

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
      const token = localStorage.getItem('jwtToken') || '';
      const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
      const rolUsuario = (userToken && userToken.rol) ? userToken.rol : '';

      const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
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
      console.log('Responsables cargados con éxito');
    } catch (error) {
      console.error('Error al llenar responsables:', error);
    }
  }

  async function cargarProyectosDesdeNube() {
    const selectProyecto = document.getElementById('proyecto');
    if (!selectProyecto) return;

    try {
      const token = localStorage.getItem('jwtToken') || '';

      const respuesta = await fetch(`${API_URL}/proyectos`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
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
      
      console.log('Proyectos cargados con éxito');
    } catch (error) {
      console.error('Error al rellenar proyectos:', error);
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
    const comentarioInput = document.getElementById('comentarioDirector');
    const comentario = comentarioInput ? comentarioInput.value.trim() : '';

    const actividadNueva = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      proyecto: proyecto,
      responsable: responsable,
      semana: semanaFiscalCalculada,
      fecha: fecha,
      descripcion: actividad,
      estado: 'pendiente',
      comentarioDirector: comentario
    };

    actividadesAcumuladas.push(actividadNueva);
    renderizarMiniTabla();

    document.getElementById('actividad').value = '';
    document.getElementById('responsable').value = '';
    document.getElementById('proyecto').value = '';
    document.getElementById('fecha').value='';
    document.getElementById('comentarioDirector').value = '';
    document.getElementById('actividad').focus();
    });
  }

  const formularioMinutas = document.getElementById('form-minutas');
  if (formularioMinutas) {
    formularioMinutas.addEventListener('submit', function(event) {
      event.preventDefault();
      
      const actividadFlotante = document.getElementById('actividad').value.trim();
      const responsableFlotante = document.getElementById('responsable').value;
      const proyectoFlotante = document.getElementById('proyecto').value;
      const fechaFlotante = document.getElementById('fecha').value;

      if (actividadFlotante && responsableFlotante && proyectoFlotante && fechaFlotante) {
        const fechaHoy = new Date();
        const semanaFiscal = obtenerNumeroSemana(fechaHoy);
        const comentarioInput = document.getElementById('comentarioDirector');
        const comentario = comentarioInput ? comentarioInput.value.trim() : '';

        const ultimaActividad = {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          proyecto : proyectoFlotante,
          responsable : responsableFlotante,
          semana: semanaFiscal,
          fecha : fechaFlotante,
          descripcion: actividadFlotante,
          estado: 'pendiente',
          comentarioDirector: comentario
        };
        actividadesAcumuladas.push(ultimaActividad);
        renderizarMiniTabla();
      }

      if(actividadesAcumuladas.length === 0) { 
        alert('Por favor, agrega al menos una actividad');
        return;
      }

      const actividadesParaEnviar = [...actividadesAcumuladas];

      procesarEnvioNube(actividadesParaEnviar);
    });
  }

  async function procesarEnvioNube(listaDeActividades) {
    try {
      const datosSanitizados = listaDeActividades.map(act => ({
        ...act,
        avance: Number(act.avance) || 0,
        comentarioDirector: act.comentarioDirector ? String(act.comentarioDirector).trim() : ''
      }));

      const token = localStorage.getItem('jwtToken') || '';

      const respuesta = await fetch(`${API_URL}/tabla_minutas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
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
      renderizarMiniTabla();

      const formulario = document.getElementById('form-minutas');
      if (formulario) formulario.reset();

      document.getElementById('actividad').focus();
      alert('¡Minuta guardada con éxito');
    } catch (error) {
      console.error('Error al conectar el backend:', error);
      alert('❌ Error al conectar con la base de datos. Tus minutas se conservan en la tabla inferior para respaldo.');
    }
  }

  function configurarBotonGuardarAlterno(){
    const botonGuardar = document.getElementById('guardar') || document.getElementById('guardarMinuta');
    if (botonGuardar) {
      botonGuardar.addEventListener('click',(evento) => {
        evento.preventDefault();
        const formulario = document.getElementById('form-minutas');
        if (formulario) formulario.dispatchEvent(new Event('submit'));
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

  // [AGREGADO]: Función encargada de sincronizar la mini-tabla con la variable actividadesAcumuladas
  function renderizarMiniTabla() {
    const contenedorVacio = document.getElementById('tabla-minutas-vacia');
    const tabla = document.getElementById('tabla-mini-minutas');
    const cuerpoTabla = document.getElementById('cuerpo-mini-tabla-minutas');

    if (!cuerpoTabla || !contenedorVacio || !tabla) return;

    cuerpoTabla.innerHTML = '';

    if (actividadesAcumuladas.length === 0) {
      contenedorVacio.style.display = 'block';
      tabla.style.display = 'none';
      return;
    }

    contenedorVacio.style.display = 'none';
    tabla.style.display = 'table';

    actividadesAcumuladas.forEach((act, index) => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${act.descripcion}</td>
        <td>${act.responsable}</td>
        <td>${act.proyecto}</td>
        <td>${act.fecha}</td>
        <td>${act.comentarioDirector || ''}</td>
        <td class="col-accion">
          <button type="button" class="btn-editar" data-index="${index}" title="Editar actividad" style="background:none; border:none; cursor:pointer;">✏️</button>
          <button type="button" class="btn-eliminar" data-index="${index}" title="Eliminar actividad" style="background:none; border:none; cursor:pointer;">❌</button>
        </td>
      `;

      cuerpoTabla.appendChild(tr);
    });

    cuerpoTabla.querySelectorAll('.btn-editar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.getAttribute('data-index'));
        editarActividad(idx);
      });
    });

    cuerpoTabla.querySelectorAll('.btn-eliminar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.getAttribute('data-index'));
        eliminarActividad(idx);
      });
    });
  }

  function editarActividad(index) {
    const act = actividadesAcumuladas[index];
    if (!act) return;

    document.getElementById('actividad').value = act.descripcion;
    document.getElementById('responsable').value = act.responsable;
    document.getElementById('proyecto').value = act.proyecto;
    document.getElementById('fecha').value = act.fecha;
    const comentarioInput = document.getElementById('comentarioDirector');
    if (comentarioInput) comentarioInput.value = act.comentarioDirector || '';

    actividadesAcumuladas.splice(index, 1);
    renderizarMiniTabla();
    document.getElementById('actividad').focus();
  }

  function eliminarActividad(index) {
    actividadesAcumuladas.splice(index, 1);
    renderizarMiniTabla();
  }
})();