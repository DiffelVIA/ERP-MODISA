(() => {
    window.ContratosApp = window.ContratosApp || {};

    function obtenerHeadersAuth(incluirJson = false) {
        const token = localStorage.getItem('jwtToken') || '';
        const headers = {};
        if (incluirJson) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    function manejarRespuestaNoAutorizada(response) {
        if (response.status === 401) {
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userRol');
            sessionStorage.removeItem('usuarioMODISA');
            window.location.replace('/');
            return true;
        }
        return false;
    }

    async function obtenerContratos() {
        const { API_BASE } = window.ContratosApp.Auth;
        const response = await fetch(`${API_BASE}/contratos`, {
            headers: obtenerHeadersAuth(false)
        });
        if (manejarRespuestaNoAutorizada(response)) return [];
        if (!response.ok) throw new Error("Error al obtener los contratos");
        return await response.json();
    }

    async function actualizarControlContrato(idContract, payload) {
        const { API_BASE } = window.ContratosApp.Auth;
        const response = await fetch(`${API_BASE}/contratos/${idContract}/actualizar-control`, {
            method: "PUT",
            headers: obtenerHeadersAuth(true),
            body: JSON.stringify(payload)
        });
        manejarRespuestaNoAutorizada(response);
        return response;
    }

    async function actualizarUrlContrato(idContract, contractFileUrl) {
        const { API_BASE } = window.ContratosApp.Auth;
        const response = await fetch(`${API_BASE}/contratos/${idContract}/actualizar-url`, {
            method: "PUT",
            headers: obtenerHeadersAuth(true),
            body: JSON.stringify({ contract_file_url: contractFileUrl })
        });
        manejarRespuestaNoAutorizada(response);
        const data = await response.json();
        return { ok: response.ok, data };
    }

    async function eliminarContratoPorId(idContract) {
        const { API_BASE } = window.ContratosApp.Auth;
        const response = await fetch(`${API_BASE}/contratos/${idContract}`, {
            method: "DELETE",
            headers: obtenerHeadersAuth(true)
        });
        manejarRespuestaNoAutorizada(response);
        const data = await response.json();
        return { ok: response.ok, data };
    }

    window.ContratosApp.Api = {
        obtenerContratos,
        actualizarControlContrato,
        actualizarUrlContrato,
        eliminarContratoPorId
    };
})();