export function obtenerTokenActivo() {
    return localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
}

export function obtenerRolDesdeJWT() {
    const token = obtenerTokenActivo();
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
        console.error("❌ Error al decodificar JWT en categorías:", e.message);
        return '';
    }
}

export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export const limpiarTexto = (texto) => {
    if (!texto) return '';
    return texto
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const ROL_AUTORIZADO = [
    "gerente de costos", 
    "costos", 
    "director operativo", 
    "compras",
    "gerente administracion",
    "gerente de administracion"
];

export function validarAccesoCategorias() {
    const tokenActivo = obtenerTokenActivo();
    const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const ROL_RAW = tokenActivo
        ? ((usuarioToken && (usuarioToken.rol || usuarioToken.role || usuarioToken.job_title)) || obtenerRolDesdeJWT())
        : '';

    const rolActualLimpio = limpiarTexto(ROL_RAW);

    const tienePermiso = Boolean(tokenActivo) && ROL_AUTORIZADO.some(rolPermitido => {
        const permitidoLimpio = limpiarTexto(rolPermitido);
        return rolActualLimpio === permitidoLimpio || (rolActualLimpio.includes("gerente") && rolActualLimpio.includes("administrac"));
    });

    if (!rolActualLimpio || !tienePermiso) {
        const contenedorPrincipal = document.querySelector('.form_main');
        if (contenedorPrincipal) {
            contenedorPrincipal.innerHTML = `
              <div style="text-align: center; padding: 60px 20px; font-family: system-ui, sans-serif;">
                <div style="font-size: 70px; margin-bottom: 15px;">🔒</div>
                <h1 style="color: #2c3e50; font-size: 26px; margin-bottom: 10px;">Acceso Denegado</h1>
                <p style="color: #7f8c8d; font-size: 15px; max-width: 450px; margin: 0 auto 25px auto; line-height: 1.6;">
                  No tienes los permisos necesarios para ver esta sección.
                </p>
              </div>
            `;
        }
        return false;
    }

    return true;
}