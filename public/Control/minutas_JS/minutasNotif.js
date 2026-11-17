const enviosEnCurso = new Map();

function obtenerTokenActivo() {
  return localStorage.getItem('jwtToken') || localStorage.getItem('token') || '';
}

function obtenerRolDesdeToken(token) {
  if (window.obtenerUsuarioDesdeToken) {
    const usuario = window.obtenerUsuarioDesdeToken();
    if (usuario && (usuario.rol || usuario.role || usuario.job_title)) {
      return String(usuario.rol || usuario.role || usuario.job_title).toLowerCase().trim();
    }
  }

  if (!token) return '';

  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return '';
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(jsonPayload);
    return String(payload.rol || payload.role || payload.job_title || '').toLowerCase().trim();
  } catch (e) {
    return '';
  }
}

export async function cargarCatalogoEmpleados(API_URL) {
  try {
    const token = obtenerTokenActivo();
    if (!token) return [];

    const rolActual = obtenerRolDesdeToken(token)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!rolActual.includes('director') && !rolActual.includes('auxiliar')) {
      return [];
    }

    const respuesta = await fetch(`${API_URL}/empleados/gestion`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (respuesta.ok) {
      return await respuesta.json();
    }

    return [];
  } catch (error) {
    console.error('❌ Error al cargar empleados en minutas:', error.message);
    return [];
  }
}

export async function guardarEnNubeUrgente(API_URL, actividadActualizada, concentradoMinutas) {
  const idClave = String(actividadActualizada.id);

  if (enviosEnCurso.has(idClave)) {
    try {
      await enviosEnCurso.get(idClave);
    } catch (e) {
      void e;
    }
  }

  const promesaGuardado = (async () => {
    const indice = Array.isArray(concentradoMinutas)
      ? concentradoMinutas.findIndex(item => String(item.id) === idClave)
      : -1;
    const respaldoActividad = indice !== -1 ? { ...concentradoMinutas[indice] } : null;

    try {
      const token = obtenerTokenActivo();
      if (!token) {
        throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
      }

      const url = `${API_URL}/tabla_minutas`;

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
        comentarioDirector: actividadActualizada.comentarioDirector || ''
      };

      const payloadParaBackend = [objetoFormateado];

      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payloadParaBackend)
      });

      if (!respuesta.ok) {
        let mensajeServidor = 'No se pudieron guardar los cambios en la nube.';
        try {
          const errData = await respuesta.json();
          if (errData && (errData.detalle || errData.error)) {
            mensajeServidor = errData.detalle || errData.error;
          }
        } catch (e) {
          void e;
        }

        if (respuesta.status === 401) {
          mensajeServidor = 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
        }

        throw new Error(mensajeServidor);
      }

      await respuesta.json();
    } catch (error) {
      if (indice !== -1 && respaldoActividad) {
        concentradoMinutas[indice] = respaldoActividad;
      }
      console.error('Error al guardar cambios en la nube:', error.message);
      alert(error.message || 'No se pudieron guardar los cambios en la nube.');
      throw error;
    } finally {
      if (enviosEnCurso.get(idClave) === promesaGuardado) {
        enviosEnCurso.delete(idClave);
      }
    }
  })();

  enviosEnCurso.set(idClave, promesaGuardado);
  return promesaGuardado;
}