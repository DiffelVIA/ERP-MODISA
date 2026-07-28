(() => {
  let proyectosActivos = [];
  let proyectoSeleccionadoId = null;
  let cuerpoTabla;
  let filtroProyecto;

  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

  document.addEventListener('DOMContentLoaded', () => {
    cuerpoTabla = document.querySelector('.cuerpoTabla');
    filtroProyecto = document.getElementById("filtroProyecto");

    if (!cuerpoTabla) return;

    cargarProyectosActivos();
    configurarDropdowns();

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('chk-proyecto')) {
        if (e.target.checked) {
          document.querySelectorAll('.chk-proyecto').forEach(chk => {
            if (chk !== e.target) chk.checked = false;
          });

          proyectoSeleccionadoId = e.target.value;
          const nombreProyecto = e.target.dataset.name;
          
          const btnDropdown = document.querySelector('#dropdownProyecto .btn-dropdown');
          if (btnDropdown) {
            btnDropdown.textContent = `${nombreProyecto} ▾`;
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
        cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:red; font-weight:bold;">Error al obtener la lista de proyectos activos del servidor.</td></tr>`;
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
      <label class="opcion-filtro" style="cursor: pointer; display: block; padding: 4px 12px;">
        <input type="checkbox" value="${p.id_project}" data-name="${p.project_name}" class="chk-proyecto"> ${p.project_name}
      </label>
    `).join('');
  }

  async function cargarPresupuestoProyecto(idProject) {
    if (!cuerpoTabla) return;

    try {
      cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #64748b;">⏳ Consultando base de datos presupuestal...</td></tr>`;

      const respuesta = await fetch(`${API_URL}/project-categories/${idProject}`);
      if (!respuesta.ok) throw new Error('Error en respuesta de base de datos');

      const rubros = await respuesta.json();
      renderizarTablaPresupuestos(rubros);

    } catch (error) {
      console.error("❌ Error al cargar presupuestos:", error);
      cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:red; font-weight:bold;">No se pudo procesar la consulta financiera de este proyecto.</td></tr>`;
    }
  }

  function renderizarTablaPresupuestos(datos) {
    if (!cuerpoTabla) return;
    cuerpoTabla.innerHTML = '';

    if (datos.length === 0) {
      cuerpoTabla.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748b;">El proyecto seleccionado no cuenta con categorías autorizadas registradas en el sistema.</td></tr>`;
      return;
    }

    const formatoMoneda = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });

    const estiloNumericoBase = 'text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; color: #334155;';

    datos.forEach((rubro) => {
      const fila = document.createElement('tr');

      fila.innerHTML = `
        <td><strong>${rubro.grupo}</strong><br><span style="font-size: 11px; color: #64748b;">${rubro.categoria}</span></td>
        <td>${rubro.subcategoria || '<span style="color: #cbd5e1;">—</span>'}</td>
        <td style="${estiloNumericoBase}">${formatoMoneda.format(rubro.mano_obra)}</td>
        <td style="${estiloNumericoBase}">${formatoMoneda.format(rubro.materiales)}</td>
        <td style="${estiloNumericoBase}">${formatoMoneda.format(rubro.maquinaria_equipo)}</td>
        <td style="${estiloNumericoBase}">${formatoMoneda.format(rubro.contratos)}</td>
        <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: bold; color: #0f172a;">${formatoMoneda.format(rubro.total)}</td>
      `;

      cuerpoTabla.appendChild(fila);
    });
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
  async function cargarPresupuestoConEjecucion(idProyecto) {
    try {
        const res = await fetch(`${API_URL}/project-categories/${idProyecto}`);
        if (!res.ok) throw new Error("Error al obtener la información de presupuestos.");

        const categorias = await res.json();
        renderizarTablaPresupuestos(categorias);
    } catch (error) {
        console.error("❌ Error al renderizar la tabla de presupuestos:", error);
    }
}

function renderizarTablaPresupuestos(lista) {
    const tbody = document.getElementById("cuerpoTablaPresupuestos");
    const tfoot = document.getElementById("pieTablaPresupuestos");
    if (!tbody || !tfoot) return;

    tbody.innerHTML = "";
    tfoot.innerHTML = "";

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
            <td>${cat.grupo || '-'}</td>
            <td>${cat.categoria || '-'}</td>
            <td>${cat.subcategoria || '-'}</td>

            <!-- Mano de Obra -->
            <td style="text-align: right;">$${fmt(maoAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(maoEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(maoEjec, maoAut)}</td>

            <!-- Materiales -->
            <td style="text-align: right;">$${fmt(matAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(matEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(matEjec, matAut)}</td>

            <!-- Maquinaria y Equipo -->
            <td style="text-align: right;">$${fmt(maqAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(maqEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(maqEjec, maqAut)}</td>

            <!-- Contratos -->
            <td style="text-align: right;">$${fmt(conAut)}</td>
            <td style="text-align: right; color: #0284c7;">$${fmt(conEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(conEjec, conAut)}</td>

            <!-- Total General Fila -->
            <td style="text-align: right; font-weight: bold;">$${fmt(genAut)}</td>
            <td style="text-align: right; font-weight: bold; color: #0f172a;">$${fmt(genEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(genEjec, genAut)}</td>
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

            <td style="text-align: right; font-size: 13px;">$${fmt(totGenAut)}</td>
            <td style="text-align: right; font-size: 13px; color: #0f172a;">$${fmt(totGenEjec)}</td>
            <td style="text-align: center;">${calcPorcentajeHTML(totGenEjec, totGenAut)}</td>
        </tr>
    `;
}

function fmt(val) {
    return val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcPorcentajeHTML(ejecutado, autorizado) {
    if (!autorizado || autorizado <= 0) return `<span style="color: #64748b;">0%</span>`;
    
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