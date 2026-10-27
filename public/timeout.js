(() => {
    const TIEMPO_LIMITE_INACTIVIDAD = 45 * 60 * 1000;
    const LLAVE_ULTIMA_ACTIVIDAD = 'modisa_last_activity';

    function obtenerPayloadJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map((c) => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    // MODIFICACIÓN (Ciberseguridad y UX): Limpieza atómica completa al cerrar sesión
    function cerrarSesion(mensaje) {
        console.warn(`⚠️ Sesión finalizada: ${mensaje}`);
        
        // Detener el temporizador en memoria para evitar llamadas concurrentes
        if (typeof temporizadorInactividad !== 'undefined') {
            clearTimeout(temporizadorInactividad);
        }

        localStorage.removeItem('jwtToken');
        localStorage.removeItem('token');
        localStorage.removeItem(LLAVE_ULTIMA_ACTIVIDAD);
        sessionStorage.removeItem('usuarioMODISA');
        sessionStorage.clear();

        alert(mensaje);
        window.location.replace('/'); 
    }

    // MODIFICACIÓN (Fix Race Condition): Validación de inactividad con actualización atómica de timestamp
    function validarSesionEInactividad() {
        const token = localStorage.getItem('jwtToken') || '';
        const usuario = sessionStorage.getItem('usuarioMODISA');

        if (!token || !usuario) {
            window.location.replace('/');
            return false;
        }

        const payload = obtenerPayloadJWT(token);
        if (payload && payload.exp) {
            const tiempoActualSegundos = Math.floor(Date.now() / 1000);
            if (tiempoActualSegundos >= payload.exp) {
                cerrarSesion("Tu sesión ha expirado por límite de tiempo de seguridad. Por favor, ingresa de nuevo.");
                return false;
            }
        }

        const ultimaActividad = parseInt(localStorage.getItem(LLAVE_ULTIMA_ACTIVIDAD) || '0', 10);
        const ahora = Date.now();

        // Si el timestamp guardado es muy antiguo (de una sesión previa), lo reiniciamos si el token JWT es nuevo y válido
        if (ultimaActividad > 0 && (ahora - ultimaActividad) > TIEMPO_LIMITE_INACTIVIDAD) {
            // Verificar si la sesión apenas fue iniciada (token emitido recientemente)
            if (payload && payload.iat && (Math.floor(ahora / 1000) - payload.iat) < 60) {
                localStorage.setItem(LLAVE_ULTIMA_ACTIVIDAD, ahora.toString());
                return true;
            }

            cerrarSesion("Tu sesión ha expirado por inactividad prolongada.");
            return false;
        }

        return true;
    }

    let temporizadorInactividad;

    function registrarActividad() {
        localStorage.setItem(LLAVE_ULTIMA_ACTIVIDAD, Date.now().toString());
        
        clearTimeout(temporizadorInactividad);
        temporizadorInactividad = setTimeout(() => {
            validarSesionEInactividad();
        }, TIEMPO_LIMITE_INACTIVIDAD);
    }

    function iniciarMonitoreoInactividad() {
        if (!validarSesionEInactividad()) return;

        registrarActividad();

        const eventosActividad = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

        eventosActividad.forEach(evento => {
            document.addEventListener(evento, registrarActividad, { passive: true });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                validarSesionEInactividad();
            }
        });

        window.addEventListener('pageshow', (event) => {
            if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
                validarSesionEInactividad();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarMonitoreoInactividad);
    } else {
        iniciarMonitoreoInactividad();
    }
})();