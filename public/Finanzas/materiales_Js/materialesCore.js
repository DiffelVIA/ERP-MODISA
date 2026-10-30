// public/Finanzas/materiales_Js/materialesCore.js
import { 
    limpiarTexto, 
    generarOpcionesFiltros, 
    renderizarTabla, 
    configurarDropdowns 
} from './materialesUi.js';

import { 
    obtenerDatosIniciales, 
    actualizarMaterialServidor 
} from './materialesNotif.js';

import { generarOrdenCompraPDF } from './materialesPdf.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

let esResidente = false;

function obtenerRolDesdeJWT() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return '';
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return '';
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        return payload.rol || payload.role || payload.job_title || '';
    } catch (e) {
        console.error("❌ Error al decodificar JWT en materiales:", e);
        return '';
    }
}

const puestosAutorizados = [
    "gerente administracion",
    "gerente de administracion",
    "compras",
    "director general",
    "director operativo",
    "gerente de costos",
    "auxiliar costos",
    "residente de obra"
];

let concentradoMateriales = [];
let materialesFiltrados = [];
let listaProyectosGlobal = [];

let filtroObra, filtroSolicitante, filtroEstado, filtroProveedor, filtroFecha, filtroSemana, cuerpoTabla;

document.addEventListener('DOMContentLoaded', async () => {
    const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const ROL_RAW = (usuarioSesion && usuarioSesion.rol) 
        ? usuarioSesion.rol 
        : (obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '');

    const rolUsuarioLimpio = limpiarTexto(ROL_RAW);

    const tienePermiso = puestosAutorizados.some(puesto => {
        const puestoLimpio = limpiarTexto(puesto);
        return rolUsuarioLimpio === puestoLimpio || (rolUsuarioLimpio.includes("gerente") && rolUsuarioLimpio.includes("administrac"));
    });

    if (!rolUsuarioLimpio || !tienePermiso) {
        const mainContent = document.querySelector('.main-tabla') || document.body;
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
        }
        return;
    }

    if (rolUsuarioLimpio.includes("residente")) {
        esResidente = true;
    }

    cuerpoTabla = document.querySelector('.cuerpoTabla');
    filtroObra = document.getElementById("filtroObra");
    filtroSolicitante = document.getElementById("filtroSolicitante");
    filtroEstado = document.getElementById("filtroEstado");
    filtroProveedor = document.getElementById("filtroProveedor");
    filtroFecha = document.getElementById("filtroFecha");
    filtroSemana = document.getElementById("filtroSemana");

    await inicializarDatos();
    configurarDropdowns();

    document.addEventListener('change', (e) => {
        if (
            e.target.classList.contains('chk-obra') ||
            e.target.classList.contains('chk-solicitante') ||
            e.target.classList.contains('chk-estado') ||
            e.target.classList.contains('chk-proveedor') ||
            e.target.classList.contains('chk-fecha') ||
            e.target.classList.contains('chk-semana')
        ) {
            aplicarFiltros();
        }
    });

    const btnDescargar = document.getElementById("descargar");
    if (btnDescargar) {
        const ejecutarPDF = () => generarOrdenCompraPDF(materialesFiltrados, concentradoMateriales, listaProyectosGlobal);
        btnDescargar.removeEventListener('click', ejecutarPDF); 
        btnDescargar.addEventListener('click', ejecutarPDF);
    }

    if (esResidente) {
        if (btnDescargar) btnDescargar.style.display = "none";

        const filtroProvContenedor = document.getElementById("filtroProveedor")?.closest('.filtros');
        if (filtroProvContenedor) filtroProvContenedor.style.display = "none";

        const encabezados = document.querySelectorAll('thead th, table th');
        encabezados.forEach(th => {
            const texto = th.textContent.toLowerCase().trim();
            if (
                texto.includes('proveedor') || 
                texto.includes('precio') || 
                texto.includes('monto') || 
                texto.includes('total') || 
                texto.includes('referencia')
            ) {
                th.style.display = 'none';
            }
        });
    }
});

async function inicializarDatos() {
    try {
        if (cuerpoTabla) {
            cuerpoTabla.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 25px;">⏳ Cargando materiales desde la base de datos...</td></tr>`;
        }

        const datos = await obtenerDatosIniciales(API_URL);
        concentradoMateriales = datos.concentradoMateriales;
        listaProyectosGlobal = datos.listaProyectosGlobal;

        materialesFiltrados = [...concentradoMateriales];

        const elementosFiltro = { filtroObra, filtroSolicitante, filtroEstado, filtroProveedor, filtroFecha, filtroSemana };
        generarOpcionesFiltros(concentradoMateriales, elementosFiltro);
        
        renderizarTabla(concentradoMateriales, {
            cuerpoTabla,
            esResidente,
            concentradoMateriales,
            actualizarMaterialNotif: (idDetail, payload) => actualizarMaterialServidor(API_URL, idDetail, payload),
            elementosFiltro
        });
    } catch (error) {
        console.error("Error al conectar con el backend de materiales:", error);
        if (cuerpoTabla) {
            cuerpoTabla.innerHTML = `
                <tr>
                    <td colspan="15" style="text-align: center; color: red; padding: 25px; font-weight: bold;">
                        ❌ Error al cargar datos: ${error.message}. Verifica que el servidor esté encendido.
                    </td>
                </tr>
            `;
        }
    }
}

function aplicarFiltros() {
    const obtenerValoresCheckboxes = (selector) => {
        return Array.from(document.querySelectorAll(selector))
                    .filter(chk => chk.checked)
                    .map(chk => chk.value);
    };

    const obrasSeleccionadas = obtenerValoresCheckboxes('.chk-obra');
    const solicitantesSeleccionados = obtenerValoresCheckboxes('.chk-solicitante');
    const estadosSeleccionadas = obtenerValoresCheckboxes('.chk-estado');
    const proveedoresSeleccionados = obtenerValoresCheckboxes('.chk-proveedor');
    const fechasSeleccionadas = obtenerValoresCheckboxes('.chk-fecha');
    const semanasSeleccionadas = obtenerValoresCheckboxes('.chk-semana');

    const elementosFiltro = { filtroObra, filtroSolicitante, filtroEstado, filtroProveedor, filtroFecha, filtroSemana };
    generarOpcionesFiltros(concentradoMateriales, elementosFiltro);

    const resultadoFiltrado = concentradoMateriales.filter((item) => {
        const estadoLimpio = item.estado ? item.estado.toLowerCase().trim() : '';

        const cumpleObra = obrasSeleccionadas.length === 0 || obrasSeleccionadas.includes(item.obra);
        const cumpleSolicitante = solicitantesSeleccionados.length === 0 || solicitantesSeleccionados.includes(item.solicitante);
        const cumpleEstado = estadosSeleccionadas.length === 0 || estadosSeleccionadas.includes(estadoLimpio);
        const cumpleProveedor = proveedoresSeleccionados.length === 0 || proveedoresSeleccionados.includes(item.proveedor);
        
        const cumpleFecha = fechasSeleccionadas.length === 0 || fechasSeleccionadas.includes(item.order_date);
        const cumpleSemana = semanasSeleccionadas.length === 0 || semanasSeleccionadas.includes(String(item.fiscal_week));

        return cumpleObra && cumpleSolicitante && cumpleEstado && cumpleProveedor && cumpleFecha && cumpleSemana;
    });

    materialesFiltrados = resultadoFiltrado;
    renderizarTabla(resultadoFiltrado, {
        cuerpoTabla,
        esResidente,
        concentradoMateriales,
        actualizarMaterialNotif: (idDetail, payload) => actualizarMaterialServidor(API_URL, idDetail, payload),
        elementosFiltro
    });
}