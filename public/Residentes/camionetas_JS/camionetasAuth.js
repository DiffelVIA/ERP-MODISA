(() => {
    const token = localStorage.getItem('jwtToken') || '';
    if (!token || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/');
        return;
    }

    function obtenerDatosUsuarioSesion() {
        let payload = {};
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            payload = JSON.parse(jsonPayload);
        } catch (e) {}

        let sesionObj = {};
        try {
            const raw = sessionStorage.getItem('usuarioMODISA');
            if (raw && raw.trim().startsWith('{')) {
                sesionObj = JSON.parse(raw);
            }
        } catch (e) {}

        const idEmpleado = payload.id_employee || payload.id || sesionObj.id_employee || sesionObj.id || null;
        const nombre = sesionObj.nombre || sesionObj.name || payload.name || payload.nombre || 'Empleado MODISA';
        const rol = payload.rol || payload.role || localStorage.getItem('userRol') || '';

        return { token, idEmpleado, nombre, rol };
    }

    function escaparHTML(texto) {
        if (texto === null || texto === undefined) return '';
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.CamionetasAuth = {
        obtenerDatosUsuarioSesion,
        escaparHTML
    };
})();