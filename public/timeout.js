(() => {
    // MODIFICACIÓN DE VALIDACIÓN DE SESIÓN (JWT)
    // Se valida el token y la sesión usando sessionStorage en lugar de la clave inexistente userRol
    const tokenSesion = sessionStorage.getItem('authToken');
    const usuarioSesion = sessionStorage.getItem('usuarioMODISA');

    if (!tokenSesion || !usuarioSesion) {
        window.location.replace('/'); 
        return;
    }
    // FIN DE LA MODIFICACIÓN

    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    const TIEMPO_LIMITE_INACTIVIDAD = 90 * 60 * 1000;
    let temporizadorInactividad;

    function cerrarSesionPorInactividad() {
        console.warn("⚠️ Sesión expirada debido a inactividad prolongada.");
        
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('usuarioMODISA');
        localStorage.removeItem('userRol');

        alert("Tu sesión ha expirado por inactividad. Por favor, inicia sesión de nuevo.");
        window.location.replace('/'); 
    }

    function reiniciarTemporizador() {
        clearTimeout(temporizadorInactividad);
        temporizadorInactividad = setTimeout(cerrarSesionPorInactividad, TIEMPO_LIMITE_INACTIVIDAD);
    }

    function iniciarMonitoreoInactividad() {
        const eventosActividad = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

        eventosActividad.forEach(evento => {
            document.addEventListener(evento, reiniciarTemporizador, { passive: true });
        });

        reiniciarTemporizador();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarMonitoreoInactividad);
    } else {
        iniciarMonitoreoInactividad();
    }
})();