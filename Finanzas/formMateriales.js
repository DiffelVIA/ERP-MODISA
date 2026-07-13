let listaMateriales = [];
let categoriasCargadas = [];

document.addEventListener('DOMContentLoaded', () => {
    inicializarCamposFechas();
    cargarSelectoresIniciales(); 
    configurarEventos();
    renderizarMiniTabla();
});

function inicializarCamposFechas() {
    const inputFecha = document.getElementById('fecha');
    const inputSemana = document.getElementById('semana-fiscal');

    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    
    inputFecha.value = `${año}-${mes}-${dia}`;

    const inicioAño = new Date(año, 0, 1);
    const diasPasados = Math.floor((hoy - inicioAño) / (24 * 60 * 60 * 1000));
    const numeroSemana = Math.ceil((diasPasados + inicioAño.getDay() + 1) / 7);
    
    inputSemana.value = `Semana ${numeroSemana}`;
}

async function cargarSelectoresIniciales() {
    try {
        const resEmpleados = await fetch('http://localhost:3000/api/empleados');
        if (resEmpleados.ok) {
            const empleados = await resEmpleados.json();
            const lista = empleados.map(emp => ({
                id: emp.id_employee,
                nombre: `${emp.name} ${emp.last_name}`.trim()
            }));
            
            llenarSelect('solicitante', lista);
        }

        const resProyectos = await fetch('http://localhost:3000/api/proyectos');
        if (resProyectos.ok) {
            const proyectos = await resProyectos.json();
            const lista = proyectos.map(p => ({ 
                id: p.id_project,
                nombre: p.project_name
            }));
            llenarSelect('proyecto', lista);
        }
    } catch (error) {
        console.error("❌ Error inicial:", error);
    }
}

function configurarEventos() {
    document.getElementById('proyecto').addEventListener('change', async (e) => {
        const idProyecto = e.target.value;
        if (!idProyecto) return;

        try {
            const res = await fetch(`http://localhost:3000/api/proyectos/${idProyecto}/categorias`);
            if (res.ok) {
                categoriasCargadas = await res.json();
                
                const gruposUnicos = [...new Set(categoriasCargadas.map(c => c.grupo))];
                llenarSelectSencillo('grupo', gruposUnicos);
            }
        } catch (error) {
            console.error("❌ Error al cargar categorías de la obra:", error);
        }
    });

    document.getElementById('grupo').addEventListener('change', (e) => {
        const grupoSeleccionado = e.target.value;
        const filtradas = categoriasCargadas.filter(c => c.grupo === grupoSeleccionado);
        const categoriasUnicas = [...new Set(filtradas.map(c => c.categoria))];
        
        llenarSelectSencillo('categoria', categoriasUnicas);
        llenarSelectSencillo('subcategoria', []); // Limpiar subcategoría
    });

    document.getElementById('categoria').addEventListener('change', (e) => {
        const catSeleccionada = e.target.value;
        const grupoSeleccionado = document.getElementById('grupo').value;
        const filtradas = categoriasCargadas.filter(c => c.grupo === grupoSeleccionado && c.categoria === catSeleccionada);
        const subcategoriasUnicas = [...new Set(filtradas.map(c => c.subcategoria))];
        
        llenarSelectSencillo('subcategoria', subcategoriasUnicas);
    });

    document.querySelector('[data-accion="añadir"]').addEventListener('click', añadirMaterialALista);
    document.querySelector('[data-accion="requisicion"]').addEventListener('submit', enviarSolicitudFinal);
}

function llenarSelect(id, lista) {
    const select = document.getElementById(id);
    if (!select) return;
    
    // Limpieza total y creación segura del valor por defecto
    select.innerHTML = `<option value="">-- Selecciona --</option>`;
    
    lista.forEach(item => {
        const op = document.createElement('option');
        op.value = item.id;
        op.textContent = item.nombre;
        select.appendChild(op);
    });
}

function llenarSelectSencillo(id, lista) {
    const select = document.getElementById(id);
    if (!select) return;
    
    // Limpieza total y creación segura del valor por defecto
    select.innerHTML = `<option value="">-- Selecciona --</option>`;
    
    lista.forEach(item => {
        if(!item) return;
        const op = document.createElement('option');
        op.value = item;
        op.textContent = item;
        select.appendChild(op);
    });
}

// 4. 📝 Añadir Material
function añadirMaterialALista(e) {
    if (e) e.preventDefault();

    const descripcion = document.getElementById('descripcion').value.trim();
    const unidad = document.getElementById('unidad').value;
    const cantidad = parseFloat(document.getElementById('cantidad').value);
    const comentario = document.getElementById('comentario').value.trim();
    
    const grupo = document.getElementById('grupo').value;
    const categoria = document.getElementById('categoria').value;
    const subcategoria = document.getElementById('subcategoria').value;

    if (!descripcion || isNaN(cantidad) || cantidad <= 0 || !grupo || !categoria || !subcategoria) {
        alert('⚠️ Error: Selecciona Grupo, Categoría, Subcategoría, Descripción y Cantidad.');
        return false;
    }

    // Buscamos el ID real de la combinación en nuestro mapa de categorías cargadas
    const registroMatch = categoriasCargadas.find(c => 
        c.grupo === grupo && c.categoria === categoria && c.subcategoria === subcategoria
    );

    const nuevoMaterial = {
        id_project_category: registroMatch ? registroMatch.id_project_category : null,
        material_description: descripcion,
        unit: unidad,
        quantity: cantidad,
        commentary: comentario || null
    };

    listaMateriales.push(nuevoMaterial);
    renderizarMiniTabla();
    alert(`✅ "${descripcion}" añadido al lote.`);

    document.getElementById('descripcion').value = '';
    document.getElementById('cantidad').value = '';
    document.getElementById('comentario').value = '';
    return true;
}

function enviarSolicitudFinal(e) {
    e.preventDefault(); 

    if (listaMateriales.length === 0) {
        alert('❌ Error: No has añadido materiales a la lista.');
        return;
    }

    // Extraer el número de la semana eliminando cualquier texto extra de forma segura
    const semanaTexto = document.getElementById('semana-fiscal').value;
    const semanaNumero = parseInt(semanaTexto.replace(/[^0-9]/g, '')); // Deja solo los números

    const idSelectSolicitante = document.getElementById('solicitante').value;
    const idSelectProyecto = document.getElementById('proyecto').value;

    const payloadOrden = {
        id_project: idSelectProyecto ? parseInt(idSelectProyecto) : null,
        id_employee: idSelectSolicitante ? parseInt(idSelectSolicitante) : null,
        order_date: document.getElementById('fecha').value,
        fiscal_week: semanaNumero,
        materiales: listaMateriales 
    };

    // 🔍 Esto te mostrará en la consola del navegador qué datos viajan
    console.log("🚀 Enviando este paquete al backend:", payloadOrden);

    fetch('http://localhost:3000/api/materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadOrden)
    })
    // Modificamos aquí para poder leer el mensaje de error exacto del 400
    .then(async res => {
        const datos = await res.json();
        if (!res.ok) {
            throw new Error(datos.error || 'Error desconocido en el servidor.');
        }
        return datos;
    })
    .then(() => {
        alert(`🚀 ¡Solicitud guardada en MySQL con éxito!`);
        listaMateriales = [];
        document.getElementById('form-requisicion').reset();
        inicializarCamposFechas();
    })
    .catch((error) => {
        alert(`❌ Error al guardar: ${error.message}`);
    });
}

function renderizarMiniTabla() {
    const contenedorVacio = document.getElementById('tabla-materiales-vacia');
    const tablaElemento = document.getElementById('tabla-mini-materiales');
    const cuerpoTabla = document.getElementById('cuerpo-mini-tabla');

    cuerpoTabla.innerHTML = '';

    if (listaMateriales.length === 0) {
        contenedorVacio.style.display = 'block';
        tablaElemento.style.display = 'none';
        return;
    }

    contenedorVacio.style.display = 'none';
    tablaElemento.style.display = 'table';

    listaMateriales.forEach((mat, index) => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td class="desc-celda">${mat.material_description}</td>
            <td class="txt-centro cant-celda">${mat.quantity}</td>
            <td class="txt-centro unidad-celda">${mat.unit}</td>
            <td class="comentario-celda" title="${mat.commentary || ''}">${mat.commentary || '-'}</td>
            <td class="txt-centro">
                <button type="button" class="btn-eliminar-mini" data-index="${index}">❌</button>
            </td>
        `;

        tr.querySelector('.btn-eliminar-mini').addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            listaMateriales.splice(idx, 1);
            renderizarMiniTabla();
        });

        cuerpoTabla.appendChild(tr);
    });
}