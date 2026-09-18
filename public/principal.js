(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    const token = localStorage.getItem('jwtToken') || '';
    if (!token || !sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('/');
    }

    function obtenerRolDesdeJWT() {
        const token = localStorage.getItem('jwtToken');
        if (!token) return '';
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return '';
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const payload = JSON.parse(jsonPayload);
            return payload.rol || payload.role || '';
        } catch (e) {
            console.error("❌ Error al decodificar JWT:", e);
            return '';
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        renderizarSaludoUsuario();
        cargarNotificacionesMinutas();
        configurarEventosTarjetasKPI();

        const rolDesdeJWT = obtenerRolDesdeJWT();
        const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const ROL_RAW = rolDesdeJWT || (usuarioSesion && usuarioSesion.rol ? usuarioSesion.rol : '');
        const rolUsuario = (ROL_RAW || localStorage.getItem('userRol') || '').trim().toLowerCase();
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
            
            const rolesPermitidosEmpleados = [
                'director operativo',
                'gerente de administración',
                'compras'
            ];

            if (rolesPermitidosEmpleados.includes(rolLimpio)) {
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
            } else if (seccionObjetivo === 'residentes') {
                tituloDashboard.textContent = "Sistema de Gestión - Residentes";
            }

            if (btnRegresarPanel) btnRegresarPanel.classList.remove('panel-oculto');
            if (ventana) ventana.scrollLeft = 0;
        };

        const esResidente = rolUsuario.includes('residente');

        if (esResidente) {
            abrirSubPanel('residentes');
            if (btnRegresarPanel) btnRegresarPanel.classList.add('panel-oculto');
        } else {
            tarjetasMaster.forEach(master => {
                const botonAbrir = master.querySelector('.btn-tarjeta');

                if (botonAbrir) {
                    botonAbrir.addEventListener('click', () => {
                        const seccionObjetivo = master.getAttribute('data-target');
                        abrirSubPanel(seccionObjetivo);
                    });
                }
            });
        }

        if (btnRegresarPanel) {
            btnRegresarPanel.addEventListener('click', (e) => {
                e.preventDefault();

                if (esResidente) return;
                
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
        if (panelParam === 'control' || panelParam === 'finanzas' || panelParam === 'residentes') {
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
            let nombreUsuario = '';

            if (rawSesion && rawSesion.trim().startsWith('{')) {
                const parsed = JSON.parse(rawSesion);
                nombreUsuario = parsed.nombre || parsed.nombre_empleado || parsed.usuario || parsed.name || '';
            } else if (rawSesion) {
                nombreUsuario = rawSesion;
            }

            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${API_URL}/notificaciones/minutas-resumen`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-usuario-nombre': nombreUsuario
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

        } catch (error) {
            console.error("❌ Error al cargar notificaciones de minutas:", error);
        }
    }

    function configurarEventosTarjetasKPI() {
        const obtenerNombreUsuarioActual = () => {
            try {
                const rawSesion = sessionStorage.getItem('usuarioMODISA');
                if (!rawSesion) return '';
                if (rawSesion.trim().startsWith('{')) {
                    const usuario = JSON.parse(rawSesion);
                    return usuario.nombre || usuario.nombre_empleado || usuario.name || usuario.usuario || '';
                }
                return rawSesion;
            } catch (e) {
                return '';
            }
        };

        const nombreUsuario = encodeURIComponent(obtenerNombreUsuarioActual());
        const cardAtrasadas = document.querySelector('.kpi-atrasadas');
        const cardPendientes = document.querySelector('.kpi-pendientes');
        const cardAplazadas = document.querySelector('.kpi-aplazadas');
        const rolJwt = obtenerRolDesdeJWT().toLowerCase();
        const sufijoOrigen = rolJwt.includes('residente') ? '&origen=residentes' : '';

        if (cardAtrasadas) {
            cardAtrasadas.onclick = () => {
                window.location.href = `Control/tabla_minutas.html?estado=atrasada&responsable=${nombreUsuario}${sufijoOrigen}`;
            };
        }
        if (cardPendientes) {
            cardPendientes.onclick = () => {
                window.location.href = `Control/tabla_minutas.html?estado=pendiente&responsable=${nombreUsuario}${sufijoOrigen}`;
            };
        }
        if (cardAplazadas) {
            cardAplazadas.onclick = () => {
                window.location.href = `Control/tabla_minutas.html?estado=aplazada&responsable=${nombreUsuario}${sufijoOrigen}`;
            };
        }
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault(); 
            
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userRol');
            sessionStorage.removeItem('usuarioMODISA');
            
            window.location.replace("/"); 
        });
    }

    function procesarFiltrosUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const estadoParam = urlParams.get('estado');
    const responsableParam = urlParams.get('responsable');

    let hayFiltrosUrl = false;

    if (estadoParam) {
      const estadoLimpio = decodeURIComponent(estadoParam).toLowerCase().trim();
      const checkboxesEstado = document.querySelectorAll('.chk-estado');
      checkboxesEstado.forEach(chk => {
        if (chk.value.toLowerCase().trim() === estadoLimpio) {
          chk.checked = true;
          hayFiltrosUrl = true;
        }
      });
    }

    if (responsableParam) {
      const respLimpio = decodeURIComponent(responsableParam).toLowerCase().trim();
      const checkboxesResp = document.querySelectorAll('.chk-responsable');
      checkboxesResp.forEach(chk => {
        if (chk.value.toLowerCase().trim() === respLimpio) {
          chk.checked = true;
          hayFiltrosUrl = true;
        }
      });
    }

    if (hayFiltrosUrl) {
      aplicarFiltros();
    }
  }
})();