// public/Finanzas/materiales_Js/materialesNotif.js

export async function obtenerDatosIniciales(API_URL) {
    const token = localStorage.getItem('jwtToken') || '';
    const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const rolParaHeaders = (usuarioSesion && usuarioSesion.rol) ? usuarioSesion.rol : '';

    const headersPeticion = {
        'Authorization' : token ? `Bearer ${token}` : '',
        'x-user-rol': rolParaHeaders
    };

    const [resMateriales, resProyectos] = await Promise.all([
        fetch(`${API_URL}/materiales`, {
            method: 'GET',
            headers: headersPeticion
        }),
        fetch(`${API_URL}/proyectos`, {
            headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        })
    ]);
    
    if (!resMateriales.ok || !resProyectos.ok) {
        throw new Error("Error en el servidor.");
    }

    const concentradoMateriales = await resMateriales.json();
    const listaProyectosGlobal = await resProyectos.json();

    return { concentradoMateriales, listaProyectosGlobal };
}

export async function actualizarMaterialServidor(API_URL, idDetail, datosActualizados) {
    const token = localStorage.getItem('jwtToken') || '';
    const usuarioSesion = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const rolParaHeaders = (usuarioSesion && usuarioSesion.rol) ? usuarioSesion.rol : '';

    const respuesta = await fetch(`${API_URL}/materiales/detalle/${idDetail}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            'x-user-rol': rolParaHeaders
        },
        body: JSON.stringify(datosActualizados)
    });

    if (!respuesta.ok) {
        throw new Error("No se pudo actualizar el registro en el servidor.");
    }
    console.log(`📡 Sincronizado id_detail ${idDetail} con éxito.`);
    return await respuesta.json();
}