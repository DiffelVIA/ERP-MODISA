(() => {
    if (!localStorage.getItem('userRol') || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/'); 
        return;
    }

    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    const TIEMPO_LIMITE_INACTIVIDAD = 30 * 60 * 1000;
    let temporizadorInactividad;

    function cerrarSesionPorInactividad() {
        console.warn("⚠️ Sesión expirada debido a inactividad prolongada.");
        
        localStorage.removeItem('userRol');
        sessionStorage.removeItem('usuarioMODISA');

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