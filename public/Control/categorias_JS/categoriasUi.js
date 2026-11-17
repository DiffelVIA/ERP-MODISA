import { escapeHTML } from './categoriasAuth.js';

export function configurarCalculosTotales() {
    const inputsAdd = ["addManoObra", "addMateriales", "addMaquinaria", "addContratos", "addEsDeductiva"];
    const inputsEdit = ["editManoObra", "editMateriales", "editMaquinaria", "editContratos", "editEsDeductiva"];

    const calcularSumatoria = (moId, matId, maqId, conId, totalId, deductivaId) => {
        const mo = Math.abs(parseFloat(document.getElementById(moId)?.value) || 0);
        const mat = Math.abs(parseFloat(document.getElementById(matId)?.value) || 0);
        const maq = Math.abs(parseFloat(document.getElementById(maqId)?.value) || 0);
        const con = Math.abs(parseFloat(document.getElementById(conId)?.value) || 0);
        const esDeductiva = document.getElementById(deductivaId)?.checked || false;

        const factor = esDeductiva ? -1 : 1;
        const subtotal = (mo + mat + maq + con) * factor;

        const totalEl = document.getElementById(totalId);
        if (totalEl) totalEl.value = subtotal.toFixed(2);
    };

    inputsAdd.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
                calcularSumatoria("addManoObra", "addMateriales", "addMaquinaria", "addContratos", "addTotal", "addEsDeductiva");
            });
        }
    });

    inputsEdit.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
                calcularSumatoria("editManoObra", "editMateriales", "editMaquinaria", "editContratos", "editTotal", "editEsDeductiva");
            });
        }
    });
}

export function poblarDatalistsAutocompletado(listaCategoriasCache) {
    const dlGrupos = document.getElementById("dlGruposAdd");
    const dlCats = document.getElementById("dlCategoriasAdd");
    const dlSubcats = document.getElementById("dlSubcategoriasAdd");

    if (!dlGrupos) return;

    const gruposUnicos = [...new Set(listaCategoriasCache.map(c => c.grupo).filter(Boolean))].sort();
    const catsUnicas = [...new Set(listaCategoriasCache.map(c => c.categoria).filter(Boolean))].sort();
    const subcatsUnicas = [...new Set(listaCategoriasCache.map(c => c.subcategoria).filter(Boolean))].sort();

    dlGrupos.innerHTML = gruposUnicos.map(g => `<option value="${escapeHTML(g)}">`).join("");
    if (dlCats) dlCats.innerHTML = catsUnicas.map(c => `<option value="${escapeHTML(c)}">`).join("");
    if (dlSubcats) dlSubcats.innerHTML = subcatsUnicas.map(s => `<option value="${escapeHTML(s)}">`).join("");
}

export function configurarFiltrosCascadaDatalists(obtenerCache) {
    const inputGrupo = document.getElementById("addGrupo");
    const inputCat = document.getElementById("addCategoria");
    const dlCats = document.getElementById("dlCategoriasAdd");
    const dlSubcats = document.getElementById("dlSubcategoriasAdd");

    if (!inputGrupo || !inputCat) return;

    inputGrupo.addEventListener("input", () => {
        const listaCategoriasCache = obtenerCache();
        const valGrupo = inputGrupo.value.trim();
        if (!valGrupo) {
            poblarDatalistsAutocompletado(listaCategoriasCache);
            return;
        }

        const catsFiltradas = [...new Set(
            listaCategoriasCache.filter(c => c.grupo === valGrupo).map(c => c.categoria).filter(Boolean)
        )].sort();

        if (dlCats) {
            dlCats.innerHTML = catsFiltradas.map(c => `<option value="${escapeHTML(c)}">`).join("");
        }
    });

    inputCat.addEventListener("input", () => {
        const listaCategoriasCache = obtenerCache();
        const valGrupo = inputGrupo.value.trim();
        const valCat = inputCat.value.trim();

        if (!valCat) {
            poblarDatalistsAutocompletado(listaCategoriasCache);
            return;
        }

        const subcatsFiltradas = [...new Set(
            listaCategoriasCache
                .filter(c => (!valGrupo || c.grupo === valGrupo) && c.categoria === valCat)
                .map(c => c.subcategoria)
                .filter(Boolean)
        )].sort();

        if (dlSubcats) {
            dlSubcats.innerHTML = subcatsFiltradas.map(s => `<option value="${escapeHTML(s)}">`).join("");
        }
    });
}

export function poblarSelectGrupos(listaCategoriasCache) {
    const modSelectGrupo = document.getElementById("modSelectGrupo");
    const modSelectCategoria = document.getElementById("modSelectCategoria");
    const modSelectSubcategoria = document.getElementById("modSelectSubcategoria");
    if (!modSelectGrupo || !modSelectCategoria || !modSelectSubcategoria) return;

    modSelectGrupo.innerHTML = '<option value="">-- Selecciona un grupo --</option>';
    modSelectCategoria.innerHTML = '<option value="">-- Primero selecciona un grupo --</option>';
    modSelectSubcategoria.innerHTML = '<option value="">-- Primero selecciona una categoría --</option>';
    modSelectCategoria.disabled = true;
    modSelectSubcategoria.disabled = true;

    if (listaCategoriasCache.length === 0) {
        modSelectGrupo.options[0].textContent = "-- El proyecto no tiene categorías --";
        return;
    }

    const gruposUnicos = [...new Set(listaCategoriasCache.map(c => c.grupo))];
    gruposUnicos.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        modSelectGrupo.appendChild(opt);
    });
}

export function resetearFormularioAgregar(listaCategoriasCache) {
    document.getElementById("addGrupo").value = "";
    document.getElementById("addCategoria").value = "";
    document.getElementById("addSubcategoria").value = "";
    document.getElementById("addEsDeductiva").checked = false;
    document.getElementById("addManoObra").value = "0.00";
    document.getElementById("addMateriales").value = "0.00";
    document.getElementById("addMaquinaria").value = "0.00";
    document.getElementById("addContratos").value = "0.00";
    document.getElementById("addTotal").value = "0.00";
    poblarDatalistsAutocompletado(listaCategoriasCache);
}

export function limpiarSecciones() {
    document.querySelectorAll(".seccion-accion").forEach(el => el.classList.remove("visible"));
    const camposEdicion = document.getElementById("camposEdicion");
    if (camposEdicion) camposEdicion.style.display = "none";
}