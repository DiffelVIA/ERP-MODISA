import { subirCsvJerarquiaAPI } from './categoriasApi.js';

export function configurarManejadorArchivo(recargarCategoriasProyecto) {
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const form = document.getElementById("formCategorias");

    if (!dropZone || !fileInput || !form) return;

    let archivoSeleccionado = null;

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("click", (e) => e.stopPropagation());

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            const archivo = e.target.files[0];
            if (!archivo.name.toLowerCase().endsWith('.csv')) {
                alert("⚠️ Por favor selecciona un archivo válido con extensión .csv");
                fileInput.value = '';
                archivoSeleccionado = null;
                dropZone.querySelector("span").textContent = "Arrastra tu archivo .csv aquí o haz clic para buscar";
                return;
            }
            archivoSeleccionado = archivo;
            dropZone.querySelector("span").textContent = `Archivo cargado: ${archivoSeleccionado.name}`;
        }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const idProject = document.getElementById("selectProyecto")?.value || '';
        if (!idProject) {
            alert("⚠️ Selecciona primero un proyecto antes de subir el archivo.");
            return;
        }
        if (!archivoSeleccionado) {
            alert("⚠️ Selecciona un archivo .csv para procesar.");
            return;
        }

        const btnSubmit = form.querySelector('button[type="submit"]');
        const textoOriginal = btnSubmit ? btnSubmit.textContent : '';
        if (btnSubmit) {
            if (btnSubmit.disabled) return;
            btnSubmit.disabled = true;
            btnSubmit.textContent = "Procesando...";
        }

        const reader = new FileReader();
        reader.onload = async function (evt) {
            const contenidoTexto = evt.target.result;
            try {
                await subirCsvJerarquiaAPI(idProject, contenidoTexto);
                alert("✨ Matriz presupuestal inyectada con éxito a MySQL.");
                form.reset();
                dropZone.querySelector("span").textContent = "Arrastra tu archivo .csv aquí o haz clic para buscar";
                archivoSeleccionado = null;
                await recargarCategoriasProyecto(idProject);
            } catch (err) {
                alert(`❌ Error en carga masiva: ${err.message}`);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = textoOriginal;
                }
            }
        };
        reader.onerror = function () {
            alert("❌ No se pudo leer el archivo seleccionado.");
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = textoOriginal;
            }
        };
        reader.readAsText(archivoSeleccionado, 'UTF-8');
    });
}