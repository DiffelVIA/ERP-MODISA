/*
 * 🔒 GESTOR DE INACTIVIDAD DE SESIÓN - MODISA
 */

(() => {
  const TIEMPO_LIMITE_INACTIVIDAD = 2 * 60 * 1000; 
  let temporizadorInactividad;

  function cerrarSesionPorInactividad() {
    console.warn("⚠️ Sesión expirada debido a inactividad prolongada (2 minutos).");
    
    localStorage.removeItem('userRol');

    alert("Tu sesión ha expirado por inactividad. Por favor, inicia sesión de nuevo.");
    
    window.location.href = 'login.html'; 
  }

  function reiniciarTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(cerrarSesionPorInactividad, TIEMPO_LIMITE_INACTIVIDAD);
  }

  function iniciarMonitoreoInactividad() {
    if (!localStorage.getItem('userRol')) return;

    const eventosActividad = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    eventosActividad.forEach(evento => {
      document.addEventListener(evento, reiniciarTemporizador, { passive: true });
    });

    reiniciarTemporizador();
  }

  document.addEventListener('DOMContentLoaded', iniciarMonitoreoInactividad);
})();