// public/Finanzas/materiales_Js/materialesPdf.js
import { formatearFecha } from './materialesUi.js';

export function generarOrdenCompraPDF(materialesFiltrados, concentradoMateriales, listaProyectosGlobal) {
    const idsVisibles = materialesFiltrados.map(m => m.id_detail);
    const materialesAProcesar = concentradoMateriales.filter(item => idsVisibles.includes(item.id_detail));
    
    if (materialesAProcesar.length === 0) {
        alert('⚠️ No hay materiales en la tabla para generar la Orden de Compra. Ajusta tus filtros primero.');
        return;
    }

    const materialesSoloCotizados = materialesFiltrados.filter(item => 
        item.estado && item.estado.toLowerCase().trim() === "cotizado"
    );

    if (materialesSoloCotizados.length === 0) {
        alert('⚠️ Ninguno de los materiales seleccionados tiene el estado "Cotizado". No se puede generar la Orden de Compra.');
        return;
    }

    let observacionUsuario = prompt("Escribe una observación para incluir en la Orden de Compra (Si no hay, puedes dejarla vacía):");
    if (observacionUsuario === null) observacionUsuario = "";
    observacionUsuario = observacionUsuario.trim();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'letter');

    const azulModisa = [6, 18, 30];
    const azulClaro = [59, 130, 246];
    const grisBorde = [203, 213, 225];
    const textoOscuro = [51, 65, 85];
    const grisFondo = [248, 250, 252];
    
    const margenIzquierdo = 40;
    let y = 45;

    const primerItem = materialesSoloCotizados[0];

    const ahora = new Date();
    const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
    const dias = Math.floor((ahora - inicioAnio) / (24 * 60 * 60 * 1000));
    const semanaActualDescarga = Math.ceil((dias + inicioAnio.getDay() + 1) / 7);

    const nombreProyecto = primerItem.obra || "MOD";
    const prefijoProyecto = nombreProyecto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3).toUpperCase();

    const nombreProveedor = primerItem.proveedor || "SIN PROV";
    let sufijoProveedor = "";
    const palabrasProv = nombreProveedor.trim().toUpperCase().split(/\s+/).filter(p => p !== "DE" && p !== "LA" && p !== "EL" && p !== "LOS" && p !== "Y");

    if (palabrasProv.length === 1) {
        sufijoProveedor = palabrasProv[0].substring(0, 3);
    } else {
        sufijoProveedor = palabrasProv.map(p => p[0]).join('').substring(0, 3);
    }

    const folioOC = `${semanaActualDescarga}${prefijoProyecto}${sufijoProveedor}`;

    doc.setFillColor(...azulModisa);
    doc.rect(margenIzquierdo, y, 532, 40, 'F'); 

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("ORDEN DE COMPRA", margenIzquierdo + 15, y + 25);

    doc.setFontSize(11);
    doc.text(`FOLIO: ${folioOC}`, 450, y + 25);

    y += 60;

    const hoyIso = new Date().toISOString().split('T')[0];
    const fechaFormateada = formatearFecha(hoyIso);
    const proyectoEncontrado = listaProyectosGlobal.find(p => p.project_name === primerItem.obra);
    const ubicacionObra = proyectoEncontrado ? (proyectoEncontrado.direccion || "Dirección No Registrada") : "Obra no encontrada";
    const telefonoResidente = primerItem.telefono || "S/N";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...azulModisa);
    doc.text("DATOS DE ENTREGA", margenIzquierdo, y);
    doc.setDrawColor(...grisBorde);
    doc.line(margenIzquierdo, y + 4, 260, y + 4);

    doc.setFontSize(8.5);
    doc.setTextColor(...textoOscuro);
    
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.text("OBRA:", margenIzquierdo, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${primerItem.obra}`, margenIzquierdo + 70, y);

    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("UBICACIÓN:", margenIzquierdo, y);
    doc.setFont("helvetica", "normal");
    const lineasUbicacion = doc.splitTextToSize(ubicacionObra, 180);
    doc.text(lineasUbicacion, margenIzquierdo + 70, y);
    y += (lineasUbicacion.length - 1) * 11; 

    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("RECIBE:", margenIzquierdo, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${primerItem.solicitante}`, margenIzquierdo + 70, y);

    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("TELÉFONO:", margenIzquierdo, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${telefonoResidente}`, margenIzquierdo + 70, y);

    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("FECHA REQ:", margenIzquierdo, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${fechaFormateada}`, margenIzquierdo + 70, y);

    let yFinalEntrega = y;

    let xFacturacion = 295;
    let yFacturacion = 105; 

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...azulModisa);
    doc.text("DATOS DE FACTURACIÓN", xFacturacion, yFacturacion);
    doc.setDrawColor(...grisBorde);
    doc.line(xFacturacion, yFacturacion + 4, 572, yFacturacion + 4);

    doc.setFontSize(8.5);
    doc.setTextColor(...textoOscuro);
    
    yFacturacion += 20;

    const xValor = xFacturacion + 70;      
    const maxAnchoTexto = 572 - xValor;    

    const datosFacturacion = [
        { etiqueta: "RAZÓN SOCIAL:", valor: "Servicios Integrales de Construcción Modisa S.A. de C.V." },
        { etiqueta: "RFC:", valor: "SIC191202RT9" },
        { etiqueta: "USO CFDI:", valor: "Adquisición de Mercancías" },
        { etiqueta: "REGIMEN:", valor: "Régimen General de Ley Personas Morales" },
        { etiqueta: "DIRECCIÓN:", valor: "Av. Ventura Puente 999 Int. 35 Col Del Empleado 58280" }
    ];

    datosFacturacion.forEach(campo => {
        doc.setFont("helvetica", "bold");
        doc.text(campo.etiqueta, xFacturacion, yFacturacion);

        doc.setFont("helvetica", "normal");
        const lineasTexto = doc.splitTextToSize(campo.valor, maxAnchoTexto);
        doc.text(lineasTexto, xValor, yFacturacion);

        yFacturacion += (lineasTexto.length * 9.5) + 4.5;
    });

    y = Math.max(yFinalEntrega, yFacturacion) + 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...azulModisa);
    doc.text("MATERIAL A REQUERIR", margenIzquierdo, y);
    y += 10;

    const columnas = [
        { name: "Proveedor", w: 100 },
        { name: "Concepto / Descripción", w: 250 },
        { name: "Unidad", w: 50 },
        { name: "Cant.", w: 35 },
        { name: "P. Unitario", w: 52 },
        { name: "Total", w: 45 }
    ];

    doc.setFillColor(...azulModisa);
    doc.rect(margenIzquierdo, y, 532, 22, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    
    let xCurr = margenIzquierdo;
    columnas.forEach(col => {
        if (col.name === "P. Unitario" || col.name === "Total" || col.name === "Cant.") {
            doc.text(col.name, xCurr + col.w - 5, y + 14, { align: "right" });
        } else {
            doc.text(col.name, xCurr + 5, y + 14);
        }
        xCurr += col.w;
    });

    y += 22;
    let granTotal = 0;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    
    materialesSoloCotizados.forEach((item, index) => {
        if (y > 600) {
            doc.addPage();
            y = 50;
            doc.setFillColor(...azulModisa);
            doc.rect(margenIzquierdo, y, 532, 22, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            let xNew = margenIzquierdo;
            columnas.forEach(col => {
                if (col.name === "P. Unitario" || col.name === "Total" || col.name === "Cant.") {
                    doc.text(col.name, xNew + col.w - 5, y + 14, { align: "right" });
                } else {
                    doc.text(col.name, xNew + 5, y + 14);
                }
                xNew += col.w;
            });
            y += 22;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
        }

        if (index % 2 === 0) {
            doc.setFillColor(...grisFondo);
            doc.rect(margenIzquierdo, y, 532, 20, 'F');
        }

        doc.setDrawColor(...grisBorde);
        doc.setLineWidth(0.5);
        doc.line(margenIzquierdo, y + 20, margenIzquierdo + 532, y + 20);
        doc.setTextColor(...textoOscuro);

        const proveedorTxt = item.proveedor || "-";
        const cantidad = Number(item.quantity) || 0;
        const precioUnitario = Number(item.precio_unitario) || 0;
        const totalFila = cantidad * precioUnitario;
        granTotal += totalFila;

        let xPos = margenIzquierdo;
        
        doc.text(proveedorTxt, xPos + 5, y + 13, { maxWidth: 90, ellipsize: true});
        xPos += columnas[0].w;

        doc.text(item.material_description, xPos + 5, y + 13, { maxWidth: 240, ellipsize: true});
        xPos += columnas[1].w;

        doc.text(item.unit, xPos + 5, y + 13);
        xPos += columnas[2].w;

        doc.text(cantidad.toString(), xPos + columnas[3].w - 5, y + 13, { align: "right" });
        xPos += columnas[3].w;

        doc.text(`$${precioUnitario.toFixed(2)}`, xPos + columnas[4].w - 5, y + 13, { align: "right" });
        xPos += columnas[4].w;

        doc.text(`$${totalFila.toFixed(2)}`, xPos + columnas[5].w - 5, y + 13, { align: "right" });

        y += 20;
    });

    y += 10;
    doc.setFillColor(...azulModisa);
    doc.rect(420, y, 152, 22, 'F');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAL GENERAL:", 425, y + 14);
    doc.text(`$${granTotal.toFixed(2)}`, 567, y + 14, { align: "right" });

    y += 35;

    if (observacionUsuario !== "") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...azulModisa);
        doc.text("OBSERVACIONES:", margenIzquierdo, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...textoOscuro);
        
        const lineasObs = doc.splitTextToSize(observacionUsuario, 520);
        doc.text(lineasObs, margenIzquierdo, y + 10);
        y += (lineasObs.length * 12) + 15;
    }

    if (y > 640) {
        doc.addPage();
        y = 50;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...azulModisa);
    doc.text("CONDICIONES DE ENTREGA:", margenIzquierdo, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...textoOscuro);

    const textoCondiciones = [
        "No se recibirá ningún material que sea incorrecto o este dañado, el material será revisado al momento de entrega"
    ];

    textoCondiciones.forEach(linea => {
        const parrafoSeparado = doc.splitTextToSize(linea, 532);
        doc.text(parrafoSeparado, margenIzquierdo, y + 10);
        y += (parrafoSeparado.length * 11);
    });

    y = 740;
    doc.setDrawColor(...azulClaro);
    doc.setLineWidth(1.5);
    doc.line(margenIzquierdo, y, margenIzquierdo + 532, y);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Servicios Integrales de Construcción MODISA S.A. de C.V. — Control Interno y Gestión de Almacén", margenIzquierdo, y + 15);

    const nombreLimpioObra = primerItem.obra.replace(/\s+/g, '_');
    doc.save(`Orden_Compra_Modisa_${nombreLimpioObra}.pdf`);
}