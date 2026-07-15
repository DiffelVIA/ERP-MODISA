/*
 * 🔒 GESTOR DE INACTIVIDAD DE SESIÓN - MODISA (Seguro y robusto)
 */
(() => {
  const TIEMPO_LIMITE_INACTIVIDAD = 10 * 1000; // 10 segundos para tus pruebas
  let temporizadorInactividad;

  function cerrarSesionPorInactividad() {
    console.warn("⚠️ Sesión expirada debido a inactividad prolongada.");
    
    // 🧹 Limpiamos TODO rastro de sesión
    localStorage.removeItem('userRol');
    sessionStorage.removeItem('usuarioMODISA');

    alert("Tu sesión ha expirado por inactividad. Por favor, inicia sesión de nuevo.");
    
    // Redirección forzada eliminando el historial de la pestaña actual
    window.location.replace('/'); 
  }

  function reiniciarTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(cerrarSesionPorInactividad, TIEMPO_LIMITE_INACTIVIDAD);
  }

  function iniciarMonitoreoInactividad() {
    // Si no detecta sesión activa, no inicia el monitor
    if (!localStorage.getItem('userRol') && !sessionStorage.getItem('usuarioMODISA')) {
      return;
    }

    const eventosActividad = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    eventosActividad.forEach(evento => {
      document.addEventListener(evento, reiniciarTemporizador, { passive: true });
    });

    reiniciarTemporizador();
  }

  document.addEventListener('DOMContentLoaded', iniciarMonitoreoInactividad);
})();