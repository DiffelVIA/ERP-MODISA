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
let datosGanttEmpleado = [];
let vistaGanttActual = 'area'; // 'area' (por defecto) | 'general'
let ganttEmpleadoCargado = false;
let contadorSolicitudGantt = 0;

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

// MODIFICACIÓN SOLUCIÓN: Solo para decidir qué muestra la interfaz. La seguridad real la aplica el backend.
function esRolAdministrativo() {
  const jwtDatos = obtenerDatosDesdeJWT() || {};
  const rolRaw = localStorage.getItem('userRol') || jwtDatos.rol || jwtDatos.role || jwtDatos.job_title || '';
  const rol = rolRaw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const esGerenteAdmin = (
    rol === 'gerente administracion' ||
    rol === 'gerente de administracion' ||
    (rol.includes('gerente') && rol.includes('administrac'))
  );

  const esDirector = (
    rol === 'director operativo' ||
    rol === 'director general' ||
    (rol.includes('director') && rol.includes('operativ'))
  );

  return esGerenteAdmin || esDirector;
}

// Garantiza que el año actual y el siguiente existan en el selector para poder planear a futuro
function asegurarOpcionesAnioGantt() {
  const select = document.getElementById('selectAnioGantt');
  if (!select) return;

  const anioActual = new Date().getFullYear();
  const anios = new Set(Array.from(select.options).map(o => parseInt(o.value, 10)));
  anios.add(anioActual);
  anios.add(anioActual + 1);

  const ordenados = [...anios].filter(Number.isInteger).sort((a, b) => b - a);
  select.innerHTML = ordenados.map(a => `
    <option value="${a}" ${a === anioGanttSeleccionado ? 'selected' : ''}>Año ${a}</option>
  `).join('');
}

function actualizarEstiloToggleGantt() {
  [['btnGanttArea', 'area'], ['btnGanttGeneral', 'general']].forEach(([idBtn, clave]) => {
    const btn = document.getElementById(idBtn);
    if (!btn) return;
    const activo = vistaGanttActual === clave;
    btn.style.background = activo ? '#2563eb' : 'transparent';
    btn.style.color = activo ? '#ffffff' : '#475569';
    btn.setAttribute('aria-pressed', String(activo));
  });
}

function configurarToggleVistaGantt() {
  const grupo = document.getElementById('grupoVistaGantt');
  const btnArea = document.getElementById('btnGanttArea');
  const btnGeneral = document.getElementById('btnGanttGeneral');

  if (!grupo || !btnArea || !btnGeneral) return;
  if (esRolAdministrativo()) return; // Los administrativos conservan su vista actual

  grupo.style.display = 'flex';

  const cambiarVista = (nuevaVista) => {
    if (vistaGanttActual === nuevaVista) return;
    vistaGanttActual = nuevaVista;
    actualizarEstiloToggleGantt();
    cargarGanttEmpleado();
  };

  btnArea.addEventListener('click', () => cambiarVista('area'));
  btnGeneral.addEventListener('click', () => cambiarVista('general'));
}

function renderizarGanttEmpleado() {
  if (!ganttEmpleadoCargado) return;

  const jwtDatos = obtenerDatosDesdeJWT() || {};
  const idActual = jwtDatos.id_employee || jwtDatos.id || jwtDatos.userId || null;

  renderizarGanttVacaciones(datosGanttEmpleado, anioGanttSeleccionado, {
    ocultarSaldos: true,
    idEmpleadoActual: idActual
  });
}

async function cargarGanttEmpleado() {
  const grid = document.getElementById('ganttGrid');
  const info = document.getElementById('ganttInfoAlcance');
  const idSolicitud = ++contadorSolicitudGantt;
  ganttEmpleadoCargado = false;

  if (grid) {
    grid.innerHTML = `<div role="status" style="padding: 20px; text-align: center; color: #64748b;">Cargando calendario anual...</div>`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const token = localStorage.getItem('jwtToken') || '';
    const params = new URLSearchParams({
      vista: vistaGanttActual,
      anio: String(anioGanttSeleccionado)
    });

    const respuesta = await fetch(`${API_URL}/vacaciones/gantt?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);
    if (idSolicitud !== contadorSolicitudGantt) return;

    if (!respuesta.ok) {
      let mensaje = `Error ${respuesta.status}: no se pudo consultar el calendario.`;
      try {
        const errorJson = await respuesta.json();
        if (errorJson && errorJson.error) mensaje = errorJson.error;
      } catch (_) { /* se conserva el mensaje genérico */ }
      throw new Error(mensaje);
    }

    const resultado = await respuesta.json();
    if (idSolicitud !== contadorSolicitudGantt) return;

    datosGanttEmpleado = Array.isArray(resultado.datos) ? resultado.datos : [];
    ganttEmpleadoCargado = true;

    if (info) {
      const alcance = vistaGanttActual === 'area'
        ? (resultado.area
            ? `Mostrando solo al área ${resultado.area}.`
            : 'Tu perfil no tiene un área asignada; usa la vista General.')
        : 'Mostrando a todo el personal.';
      info.textContent = `${alcance} Incluye solicitudes pendientes y autorizadas.`;
      info.style.display = 'block';
    }

    renderizarGanttEmpleado();

  } catch (error) {
    clearTimeout(timeoutId);
    if (idSolicitud !== contadorSolicitudGantt) return;

    console.error('❌ Error al cargar el calendario Gantt:', error);
    const msg = error.name === 'AbortError'
      ? 'La solicitud ha superado el tiempo de espera. Por favor, reintente.'
      : error.message;

    if (grid) {
      grid.innerHTML = `
        <div role="alert" style="padding: 24px; text-align: center; color: #dc2626; font-weight: 500;">
          ❌ ${escapeHTML(msg)}
          <div style="margin-top: 12px;">
            <button type="button" id="btnReintentarGantt" class="btn">Reintentar</button>
          </div>
        </div>`;
      const btnReintentar = document.getElementById('btnReintentarGantt');
      if (btnReintentar) btnReintentar.addEventListener('click', cargarGanttEmpleado);
    }
  }
}
// FIN MODIFICACIÓN SOLUCIÓN

document.addEventListener('DOMContentLoaded', async () => {
  configurarDropdownsUI();
  configurarAlternadorVistasUI();

  // MODIFICACIÓN SOLUCIÓN: Selector Mi área / General y apertura directa desde el formulario (?vista=gantt)
  configurarToggleVistaGantt();
  if (new URLSearchParams(window.location.search).get('vista') === 'gantt') {
    const btnGanttAuto = document.getElementById('btnVistaGantt');
    if (btnGanttAuto) btnGanttAuto.click();
  }
  // FIN MODIFICACIÓN SOLUCIÓN
  
  // Registrar handlers globales en la ventana
  inicializarHandlersGlobales(API_URL, getDatosVacaciones, setDatosVacaciones, cargarDatosVacaciones, cargarDatosEstatus, actualizarFiltrosYTabla, () => renderizarVistaEstatus(datosEstatusVacaciones, empleadosSeleccionados, obtenerDatosDesdeJWT));
  inicializarHandlersPDF(API_URL, getDatosVacaciones, cargarDatosVacaciones);

  await cargarDatosVacaciones();
  await cargarDatosEstatus();

  // MODIFICACIÓN SOLUCIÓN: Se agrega el año siguiente al selector para poder planear a futuro
  if (!esRolAdministrativo()) asegurarOpcionesAnioGantt();
  // FIN MODIFICACIÓN SOLUCIÓN
});

function configurarAlternadorVistasUI() {
  const btnTabla = document.getElementById('btnVistaTabla');
  const btnGantt = document.getElementById('btnVistaGantt');
  const btnEstatus = document.getElementById('btnVistaEstatus');

  const vistaTabla = document.getElementById('contenedorVistaTabla');
  const vistaGantt = document.getElementById('contenedorVistaGantt');
  const vistaEstatus = document.getElementById('contenedorVistaEstatus');

  const selectAnio = document.getElementById('selectAnioGantt');

  // MODIFICACIÓN SOLUCIÓN: Grupo de filtros que se oculta en el Gantt de empleados (no les aplican)
  const grupoFiltros = document.getElementById('grupoFiltrosVacaciones');

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

  // MODIFICACIÓN SOLUCIÓN: Ya no se oculta el botón del Gantt; ahora lo ven todos los roles.
  // Los datos los restringe el backend (GET /api/vacaciones/gantt), no la interfaz.

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
    if (grupoFiltros) grupoFiltros.style.display = 'flex'; // MODIFICACIÓN SOLUCIÓN
  }

  btnTabla.addEventListener('click', () => {
    resetearBotones();
    btnTabla.classList.add('activa');
    btnTabla.style.background = '#2563eb';
    btnTabla.style.color = '#ffffff';
    vistaTabla.style.display = 'block';
  });

  // MODIFICACIÓN SOLUCIÓN: El listener del Gantt aplica para todos los roles
  btnGantt.addEventListener('click', () => {
    resetearBotones();
    btnGantt.classList.add('activa');
    btnGantt.style.background = '#2563eb';
    btnGantt.style.color = '#ffffff';
    vistaGantt.style.display = 'block';

    if (!puedeVerGantt) {
      if (grupoFiltros) grupoFiltros.style.display = 'none';
      asegurarOpcionesAnioGantt();
      cargarGanttEmpleado();
    }
  });

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
      // MODIFICACIÓN SOLUCIÓN: Roles no administrativos vuelven a consultar el año elegido al backend
      if (puedeVerGantt) {
        actualizarFiltrosYTabla();
      } else {
        cargarGanttEmpleado();
      }
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
    // MODIFICACIÓN SOLUCIÓN: Los administrativos conservan su Gantt; los demás roles usan los datos del endpoint /gantt
  if (esRolAdministrativo()) {
    renderizarGanttVacaciones(filtrados, anioGanttSeleccionado);
  } else {
    renderizarGanttEmpleado();
  }
  window.scrollTo(0, posicionScroll);
}