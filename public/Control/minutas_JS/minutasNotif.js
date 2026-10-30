// public/Residentes/minutas_JS/minutasNotif.js

export async function cargarCatalogoEmpleados(API_URL) {
  try {
    const token = localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
    const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
    const rolActual = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol.trim() : '';

    const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-user-rol': rolActual
      }
    });

    if (respuesta.ok) {
      return await respuesta.json();
    } else {
      console.warn('⚠️ No se pudo obtener la lista de empleados para el selector de minutas.');
      return [];
    }
  } catch (error) {
    console.error('❌ Error crítico al cargar empleados en minutas:', error);
    return [];
  }
}

export async function guardarEnNubeUrgente(API_URL, actividadActualizada, concentradoMinutas) {
  try {
    const url = `${API_URL}/tabla_minutas`;

    const indice = concentradoMinutas.findIndex(item => String(item.id) === String(actividadActualizada.id));
    if (indice !== -1) {
      concentradoMinutas[indice] = {...actividadActualizada};
    }

    const numeroSemana = Number(actividadActualizada.semana);

    const objetoFormateado = {
      id: actividadActualizada.id,
      proyecto: actividadActualizada.proyecto,
      avance: actividadActualizada.avance !== undefined ? Number(actividadActualizada.avance) : 0,
      responsable: actividadActualizada.responsable,
      semana: isNaN(numeroSemana) ? 1 : numeroSemana,
      fecha: actividadActualizada.fecha,
      descripcion: actividadActualizada.descripcion,
      estado: actividadActualizada.estado,
      comentariodirector: actividadActualizada.comentarioDirector || ''
    };

    const payloadParaBackend = [objetoFormateado];

    console.log("Enviando este payload corregido al servidor:", payloadParaBackend);

    const token = localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify(payloadParaBackend)
    });

    if (!respuesta.ok) {
      throw new Error('Error al actualizar datos en el servidor');
    }

    const resultado = await respuesta.json();
    console.log('Sincronización exitosa con Aiven:', resultado);
    
  } catch (error) {
    console.error('Error al guardar cambios en la nube:', error);
    alert('No se pudieron guardar los cambios en la nube.');
  }
}