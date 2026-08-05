document.addEventListener('DOMContentLoaded', () => {
    // 1. Control de acceso estricto por Rol
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

    // Instancias de Gráficos (Chart.js)
    let chartPresupuesto = null;
    let chartRubros = null;

    const selectProyecto = document.getElementById('select-proyecto-dashboard');

    // Inicialización
    cargarProyectos();

    selectProyecto.addEventListener('change', (e) => {
        const idProyecto = e.target.value;
        if (idProyecto) {
            cargarDatosDashboard(idProyecto);
        }
    });

    // 2. Cargar Proyectos para el Select
    async function cargarProyectos() {
        try {
            const res = await fetch('/api/projects');
            const proyectos = await res.json();

            selectProyecto.innerHTML = '<option value="">-- Selecciona un Proyecto --</option>';
            proyectos.forEach(proj => {
                const opt = document.createElement('option');
                opt.value = proj.id_project;
                opt.textContent = proj.name || proj.nombre;
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

    // 3. Obtener Métricas y Renderizar
    async function cargarDatosDashboard(idProyecto) {
        try {
            const res = await fetch(`/api/dashboard/metrics/${idProyecto}`);
            const data = await res.json();

            actualizarKPIs(data.totales);
            renderizarGraficoDona(data.rubros);
            renderizarGraficoBarras(data.rubros);
        } catch (err) {
            console.error('Error al cargar datos del dashboard:', err);
        }
    }

    // 4. Actualización de Tarjetas KPI
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

    // 5. Gráfico de Dona: Presupuesto Autorizado vs Ejecutado
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
                    backgroundColor: ['#3b82f6', '#cbd5e1'], // Usando variables CSS: --accent-color y --border-color
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

    // 6. Gráfico de Barras: Comparativo por Rubro
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
                        backgroundColor: '#06121E' // --primary-color
                    },
                    {
                        label: 'Ejecutado',
                        data: datosEjec,
                        backgroundColor: '#10b981' // --verde--
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