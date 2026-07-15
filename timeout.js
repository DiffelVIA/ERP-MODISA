/*
 * 🛡️ CONTROL GLOBAL DE SEGURIDAD E INACTIVIDAD - MODISA
 * Este script protege la página de intrusos y gestiona el timeout de 30 minutos.
 */
(() => {
    // 1. 🛡️ CONTROL DE ACCESO INMEDIATO (CANDADO GENERAL)
    // Si no hay sesión activa en los storages, redirige al login de inmediato
    if (!localStorage.getItem('userRol') || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/'); 
        return; // Detiene por completo la carga de cualquier otro script en la página
    }

    // Prevenir que el usuario use el botón de "Atrás" del navegador para ver datos viejos en caché
    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });


    // ⏱️ 2. GESTOR DE INACTIVIDAD (TIMEOUT DE 30 MINUTOS)
    const TIEMPO_LIMITE_INACTIVIDAD = 30 * 60 * 1000; // 30 minutos en milisegundos
    let temporizadorInactividad;

    function cerrarSesionPorInactividad() {
        console.warn("⚠️ Sesión expirada debido a inactividad prolongada.");
        
        // Limpiamos absolutamente todo rastro de sesión
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

    // Iniciar el monitoreo en cuanto el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarMonitoreoInactividad);
    } else {
        iniciarMonitoreoInactividad();
    }
})();