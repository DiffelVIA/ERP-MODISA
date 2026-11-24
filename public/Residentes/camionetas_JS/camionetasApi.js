(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api/camionetas'
        : 'https://erp-modisa.onrender.com/api/camionetas';

    function obtenerHeadersAuth(esJson = true) {
        const sesion = window.CamionetasAuth?.obtenerDatosUsuarioSesion
            ? window.CamionetasAuth.obtenerDatosUsuarioSesion()
            : { token: localStorage.getItem('jwtToken') || '' };
        const headers = {};
        if (sesion.token) {
            headers['Authorization'] = `Bearer ${sesion.token}`;
        }
        if (esJson) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    function manejarRespuestaNoAutorizada(res) {
        if (res.status === 401) {
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userRol');
            sessionStorage.removeItem('usuarioMODISA');
            window.location.replace('/');
            return true;
        }
        return false;
    }

    async function obtenerUnidades() {
        const res = await fetch(`${API_BASE}/unidades`, {
            headers: obtenerHeadersAuth(true)
        });
        if (manejarRespuestaNoAutorizada(res)) return [];
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al obtener las camionetas.');
        return data;
    }

    async function enviarMovimiento(formData) {
        const res = await fetch(`${API_BASE}/movimiento`, {
            method: 'POST',
            headers: obtenerHeadersAuth(false),
            body: formData
        });
        if (manejarRespuestaNoAutorizada(res)) return { success: false };
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrar el movimiento.');
        return data;
    }

    window.CamionetasApi = {
        obtenerUnidades,
        enviarMovimiento
    };
})();