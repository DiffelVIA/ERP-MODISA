import { validarAccesoCategorias } from './categoriasAuth.js';
import {
    fetchProyectosDestino,
    fetchCategoriasProyecto,
    crearCategoriaAPI,
    actualizarCategoriaAPI,
    eliminarCategoriaAPI
} from './categoriasApi.js';
import {
    configurarCalculosTotales,
    poblarDatalistsAutocompletado,
    configurarFiltrosCascadaDatalists,
    poblarSelectGrupos,
    resetearFormularioAgregar,
    limpiarSecciones
} from './categoriasUi.js';
import { configurarManejadorArchivo } from './categoriasCsv.js';

let listaCategoriasCache = [];
let idRegistroSeleccionado = null;

document.addEventListener("DOMContentLoaded", () => {
    if (!validarAccesoCategorias()) return;

    cargarProyectosDestino();
    configurarManejadoresInterfaz();
    configurarManejadorArchivo(cargarCategoriasProyecto);
    configurarCalculosTotales();
    configurarFiltrosCascadaDatalists(() => listaCategoriasCache);
});

async function cargarProyectosDestino() {
    const select = document.getElementById("selectProyecto");
    if (!select) return;
    try {
        const proys = await fetchProyectosDestino();
        proys.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id_project;
            opt.textContent = p.project_name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
        alert("❌ No se pudieron cargar los proyectos.");
    }
}

async function cargarCategoriasProyecto(idProject) {
    try {
        listaCategoriasCache = await fetchCategoriasProyecto(idProject);
    } catch (e) {
        listaCategoriasCache = [];
    }
    poblarDatalistsAutocompletado(listaCategoriasCache);
}

function limpiarEstadoYSecciones() {
    limpiarSecciones();
    idRegistroSeleccionado = null;
}

function configurarManejadoresInterfaz() {
    const selectProyecto = document.getElementById("selectProyecto");
    const selectAccion = document.getElementById("selectAccion");

    const modSelectGrupo = document.getElementById("modSelectGrupo");
    const modSelectCategoria = document.getElementById("modSelectCategoria");
    const modSelectSubcategoria = document.getElementById("modSelectSubcategoria");
    const camposEdicion = document.getElementById("camposEdicion");

    if (!selectProyecto || !selectAccion) return;

    selectProyecto.addEventListener("change", async () => {
        const idProject = selectProyecto.value;
        limpiarEstadoYSecciones();
        selectAccion.value = "";

        if (!idProject) {
            selectAccion.disabled = true;
            selectAccion.options[0].textContent = "-- Primero selecciona un proyecto --";
            return;
        }
        selectAccion.disabled = false;
        selectAccion.options[0].textContent = "-- Selecciona una opción --";
        await cargarCategoriasProyecto(idProject);
    });

    selectAccion.addEventListener("change", () => {
        limpiarEstadoYSecciones();
        const accion = selectAccion.value;
        if (!accion) return;

        const seccion = document.getElementById(`seccion-${accion}`);
        if (seccion) seccion.classList.add("visible");

        if (accion === "modificar") poblarSelectGrupos(listaCategoriasCache);
    });

    modSelectGrupo.addEventListener("change", () => {
        const grupoSel = modSelectGrupo.value;
        modSelectCategoria.innerHTML = '<option value="">-- Selecciona una categoría --</option>';
        modSelectSubcategoria.innerHTML = '<option value="">-- Primero selecciona una categoría --</option>';
        modSelectCategoria.disabled = !grupoSel;
        modSelectSubcategoria.disabled = true;
        camposEdicion.style.display = "none";
        idRegistroSeleccionado = null;

        if (!grupoSel) return;

        const categoriasFiltradas = [...new Set(
            listaCategoriasCache.filter(c => c.grupo === grupoSel).map(c => c.categoria)
        )];

        categoriasFiltradas.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            modSelectCategoria.appendChild(opt);
        });
    });

    modSelectCategoria.addEventListener("change", () => {
        const grupoSel = modSelectGrupo.value;
        const catSel = modSelectCategoria.value;

        modSelectSubcategoria.innerHTML = '<option value="">-- Selecciona una subcategoría --</option>';
        modSelectSubcategoria.disabled = !catSel;
        camposEdicion.style.display = "none";
        idRegistroSeleccionado = null;

        if (!catSel) return;

        const registrosCoincidentes = listaCategoriasCache.filter(c => c.grupo === grupoSel && c.categoria === catSel);
        registrosCoincidentes.forEach(reg => {
            const opt = document.createElement("option");
            opt.value = reg.id_project_category;
            opt.textContent = reg.subcategoria ? reg.subcategoria : "[Sin Subcategoría]";
            modSelectSubcategoria.appendChild(opt);
        });
    });

    modSelectSubcategoria.addEventListener("change", () => {
        const idFila = modSelectSubcategoria.value;
        if (!idFila) {
            camposEdicion.style.display = "none";
            idRegistroSeleccionado = null;
            return;
        }

        idRegistroSeleccionado = idFila;
        const filaEncontrada = listaCategoriasCache.find(c => String(c.id_project_category) === String(idFila));

        if (filaEncontrada) {
            document.getElementById("editGrupo").value = filaEncontrada.grupo || "";
            document.getElementById("editCategoria").value = filaEncontrada.categoria || "";
            document.getElementById("editSubcategoria").value = filaEncontrada.subcategoria || "";

            const mo = parseFloat(filaEncontrada.mano_obra) || 0;
            const mat = parseFloat(filaEncontrada.materials || filaEncontrada.materiales) || 0;
            const maq = parseFloat(filaEncontrada.maquinaria_equipo) || 0;
            const con = parseFloat(filaEncontrada.contratos) || 0;
            const tot = parseFloat(filaEncontrada.total) || 0;

            const esDeductiva = tot < 0 || mo < 0 || mat < 0 || maq < 0 || con < 0;
            document.getElementById("editEsDeductiva").checked = esDeductiva;

            document.getElementById("editManoObra").value = mo;
            document.getElementById("editMateriales").value = mat;
            document.getElementById("editMaquinaria").value = maq;
            document.getElementById("editContratos").value = con;
            document.getElementById("editTotal").value = tot;

            camposEdicion.style.display = "block";
        }
    });

    const btnGuardar = document.querySelector('[data-accion="guardar"]');
    if (btnGuardar) {
        btnGuardar.addEventListener("click", async () => {
            if (btnGuardar.disabled) return;
            const idProject = selectProyecto.value;
            if (!idProject) {
                alert("⚠️ Selecciona primero un proyecto.");
                return;
            }

            const grupo = document.getElementById("addGrupo").value.trim();
            const categoria = document.getElementById("addCategoria").value.trim();
            const subcategoria = document.getElementById("addSubcategoria").value.trim();
            const esDeductiva = document.getElementById("addEsDeductiva").checked;
            const factor = esDeductiva ? -1 : 1;

            const mano_obra = (Math.abs(parseFloat(document.getElementById("addManoObra").value)) || 0) * factor;
            const materiales = (Math.abs(parseFloat(document.getElementById("addMateriales").value)) || 0) * factor;
            const maquinaria_equipo = (Math.abs(parseFloat(document.getElementById("addMaquinaria").value)) || 0) * factor;
            const contratos = (Math.abs(parseFloat(document.getElementById("addContratos").value)) || 0) * factor;
            const total = (Math.abs(parseFloat(document.getElementById("addTotal").value)) || 0) * factor;

            if (!grupo || !categoria) {
                alert("⚠️ El Grupo y la Categoría son obligatorios.");
                return;
            }

            const textoOriginal = btnGuardar.textContent;
            btnGuardar.disabled = true;
            btnGuardar.textContent = "Guardando...";

            try {
                await crearCategoriaAPI({
                    id_project: idProject,
                    grupo,
                    categoria,
                    subcategoria,
                    mano_obra,
                    materiales,
                    maquinaria_equipo,
                    contratos,
                    total
                });

                alert("✨ Categoría y matriz presupuestal guardadas.");
                resetearFormularioAgregar(listaCategoriasCache);
                await cargarCategoriasProyecto(idProject);
            } catch (err) {
                alert(`❌ Error: ${err.message}`);
            } finally {
                btnGuardar.disabled = false;
                btnGuardar.textContent = textoOriginal;
            }
        });
    }

    const btnActualizar = document.querySelector('[data-accion="actualizar"]');
    if (btnActualizar) {
        btnActualizar.addEventListener("click", async () => {
            if (!idRegistroSeleccionado || btnActualizar.disabled) return;
            const grupo = document.getElementById("editGrupo").value.trim();
            const categoria = document.getElementById("editCategoria").value.trim();
            const subcategoria = document.getElementById("editSubcategoria").value.trim();
            const esDeductiva = document.getElementById("editEsDeductiva")?.checked || false;
            const factor = esDeductiva ? -1 : 1;

            const mano_obra = (Math.abs(parseFloat(document.getElementById("editManoObra").value)) || 0) * factor;
            const materiales = (Math.abs(parseFloat(document.getElementById("editMateriales").value)) || 0) * factor;
            const maquinaria_equipo = (Math.abs(parseFloat(document.getElementById("editMaquinaria").value)) || 0) * factor;
            const contratos = (Math.abs(parseFloat(document.getElementById("editContratos").value)) || 0) * factor;
            const total = (Math.abs(parseFloat(document.getElementById("editTotal").value)) || 0) * factor;

            if (!grupo || !categoria) {
                alert("⚠️ El Grupo y la Categoría no pueden quedar vacíos.");
                return;
            }

            const textoOriginal = btnActualizar.textContent;
            btnActualizar.disabled = true;
            btnActualizar.textContent = "Actualizando...";

            try {
                await actualizarCategoriaAPI(idRegistroSeleccionado, {
                    grupo,
                    categoria,
                    subcategoria,
                    mano_obra,
                    materiales,
                    maquinaria_equipo,
                    contratos,
                    total
                });

                alert("✨ Registro y matriz de costos modificados correctamente.");
                camposEdicion.style.display = "none";
                idRegistroSeleccionado = null;
                await cargarCategoriasProyecto(selectProyecto.value);
                poblarSelectGrupos(listaCategoriasCache);
            } catch (err) {
                alert(`❌ Error: ${err.message}`);
            } finally {
                btnActualizar.disabled = false;
                btnActualizar.textContent = textoOriginal;
            }
        });
    }

    const btnEliminar = document.querySelector('[data-accion="eliminar"]');
    if (btnEliminar) {
        btnEliminar.addEventListener("click", async () => {
            if (!idRegistroSeleccionado || btnEliminar.disabled) return;
            if (!confirm("⚠️ ¿Estás completamente seguro de eliminar esta línea de categoría y sus costos?")) return;

            const textoOriginal = btnEliminar.textContent;
            btnEliminar.disabled = true;
            btnEliminar.textContent = "Eliminando...";

            try {
                await eliminarCategoriaAPI(idRegistroSeleccionado);

                alert("🗑️ Renglón eliminado con éxito.");
                camposEdicion.style.display = "none";
                idRegistroSeleccionado = null;
                await cargarCategoriasProyecto(selectProyecto.value);
                poblarSelectGrupos(listaCategoriasCache);
            } catch (err) {
                alert(`❌ Error: ${err.message}`);
            } finally {
                btnEliminar.disabled = false;
                btnEliminar.textContent = textoOriginal;
            }
        });
    }
}