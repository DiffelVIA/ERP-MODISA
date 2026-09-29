(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  document.addEventListener('DOMContentLoaded', () => {
    // Autenticación / Roles (mismo patrón que formMinutas.js)
    const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;

    // INICIO MODIFICACIÓN: Bloqueo de selector de residente para autocompletado obligatorio
    const selectResponsable = document.getElementById('id_employee');
    if (selectResponsable) {
      selectResponsable.style.pointerEvents = 'none';
      selectResponsable.style.backgroundColor = '#e9ecef';
      selectResponsable.tabIndex = -1;
    }
    // FIN MODIFICACIÓN

    // INICIO MODIFICACIÓN: Inicializar Fecha Actual automáticamente al cargar la pantalla
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) {
      const hoy = new Date().toISOString().split('T')[0];
      inputFecha.value = hoy;
      actualizarFechaYSemana(hoy);

      inputFecha.addEventListener('change', (e) => {
        actualizarFechaYSemana(e.target.value);
      });
    }
    // FIN MODIFICACIÓN

    // INICIO MODIFICACIÓN: Event listener para autocompletar Residente al cambiar Proyecto
    const selectProyecto = document.getElementById('id_project');
    if (selectProyecto) {
      selectProyecto.addEventListener('change', (e) => {
        const optionSeleccionada = e.target.options[e.target.selectedIndex];
        const idUserResidente = optionSeleccionada.getAttribute('data-id-user');
        
        if (selectResponsable) {
          selectResponsable.value = idUserResidente || '';
        }
      });
    }
    // FIN MODIFICACIÓN

    cargarProyectosDesdeNube();
    cargarResponsablesDesdeNube();
    configurarEnvioFormulario();

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        window.location.reload();
      }
    });
  });

  // Carga lista de proyectos
  async function cargarProyectosDesdeNube() {
    const selectProyecto = document.getElementById('id_project');
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
      selectProyecto.innerHTML = '<option value="">-- Selecciona --</option>';

      proyectos.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id_project;
        option.textContent = p.project_name;
        
        // INICIO MODIFICACIÓN: Guardar id_user de la BD en un atributo data HTML
        if (p.id_user) {
          option.setAttribute('data-id-user', p.id_user);
        }
        // FIN MODIFICACIÓN

        selectProyecto.appendChild(option);
      });

      console.log('Proyectos cargados con éxito');
    } catch (error) {
      console.error('Error al rellenar proyectos:', error);
    }
  }

  // Carga lista de empleados/inspectores
  async function cargarResponsablesDesdeNube() {
    const selectResponsable = document.getElementById('id_employee');
    if (!selectResponsable) return;

    try {
      const token = localStorage.getItem('jwtToken') || '';
      const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!respuesta.ok) throw new Error('Error al traer empleados');

      const empleados = await respuesta.json();
      selectResponsable.innerHTML = '<option value="">-- Selecciona --</option>';

      empleados.forEach(empleado => {
        const nombreCompleto = `${empleado.name} ${empleado.last_name}`;
        const option = document.createElement('option');
        option.value = empleado.id_employee;
        option.textContent = nombreCompleto;
        selectResponsable.appendChild(option);
      });

      console.log('Responsables cargados con éxito');
    } catch (error) {
      console.error('Error al llenar responsables:', error);
    }
  }

  // Auto-calcula Mes y Semana Fiscal
  function actualizarFechaYSemana(fechaString) {
    if (!fechaString) return;
    const partes = fechaString.split('-');
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);

    const numMes = fecha.getMonth();
    const inputMes = document.getElementById('mes');
    if (inputMes) inputMes.value = MESES[numMes];

    const numSemana = obtenerNumeroSemana(fecha);
    const inputSemana = document.getElementById('semana');
    if (inputSemana) inputSemana.value = numSemana;
  }

  // Configura el envío del formulario al Endpoint POST /api/supervision
  function configurarEnvioFormulario() {
    const formulario = document.getElementById('form-supervision');
    if (!formulario) return;

    formulario.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btnGuardar = document.getElementById('guardar');
      if (btnGuardar) btnGuardar.disabled = true;

      const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
      const rawRol = (userToken && userToken.rol) ? String(userToken.rol).trim() : '';

      const payload = {
        fecha: document.getElementById('fecha').value,
        semana: document.getElementById('semana').value,
        mes: document.getElementById('mes').value,
        id_project: document.getElementById('id_project').value,
        id_employee: document.getElementById('id_employee').value,
        cumplimiento_planos: document.getElementById('cumplimiento_planos').value,
        justificacion_planos: document.getElementById('justificacion_planos').value,
        calidad_obra: document.getElementById('calidad_obra').value,
        justificacion_calidad: document.getElementById('justificacion_calidad').value,
        personal_mano_obra: document.getElementById('personal_mano_obra').value,
        justificacion_personal: document.getElementById('justificacion_personal').value,
        material_orden_seguridad: document.getElementById('material_orden_seguridad').value,
        justificacion_material: document.getElementById('justificacion_material').value,
        cumplimiento_gestoria: document.getElementById('cumplimiento_gestoria').value,
        justificacion_gestoria: document.getElementById('justificacion_gestoria').value
      };

      try {
        const token = localStorage.getItem('jwtToken') || '';
        const respuesta = await fetch(`${API_URL}/supervision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            'x-user-rol': rawRol
          },
          body: JSON.stringify(payload)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
          throw new Error(resultado.error || 'Error al guardar la evaluación de supervisión');
        }

        alert(`¡Evaluación guardada con éxito!\nPuntaje: ${(resultado.evaluacion * 100).toFixed(2)}%\nResultado: ${resultado.resultado}`);

        // INICIO MODIFICACIÓN: Recarga limpia del formulario para realizar un nuevo llenado
        window.location.reload();
        // FIN MODIFICACIÓN

      } catch (error) {
        console.error('Error al conectar con la base de datos:', error);
        alert(`❌ Error: ${error.message}`);
        if (btnGuardar) btnGuardar.disabled = false;
      }
    });
  }

  // Helper de cálculo de semana fiscal
  function obtenerNumeroSemana(fecha) {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dianNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dianNum);
    const anioInicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - anioInicio) / 86400000) + 1) / 7);
  }
})();