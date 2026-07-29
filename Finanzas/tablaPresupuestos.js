(() => {
  let proyectosActivos = [];
  let proyectoSeleccionadoId = null;
  let proyectoSeleccionadoNombre = '';
  let datosPresupuestoActual = [];
  let cuerpoTabla;
  let filtroProyecto;

  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

  document.addEventListener('DOMContentLoaded', () => {
    cuerpoTabla = document.getElementById("cuerpoTablaPresupuestos");
    filtroProyecto = document.getElementById("filtroProyecto");

    cargarProyectosActivos();
    configurarDropdowns();
    inicializarEventoExportarExcel();

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('chk-proyecto')) {
        if (e.target.checked) {
          document.querySelectorAll('.chk-proyecto').forEach(chk => {
            if (chk !== e.target) chk.checked = false;
          });

          proyectoSeleccionadoId = e.target.value;
          proyectoSeleccionadoNombre = e.target.dataset.name;
          
          const btnDropdown = document.querySelector('#dropdownProyecto .btn-dropdown');
          if (btnDropdown) {
            btnDropdown.textContent = `${proyectoSeleccionadoNombre} ▾`;
          }

          const contenidoDropdown = document.getElementById("filtroProyecto");
          if (contenidoDropdown) contenidoDropdown.classList.remove('mostrar');

          cargarPresupuestoProyecto(proyectoSeleccionadoId);
        }
      }
    });
  });

  async function cargarProyectosActivos() {
    try {
      const respuesta = await fetch(`${API_URL}/projects-active`);
      if (!respuesta.ok) throw new Error('Error al conectar con el servidor');

      proyectosActivos = await respuesta.json();
      poblarDropdownProyectos(proyectosActivos);

    } catch (error) {
      console.error("❌ Error al cargar proyectos activos:", error);
      if (cuerpoTabla) {
        cuerpoTabla.innerHTML = `<tr><td colspan="18" style="text-align:center; padding:20px; color:#ef4444; font-weight:bold;">Error al obtener la lista de proyectos activos del servidor.</td></tr>`;
      }
    }
  }

  function poblarDropdownProyectos(proyectos) {
    if (!filtroProyecto || !proyectos) return;

    if (proyectos.length === 0) {
      filtroProyecto.innerHTML = `<label class="opcion-filtro">No hay proyectos activos</label>`;
      return;
    }

    filtroProyecto.innerHTML = proyectos.map(p => `
      <label class="opcion-filtro" style="cursor: pointer; display: block; padding: 6px 12px;">
        <input type="checkbox" value="${p.id_project}" data-name="${p.project_name}" class="chk-proyecto"> ${p.project_name}
      </label>
    `).join('');
  }

  async function cargarPresupuestoProyecto(idProyecto) {
    const tbody = document.getElementById("cuerpoTablaPresupuestos");
    const tfoot = document.getElementById("pieTablaPresupuestos");

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="18" style="text-align:center; padding:30px; color:#0284c7; font-weight:500;">⏳ Cargando presupuesto del proyecto...</td></tr>`;
    }
    if (tfoot) tfoot.innerHTML = "";

    try {
        const response = await fetch(`${API_URL}/project-categories/${idProyecto}`);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Error del servidor (${response.status})`);
        }

        const datos = await response.json();
        datosPresupuestoActual = datos;
        renderizarTablaPresupuestos(datos);

    } catch (error) {
        console.error("❌ Error al cargar presupuestos:", error);
        datosPresupuestoActual = [];
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="18" style="text-align: center; color: #ef4444; font-weight: bold; padding: 20px;">
                        ⚠️ ${error.message}
                    </td>
                </tr>`;
        }
    }
  }

  function configurarDropdowns() {
    const dropdowns = document.querySelectorAll('.filtros');

    dropdowns.forEach(dropdown => {
      const boton = dropdown.querySelector('.btn-dropdown');
      const contenido = dropdown.querySelector('.contenido-dropdown');

      if (boton && contenido) {
        boton.addEventListener('click', (e) => {
          e.stopPropagation();
          
          document.querySelectorAll('.contenido-dropdown').forEach(c => {
            if (c !== contenido) c.classList.remove('mostrar');
          });
          
          contenido.classList.toggle('mostrar');
        });

        contenido.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.contenido-dropdown').forEach(c => {
        c.classList.remove('mostrar');
      });
    });
  }

  function renderizarTablaPresupuestos(lista) {
    const tbody = document.getElementById("cuerpoTablaPresupuestos");
    const tfoot = document.getElementById("pieTablaPresupuestos");
    if (!tbody || !tfoot) return;

    tbody.innerHTML = "";
    tfoot.innerHTML = "";

    if (!lista || lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="18" style="text-align:center; padding:30px; color:#64748b;">El proyecto seleccionado no cuenta con categorías autorizadas registradas en el sistema.</td></tr>`;
      return;
    }

    let totMaoAut = 0, totMaoEjec = 0;
    let totMatAut = 0, totMatEjec = 0;
    let totMaqAut = 0, totMaqEjec = 0;
    let totConAut = 0, totConEjec = 0;
    let totGenAut = 0, totGenEjec = 0;

    lista.forEach(cat => {
        const maoAut = parseFloat(cat.mano_obra_aut || 0);
        const maoEjec = parseFloat(cat.mano_obra_ejecutado || 0);

        const matAut = parseFloat(cat.materiales_aut || 0);
        const matEjec = parseFloat(cat.materiales_ejecutado || 0) + parseFloat(cat.materiales_pagos_extra || 0);

        const maqAut = parseFloat(cat.maquinaria_aut || 0);
        const maqEjec = parseFloat(cat.maquinaria_ejecutado || 0);

        const conAut = parseFloat(cat.contratos_aut || 0);
        const conEjec = parseFloat(cat.contratos_ejecutado || 0);

        const genAut = maoAut + matAut + maqAut + conAut;
        const genEjec = maoEjec + matEjec + maqEjec + conEjec;

        totMaoAut += maoAut; totMaoEjec += maoEjec;
        totMatAut += matAut; totMatEjec += matEjec;
        totMaqAut += maqAut; totMaqEjec += maqEjec;
        totConAut += conAut; totConEjec += conEjec;
        totGenAut += genAut; totGenEjec += genEjec;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${cat.grupo || '-'}</strong></td>
            <td>${cat.categoria || '-'}</td>
            <td>${cat.subcategoria || '<span style="color: #94a3b8;">—</span>'}</td>

            <!-- Mano de Obra -->
            <td style="text-align: right;">$${fmt(maoAut)}</td>
            <td style="text-align: right; color: #0284c7; font-weight: 500;">$${fmt(maoEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(maoEjec, maoAut)}</td>

            <!-- Materiales -->
            <td style="text-align: right;">$${fmt(matAut)}</td>
            <td style="text-align: right; color: #0284c7; font-weight: 500;">$${fmt(matEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(matEjec, matAut)}</td>

            <!-- Maquinaria y Equipo -->
            <td style="text-align: right;">$${fmt(maqAut)}</td>
            <td style="text-align: right; color: #0284c7; font-weight: 500;">$${fmt(maqEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(maqEjec, maqAut)}</td>

            <!-- Contratos -->
            <td style="text-align: right;">$${fmt(conAut)}</td>
            <td style="text-align: right; color: #0284c7; font-weight: 500;">$${fmt(conEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(conEjec, conAut)}</td>

            <!-- Total General Fila -->
            <td style="text-align: right; font-weight: bold; background-color: #f8fafc;">$${fmt(genAut)}</td>
            <td style="text-align: right; font-weight: bold; color: #0f172a; background-color: #f8fafc;">$${fmt(genEjec)}</td>
            <td style="text-align: center; background-color: #f8fafc;">${calcPorcentajeHTML(genEjec, genAut)}</td>
        `;
        tbody.appendChild(tr);
    });

    tfoot.innerHTML = `
        <tr>
            <td colspan="3" style="text-align: right; font-weight: bold; font-size: 13px;">TOTALES GENERALES:</td>

            <td style="text-align: right;">$${fmt(totMaoAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(totMaoEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(totMaoEjec, totMaoAut)}</td>

            <td style="text-align: right;">$${fmt(totMatAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(totMatEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(totMatEjec, totMatAut)}</td>

            <td style="text-align: right;">$${fmt(totMaqAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(totMaqEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(totMaqEjec, totMaqAut)}</td>

            <td style="text-align: right;">$${fmt(totConAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(totConEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(totConEjec, totConAut)}</td>

            <td style="text-align: right; font-size: 13px; font-weight: bold;">$${fmt(totGenAut)}</td>
            <td style="text-align: right; font-size: 13px; font-weight: bold; color: #0f172a;">$${fmt(totGenEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(totGenEjec, totGenAut)}</td>
        </tr>
    `;
  }

  function inicializarEventoExportarExcel() {
    const btnDescargar = document.getElementById('descargar');
    if (!btnDescargar) return;

    btnDescargar.addEventListener('click', () => {
      if (!datosPresupuestoActual || datosPresupuestoActual.length === 0) {
        alert('⚠️ Selecciona un proyecto con datos autorizados para exportar.');
        return;
      }

      let totMaoAut = 0, totMaoEjec = 0;
      let totMatAut = 0, totMatEjec = 0;
      let totMaqAut = 0, totMaqEjec = 0;
      let totConAut = 0, totConEjec = 0;
      let totGenAut = 0, totGenEjec = 0;

      const filasExcel = datosPresupuestoActual.map(cat => {
        const maoAut = parseFloat(cat.mano_obra_aut || 0);
        const maoEjec = parseFloat(cat.mano_obra_ejecutado || 0);

        const matAut = parseFloat(cat.materiales_aut || 0);
        const matEjec = parseFloat(cat.materiales_ejecutado || 0) + parseFloat(cat.materiales_pagos_extra || 0);

        const maqAut = parseFloat(cat.maquinaria_aut || 0);
        const maqEjec = parseFloat(cat.maquinaria_ejecutado || 0);

        const conAut = parseFloat(cat.contratos_aut || 0);
        const conEjec = parseFloat(cat.contratos_ejecutado || 0);

        const genAut = maoAut + matAut + maqAut + conAut;
        const genEjec = maoEjec + matEjec + maqEjec + conEjec;

        totMaoAut += maoAut; totMaoEjec += maoEjec;
        totMatAut += matAut; totMatEjec += matEjec;
        totMaqAut += maqAut; totMaqEjec += maqEjec;
        totConAut += conAut; totConEjec += conEjec;
        totGenAut += genAut; totGenEjec += genEjec;

        return {
          "Grupo": cat.grupo || '---',
          "Categoría": cat.categoria || '---',
          "Subcategoría": cat.subcategoria || '---',
          
          "M.O. Autorizado": maoAut,
          "M.O. Ejecutado": maoEjec,
          "% M.O.": maoAut > 0 ? `${Math.round((maoEjec / maoAut) * 100)}%` : '0%',

          "Materiales Autorizado": matAut,
          "Materiales Ejecutado": matEjec,
          "% Materiales": matAut > 0 ? `${Math.round((matEjec / matAut) * 100)}%` : '0%',

          "Maquinaria Autorizado": maqAut,
          "Maquinaria Ejecutado": maqEjec,
          "% Maquinaria": maqAut > 0 ? `${Math.round((maqEjec / maqAut) * 100)}%` : '0%',

          "Contratos Autorizado": conAut,
          "Contratos Ejecutado": conEjec,
          "% Contratos": conAut > 0 ? `${Math.round((conEjec / conAut) * 100)}%` : '0%',

          "Total Autorizado": genAut,
          "Total Ejecutado": genEjec,
          "% Total General": genAut > 0 ? `${Math.round((genEjec / genAut) * 100)}%` : '0%'
        };
      });

      filasExcel.push({
        "Grupo": "TOTALES GENERALES",
        "Categoría": "---",
        "Subcategoría": "---",
        "M.O. Autorizado": totMaoAut,
        "M.O. Ejecutado": totMaoEjec,
        "% M.O.": totMaoAut > 0 ? `${Math.round((totMaoEjec / totMaoAut) * 100)}%` : '0%',
        "Materiales Autorizado": totMatAut,
        "Materiales Ejecutado": totMatEjec,
        "% Materiales": totMatAut > 0 ? `${Math.round((totMatEjec / totMatAut) * 100)}%` : '0%',
        "Maquinaria Autorizado": totMaqAut,
        "Maquinaria Ejecutado": totMaqEjec,
        "% Maquinaria": totMaqAut > 0 ? `${Math.round((totMaqEjec / totMaqAut) * 100)}%` : '0%',
        "Contratos Autorizado": totConAut,
        "Contratos Ejecutado": totConEjec,
        "% Contratos": totConAut > 0 ? `${Math.round((totConEjec / totConAut) * 100)}%` : '0%',
        "Total Autorizado": totGenAut,
        "Total Ejecutado": totGenEjec,
        "% Total General": totGenAut > 0 ? `${Math.round((totGenEjec / totGenAut) * 100)}%` : '0%'
      });

      const worksheet = XLSX.utils.json_to_sheet(filasExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Presupuestos");

      const nombreLimpio = (proyectoSeleccionadoNombre || 'Proyecto').replace(/[^a-zA-Z0-9]/g, '_');
      const fechaHoy = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Presupuesto_Autorizado_${nombreLimpio}_${fechaHoy}.xlsx`);
    });
  }

  function fmt(val) {
      return val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function calcPorcentajeHTML(ejecutado, autorizado) {
      if (!autorizado || autorizado <= 0) return `<span style="color: #94a3b8;">0%</span>`;
      
      const pct = Math.round((ejecutado / autorizado) * 100);
      let color = '#16a34a';

      if (pct > 100) {
          color = '#dc2626';
      } else if (pct >= 80) {
          color = '#d97706';
      }

      return `<strong style="color: ${color};">${pct}%</strong>`;
  }
})();