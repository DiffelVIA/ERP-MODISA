(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';

    let categoriasCache = [];

    const sesionUsuarioRaw = JSON.parse(localStorage.getItem("usuarioBD")) || null;
    const userRolString = localStorage.getItem("userRol") || null;

    const sesionUsuario = {
        id: sesionUsuarioRaw ? sesionUsuarioRaw.id : null,
        nombre: sesionUsuarioRaw ? sesionUsuarioRaw.nombre : 'Solicitante',
        rol: (sesionUsuarioRaw && sesionUsuarioRaw.rol) ? sesionUsuarioRaw.rol : userRolString
    };

    const ROLES_PERMITIDOS = ["Residente de Obra", "Director Operativo"];

    document.addEventListener("DOMContentLoaded", () => {
        
        if (!sesionUsuario || !ROLES_PERMITIDOS.includes(sesionUsuario.rol)) {
            const mainContent = document.querySelector('.form_main');
            if (mainContent) {
                mainContent.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
                        <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
                        <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px; font-weight: bold;">Acceso Denegado</h1>
                        <p style="color: #64748b; font-size: 16px; max-width: 400px; margin: 0 auto 30px auto; line-height: 1.5;">
                            No tienes los permisos necesarios para ver esta sección.
                        </p>
                    </div>
                `;
                return;
            }
        }

        inicializarFechas();
        cargarDatosUsuarioLogueado(); 
        cargarSelectoresIniciales();
        configurarEventosCascada();
        configurarEnvioFormulario();
    });

    function inicializarFechas() {
        const txtFecha = document.getElementById("fecha");
        const txtSemana = document.getElementById("semana-fiscal");

        const hoy = new Date();
        const año = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        txtFecha.value = `${año}-${mes}-${dia}`;

        const inicioAño = new Date(año, 0, 1);
        const diasPasados = Math.floor((hoy - inicioAño) / (24 * 60 * 60 * 1000));
        const numeroSemana = Math.ceil((diasPasados + inicioAño.getDay() + 1) / 7);
        
        txtSemana.value = `Semana ${numeroSemana}`;
    }

    function cargarDatosUsuarioLogueado() {
        const txtSolicitante = document.getElementById("solicitante");
        if (txtSolicitante && sesionUsuario && sesionUsuario.nombre) {
            txtSolicitante.value = sesionUsuario.nombre;
        }
    }

    async function cargarSelectoresIniciales() {
        try {
            const response = await fetch(`${API_BASE}/proyectos`);
            const selectProy = document.getElementById("proyecto");

            if (response.ok) {
                const proyectos = await response.json();
                selectProy.innerHTML = '<option value="">-- Selecciona --</option>';
                proyectos.forEach(p => {
                    selectProy.innerHTML += `<option value="${p.id_project}">${p.project_name}</option>`;
                });
            }
        } catch (error) {
            console.error("❌ Error al conectar con los catálogos:", error);
        }
    }

    function configurarEventosCascada() {
        const selectProy = document.getElementById("proyecto");
        const selectGrupo = document.getElementById("grupo");
        const selectCat = document.getElementById("categoria");
        const selectSub = document.getElementById("subcategoria");

        selectProy.addEventListener("change", async () => {
            const idProyecto = selectProy.value;
            
            resetSelect(selectGrupo, "-- Selecciona Proyecto Primero --", true);
            resetSelect(selectCat, "-- Selecciona Grupo Primero --", true);
            resetSelect(selectSub, "-- Selecciona Categoría Primero --", true);
            categoriasCache = [];

            if (!idProyecto) return;

            try {
                const response = await fetch(`${API_BASE}/proyectos/${idProyecto}/categorias`);
                if (!response.ok) throw new Error("No se pudieron cargar las categorías.");

                categoriasCache = await response.json();
                const gruposUnicos = [...new Set(categoriasCache.map(c => c.grupo))].sort();

                if (gruposUnicos.length > 0) {
                    selectGrupo.innerHTML = '<option value="">-- Selecciona --</option>';
                    gruposUnicos.forEach(g => {
                        selectGrupo.innerHTML += `<option value="${g}">${g}</option>`;
                    });
                    selectGrupo.disabled = false;
                } else {
                    resetSelect(selectGrupo, "⚠️ Proyecto sin clasificaciones registradas", true);
                }
            } catch (error) {
                console.error("❌ Error al cargar datos en cascada:", error);
            }
        });

        selectGrupo.addEventListener("change", () => {
            const grupoSeleccionado = selectGrupo.value;
            resetSelect(selectCat, "-- Selecciona Grupo Primero --", true);
            resetSelect(selectSub, "-- Selecciona Categoría Primero --", true);

            if (!grupoSeleccionado) return;

            const Glen = categoriasCache.filter(c => c.grupo === grupoSeleccionado);
            const categoriasUnicas = [...new Set(Glen.map(c => c.categoria))].sort();

            selectCat.innerHTML = '<option value="">-- Selecciona --</option>';
            categoriasUnicas.forEach(cat => {
                selectCat.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            selectCat.disabled = false;
        });

        selectCat.addEventListener("change", () => {
            const grupoSeleccionado = selectGrupo.value;
            const catSeleccionada = selectCat.value;
            resetSelect(selectSub, "-- Selecciona Categoría Primero --", true);

            if (!grupoSeleccionado || !catSeleccionada) return;

            const subcategoriasFiltradas = categoriasCache.filter(c => 
                c.grupo === grupoSeleccionado && c.categoria === catSeleccionada
            );

            selectSub.innerHTML = '<option value="">-- Selecciona --</option>';
            subcategoriasFiltradas.forEach(sub => {
                selectSub.innerHTML += `<option value="${sub.id_project_category}">${sub.subcategoria}</option>`;
            });
            selectSub.disabled = false;
        });
    }

    function resetSelect(elemento, mensaje, deshabilitar) {
        elemento.innerHTML = `<option value="">${mensaje}</option>`;
        elemento.disabled = deshabilitar;
    }

    function configurarEnvioFormulario() {
        document.getElementById("form-contratos").addEventListener("submit", async (e) => {
            e.preventDefault();

            const payload = {
                id_project: document.getElementById("proyecto").value,
                id_project_category: document.getElementById("subcategoria").value || null,
                contract_key: document.getElementById("clave").value,
                Concept: document.getElementById("concepto").value, 
                supplier: document.getElementById("proveedor").value,
                id_employee: sesionUsuario ? sesionUsuario.id : null, 
                start_date: null, 
                end_date: null,   
                total_amount: document.getElementById("monto").value
            };

            try {
                const response = await fetch(`${API_BASE}/contratos`, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "x-user-rol": sesionUsuario ? sesionUsuario.rol : ""
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert("🎉 ¡Contrato registrado con éxito en MODISA!");
                    e.target.reset();
                    resetSelect(document.getElementById("grupo"), "-- Selecciona Proyecto Primero --", true);
                    resetSelect(document.getElementById("categoria"), "-- Selecciona Grupo Primero --", true);
                    resetSelect(document.getElementById("subcategoria"), "-- Selecciona Categoría Primero --", true);
                    
                    inicializarFechas();
                    cargarDatosUsuarioLogueado(); 
                } else {
                    const errData = await response.json();
                    alert(`❌ Error del servidor: ${errData.error || "No se pudo guardar."}`);
                }
            } catch (error) {
                console.error("Error en la petición POST:", error);
                alert("❌ Hubo un fallo de red o no se pudo establecer conexión con el servidor.");
            }
        });
    }
})();