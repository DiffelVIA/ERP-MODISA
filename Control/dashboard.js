(() => {
    'use strict';

    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000/api' 
        : 'https://erp-modisa.onrender.com/api';

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
                const usuarioMODISA = JSON.parse(sessionStorage.getItem('usuarioMODISA')) || {};
                const idEmployee = usuarioMODISA.id_employee || localStorage.getItem('id_employee') || '';

                const res = await fetch(`${API_URL}/proyectos`, {
                    headers: {
                        'x-employee-id': idEmployee,
                        'x-user-rol': localStorage.getItem('userRol') || ''
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
                const res = await fetch(`${API_URL}/dashboard/metrics/${idProyecto}`);
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