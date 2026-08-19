(() => {
    const ROL_AUTORIZADO = ["Gerente de Costos", "Director Operativo"];

    document.addEventListener("DOMContentLoaded", () => {

        const usuarioToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        const rolActual = (usuarioToken && usuarioToken.rol) ? usuarioToken.rol.trim() : '';

        if (!ROL_AUTORIZADO.includes(rolActual)) {
            const contenedorPrincipal = document.querySelector('.form_main');
            if (contenedorPrincipal) {
                window.stop();
                contenedorPrincipal.innerHTML = `
                  <div style="text-align: center; padding: 60px 20px; font-family: system-ui, sans-serif;">
                    <div style="font-size: 70px; margin-bottom: 15px;">🔒</div>
                    <h1 style="color: #2c3e50; font-size: 26px; margin-bottom: 10px;">Acceso Denegado</h1>
                    <p style="color: #7f8c8d; font-size: 15px; max-width: 450px; margin: 0 auto 25px auto; line-height: 1.6;">
                      No tienes los permisos necesarios para ver esta sección.
                    </p>
                  </div>
                `;
                neutralizarEntorno();
                return;
            }
        }

        cargarProyectosDestino();
        configurarManejadoresInterfaz();
        configurarManejadorArchivo();
        configurarCalculosTotales();
        configurarFiltrosCascadaDatalists(); 
    });

    function neutralizarEntorno() {
        cargarProyectosDestino = () => {};
        configurarManejadoresInterfaz = () => {};
        configurarManejadorArchivo = () => {};
        configurarCalculosTotales = () => {};
    }

    const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : 'https://erp-modisa.onrender.com';

    let archivoSeleccionado = null;
    let listaCategoriasCache = []; 
    let idRegistroSeleccionado = null; 

    async function cargarProyectosDestino() {
        const select = document.getElementById("selectProyecto");
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${BASE_URL}/api/projects-report`, {
                headers: {
                    "Authorization": token ? `Bearer ${token}` : ''
                }
            });

            if (!res.ok) throw new Error("Error al consultar proyectos");
            const proys = await res.json();
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

    function configurarManejadoresInterfaz() {
        const selectProyecto = document.getElementById("selectProyecto");
        const selectAccion = document.getElementById("selectAccion");
        
        const modSelectGrupo = document.getElementById("modSelectGrupo");
        const modSelectCategoria = document.getElementById("modSelectCategoria");
        const modSelectSubcategoria = document.getElementById("modSelectSubcategoria");
        const camposEdicion = document.getElementById("camposEdicion");

        selectProyecto.addEventListener("change", async () => {
            const idProject = selectProyecto.value;
            limpiarSecciones();
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
            limpiarSecciones();
            const accion = selectAccion.value;
            if (!accion) return;

            const seccion = document.getElementById(`seccion-${accion}`);
            if (seccion) seccion.classList.add("visible");

            if (accion === "modificar") poblarSelectGrupos();
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
            const filaEncontrada = listaCategoriasCache.find(c => c.id_project_category == idFila);
            
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
                const idProject = selectProyecto.value;
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

                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const res = await fetch(`${BASE_URL}/api/project-categories`, {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json",
                            "Authorization": token ? `Bearer ${token}` : '',
                            "x-user-rol": localStorage.getItem('userRol') || '' 
                        },
                        body: JSON.stringify({ 
                            id_project: idProject, grupo, categoria, subcategoria, 
                            mano_obra, materiales, maquinaria_equipo, contratos, total 
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Fallo al insertar");

                    alert("✨ Categoría y matriz presupuestal guardadas.");
                    resetearFormularioAgregar();
                    await cargarCategoriasProyecto(idProject);
                } catch (err) {
                    alert(`❌ Error: ${err.message}`);
                }
            });
        }

        const btnActualizar = document.querySelector('[data-accion="actualizar"]');
        if (btnActualizar) {
            btnActualizar.addEventListener("click", async () => {
                if (!idRegistroSeleccionado) return;
                const grupo = document.getElementById("editGrupo").value.trim();
                const categoria = document.getElementById("editCategoria").value.trim();
                const subcategoria = document.getElementById("editSubcategoria").value.trim();
                
                const mano_obra = parseFloat(document.getElementById("editManoObra").value) || 0;
                const materiales = parseFloat(document.getElementById("editMateriales").value) || 0;
                const maquinaria_equipo = parseFloat(document.getElementById("editMaquinaria").value) || 0;
                const contratos = parseFloat(document.getElementById("editContratos").value) || 0;
                const total = parseFloat(document.getElementById("editTotal").value) || 0;

                if (!grupo || !categoria) {
                    alert("⚠️ El Grupo y la Categoría no pueden quedar vacíos.");
                    return;
                }

                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const res = await fetch(`${BASE_URL}/api/project-categories/${idRegistroSeleccionado}`, {
                        method: "PUT",
                        headers: { 
                            "Content-Type": "application/json",
                            "Authorization": token ? `Bearer ${token}` : '',
                            "x-user-rol": localStorage.getItem('userRol') || ''
                        },
                        body: JSON.stringify({ 
                            grupo, categoria, subcategoria, 
                            mano_obra, materiales, maquinaria_equipo, contratos, total 
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Fallo al actualizar");

                    alert("✨ Registro y matriz de costos modificados correctamente.");
                    camposEdicion.style.display = "none";
                    await cargarCategoriasProyecto(selectProyecto.value);
                    poblarSelectGrupos();
                } catch (err) {
                    alert(`❌ Error: ${err.message}`);
                }
            });
        }

        const btnEliminar = document.querySelector('[data-accion="eliminar"]');
        if (btnEliminar) {
            btnEliminar.addEventListener("click", async () => {
                if (!idRegistroSeleccionado) return;
                if (!confirm("⚠️ ¿Estás completamente seguro de eliminar esta línea de categoría y sus costos?")) return;

                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const res = await fetch(`${BASE_URL}/api/project-categories/${idRegistroSeleccionado}`, { 
                        method: "DELETE",
                        headers: { 
                            "Authorization": token ? `Bearer ${token}` : '',
                            "x-user-rol": localStorage.getItem('userRol') || '' 
                        }
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Fallo al eliminar");

                    alert("🗑️ Renglón eliminado con éxito.");
                    camposEdicion.style.display = "none";
                    await cargarCategoriasProyecto(selectProyecto.value);
                    poblarSelectGrupos();
                } catch (err) {
                    alert(`❌ Error: ${err.message}`);
                }
            });
        }
    }

    function configurarCalculosTotales() {
        const inputsAdd = ["addManoObra", "addMateriales", "addMaquinaria", "addContratos", "addEsDeductiva"];
        const inputsEdit = ["editManoObra", "editMateriales", "editMaquinaria", "editContratos", "editEsDeductiva"];

        const calcularSumatoria = (moId, matId, maqId, conId, totalId, deductivaId) => {
            const mo = Math.abs(parseFloat(document.getElementById(moId).value) || 0);
            const mat = Math.abs(parseFloat(document.getElementById(matId).value) || 0);
            const maq = Math.abs(parseFloat(document.getElementById(maqId).value) || 0);
            const con = Math.abs(parseFloat(document.getElementById(conId).value) || 0);
            const esDeductiva = document.getElementById(deductivaId)?.checked || false;

            const factor = esDeductiva ? -1 : 1;
            const subtotal = (mo + mat + maq + con) * factor;

            document.getElementById(totalId).value = subtotal.toFixed(2);
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

    async function cargarCategoriasProyecto(idProject) {
        try {
            const token = localStorage.getItem('jwtToken') || '';
            const res = await fetch(`${BASE_URL}/api/project-categories/${idProject}`, {
                headers: {
                    "Authorization": token ? `Bearer ${token}` : ''
                }
            });

            if (!res.ok) throw new Error("Error al obtener catálogo actual");
            listaCategoriasCache = await res.json();
        } catch (e) {
            listaCategoriasCache = [];
        }
        poblarDatalistsAutocompletado();
    }

    function poblarDatalistsAutocompletado() {
        const dlGrupos = document.getElementById("dlGruposAdd");
        const dlCats = document.getElementById("dlCategoriasAdd");
        const dlSubcats = document.getElementById("dlSubcategoriasAdd");

        if (!dlGrupos) return;

        const gruposUnicos = [...new Set(listaCategoriasCache.map(c => c.grupo).filter(Boolean))].sort();
        const catsUnicas = [...new Set(listaCategoriasCache.map(c => c.categoria).filter(Boolean))].sort();
        const subcatsUnicas = [...new Set(listaCategoriasCache.map(c => c.subcategoria).filter(Boolean))].sort();

        dlGrupos.innerHTML = gruposUnicos.map(g => `<option value="${g}">`).join("");
        dlCats.innerHTML = catsUnicas.map(c => `<option value="${c}">`).join("");
        dlSubcats.innerHTML = subcatsUnicas.map(s => `<option value="${s}">`).join("");
    }

    function configurarFiltrosCascadaDatalists() {
        const inputGrupo = document.getElementById("addGrupo");
        const inputCat = document.getElementById("addCategoria");
        const dlCats = document.getElementById("dlCategoriasAdd");
        const dlSubcats = document.getElementById("dlSubcategoriasAdd");

        if (!inputGrupo || !inputCat) return;

        inputGrupo.addEventListener("input", () => {
            const valGrupo = inputGrupo.value.trim();
            if (!valGrupo) {
                poblarDatalistsAutocompletado();
                return;
            }

            const catsFiltradas = [...new Set(
                listaCategoriasCache.filter(c => c.grupo === valGrupo).map(c => c.categoria).filter(Boolean)
            )].sort();

            if (dlCats) {
                dlCats.innerHTML = catsFiltradas.map(c => `<option value="${c}">`).join("");
            }
        });

        inputCat.addEventListener("input", () => {
            const valGrupo = inputGrupo.value.trim();
            const valCat = inputCat.value.trim();

            if (!valCat) {
                poblarDatalistsAutocompletado();
                return;
            }

            const subcatsFiltradas = [...new Set(
                listaCategoriasCache
                    .filter(c => (!valGrupo || c.grupo === valGrupo) && c.categoria === valCat)
                    .map(c => c.subcategoria)
                    .filter(Boolean)
            )].sort();

            if (dlSubcats) {
                dlSubcats.innerHTML = subcatsFiltradas.map(s => `<option value="${s}">`).join("");
            }
        });
    }

    function poblarSelectGrupos() {
        const modSelectGrupo = document.getElementById("modSelectGrupo");
        modSelectGrupo.innerHTML = '<option value="">-- Selecciona un grupo --</option>';
        document.getElementById("modSelectCategoria").innerHTML = '<option value="">-- Primero selecciona un grupo --</option>';
        document.getElementById("modSelectSubcategoria").innerHTML = '<option value="">-- Primero selecciona una categoría --</option>';
        document.getElementById("modSelectCategoria").disabled = true;
        document.getElementById("modSelectSubcategoria").disabled = true;

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

    function resetearFormularioAgregar() {
        document.getElementById("addGrupo").value = "";
        document.getElementById("addCategoria").value = "";
        document.getElementById("addSubcategoria").value = "";
        document.getElementById("addEsDeductiva").checked = false;
        document.getElementById("addManoObra").value = "0.00";
        document.getElementById("addMateriales").value = "0.00";
        document.getElementById("addMaquinaria").value = "0.00";
        document.getElementById("addContratos").value = "0.00";
        document.getElementById("addTotal").value = "0.00";
        poblarDatalistsAutocompletado();
    }

    function limpiarSecciones() {
        document.querySelectorAll(".seccion-accion").forEach(el => el.classList.remove("visible"));
        document.getElementById("camposEdicion").style.display = "none";
        idRegistroSeleccionado = null;
    }

    function configurarManejadorArchivo() {
        const dropZone = document.getElementById("dropZone");
        const fileInput = document.getElementById("fileInput");
        const form = document.getElementById("formCategorias");

        if(!dropZone || !fileInput || !form) return;

        dropZone.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("click", (e) => e.stopPropagation());

        fileInput.addEventListener("change", (e) => {
            if (e.target.files.length > 0) {
                archivoSeleccionado = e.target.files[0];
                dropZone.querySelector("span").textContent = `Archivo cargado: ${archivoSeleccionado.name}`;
            }
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const idProject = document.getElementById("selectProyecto").value;
            if (!archivoSeleccionado) return;

            const reader = new FileReader();
            reader.onload = async function (evt) {
                const contenidoTexto = evt.target.result;
                try {
                    const token = localStorage.getItem('jwtToken') || '';
                    const response = await fetch(`${BASE_URL}/api/upload-hierarchy`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            "Authorization": token ? `Bearer ${token}` : '',
                            "x-user-rol": localStorage.getItem('userRol') || ''
                        },
                        body: JSON.stringify({ id_project: idProject, csvData: contenidoTexto })
                    });
                    const resultado = await response.json();
                    if (response.ok) {
                        alert("✨ Matriz presupuestal inyectada con éxito a MySQL.");
                        form.reset();
                        dropZone.querySelector("span").textContent = "Arrastra tu archivo .csv aquí o haz clic para buscar";
                        archivoSeleccionado = null;
                        await cargarCategoriasProyecto(idProject);
                    } else {
                        throw new Error(resultado.error || "Fallo al procesar archivo");
                    }
                } catch (err) {
                    alert(`❌ Error en carga masiva: ${err.message}`);
                }
            };
            reader.readAsText(archivoSeleccionado, 'UTF-8');
        });
    }
})();