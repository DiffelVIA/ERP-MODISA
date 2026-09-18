(() => {
    'use strict';

    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    function obtenerRolDesdeJWT() {
        const token = localStorage.getItem('jwtToken');
        if (!token) return '';
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return '';
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const payload = JSON.parse(jsonPayload);
            return payload.rol || payload.role || payload.job_title || '';
        } catch (e) {
            console.error("❌ Error al decodificar JWT en dashboard:", e);
            return '';
        }
    }

    const limpiarTexto = (texto) => {
        if (!texto) return '';
        return texto
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    };

    document.addEventListener('DOMContentLoaded', () => {
        const ROLES_PERMITIDOS = [
            'Director General',
            'Director Operativo',
            'Director de Proyectos',
            'Subdirector de Obra',
            'Gerente Administración',
            'Gerente de Administración',
            'Compras',
            'Gerente de Costos'
        ];

        let userToken = window.obtenerUsuarioDesdeToken ? window.obtenerUsuarioDesdeToken() : null;
        
        if (!userToken) {
            try {
                const sesionStorageUsuario = sessionStorage.getItem('usuarioMODISA');
                if (sesionStorageUsuario) {
                    userToken = JSON.parse(sesionStorageUsuario);
                }
            } catch (e) {
                console.error('Error al parsear usuarioMODISA en dashboard:', e);
            }
        }

        const ROL_RAW = (userToken && userToken.rol) 
            ? userToken.rol 
            : (obtenerRolDesdeJWT() || localStorage.getItem('userRol') || '');

        const rolUsuarioLimpio = limpiarTexto(ROL_RAW);

        const tienePermiso = ROLES_PERMITIDOS.some(rolPermitido => {
            const permitidoLimpio = limpiarTexto(rolPermitido);
            return rolUsuarioLimpio === permitidoLimpio || (rolUsuarioLimpio.includes("gerente") && rolUsuarioLimpio.includes("administrac"));
        });

        if (!rolUsuarioLimpio || !tienePermiso) {
            const mainContent = document.querySelector('main') || document.querySelector('.dashboard-container') || document.body;
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
        let chartPresupuesto = null;
        let chartRubros = null;

        const selectProyecto = document.getElementById('select-proyecto-dashboard');

        cargarProyectos();

        selectProyecto.addEventListener('change', (e) => {
            const idProyecto = e.target.value;
            if (idProyecto) {
                cargarDatosDashboard(idProyecto);
            }
        });

        async function cargarProyectos() {
            try {
                const token = localStorage.getItem('jwtToken') || '';
                const usuarioMODISA = JSON.parse(sessionStorage.getItem('usuarioMODISA')) || {};
                const idEmployee = usuarioMODISA.id_employee || localStorage.getItem('id_employee') || '';

                const res = await fetch(`${API_URL}/proyectos`, {
                    headers: {
                        'Authorization': token ? `Bearer ${token}` : ''
                    }
                });

                if (!res.ok) {
                    throw new Error(`Error en el servidor: ${res.status} ${res.statusText}`);
                }

                const proyectos = await res.json();

                selectProyecto.innerHTML = '<option value="">-- Selecciona un Proyecto --</option>';
                proyectos.forEach(proj => {
                    const opt = document.createElement('option');
                    opt.value = proj.id_project;
                    opt.textContent = proj.project_name;
                    selectProyecto.appendChild(opt);
                });

                if (proyectos.length > 0) {
                    selectProyecto.value = proyectos[0].id_project;
                    cargarDatosDashboard(proyectos[0].id_project);
                }
            } catch (err) {
                console.error('Error al cargar proyectos:', err);
            }
        }

        async function cargarDatosDashboard(idProyecto) {
            try {
                const token = localStorage.getItem('jwtToken') || '';
                const res = await fetch(`${API_URL}/dashboardBackend/metrics/${idProyecto}`, {
                    headers: {
                        'Authorization': token ? `Bearer ${token}` : '',
                    }
                });
                
                const contentType = res.headers.get('content-type') || '';

                if (!res.ok || !contentType.includes('application/json')) {
                    throw new Error(`Respuesta no válida del servidor: ${res.status} (${contentType})`);
                }
                const data = await res.json();

                actualizarKPIs(data.totales);
                renderizarGraficoDona(data.rubros);
                renderizarGraficoBarras(data.rubros);
            } catch (err) {
                console.error('Error al cargar datos del dashboard:', err);
            }
        }

        function actualizarKPIs(totales) {
            const auth = parseFloat(totales.autorizado) || 0;
            const ejec = parseFloat(totales.ejecutado) || 0;
            const saldo = auth - ejec;
            const pct = auth > 0 ? ((ejec / auth) * 100).toFixed(1) : 0;

            document.getElementById('kpi-autorizado').textContent = `$${auth.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpi-ejecutado').textContent = `$${ejec.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpi-porcentaje').textContent = `${pct}%`;
            document.getElementById('kpi-saldo').textContent = `$${saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
        }

        function renderizarGraficoDona(rubros) {
            const ctx = document.getElementById('chartPresupuestoVsEjecutado').getContext('2d');

            if (chartPresupuesto) chartPresupuesto.destroy();

            const totalAuth = rubros.reduce((acc, r) => acc + parseFloat(r.autorizado), 0);
            const totalEjec = rubros.reduce((acc, r) => acc + parseFloat(r.ejecutado), 0);
            const porEjercer = Math.max(0, totalAuth - totalEjec);

            chartPresupuesto = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Ejecutado (Pagado)', 'Por Ejercer'],
                    datasets: [{
                        data: [totalEjec, porEjercer],
                        backgroundColor: ['#3b82f6', '#cbd5e1'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

        function renderizarGraficoBarras(rubros) {
            const ctx = document.getElementById('chartRubros').getContext('2d');

            if (chartRubros) chartRubros.destroy();

            const etiquetas = rubros.map(r => r.nombre);
            const datosAuth = rubros.map(r => parseFloat(r.autorizado));
            const datosEjec = rubros.map(r => parseFloat(r.ejecutado));

            chartRubros = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: etiquetas,
                    datasets: [
                        {
                            label: 'Autorizado',
                            data: datosAuth,
                            backgroundColor: '#06121E'
                        },
                        {
                            label: 'Ejecutado',
                            data: datosEjec,
                            backgroundColor: '#10b981'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true }
                    },
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    });
})();