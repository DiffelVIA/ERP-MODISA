import { obtenerTokenActivo } from './categoriasAuth.js';

const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://erp-modisa.onrender.com';

function obtenerHeaders(conJson = false) {
    const token = obtenerTokenActivo();
    const headers = {
        "Authorization": token ? `Bearer ${token}` : ''
    };
    if (conJson) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
}

export async function fetchProyectosDestino() {
    const res = await fetch(`${BASE_URL}/api/projects-report`, {
        headers: obtenerHeaders(false)
    });
    if (!res.ok) throw new Error("Error al consultar proyectos");
    return await res.json();
}

export async function fetchCategoriasProyecto(idProject) {
    const res = await fetch(`${BASE_URL}/api/project-categories/${encodeURIComponent(idProject)}`, {
        headers: obtenerHeaders(false)
    });
    if (!res.ok) throw new Error("Error al obtener catálogo actual");
    return await res.json();
}

export async function crearCategoriaAPI(payload) {
    const res = await fetch(`${BASE_URL}/api/project-categories`, {
        method: "POST",
        headers: obtenerHeaders(true),
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "Fallo al insertar");
    return data;
}

export async function actualizarCategoriaAPI(idRegistro, payload) {
    const res = await fetch(`${BASE_URL}/api/project-categories/${encodeURIComponent(idRegistro)}`, {
        method: "PUT",
        headers: obtenerHeaders(true),
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "Fallo al actualizar");
    return data;
}

export async function eliminarCategoriaAPI(idRegistro) {
    const res = await fetch(`${BASE_URL}/api/project-categories/${encodeURIComponent(idRegistro)}`, {
        method: "DELETE",
        headers: obtenerHeaders(false)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "Fallo al eliminar");
    return data;
}

export async function subirCsvJerarquiaAPI(idProject, csvData) {
    const response = await fetch(`${BASE_URL}/api/upload-hierarchy`, {
        method: 'POST',
        headers: obtenerHeaders(true),
        body: JSON.stringify({ id_project: idProject, csvData })
    });
    const resultado = await response.json();
    if (!response.ok) {
        throw new Error(resultado.error || resultado.message || "Fallo al procesar archivo");
    }
    return resultado;
}