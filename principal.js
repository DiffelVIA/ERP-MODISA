(() => {
    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    if (!localStorage.getItem('userRol') || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/');
    }

    document.addEventListener("DOMContentLoaded", () => {
        const rolUsuario = localStorage.getItem('userRol');
        const ventana = document.querySelector('.carrusel-ventana');
        const trackContenedor = document.getElementById('carrusel-track');
        
        const btnRegistroMinuta = document.getElementById('btn-registro-minuta');
        const btnConsultaMinuta = document.getElementById('btn-consulta-minuta');

        const tituloDashboard = document.getElementById('titulo-dashboard');
        const btnRegresarPanel = document.getElementById('btn-regresar-panel');
        const tarjetasMaster = document.querySelectorAll('.tarjeta-master');
        const tarjetasSub = document.querySelectorAll('.tarjeta-sub');

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

        const abrirSubPanel = (seccionObjetivo) => {
            if (trackContenedor) trackContenedor.classList.remove('vista-menu');
            tarjetasMaster.forEach(m => m.classList.add('panel-oculto'));
            tarjetasSub.forEach(sub => {
                if (sub.getAttribute('data-seccion') === seccionObjetivo) {
                    sub.classList.remove('panel-oculto');
                } else {
                    sub.classList.add('panel-oculto');
                }
            });

            if (seccionObjetivo === 'control') {
                tituloDashboard.textContent = "Sistema de Gestión - Control Operativo";
            } else if (seccionObjetivo === 'finanzas') {
                tituloDashboard.textContent = "Sistema de Gestión - Administración y Finanzas";
            }

            if (btnRegresarPanel) btnRegresarPanel.classList.remove('panel-oculto');
            if (ventana) ventana.scrollLeft = 0;
        };

        tarjetasMaster.forEach(master => {
            const botonAbrir = master.querySelector('.btn-tarjeta');

            if (botonAbrir) {
                botonAbrir.addEventListener('click', () => {
                    const seccionObjetivo = master.getAttribute('data-target');
                    abrirSubPanel(seccionObjetivo);
                });
            }
        });

        if (btnRegresarPanel) {
            btnRegresarPanel.addEventListener('click', (e) => {
                e.preventDefault(); // Evita recarga si el elemento es un enlace <a>
                
                if (trackContenedor) trackContenedor.classList.add('vista-menu');
                
                tarjetasMaster.forEach(m => m.classList.remove('panel-oculto'));
                tarjetasSub.forEach(sub => sub.classList.add('panel-oculto')); 
                tituloDashboard.textContent = "Sistema de Gestión MODISA";
                btnRegresarPanel.classList.add('panel-oculto');
                if (ventana) ventana.scrollLeft = 0;

                if (window.history.replaceState) {
                    window.history.replaceState(null, '', window.location.pathname);
                }
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const panelParam = urlParams.get('panel');
        if (panelParam === 'control' || panelParam === 'finanzas') {
            abrirSubPanel(panelParam);
        }
    });

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault(); 
            
            localStorage.removeItem('userRol');
            sessionStorage.removeItem('usuarioMODISA');
            
            window.location.replace("/"); 
        });
    }
})();