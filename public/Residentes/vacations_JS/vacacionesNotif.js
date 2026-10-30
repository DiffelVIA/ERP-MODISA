import { escapeHTML, calcularDiasHabilesEfectivos } from './vacacionesUi.js';

export function inicializarHandlersGlobales(API_URL, getDatosVacaciones, setDatosVacaciones, cargarDatosVacaciones, cargarDatosEstatus, actualizarFiltrosYTabla, renderizarVistaEstatus) {
  
  window.actualizarEstadoVacacion = async function(idVacacion, nuevoEstado, elementoInput) {
    const token = localStorage.getItem('jwtToken') || '';

    const trFila = elementoInput ? elementoInput.closest('tr') : document.querySelector(`tr[data-id="${idVacacion}"]`);
    const inputObs = trFila ? trFila.querySelector('.input-obs-tabla') : null;
    const textoObservacion = inputObs ? inputObs.value : null;

    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ 
          estado: nuevoEstado,
          observaciones: textoObservacion 
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo actualizar el estado.');
      }

      const datosVacaciones = getDatosVacaciones();
      const itemLocal = datosVacaciones.find(item => item.id_vacacion === idVacacion);
      
      if (itemLocal) {
        itemLocal.estado = nuevoEstado;

        if (textoObservacion !== null) {
          itemLocal.observaciones = textoObservacion;
        }

        const idEmp = itemLocal.id_employee;
        const totalGozados = datosVacaciones
          .filter(v => v.id_employee === idEmp && (v.estado === 'aprobada' || v.estado === 'autorizada'))
          .reduce((sum, v) => {
            const dHabiles = (v.fecha_inicio && v.fecha_fin)
              ? calcularDiasHabilesEfectivos(v.fecha_inicio, v.fecha_fin)
              : Number(v.dias_tomados || 0);
            return sum + dHabiles;
          }, 0);

        datosVacaciones.forEach(v => {
          if (v.id_employee === idEmp) {
            v.dias_gozados = totalGozados;
            v.dias_restantes = Math.max(0, Number(v.dias_vacaciones_ley || 0) - totalGozados);
          }
        });
      }

      actualizarFiltrosYTabla();
      await cargarDatosEstatus();

    } catch (err) {
      console.error("❌ Error al actualizar estado:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };

  window.actualizarObservacionVacacion = async function(idVacacion, nuevaObservacion, elementoInput) {
    if (elementoInput && !document.body.contains(elementoInput)) return;

    const token = localStorage.getItem('jwtToken') || '';
    const trFila = elementoInput ? elementoInput.closest('tr') : document.querySelector(`tr[data-id="${idVacacion}"]`);

    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/observaciones`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ observaciones: nuevaObservacion })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo actualizar la observación.');
      }

      const datosVacaciones = getDatosVacaciones();
      const itemLocal = datosVacaciones.find(v => v.id_vacacion === idVacacion);
      if (itemLocal) {
        itemLocal.observaciones = nuevaObservacion;
      }

      if (trFila) {
        trFila.style.backgroundColor = "#eaffea";
        setTimeout(() => { 
          if (trFila && document.body.contains(trFila)) {
            trFila.style.backgroundColor = ""; 
          }
        }, 600);
      }
    } catch (err) {
      console.error("❌ Error al guardar observación:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };

  window.forzarRenovacionDias = async function(idEmployee, nombreEmpleado) {
    if (!confirm(`⚠️ ¿Estás segura de forzar la renovación de días para "${nombreEmpleado}"?\n\nEsto restablecerá sus días gozados eliminando las solicitudes registradas del periodo.`)) {
      return;
    }

    const token = localStorage.getItem('jwtToken') || '';

    try {
      const res = await fetch(`${API_URL}/vacaciones/renovar/${idEmployee}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo realizar la renovación.');
      }

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();
      await cargarDatosEstatus();
      renderizarVistaEstatus();

    } catch (err) {
      console.error("❌ Error al renovar días:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };
}