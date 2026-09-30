(() => {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

  let datosVacaciones = [];
  let empleadosSeleccionados = new Set();
  let estadosSeleccionados = new Set();

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function obtenerDatosDesdeJWT() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("❌ Error al decodificar JWT:", e);
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    configurarDropdownsUI();
    await cargarDatosVacaciones();
  });

  async function cargarDatosVacaciones() {
    try {
      const token = localStorage.getItem('jwtToken') || '';
      const respuesta = await fetch(`${API_URL}/vacaciones`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-user-rol': localStorage.getItem('userRol') || ''
        }
      });

      if (!respuesta.ok) throw new Error('Error al consultar el histórico de vacaciones.');

      datosVacaciones = await respuesta.json();

      construirFiltrosIniciales();
      renderizarTabla(datosVacaciones);

    } catch (error) {
      console.error('❌ Error al cargar vacaciones:', error);
      const cuerpo = document.getElementById('cuerpoTablaVacaciones');
      if (cuerpo) {
        cuerpo.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 20px;">❌ ${escapeHTML(error.message)}</td></tr>`;
      }
    }
  }

  function configurarDropdownsUI() {
    document.querySelectorAll('.btn-dropdown').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const contenedor = btn.nextElementSibling;
        
        document.querySelectorAll('.contenido-dropdown').forEach(d => {
          if (d !== contenedor) d.classList.remove('mostrar');
        });

        contenedor.classList.toggle('mostrar');
      });
    });

    document.querySelectorAll('.contenido-dropdown').forEach(d => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.contenido-dropdown').forEach(d => d.classList.remove('mostrar'));
    });
  }

  function construirFiltrosIniciales() {
    const contenedorEmpleados = document.getElementById('filtroEmpleado');
    const contenedorEstados = document.getElementById('filtroEstado');

    if (!contenedorEmpleados || !contenedorEstados) return;

    const empleadosUnicos = [...new Set(datosVacaciones.map(item => item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`))].sort();
    contenedorEmpleados.innerHTML = empleadosUnicos.map(emp => `
      <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(emp)}" class="chk-empleado"> ${escapeHTML(emp)}</label>
    `).join('');

    const estadosUnicos = ['pendiente', 'autorizada', 'rechazada'];
    contenedorEstados.innerHTML = estadosUnicos.map(est => `
      <label class="opcion-filtro"><input type="checkbox" value="${est}" class="chk-estado"> ${est.charAt(0).toUpperCase() + est.slice(1)}</label>
    `).join('');

    contenedorEmpleados.addEventListener('change', actualizarFiltrosYTabla);
    contenedorEstados.addEventListener('change', actualizarFiltrosYTabla);
  }

  function actualizarFiltrosYTabla() {
    empleadosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-empleado:checked')).map(cb => cb.value)
    );

    estadosSeleccionados = new Set(
      Array.from(document.querySelectorAll('.chk-estado:checked')).map(cb => cb.value)
    );

    const filtrados = datosVacaciones.filter(item => {
      const empNombre = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
      const estNombre = String(item.estado || 'pendiente').toLowerCase();

      const cumpleEmpleado = empleadosSeleccionados.size === 0 || empleadosSeleccionados.has(empNombre);
      const cumpleEstado = estadosSeleccionados.size === 0 || estadosSeleccionados.has(estNombre);

      return cumpleEmpleado && cumpleEstado;
    });

    renderizarTabla(filtrados);
  }

  function renderizarTabla(lista) {
    const cuerpo = document.getElementById('cuerpoTablaVacaciones');
    if (!cuerpo) return;

    if (lista.length === 0) {
      cuerpo.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No hay registros de vacaciones.</td></tr>`;
      return;
    }

    const jwtDatos = obtenerDatosDesdeJWT() || {};
    const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';

    const userRolNormalizado = userRolRaw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const esGerenteAdmin = (
      userRolNormalizado === 'gerente administracion' || 
      userRolNormalizado === 'gerente de administracion' ||
      (userRolNormalizado.includes('gerente') && userRolNormalizado.includes('administrac'))
    );

    cuerpo.innerHTML = lista.map(item => {
      const idVacacion = item.id_vacacion;
      const empNombre = escapeHTML(item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
      const fechaSolicitud = escapeHTML(item.created_at ? item.created_at.split('T')[0] : (item.fecha_solicitud || '-'));
      const fechaInicio = escapeHTML(item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '-');
      const fechaFin = escapeHTML(item.fecha_fin ? item.fecha_fin.split('T')[0] : '-');
      const diasTomados = Number(item.dias_tomados || 0);
      const estadoActual = String(item.estado || 'pendiente').toLowerCase();
      const obsTexto = escapeHTML(item.observaciones || '');

      let selectEstadoHTML = '';
      if (esGerenteAdmin) {
        selectEstadoHTML = `
          <select class="select-estado-tabla" data-id="${idVacacion}" onchange="window.actualizarEstadoVacacion(${idVacacion}, this.value, this)" style="padding: 5px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 13px; color: #334155; font-weight: 500;">
            <option value="pendiente" ${estadoActual === 'pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="autorizada" ${estadoActual === 'autorizada' ? 'selected' : ''}>Autorizada</option>
            <option value="rechazada" ${estadoActual === 'rechazada' ? 'selected' : ''}>Rechazada</option>
          </select>
        `;
      } else {
        const textoEstadoFormateado = estadoActual.charAt(0).toUpperCase() + estadoActual.slice(1);
        selectEstadoHTML = `<span class="badge-status-pago" style="padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #fff; background-color: ${estadoActual === 'autorizada' ? '#16a34a' : (estadoActual === 'rechazada' ? '#dc2626' : '#eab308')}">${textoEstadoFormateado}</span>`;
      }

      let obsHTML = '';
      if (esGerenteAdmin) {
        obsHTML = `<input type="text" value="${obsTexto}" placeholder="Agregar nota..." class="input-obs-tabla" onblur="window.actualizarObservacionVacacion(${idVacacion}, this.value, this)" style="width: 95%; padding: 5px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; color: #334155;">`;
      } else {
        obsHTML = `<span style="color: #475569; font-style: italic; font-size: 12px;">${obsTexto || '-'}</span>`;
      }

      return `
        <tr data-id="${idVacacion}">
          <td><strong>${empNombre}</strong></td>
          <td style="text-align: center;">${fechaSolicitud}</td>
          <td style="text-align: center;">${fechaInicio}</td>
          <td style="text-align: center;">${fechaFin}</td>
          <td style="text-align: center;"><strong>${diasTomados}</strong></td>
          <td style="text-align: center;">${selectEstadoHTML}</td>
          <td>${obsHTML}</td>
        </tr>
      `;
    }).join('');
  }

  window.actualizarEstadoVacacion = async function(idVacacion, nuevoEstado, elementoInput) {
  const token = localStorage.getItem('jwtToken') || '';
  const trFila = elementoInput ? elementoInput.closest('tr') : document.querySelector(`tr[data-id="${idVacacion}"]`);

  try {
    const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ estado: nuevoEstado })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'No se pudo actualizar el estado.');
    }

    if (trFila) {
      trFila.style.backgroundColor = "#eaffea";
      setTimeout(() => { trFila.style.backgroundColor = ""; }, 600);
    }
  } catch (err) {
    console.error("❌ Error al actualizar estado:", err);
    alert(`❌ Error: ${err.message}`);
    await cargarDatosVacaciones();
  }
};

window.actualizarObservacionVacacion = async function(idVacacion, nuevaObservacion, elementoInput) {
  const token = localStorage.getItem('jwtToken') || '';
  const trFila = elementoInput ? elementoInput.closest('tr') : document.querySelector(`tr[data-id="${idVacacion}"]`);

  try {
    const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/observaciones`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ observaciones: nuevaObservacion })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'No se pudo actualizar la observación.');
    }

    if (trFila) {
      trFila.style.backgroundColor = "#eaffea";
      setTimeout(() => { trFila.style.backgroundColor = ""; }, 600);
    }
  } catch (err) {
    console.error("❌ Error al guardar observación:", err);
    alert(`❌ Error: ${err.message}`);
  }
};

})();