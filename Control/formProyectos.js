(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000/api' 
      : 'https://erp-modisa.onrender.com/api';

    const ROLES_PERMITIDOS = ["Director Operativo", "Subdirector de Obra"];

    document.addEventListener("DOMContentLoaded", () => {
        const rolUsuario = localStorage.getItem('userRol') ? localStorage.getItem('userRol').trim() : '';

        if (!ROLES_PERMITIDOS.includes(rolUsuario)) {
            const mainContent = document.querySelector('.form_main');
            if (mainContent) {
                window.stop();
                mainContent.innerHTML = `
                  <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
                    <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px; font-weight: bold;">Acceso Denegado</h1>
                    <p style="color: #64748b; font-size: 16px; max-width: 400px; margin: 0 auto 30px auto; line-height: 1.5;">
                      No cuentas con los permisos requeridos para registrar proyectos.
                    </p>
                  </div>
                `;
                destruirEntornoProyectos();
                return;
            }
        }
        cargarResidentesResponsables();
        const formProyecto = document.getElementById("form-proyecto");
        if (formProyecto) {
            formProyecto.addEventListener("submit", registrarNuevoProyecto);
        }
    });

    function destruirEntornoProyectos() {
        cargarResidentesResponsables = () => { console.warn("🔒 Acción denegada por directivas de seguridad."); };
        registrarNuevoProyecto = () => { alert("Intento de violación de seguridad detectado en el cliente."); };
    }

    async function cargarResidentesResponsables() {
        const selectResponsable = document.getElementById("responsable");
        if (!selectResponsable) return;

        try {
            const response = await fetch(`${API_URL}/empleados`);
            if (!response.ok) throw new Error(`Estado HTTP: ${response.status}`);

            const empleados = await response.json();
            selectResponsable.innerHTML = '<option value="">-- Selecciona --</option>';

            empleados.forEach(emp => {
                const option = document.createElement("option");
                option.value = emp.id_employee;
                option.textContent = `${emp.name} ${emp.last_name}`.trim();
                selectResponsable.appendChild(option);
            });

        } catch (error) {
            console.error("❌ Error al cargar los residentes responsables:", error);
            selectResponsable.innerHTML = '<option value="">⚠️ Error al cargar empleados</option>';
        }
    }

    async function registrarNuevoProyecto(e) {
        e.preventDefault();
        const formElement = e.target;
        const btnSubmit = document.getElementById("descargar"); 
        const formData = {
            proyecto: document.getElementById("proyecto").value,
            responsable: document.getElementById("responsable").value,
            fechaInicio: document.getElementById("fechaInicio").value,
            fechaFin: document.getElementById("fechaFin").value,
            ubicacion: document.getElementById("ubicacion").value
        };

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = "⏳ Guardando Proyecto...";
        }

        try {
            const response = await fetch(`${API_URL}/projects`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-rol": localStorage.getItem('userRol')
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Ocurrió un error inesperado en el servidor.");
            }

            alert(`🚀 ¡Proyecto registrado con éxito!\nID Asignado en Base de Datos: ${data.id_project}`);
            formElement.reset();

        } catch (error) {
            console.error("❌ Error al registrar el proyecto:", error);
            alert(`❌ Error al guardar el proyecto: ${error.message}`);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = "🚀 Registrar Proyecto";
            }
        }
    }
})();