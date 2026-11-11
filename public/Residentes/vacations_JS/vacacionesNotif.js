// MODIFICACIÓN SOLUCIÓN: Definición local de helpers utilitarios para evitar SyntaxError por importaciones de módulos ES6
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function calcularDiasHabilesEfectivos(inicio, fin) {
  if (!inicio || !fin) return 0;
  const fInicio = new Date(inicio);
  const fFin = new Date(fin);
  let dias = 0;
  let cursor = new Date(fInicio);
  while (cursor <= fFin) {
    const diaSemana = cursor.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) { // Excluir sábados (6) y domingos (0)
      dias++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

export function inicializarHandlersGlobales(API_URL, getDatosVacaciones, setDatosVacaciones, cargarDatosVacaciones, cargarDatosEstatus, actualizarFiltrosYTabla, renderizarVistaEstatus) {
  
  // MODIFICACIÓN SOLUCIÓN: Modal estilizado sin menciones a roles y con comentarios opcionales
  function obtenerOCrearModal() {
    let modal = document.getElementById('modalComentariosVacaciones');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalComentariosVacaciones';
      modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); z-index:9999; align-items:center; justify-content:center;';
      modal.innerHTML = `
        <div style="background:#ffffff; border-radius:12px; width:90%; max-width:480px; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); border:1px solid #e2e8f0;">
          <h3 id="modalComentarioTitulo" style="margin-top:0; color:#0f172a; font-size:18px; font-weight:bold;">Autorización de Solicitud</h3>
          <p id="modalComentarioDesc" style="color:#64748b; font-size:13px; margin-bottom:12px;">Ingresa tus observaciones (opcional):</p>
          <textarea id="modalTxtObservaciones" style="width:100%; height:90px; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:13px; font-family:sans-serif;" placeholder="Escribe los comentarios aquí..."></textarea>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" id="modalBtnCancelar" style="padding:8px 16px; background:#f1f5f9; color:#475569; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Cancelar</button>
            <button type="button" id="modalBtnGuardar" style="padding:8px 16px; background:#2563eb; color:#ffffff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Guardar y Notificar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    return modal;
  }

  function abrirModalObservaciones({ valorInicial, onConfirmar, onCancelar }) {
    const modal = obtenerOCrearModal();
    const txtArea = document.getElementById('modalTxtObservaciones');
    const btnGuardar = document.getElementById('modalBtnGuardar');
    const btnCancelar = document.getElementById('modalBtnCancelar');

    if (txtArea) txtArea.value = valorInicial || '';
    modal.style.display = 'flex';

    const cerrar = () => { modal.style.display = 'none'; };

    btnGuardar.onclick = () => {
      const val = txtArea ? txtArea.value.trim() : '';
      // MODIFICACIÓN SOLUCIÓN: Ya no se exige texto obligatorio; si está vacío se envía 'Sin comentarios adicionales'
      const comentarioEnviado = val.length > 0 ? val : 'Sin comentarios adicionales';
      cerrar();
      if (onConfirmar) onConfirmar(comentarioEnviado);
    };

    btnCancelar.onclick = () => {
      cerrar();
      if (onCancelar) onCancelar();
    };
  }

  window.actualizarEstadoVacacion = async function(idVacacion, nuevoEstado, elementoInput, nivelParam = 'jefe') {
    const token = localStorage.getItem('jwtToken') || '';

    if (nuevoEstado === 'pendiente') {
      await enviarActualizacion(idVacacion, nuevoEstado, 'Sin comentarios adicionales', nivelParam, token);
      return;
    }

    abrirModalObservaciones({
      valorInicial: '',
      onConfirmar: async (obsTexto) => {
        await enviarActualizacion(idVacacion, nuevoEstado, obsTexto, nivelParam, token);
      },
      onCancelar: () => {
        if (elementoInput) cargarDatosVacaciones();
      }
    });
  };

  async function enviarActualizacion(idVacacion, estadoVal, obsTexto, nivelVal, token) {
    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          estado: estadoVal,
          observaciones: obsTexto || 'Sin comentarios adicionales',
          nivel: nivelVal
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo actualizar el estado.');
      }

      await cargarDatosVacaciones();
      await cargarDatosEstatus();

    } catch (err) {
      console.error("❌ Error al actualizar estado:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  }

  window.actualizarObservacionVacacion = async function(idVacacion, nuevaObservacion, elementoInput, nivelParam = 'jefe') {
    if (!nuevaObservacion || !nuevaObservacion.trim()) return;

    if (confirm("¿Quieres cambiar también el estado de la solicitud al actualizar el comentario?")) {
      const trFila = elementoInput ? elementoInput.closest('tr') : null;
      const selectEstado = trFila ? trFila.querySelector('.select-estado-tabla') : null;
      const estadoActual = selectEstado ? selectEstado.value : 'autorizada';
      
      window.actualizarEstadoVacacion(idVacacion, estadoActual, elementoInput, nivelParam);
    } else {
      const token = localStorage.getItem('jwtToken') || '';
      await enviarActualizacion(idVacacion, 'autorizada', nuevaObservacion.trim(), nivelParam, token);
    }
  };

  window.forzarRenovacionDias = async function(idEmployee, nombreEmpleado) {
    if (!confirm(`⚠️ ¿Estás segura de forzar la renovación de días para "${nombreEmpleado}"?`)) return;

    const token = localStorage.getItem('jwtToken') || '';
    try {
      const res = await fetch(`${API_URL}/vacaciones/renovar/${idEmployee}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo realizar la renovación.');

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();
      await cargarDatosEstatus();
      renderizarVistaEstatus();
    } catch (err) {
      console.error("❌ Error al renovar días:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };

  // MODIFICACIÓN SOLUCIÓN: Tachecito (✕) exclusivo para Director Operativo para eliminar un registro individual por equivocación
  window.eliminarRegistroVacacion = async function(idVacacion) {
    if (!confirm(`⚠️ ¿Estás seguro de que deseas eliminar este registro de vacación (#${idVacacion})? Esta acción no se puede deshacer.`)) {
      return;
    }

    const token = localStorage.getItem('jwtToken') || '';
    try {
      const res = await fetch(`${API_URL}/vacaciones/${idVacacion}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo eliminar el registro.');
      }

      alert(`✅ ${data.message}`);
      await cargarDatosVacaciones();
      await cargarDatosEstatus();

    } catch (err) {
      console.error("❌ Error al eliminar el registro de vacación:", err);
      alert(`❌ Error: ${escapeHTML(err.message)}`);
    }
  };
}