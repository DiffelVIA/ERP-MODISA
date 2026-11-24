(() => {
    window.ContratosApp = window.ContratosApp || {};

    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://erp-modisa.onrender.com/api';

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function limpiarTexto(texto) {
        if (!texto) return '';
        return texto
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
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
            return payload.rol || payload.role || payload.job_title || '';
        } catch (e) {
            console.error("❌ Error al decodificar JWT en contratos:", e);
            return '';
        }
    }

    function obtenerContextoPermisos() {
        const userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const rolRaw = (userToken && userToken.rol)
            ? userToken.rol
            : (obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '');

        const rolUsuarioLimpio = limpiarTexto(rolRaw);

        const rolesPermitidos = [
            "gerente administracion",
            "compras",
            "director general",
            "director operativo",
            "subdirector de obra",
            "gerente de costos",
            "residente de obra",
            "gerente de diseno"
        ];

        const tieneAcceso = Boolean(rolUsuarioLimpio) && rolesPermitidos.some(rolPermitido => {
            const permitidoLimpio = limpiarTexto(rolPermitido);
            return rolUsuarioLimpio === permitidoLimpio || (rolUsuarioLimpio.includes("gerente") && rolUsuarioLimpio.includes("administrac"));
        });

        const esCostos = rolUsuarioLimpio.includes("costos");
        const esResidente = rolUsuarioLimpio.includes("residente");
        const esDireccion = rolUsuarioLimpio.includes("director operativo");
        const esCompras = rolUsuarioLimpio.includes("compras") || (rolUsuarioLimpio.includes("gerente") && rolUsuarioLimpio.includes("administrac"));
        const puedeEliminar = esCostos || esResidente;

        return {
            rolUsuarioLimpio,
            tieneAcceso,
            esCostos,
            esResidente,
            esDireccion,
            esCompras,
            puedeEliminar
        };
    }

    function renderizarAccesoDenegado() {
        const mainContent = document.querySelector('.main-tabla');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
                    <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px; font-weight: bold;">Acceso Denegado</h1>
                    <p style="color: #64748b; font-size: 16px; max-width: 400px; margin: 0 auto 30px auto; line-height: 1.5;">
                        No tienes los permisos necesarios para ver esta sección.
                    </p>
                </div>
            `;
        }
    }

    window.ContratosApp.Auth = {
        API_BASE,
        escapeHTML,
        limpiarTexto,
        obtenerContextoPermisos,
        renderizarAccesoDenegado
    };
})();