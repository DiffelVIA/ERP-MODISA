(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    if (!localStorage.getItem('userRol') || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/');
    }

    document.addEventListener("DOMContentLoaded", () => {
        renderizarSaludoUsuario();
        cargarNotificacionesMinutas();
        configurarMenuNotificaciones();

        const rolUsuario = localStorage.getItem('userRol');
        const ventana = document.querySelector('.carrusel-ventana');
        const trackContenedor = document.getElementById('carrusel-track');
        
        const btnRegistroMinuta = document.getElementById('btn-registro-minuta');
        const btnConsultaMinuta = document.getElementById('btn-consulta-minuta');

        const tituloDashboard = document.getElementById('titulo-dashboard');
        const btnRegresarPanel = document.getElementById('btn-regresar-panel');
        const tarjetasMaster = document.querySelectorAll('.tarjeta-master');
        const tarjetasSub = document.querySelectorAll('.tarjeta-sub');
        const tarjetaEmpleados = document.getElementById('tarjeta-empleados');
        if (tarjetaEmpleados) {
            const rolLimpio = rolUsuario ? rolUsuario.trim().toLowerCase() : '';
            if (rolLimpio === 'director operativo' || rolLimpio === 'director_operativo') {
                tarjetaEmpleados.style.display = 'block';
            } else {
                tarjetaEmpleados.style.display = 'none';
            }
        }

        if (btnRegistroMinuta) {
            btnRegistroMinuta.addEventListener('click', (e) =>{
                e.preventDefault();
                window.location.href = "Control/form_minutas.html";
            });
        }

        if (btnConsultaMinuta){
            btnConsultaMinuta.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = "Control/tabla_minutas.html";
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
                e.preventDefault();
                
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

    function renderizarSaludoUsuario() {
        const saludoElem = document.getElementById('saludo-texto');
        if (!saludoElem) return;

        try {
            const rawSesion = sessionStorage.getItem('usuarioMODISA');
            if (!rawSesion) return;

            let nombreMostrar = 'Usuario';

            if (rawSesion.trim().startsWith('{')) {
                const usuario = JSON.parse(rawSesion);
                nombreMostrar = usuario.nombre || usuario.nombre_empleado || usuario.name || usuario.usuario || 'Usuario';
            } else {
                nombreMostrar = rawSesion;
            }
            
            const hora = new Date().getHours();
            let saludoTiempo = '¡Buenos días';
            if (hora >= 12 && hora < 19) saludoTiempo = '¡Buenas tardes';
            if (hora >= 19 || hora < 5) saludoTiempo = '¡Buenas noches';

            saludoElem.textContent = `${saludoTiempo}, ${nombreMostrar}! 👋`;
        } catch (e) {
            console.error("❌ Error al renderizar saludo del usuario:", e);
        }
    }

    async function cargarNotificacionesMinutas() {
        try {
            const rawSesion = sessionStorage.getItem('usuarioMODISA');
            const userRol = localStorage.getItem('userRol') || '';
            let nombreUsuario = '';

            if (rawSesion && rawSesion.trim().startsWith('{')) {
                const parsed = JSON.parse(rawSesion);
                nombreUsuario = parsed.nombre || parsed.nombre_empleado || parsed.usuario || parsed.name || '';
            } else if (rawSesion) {
                nombreUsuario = rawSesion;
            }

            const res = await fetch(`${API_URL}/notificaciones/minutas-resumen`, {
                headers: {
                    'x-usuario-nombre': nombreUsuario,
                    'x-user-rol': userRol
                }
            });

            if (!res.ok) throw new Error("Error en respuesta del servidor al consultar notificaciones");

            const datos = await res.json();
            const { atrasadas = 0, pendientes = 0, aplazadas = 0 } = datos;

            const kpiAtrasadas = document.getElementById('kpi-atrasadas-val');
            const kpiPendientes = document.getElementById('kpi-pendientes-val');
            const kpiAplazadas = document.getElementById('kpi-aplazadas-val');

            if (kpiAtrasadas) kpiAtrasadas.textContent = atrasadas;
            if (kpiPendientes) kpiPendientes.textContent = pendientes;
            if (kpiAplazadas) kpiAplazadas.textContent = aplazadas;

            const badge = document.getElementById('badge-notificaciones');
            if (badge) {
                const totalAtencion = atrasadas + pendientes;
                if (totalAtencion > 0) {
                    badge.textContent = totalAtencion;
                    badge.classList.remove('panel-oculto');
                } else {
                    badge.classList.add('panel-oculto');
                }
            }

            const listaNotif = document.getElementById('lista-resumen-notif');
            if (listaNotif) {
                listaNotif.innerHTML = `
                    <li class="item-notif item-atrasada">🔴 <strong>${atrasadas}</strong> minutas atrasadas</li>
                    <li class="item-notif item-pendiente">🟡 <strong>${pendientes}</strong> minutas pendientes</li>
                    <li class="item-notif item-aplazada">🔵 <strong>${aplazadas}</strong> minutas aplazadas</li>
                `;
            }

        } catch (error) {
            console.error("❌ Error al cargar notificaciones de minutas:", error);
        }
    }

    function configurarMenuNotificaciones() {
        const btnCampana = document.getElementById('btn-notificaciones');
        const dropdown = document.getElementById('dropdown-notificaciones');

        if (!btnCampana || !dropdown) return;

        btnCampana.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('panel-oculto');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== btnCampana) {
                dropdown.classList.add('panel-oculto');
            }
        });
    }

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