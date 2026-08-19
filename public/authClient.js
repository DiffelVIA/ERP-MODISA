window.obtenerUsuarioDesdeToken = function() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return null;
    try {
        const payloadBase64 = token.split('.')[1];
        return JSON.parse(atob(payloadBase64));
    } catch (e) {
        console.error("❌ Error al decodificar el token JWT:", e);
        return null;
    }
};