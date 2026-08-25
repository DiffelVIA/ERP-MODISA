window.obtenerUsuarioDesdeToken = function() {
    const token = localStorage.getItem('jwtToken');

    let usuarioToken = null;
    if (token) {
        try {
            const payloadBase64 = token.split('.')[1];
            usuarioToken = JSON.parse(atob(payloadBase64));
        } catch (e) {
            console.error("❌ Error al decodificar el token JWT:", e);
        }
    }

    const sesionLocal = sessionStorage.getItem('usuarioMODISA');
    let usuarioSesion = null;
    if (sesionLocal) {
        try {
            usuarioSesion = JSON.parse(sesionLocal);
        } catch (e) {
            console.error("❌ Error al parsear usuarioMODISA:", e);
        }
    }

    return {
        ...(usuarioToken || {}),
        ...(usuarioSesion || {})
    };
};