(() => {
    'use strict';

    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

    // Función auxiliar para obtener los encabezados con el token JWT de forma segura y dinámica
    function getAuthHeaders(headersExtra = {}) {
        const token = localStorage.getItem('token') || '';
        return {
            ...headersExtra,
            "Authorization": token ? `Bearer ${token}` : ''
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        const ROLES_PERMITIDOS = [
            'Director General',
            'Director Operativo',
            'Director de Proyectos',
            'Subdirector de Obra',
            'Gerente Administración',
            'Compras',
            'Gerente de Costos'
        ];

        const userRol = localStorage.getItem('userRol');
        
        if (!userRol || !ROLES_PERMITIDOS.includes(userRol.trim())) {
            alert('Acceso no autorizado a este módulo.');
            window.location.href = '../principal.html';
            return;
        }

        let chartPresupuesto = null;
        let chartRubros = null;
        // NUEVOS GRAFICOS
        let chartMetodos = null;
        let chartFlujo = null;

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
                const res = await fetch(`${API_URL}/proyectos`, {
                    headers: getAuthHeaders()
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
                const res = await fetch(`${API_URL}/dashboard/metrics/${idProyecto}`, {
                    headers: getAuthHeaders()
                });

                if (!res.ok) {
                    throw new Error(`Error en el servidor: ${res.status} ${res.statusText}`);
                }

                const data = await res.json();

                actualizarKPIs(data.totales);
                renderizarGraficoDona(data.rubros);
                renderizarGraficoBarras(data.rubros);

                if (data.metodosPago) renderizarGraficoMetodos(data.metodosPago);
                if (data.flujoSemanal) renderizarGraficoFlujo(data.flujoSemanal);
                if (data.topProveedores) renderizarTopProveedores(data.topProveedores);

            } catch (err) {
                console.error('Error al cargar datos del dashboard:', err);
            }
        }

        function actualizarKPIs(totales) {
            const auth = parseFloat(totales.autorizado) || 0;
            const ejec = parseFloat(totales.ejecutado) || 0;
            const comp = parseFloat(totales.comprometido) || 0;
            const saldo = auth - ejec;
            const pct = auth > 0 ? ((ejec / auth) * 100).toFixed(1) : 0;

            document.getElementById('kpi-autorizado').textContent = `$${auth.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpi-ejecutado').textContent = `$${ejec.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpi-porcentaje').textContent = `${pct}%`;
            document.getElementById('kpi-saldo').textContent = `$${saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

            const elemComprometido = document.getElementById('kpi-comprometido');
            if (elemComprometido) {
                elemComprometido.textContent = `$${comp.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            }
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

        function renderizarGraficoMetodos(datos) {
            const canvas = document.getElementById('chartMetodosPago');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (chartMetodos) chartMetodos.destroy();

            chartMetodos = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: datos.map(d => d.metodo),
                    datasets: [{
                        data: datos.map(d => parseFloat(d.total)),
                        backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        function renderizarGraficoFlujo(datos) {
            const canvas = document.getElementById('chartFlujoSemanal');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (chartFlujo) chartFlujo.destroy();

            chartFlujo = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: datos.map(d => `Semana ${d.semana}`),
                    datasets: [{
                        label: 'Egresos ($)',
                        data: datos.map(d => parseFloat(d.total)),
                        borderColor: '#0284c7',
                        backgroundColor: 'rgba(2, 132, 199, 0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        function renderizarTopProveedores(lista) {
            const contenedor = document.getElementById('contenedorTopProveedores');
            if (!contenedor) return;

            if (lista.length === 0) {
                contenedor.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Sin pagos registrados.</p>';
                return;
            }

            contenedor.innerHTML = lista.map((p, i) => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9;">
                    <span><strong>#${i + 1}</strong> ${p.proveedor}</span>
                    <strong style="color:#0f172a;">$${parseFloat(p.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                </div>
            `).join('');
        }
    });
})();