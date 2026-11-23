(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api/camionetas'
        : 'https://erp-modisa.onrender.com/api/camionetas';

    function obtenerHeaders() {
        const token = localStorage.getItem('jwtToken') || '';
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    async function obtenerUnidades() {
        const res = await fetch(`${API_BASE}/unidades`, { headers: obtenerHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cargar unidades.');
        return data;
    }

    async function obtenerHistorialMovimientos() {
        const res = await fetch(`${API_BASE}/historial-movimientos`, { headers: obtenerHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cargar bitácora.');
        return data;
    }

    async function obtenerHistorialCombustible() {
        const res = await fetch(`${API_BASE}/historial-combustible`, { headers: obtenerHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cargar combustible.');
        return data;
    }

    async function guardarUnidad(datos, idVehicle = null) {
        const url = idVehicle ? `${API_BASE}/unidades/${idVehicle}` : `${API_BASE}/unidades`;
        const method = idVehicle ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: obtenerHeaders(),
            body: JSON.stringify(datos)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar la unidad.');
        return data;
    }

    window.AdminCamionetasApi = {
        obtenerUnidades,
        obtenerHistorialMovimientos,
        obtenerHistorialCombustible,
        guardarUnidad
    };
})();