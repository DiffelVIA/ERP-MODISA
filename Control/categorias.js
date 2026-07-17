(() => {
    const ROL_AUTORIZADO = ["Gerente de Costos", "Director Operativo"];

    document.addEventListener("DOMContentLoaded", () => {

        const rolActual = localStorage.getItem('userRol') ? localStorage.getItem('userRol').trim() : '';

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
            const res = await fetch(`${BASE_URL}/api/projects-report`);
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
                
                document.getElementById("editManoObra").value = parseFloat(filaEncontrada.mano_obra) || 0;
                document.getElementById("editMateriales").value = parseFloat(filaEncontrada.materials || filaEncontrada.materiales) || 0;
                document.getElementById("editMaquinaria").value = parseFloat(filaEncontrada.maquinaria_equipo) || 0;
                document.getElementById("editContratos").value = parseFloat(filaEncontrada.contratos) || 0;
                document.getElementById("editTotal").value = parseFloat(filaEncontrada.total) || 0;

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
                
                const mano_obra = parseFloat(document.getElementById("addManoObra").value) || 0;
                const materiales = parseFloat(document.getElementById("addMateriales").value) || 0;
                const maquinaria_equipo = parseFloat(document.getElementById("addMaquinaria").value) || 0;
                const contratos = parseFloat(document.getElementById("addContratos").value) || 0;
                const total = parseFloat(document.getElementById("addTotal").value) || 0;

                if (!grupo || !categoria) {
                    alert("⚠️ El Grupo y la Categoría son obligatorios.");
                    return;
                }

                try {
                    const res = await fetch(`${BASE_URL}/api/project-categories`, {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json",
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
                    const res = await fetch(`${BASE_URL}/api/project-categories/${idRegistroSeleccionado}`, {
                        method: "PUT",
                        headers: { 
                            "Content-Type": "application/json",
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
                    const res = await fetch(`${BASE_URL}/api/project-categories/${idRegistroSeleccionado}`, { 
                        method: "DELETE",
                        headers: { "x-user-rol": localStorage.getItem('userRol') || '' }
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
        const inputsAdd = ["addManoObra", "addMateriales", "addMaquinaria", "addContratos"];
        const inputsEdit = ["editManoObra", "editMateriales", "editMaquinaria", "editContratos"];

        inputsAdd.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener("input", () => {
                    const mo = parseFloat(document.getElementById("addManoObra").value) || 0;
                    const mat = parseFloat(document.getElementById("addMateriales").value) || 0;
                    const maq = parseFloat(document.getElementById("addMaquinaria").value) || 0;
                    const con = parseFloat(document.getElementById("addContratos").value) || 0;
                    document.getElementById("addTotal").value = (mo + mat + maq + con).toFixed(2);
                });
            }
        });

        inputsEdit.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener("input", () => {
                    const mo = parseFloat(document.getElementById("editManoObra").value) || 0;
                    const mat = parseFloat(document.getElementById("editMateriales").value) || 0;
                    const maq = parseFloat(document.getElementById("editMaquinaria").value) || 0;
                    const con = parseFloat(document.getElementById("editContratos").value) || 0;
                    document.getElementById("editTotal").value = (mo + mat + maq + con).toFixed(2);
                });
            }
        });
    }

    async function cargarCategoriasProyecto(idProject) {
        try {
            const res = await fetch(`${BASE_URL}/api/project-categories/${idProject}`);
            if (!res.ok) throw new Error("Error al obtener catálogo actual");
            listaCategoriasCache = await res.json();
        } catch (e) {
            listaCategoriasCache = [];
        }
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
        document.getElementById("addManoObra").value = "0.00";
        document.getElementById("addMateriales").value = "0.00";
        document.getElementById("addMaquinaria").value = "0.00";
        document.getElementById("addContratos").value = "0.00";
        document.getElementById("addTotal").value = "0.00";
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
                    const response = await fetch(`${BASE_URL}/api/upload-hierarchy`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
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