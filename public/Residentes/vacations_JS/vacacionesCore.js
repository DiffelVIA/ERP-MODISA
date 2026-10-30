// public/Residentes/vacations_JS/vacaciones-core.js
import { escapeHTML, renderizarTabla, renderizarVistaEstatus, renderizarGanttVacaciones } from './vacacionesUi.js';
import { inicializarHandlersGlobales } from './vacacionesNotif.js';
import { inicializarHandlersPDF } from './vacacionesPdf.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000/api' 
  : 'https://erp-modisa.onrender.com/api';

let datosVacaciones = [];
let datosEstatusVacaciones = [];
let empleadosSeleccionados = new Set();
let estadosSeleccionados = new Set();
let expedientesSeleccionados = new Set();
let anioGanttSeleccionado = new Date().getFullYear();

// Getters / Setters para compartir estado entre módulos de forma segura
export const getDatosVacaciones = () => datosVacaciones;
export const setDatosVacaciones = (val) => { datosVacaciones = val; };

export function obtenerDatosDesdeJWT() {
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
  configurarAlternadorVistasUI();
  
  // Registrar handlers globales en la ventana
  inicializarHandlersGlobales(API_URL, getDatosVacaciones, setDatosVacaciones, cargarDatosVacaciones, cargarDatosEstatus, actualizarFiltrosYTabla, () => renderizarVistaEstatus(datosEstatusVacaciones, empleadosSeleccionados, obtenerDatosDesdeJWT));
  inicializarHandlersPDF(API_URL, getDatosVacaciones, cargarDatosVacaciones);

  await cargarDatosVacaciones();
  await cargarDatosEstatus();
});

function configurarAlternadorVistasUI() {
  const btnTabla = document.getElementById('btnVistaTabla');
  const btnGantt = document.getElementById('btnVistaGantt');
  const btnEstatus = document.getElementById('btnVistaEstatus');

  const vistaTabla = document.getElementById('contenedorVistaTabla');
  const vistaGantt = document.getElementById('contenedorVistaGantt');
  const vistaEstatus = document.getElementById('contenedorVistaEstatus');

  const selectAnio = document.getElementById('selectAnioGantt');

  if (!btnTabla || !btnGantt || !vistaTabla || !vistaGantt) return;

  const jwtDatos = obtenerDatosDesdeJWT() || {};
  const userRolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';

  const userRolNormalizado = userRolRaw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const esLaura = (
    userRolNormalizado === 'gerente administracion' || 
    userRolNormalizado === 'gerente de administracion' ||
    (userRolNormalizado.includes('gerente') && userRolNormalizado.includes('administrac'))
  );

  const esLuis = (
    userRolNormalizado === 'director operativo' ||
    userRolNormalizado === 'director general' ||
    (userRolNormalizado.includes('director') && userRolNormalizado.includes('operativ'))
  );

  const puedeVerGantt = esLaura || esLuis;

  if (!puedeVerGantt) {
    btnGantt.style.display = 'none';
  }

  function resetearBotones() {
    [btnTabla, btnGantt, btnEstatus].forEach(btn => {
      if (btn) {
        btn.classList.remove('activa');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
      }
    });
    if (vistaTabla) vistaTabla.style.display = 'none';
    if (vistaGantt) vistaGantt.style.display = 'none';
    if (vistaEstatus) vistaEstatus.style.display = 'none';
  }

  btnTabla.addEventListener('click', () => {
    resetearBotones();
    btnTabla.classList.add('activa');
    btnTabla.style.background = '#2563eb';
    btnTabla.style.color = '#ffffff';
    vistaTabla.style.display = 'block';
  });

  if (puedeVerGantt) {
    btnGantt.addEventListener('click', () => {
      resetearBotones();
      btnGantt.classList.add('activa');
      btnGantt.style.background = '#2563eb';
      btnGantt.style.color = '#ffffff';
      vistaGantt.style.display = 'block';
    });
  }

  if (btnEstatus && vistaEstatus) {
    btnEstatus.addEventListener('click', () => {
      resetearBotones();
      btnEstatus.classList.add('activa');
      btnEstatus.style.background = '#2563eb';
      btnEstatus.style.color = '#ffffff';
      vistaEstatus.style.display = 'block';
      renderizarVistaEstatus(datosEstatusVacaciones, empleadosSeleccionados, obtenerDatosDesdeJWT);
    });
  }

  if (selectAnio) {
    selectAnio.addEventListener('change', (e) => {
      anioGanttSeleccionado = parseInt(e.target.value, 10);
      actualizarFiltrosYTabla();
    });
  }
}

async function cargarDatosVacaciones() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const token = localStorage.getItem('jwtToken') || '';
    const respuesta = await fetch(`${API_URL}/vacaciones`, {
      signal: controller.signal,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      let mensajeServidor = 'Error al consultar el histórico de vacaciones.';
      try {
        const errorJson = await respuesta.json();
        if (errorJson && errorJson.error) {
          mensajeServidor = errorJson.error;
        }
      } catch (_) {
        mensajeServidor = `Error ${respuesta.status}: ${respuesta.statusText || 'Error interno del servidor'}`;
      }
      throw new Error(mensajeServidor);
    }

    datosVacaciones = await respuesta.json();
    
    const contenedorExpediente = document.getElementById('filtroExpediente');
    if (!contenedorExpediente || contenedorExpediente.children.length === 0) {
      construirFiltrosIniciales();
    } else {
      actualizarFiltrosYTabla();
    }

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ Error al cargar vacaciones:', error);

    const cuerpo = document.getElementById('cuerpoTablaVacaciones');
    if (cuerpo) {
      const msg = error.name === 'AbortError' 
        ? 'La solicitud ha superado el tiempo de espera. Por favor, reintente.' 
        : error.message;

      cuerpo.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: #dc2626; padding: 24px; font-weight: 500;">
            ❌ ${escapeHTML(msg)}
          </td>
        </tr>`;
    }
  }
}

async function cargarDatosEstatus() {
  try {
    const token = localStorage.getItem('jwtToken') || '';
    const res = await fetch(`${API_URL}/vacaciones/estatus`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      datosEstatusVacaciones = await res.json();

      const vistaEstatus = document.getElementById('contenedorVistaEstatus');
      if (vistaEstatus && vistaEstatus.style.display !== 'none') {
        renderizarVistaEstatus(datosEstatusVacaciones, empleadosSeleccionados, obtenerDatosDesdeJWT);
      }
    }
  } catch (err) {
    console.error('❌ Error al cargar estatus de vacaciones:', err);
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
  const contenedorExpediente = document.getElementById('filtroExpediente');
  const selectAnio = document.getElementById('selectAnioGantt');

  if (!contenedorEmpleados || !contenedorEstados) return;

  const empleadosDesdeVacaciones = datosVacaciones.map(item => item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`);
  const empleadosDesdeEstatus = datosEstatusVacaciones.map(item => item.nombre_empleado);

  const empleadosUnicos = [...new Set([...empleadosDesdeVacaciones, ...empleadosDesdeEstatus])].filter(Boolean).sort();

  contenedorEmpleados.innerHTML = empleadosUnicos.map(emp => `
    <label class="opcion-filtro"><input type="checkbox" value="${escapeHTML(emp)}" class="chk-empleado"> ${escapeHTML(emp)}</label>
  `).join('');

  const estadosUnicos = ['pendiente', 'autorizada', 'rechazada'];
  contenedorEstados.innerHTML = estadosUnicos.map(est => `
    <label class="opcion-filtro">
      <input type="checkbox" value="${est}" class="chk-estado"> 
      ${est.charAt(0).toUpperCase() + est.slice(1)}
    </label>
  `).join('');

  if (contenedorExpediente) {
    contenedorExpediente.innerHTML = `
      <label class="opcion-filtro">
        <input type="checkbox" value="pendiente" class="chk-expediente"> Pendiente de archivo
      </label>
      <label class="opcion-filtro">
        <input type="checkbox" value="archivado" class="chk-expediente"> Archivado
      </label>
    `;
    contenedorExpediente.addEventListener('change', actualizarFiltrosYTabla);
  }

  if (selectAnio) {
    const aniosExtraidos = datosVacaciones
      .map(v => v.fecha_inicio ? new Date(v.fecha_inicio).getFullYear() : null)
      .filter(a => a !== null);
    
    const aniosUnicos = [...new Set([new Date().getFullYear(), ...aniosExtraidos])].sort((a, b) => b - a);
    
    selectAnio.innerHTML = aniosUnicos.map(a => `
      <option value="${a}" ${a === anioGanttSeleccionado ? 'selected' : ''}>Año ${a}</option>
    `).join('');
  }

  contenedorEmpleados.addEventListener('change', () => {
    actualizarFiltrosYTabla();
    const vistaEstatus = document.getElementById('contenedorVistaEstatus');
    if (vistaEstatus && vistaEstatus.style.display !== 'none') {
      renderizarVistaEstatus(datosEstatusVacaciones, empleadosSeleccionados, obtenerDatosDesdeJWT);
    }
  });
  
  contenedorEstados.addEventListener('change', actualizarFiltrosYTabla);
  
  actualizarFiltrosYTabla();
}

function actualizarFiltrosYTabla() {
  const posicionScroll = window.scrollY || document.documentElement.scrollTop;

  empleadosSeleccionados = new Set(
    Array.from(document.querySelectorAll('.chk-empleado:checked')).map(cb => cb.value)
  );

  estadosSeleccionados = new Set(
    Array.from(document.querySelectorAll('.chk-estado:checked')).map(cb => cb.value)
  );

  expedientesSeleccionados = new Set(
    Array.from(document.querySelectorAll('.chk-expediente:checked')).map(cb => cb.value)
  );

  const filtrados = datosVacaciones.filter(item => {
    const empNombre = item.nombre_empleado || item.empleado || `Empleado ID #${item.id_employee}`;
    const estNombreRaw = String(item.estado || 'pendiente').toLowerCase();
    const estNombre = (estNombreRaw === 'aprobada') ? 'autorizada' : estNombreRaw;

    const tieneExpediente = Boolean(item.documento_firmado_url);
    const estExpediente = tieneExpediente ? 'archivado' : 'pendiente';

    const cumpleEmpleado = empleadosSeleccionados.size === 0 || empleadosSeleccionados.has(empNombre);
    const cumpleEstado = estadosSeleccionados.size === 0 || estadosSeleccionados.has(estNombre);
    const cumpleExpediente = expedientesSeleccionados.size === 0 || expedientesSeleccionados.has(estExpediente);

    return cumpleEmpleado && cumpleEstado && cumpleExpediente;
  });

  renderizarTabla(filtrados, datosVacaciones, obtenerDatosDesdeJWT);
  renderizarGanttVacaciones(filtrados, anioGanttSeleccionado);
  window.scrollTo(0, posicionScroll);
}