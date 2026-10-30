// public/Finanzas/pagos_Js/pagosNotif.js

export async function cargarSelectoresIniciales(API_URL, obtenerRolActualLimpio, obtenerRolDesdeJWT, llenarSelect) {
    try {
        const token = localStorage.getItem('jwtToken') || '';
        const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const idEmp = usuarioSesion ? (usuarioSesion.id_employee || usuarioSesion.id) : null;
        const userRolRaw = usuarioSesion ? usuarioSesion.rol : (obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '');

        const rolesConAccesoGlobal = [
            'compras',
            'director operativo',
            'subdirector de obra',
            'gerente administracion',
            'gerente administracion y compras',
            'gerente costos',
            'gerente de costos'
        ];

        const rolLimpio = obtenerRolActualLimpio();
        
        const esRolGlobal = rolesConAccesoGlobal.some(r => {
            const rLimpio = r.toLowerCase().trim();
            return rolLimpio === rLimpio || 
                   (rolLimpio.includes('gerente') && rolLimpio.includes('costo')) ||
                   (rolLimpio.includes('gerente') && rolLimpio.includes('administrac')) ||
                   (rolLimpio.includes('director') && rolLimpio.includes('operativ'));
        });

        const headersPeticion = {
            'Authorization': token ? `Bearer ${token}` : ''
        };
        if (idEmp) headersPeticion['x-employee-id'] = idEmp;
        if (userRolRaw) headersPeticion['x-user-rol'] = userRolRaw;

        const resProyectos = await fetch(`${API_URL}/proyectos`, {
            headers: headersPeticion
        });

        let proyectosFiltrados = [];
        if (resProyectos.ok) {
            const proyectos = await resProyectos.json();
            
            proyectosFiltrados = proyectos.filter(p => {
                if (esRolGlobal) return true;
                if (!idEmp) return true;
                if (p.id_employee !== undefined) return String(p.id_employee) === String(idEmp);
                if (p.id_user !== undefined) return String(p.id_user) === String(idEmp);
                if (Array.isArray(p.empleados)) return p.empleados.includes(Number(idEmp));
                return true;
            });

            const lista = proyectosFiltrados.map(p => ({ 
                id: p.id_project,
                nombre: p.project_name
            }));
            
            llenarSelect('proyecto', lista);
        }

        const resContratos = await fetch(`${API_URL}/contratos`, {
            headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        
        let contratosCargados = [];
        if (resContratos.ok) {
            contratosCargados = await resContratos.json();
        }

        return { proyectos: proyectosFiltrados, contratos: contratosCargados };
    } catch (error) {
        console.error("❌ Error inicial:", error);
        return { proyectos: [], contratos: [] };
    }
}

export async function obtenerSaldoContrato(API_URL, idContratoActivo) {
    const token = localStorage.getItem('jwtToken') || '';
    const resSaldo = await fetch(`${API_URL}/contratos/${idContratoActivo}/saldo`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
    });

    if (resSaldo.ok) {
        const dataSaldo = await resSaldo.json();
        return parseFloat(dataSaldo.monto_solicitado_total) || 0;
    }
    return 0;
}

export async function obtenerCategoriasProyecto(API_URL, idProyecto) {
    const token = localStorage.getItem('jwtToken') || '';
    const res = await fetch(`${API_URL}/proyectos/${idProyecto}/categorias`, {
        headers: {'Authorization': token ? `Bearer ${token}` : ''}
    });

    if (res.ok) {
        return await res.json();
    }
    return [];
}

export async function enviarPagosServidor(API_URL, formData) {
    const token = localStorage.getItem('jwtToken') || '';
    const res = await fetch(`${API_URL}/pagos`, {
        method: 'POST',
        headers: {
            'Authorization': token ? `Bearer ${token}` : ''
        },
        body: formData
    });

    const contentType = res.headers.get('content-type') || '';
    let datos = {};

    if (contentType.includes('application/json')) {
        datos = await res.json();
    } else {
        const textoError = await res.text();
        throw new Error(`El servidor respondió con un error no estructurado (${res.status}). Detalle: ${textoError.substring(0, 150)}...`);
    }

    if (!res.ok) throw new Error(datos.error || 'Error en el servidor.');

    return datos;
}