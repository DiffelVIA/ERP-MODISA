import { 
  filtroOpciones, 
  renderizarTabla, 
  configurarDropdowns, 
  extraerComentarios, 
  construirComentarioFinal, 
  nuevaFechaEstado 
} from './minutasUi.js';

import { 
  cargarCatalogoEmpleados, 
  guardarEnNubeUrgente 
} from './minutasNotif.js';

import { MinutasPDF } from './minutasPdf.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000/api' 
  : 'https://erp-modisa.onrender.com/api';

let concentradoMinutas = [];
let actividadesFiltradas = [];
let listaEmpleados = [];
let filtroProyecto, filtroEstado, filtroResponsable, filtroSemana, cuerpoTabla;
let criterioOrden = 'proyecto';
let interceptorNavegacionActivo = false;

function obtenerTokenStorage() {
  return localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
}

function obtenerSesionActual() {
  if (window.obtenerUsuarioDesdeToken) {
    const usuario = window.obtenerUsuarioDesdeToken();
    if (usuario) return usuario;
  }

  const token = obtenerTokenStorage();
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
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  cuerpoTabla = document.querySelector('.cuerpoTabla');
  filtroProyecto = document.getElementById("filtroProyecto");
  filtroEstado = document.getElementById("filtroEstado");
  filtroResponsable = document.getElementById("filtroResponsable");
  filtroSemana = document.getElementById("filtroSemana");

  if (!cuerpoTabla) return;

  listaEmpleados = await cargarCatalogoEmpleados(API_URL);
  await cargarActividades();
  configurarDropdowns();

  document.addEventListener('change', (e) => {
    if (
      e.target.classList.contains('chk-proyecto') ||
      e.target.classList.contains('chk-estado') ||
      e.target.classList.contains('chk-responsable') ||
      e.target.classList.contains('chk-semana')
    ) {
      aplicarFiltros();
    }
  });

  const btnDescargar = document.getElementById("descargar");
  if (btnDescargar) {
    btnDescargar.addEventListener('click', () => MinutasPDF(actividadesFiltradas)); 
  }
});

function ordenarDatos(lista) {
  const compararFechasAsc = (a, b) => {
    const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
    return (isNaN(fechaA) ? 0 : fechaA) - (isNaN(fechaB) ? 0 : fechaB);
  };

  if (criterioOrden === 'proyecto') {
    lista.sort((a, b) => {
      const compProyecto = a.proyecto.localeCompare(b.proyecto, 'es', { sensitivity: 'base' });
      return compProyecto !== 0 ? compProyecto : compararFechasAsc(a, b);
    });
  } else if (criterioOrden === 'alfabetico') {
    lista.sort((a, b) => {
      const compResponsable = a.responsable.localeCompare(b.responsable, 'es', { sensitivity: 'base' });
      return compResponsable !== 0 ? compResponsable : compararFechasAsc(a, b);
    });
  } else if (criterioOrden === 'fecha') {
    lista.sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return (isNaN(fechaB) ? 0 : fechaB) - (isNaN(fechaA) ? 0 : fechaA);
    });
  }
}

async function cargarActividades() {
  try {
    const token = obtenerTokenStorage();
    const respuesta = await fetch(`${API_URL}/tabla_minutas`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    
    if (!respuesta.ok) {
      throw new Error('Error al conectar con el servidor');
    }

    const datosCrudos = await respuesta.json();

    if (!Array.isArray(datosCrudos)) {
      concentradoMinutas = [];
    } else { 
      concentradoMinutas = datosCrudos.map(item => {
        const comentario = item.comentariodirector || item.comentarioDirector || '';
        const avance = item.avance !== undefined && item.avance !== null ? Number(item.avance) : 0;
        return {
          id: item.id,
          proyecto: item.proyecto || 'Sin proyecto',
          avance: avance,
          responsable: item.responsable || 'Sin responsable',
          semana: item.semana !== undefined && item.semana !== null ? String(item.semana) : '1',
          fecha: item.fecha || '',
          descripcion: item.descripcion || '',
          estado: item.estado ? String(item.estado).toLowerCase().trim() : 'pendiente',
          comentarioDirector: comentario
        };
      });
    }

    actividadesFiltradas = [...concentradoMinutas];
    
    ordenarDatos(actividadesFiltradas);
    filtroOpciones(concentradoMinutas, { filtroProyecto, filtroEstado, filtroResponsable, filtroSemana });
    procesarFiltrosUrl();
    
    renderizarTabla(actividadesFiltradas, {
      cuerpoTabla,
      listaEmpleados,
      asignarEventosInteractivos
    });

  } catch (error) {
    console.error("Error al cargar minutas desde Aiven:", error);
    if (cuerpoTabla) {
      cuerpoTabla.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:red; font-weight:bold;">Error al conectar con la base de datos en la nube. Revisa el backend.</td></tr>`;
    }
  }
}

function aplicarFiltros() {
  const obtenerValoresCheckboxes = (selector) => {
    return Array.from(document.querySelectorAll(selector))
                .filter(chk => chk.checked)
                .map(chk => chk.value);
  };

  const proyectosSeleccionados = obtenerValoresCheckboxes('.chk-proyecto');
  const estadosSeleccionados = obtenerValoresCheckboxes('.chk-estado');
  const responsablesSeleccionados = obtenerValoresCheckboxes('.chk-responsable');
  const semanasSeleccionadas = obtenerValoresCheckboxes('.chk-semana');

  const resultadoFiltrado = concentradoMinutas.filter((actividad) => {
    const cumpleProyecto = proyectosSeleccionados.length === 0 || proyectosSeleccionados.includes(actividad.proyecto);
    const cumpleEstado = estadosSeleccionados.length === 0 || estadosSeleccionados.includes(actividad.estado.toLowerCase().trim());
    const cumpleResponsable = responsablesSeleccionados.length === 0 || responsablesSeleccionados.includes(actividad.responsable);
    const cumpleSemana = semanasSeleccionadas.length === 0 || semanasSeleccionadas.includes(String(actividad.semana).trim());

    return cumpleProyecto && cumpleEstado && cumpleResponsable && cumpleSemana;
  });

  actividadesFiltradas = resultadoFiltrado;
  ordenarDatos(actividadesFiltradas);
  
  renderizarTabla(actividadesFiltradas, {
    cuerpoTabla,
    listaEmpleados,
    asignarEventosInteractivos
  });
}

function asignarEventosInteractivos() {
  cuerpoTabla.querySelectorAll('.selector-responsable-director').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const idActividad = e.target.getAttribute('data-id');
      const nuevoResponsable = e.target.value;

      const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
      if (actividad && nuevoResponsable !== '' && actividad.responsable !== nuevoResponsable) {
        actividad.responsable = nuevoResponsable;
        await guardarEnNubeUrgente(API_URL, actividad, concentradoMinutas);
        filtroOpciones(concentradoMinutas, { filtroProyecto, filtroEstado, filtroResponsable, filtroSemana });
        aplicarFiltros();
      }
    });
  });

  cuerpoTabla.querySelectorAll('.selector-residente').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const idActividad = e.target.getAttribute('data-id');
      const nuevoAvance = Number(e.target.value);

      const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
      if (actividad) {
        actividad.avance = nuevoAvance;
        await guardarEnNubeUrgente(API_URL, actividad, concentradoMinutas);
        aplicarFiltros();
      }
    });
  });

  cuerpoTabla.querySelectorAll('.selector-director').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const idActividad = e.target.getAttribute('data-id');
      const nuevoEstado = e.target.value;

      const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
      if (actividad) {
        if (nuevoEstado === 'aplazada') {
          nuevaFechaEstado(actividad, e.target, (act) => guardarEnNubeUrgente(API_URL, act, concentradoMinutas), aplicarFiltros);
        } else {
          actividad.estado = nuevoEstado;
          await guardarEnNubeUrgente(API_URL, actividad, concentradoMinutas);
          aplicarFiltros();
        }
      }
    });
  });

  cuerpoTabla.querySelectorAll('.input-comentario-residente').forEach((input) => {
    input.addEventListener('blur', async (e) => {
      const idActividad = e.target.getAttribute('data-id');
      const nuevoComentarioRes = e.target.value;

      const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
      if (actividad) {
        const { director } = extraerComentarios(actividad.comentarioDirector);
        const comentarioEnsamblado = construirComentarioFinal(nuevoComentarioRes, director);

        if (actividad.comentarioDirector !== comentarioEnsamblado) {
          actividad.comentarioDirector = comentarioEnsamblado;
          await guardarEnNubeUrgente(API_URL, actividad, concentradoMinutas);
        }
      }
    });
  });

  cuerpoTabla.querySelectorAll('.input-comentario-director').forEach((input) => {
    input.addEventListener('blur', async (e) => {
      const idActividad = e.target.getAttribute('data-id');
      const nuevoComentarioDir = e.target.value;

      const actividad = concentradoMinutas.find(item => String(item.id) === String(idActividad));
      if (actividad) {
        const { residente } = extraerComentarios(actividad.comentarioDirector);
        const comentarioEnsamblado = construirComentarioFinal(residente, nuevoComentarioDir);

        if (actividad.comentarioDirector !== comentarioEnsamblado) {
          actividad.comentarioDirector = comentarioEnsamblado;
          await guardarEnNubeUrgente(API_URL, actividad, concentradoMinutas);
        }
      }
    });
  });
}

function procesarFiltrosUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const origenParam = urlParams.get('origen');

  const usuarioToken = obtenerSesionActual();
  const rolUsuarioRaw = usuarioToken ? (usuarioToken.rol || usuarioToken.role || usuarioToken.job_title || '') : '';
  const rolUsuario = rolUsuarioRaw.toString().trim().toLowerCase();

  const esResidente = origenParam === 'residentes' || rolUsuario.includes('residente');
  
  if (esResidente && !interceptorNavegacionActivo) {
    interceptorNavegacionActivo = true;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cuerpoTabla')) return;

      const objetivo = e.target.closest('a, button, .btn, div[onclick]');
      if (!objetivo) return;

      const texto = (objetivo.innerText || objetivo.textContent || '').toLowerCase();
      const href = (objetivo.getAttribute('href') || '').toLowerCase();

      if (
        texto.includes('regresar') || 
        texto.includes('volver') || 
        texto.includes('panel') || 
        href.includes('principal') || 
        href.includes('control')
      ) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = '../principal.html?panel=residentes';
      }
    }, true);
  }
  
  let estadoParam = urlParams.get('estado');
  let responsableParam = urlParams.get('responsable');

  const esDirector = (rolUsuario === "director operativo" || rolUsuario === "director_operativo" || rolUsuario.includes("director"));

  if (!responsableParam && !esDirector && usuarioToken) {
    responsableParam = (
      usuarioToken.nombre || 
      usuarioToken.nombre_empleado || 
      usuarioToken.name || 
      usuarioToken.usuario || 
      ''
    ).toString().trim();
  }

  let hayFiltrosUrl = false;

  const normalizarTexto = (texto) => {
    if (!texto) return '';
    try {
      return decodeURIComponent(texto)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    } catch (e) {
      return String(texto)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    }
  };

  if (estadoParam) {
    const estadoLimpio = normalizarTexto(estadoParam);
    const checkboxesEstado = document.querySelectorAll('.chk-estado');
    checkboxesEstado.forEach(chk => {
      if (normalizarTexto(chk.value) === estadoLimpio) {
        chk.checked = true;
        hayFiltrosUrl = true;
      }
    });
  }

  if (responsableParam) {
    const respLimpio = normalizarTexto(responsableParam);
    const checkboxesResp = document.querySelectorAll('.chk-responsable');

    if (respLimpio !== '') {
      checkboxesResp.forEach(chk => {
        const valorChkLimpio = normalizarTexto(chk.value);
        
        if (
          valorChkLimpio === respLimpio ||
          valorChkLimpio.includes(respLimpio) ||
          respLimpio.includes(valorChkLimpio)
        ) {
          chk.checked = true;
          hayFiltrosUrl = true;
        }
      });
    }
  }

  if (hayFiltrosUrl) {
    aplicarFiltros();
  }
}