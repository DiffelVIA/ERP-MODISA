const enviosEnCurso = new Map();

export async function cargarCatalogoEmpleados(API_URL) {
  try {
    const token = localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';

    const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
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
  const idClave = String(actividadActualizada.id);

  if (enviosEnCurso.has(idClave)) {
    try {
      await enviosEnCurso.get(idClave);
    } catch (_) {
    }
  }

  const promesaGuardado = (async () => {
    try {
      const url = `${API_URL}/tabla_minutas`;

      const indice = concentradoMinutas.findIndex(item => String(item.id) === idClave);
      if (indice !== -1) {
        concentradoMinutas[indice] = { ...actividadActualizada };
      }

      const numeroSemana = Number(actividadActualizada.semana);
      const fechaLimpia = actividadActualizada.fecha
        ? String(actividadActualizada.fecha).split('T')[0]
        : '';

      const objetoFormateado = {
        id: actividadActualizada.id,
        proyecto: actividadActualizada.proyecto,
        avance: actividadActualizada.avance !== undefined ? Number(actividadActualizada.avance) : 0,
        responsable: actividadActualizada.responsable,
        semana: isNaN(numeroSemana) || numeroSemana === 0 ? 1 : numeroSemana,
        fecha: fechaLimpia,
        descripcion: actividadActualizada.descripcion,
        estado: actividadActualizada.estado,
        comentariodirector: actividadActualizada.comentarioDirector || ''
      };

      const payloadParaBackend = [objetoFormateado];

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
        let mensajeServidor = 'Error al actualizar datos en el servidor';
        try {
          const errData = await respuesta.json();
          if (errData && (errData.detalle || errData.error)) {
            mensajeServidor = errData.detalle || errData.error;
          }
        } catch (_) {
        }
        throw new Error(mensajeServidor);
      }

      await respuesta.json();
    } catch (error) {
      console.error('Error al guardar cambios en la nube:', error.message);
      alert('No se pudieron guardar los cambios en la nube.');
      throw error;
    } finally {
      enviosEnCurso.delete(idClave);
    }
  })();

  enviosEnCurso.set(idClave, promesaGuardado);
  return promesaGuardado;
}