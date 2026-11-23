(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api/camionetas'
        : 'https://erp-modisa.onrender.com/api/camionetas';

    function obtenerHeadersAuth(esJson = true) {
        const { token } = window.CamionetasAuth.obtenerDatosUsuarioSesion();
        const headers = {
            'Authorization': `Bearer ${token}`
        };
        if (esJson) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    async function obtenerUnidades() {
        const res = await fetch(`${API_BASE}/unidades`, {
            headers: obtenerHeadersAuth(true)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al obtener las camionetas.');
        return data;
    }

    async function obtenerProyectos() {
        const res = await fetch(`${API_BASE}/proyectos-activos`, {
            headers: obtenerHeadersAuth(true)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al obtener las obras.');
        return data;
    }

    async function enviarMovimiento(formData) {
        const res = await fetch(`${API_BASE}/movimiento`, {
            method: 'POST',
            headers: obtenerHeadersAuth(false),
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrar el movimiento.');
        return data;
    }

    async function enviarCombustible(formData) {
        const res = await fetch(`${API_BASE}/combustible`, {
            method: 'POST',
            headers: obtenerHeadersAuth(false),
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrar la carga de gasolina.');
        return data;
    }

    window.CamionetasApi = {
        obtenerUnidades,
        obtenerProyectos,
        enviarMovimiento,
        enviarCombustible
    };
})();