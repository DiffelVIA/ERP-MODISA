document.addEventListener("DOMContentLoaded", () => {
    const rolUsuario = localStorage.getItem('userRol');
    const ventana = document.querySelector('.carrusel-ventana');
    const trackContenedor = document.getElementById('carrusel-track');
    
    const btnRegistroMinuta = document.getElementById('btn-registro-minuta');
    const btnConsultaMinuta = document.getElementById('btn-consulta-minuta');

    // === ELEMENTOS ADICIONALES PARA NAVEGACIÓN ENTRE CATEGORÍAS ===
    const tituloDashboard = document.getElementById('titulo-dashboard');
    const btnRegresarPanel = document.getElementById('btn-regresar-panel');
    const tarjetasMaster = document.querySelectorAll('.tarjeta-master');
    const tarjetasSub = document.querySelectorAll('.tarjeta-sub');

    // (Se eliminó por completo el código de btnDer y btnIzq para evitar errores de referencia)

    if (btnRegistroMinuta) {
        btnRegistroMinuta.addEventListener('click', (e) =>{
            e.preventDefault();
            window.location.href = "Control/form_minutas.html";
        });
    }

    if (btnConsultaMinuta){
        btnConsultaMinuta.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = "Control/tabla_minutas.html"
        });
    }

    // === LÓGICA DE INTERMUTACIÓN DE PANELES (CONTROL / FINANZAS) ===
    tarjetasMaster.forEach(master => {
        master.addEventListener('click', () => {
            const seccionObjetivo = master.getAttribute('data-target');
            
            // Quitar el centrado para que los listados largos hagan scroll correctamente a la izquierda
            if (trackContenedor) trackContenedor.classList.remove('vista-menu');
            
            // Ocultar tarjetas principales
            tarjetasMaster.forEach(m => m.classList.add('panel-oculto'));
            
            // Mostrar los elementos correspondientes a la subcategoría seleccionada
            tarjetasSub.forEach(sub => {
                if (sub.getAttribute('data-seccion') === seccionObjetivo) {
                    sub.classList.remove('panel-oculto');
                } else {
                    sub.classList.add('panel-oculto');
                }
            });

            // Actualizar interfaz general
            if (seccionObjetivo === 'control') {
                tituloDashboard.textContent = "Sistema de Gestión - Control Operativo";
            } else {
                tituloDashboard.textContent = "Sistema de Gestión - Administración y Finanzas";
            }
            
            btnRegresarPanel.classList.remove('panel-oculto');
            if (ventana) ventana.scrollLeft = 0; // Reiniciar posición del carrusel
        });
    });

    if (btnRegresarPanel) {
        btnRegresarPanel.addEventListener('click', () => {
            // Regresar el centrado perfecto a las 2 tarjetas máster
            if (trackContenedor) trackContenedor.classList.add('vista-menu');

            // Regresar todo al estado inicial
            tarjetasMaster.forEach(m => m.classList.remove('panel-oculto'));
            
            // CORREGIDO: Se añadió .classList antes del .add para solucionar el TypeError
            tarjetasSub.forEach(sub => sub.classList.add('panel-oculto')); 
            
            tituloDashboard.textContent = "Sistema de Gestión MODISA";
            btnRegresarPanel.classList.add('panel-oculto');
            if (ventana) ventana.scrollLeft = 0; // Reiniciar posición del carrusel
        });
    }
});