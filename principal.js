// 🛡️ CONTROL DE ACCESO E HISTORIAL AL INICIO
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

    tarjetasMaster.forEach(master => {
        const botonAbrir = master.querySelector('.btn-tarjeta');

        if (botonAbrir) {
            botonAbrir.addEventListener('click', () => {
                const seccionObjetivo = master.getAttribute('data-target');
                
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
                } else {
                    tituloDashboard.textContent = "Sistema de Gestión - Administración y Finanzas";
                }
                btnRegresarPanel.classList.remove('panel-oculto');
                if (ventana) ventana.scrollLeft = 0;
            });
        }
    });

    if (btnRegresarPanel) {
        btnRegresarPanel.addEventListener('click', () => {
            if (trackContenedor) trackContenedor.classList.add('vista-menu');
            
            tarjetasMaster.forEach(m => m.classList.remove('panel-oculto'));
            tarjetasSub.forEach(sub => sub.classList.add('panel-oculto')); 
            tituloDashboard.textContent = "Sistema de Gestión MODISA";
            btnRegresarPanel.classList.add('panel-oculto');
            if (ventana) ventana.scrollLeft = 0;
        });
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