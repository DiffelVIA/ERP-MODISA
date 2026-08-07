'use strict';

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://erp-modisa.onrender.com/api';

/**
 * Cliente centralizado para peticiones HTTP con JWT
 */
async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token') || '';

    // Encabezados por defecto + token Bearer
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
    };

    const config = {
        ...options,
        headers
    };

    // Si enviamos un FormData (archivos/csv/subidas), dejamos que el navegador gestione el Content-Type
    if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // Si el token expiró o es inválido, cerramos sesión limpiamente
        if (response.status === 401 || response.status === 403) {
            localStorage.clear();
            sessionStorage.clear();
            alert('Tu sesión ha expirado o no tienes permisos. Por favor, ingresa de nuevo.');
            window.location.href = window.location.origin + '/login.html';
            return null;
        }

        return response;
    } catch (error) {
        console.error('Error de red o servidor:', error);
        throw error;
    }
}

// Se expone explícitamente en el scope global para consumo de los módulos
window.apiFetch = apiFetch;