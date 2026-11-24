(() => {
    let coordenadasActuales = 'GPS pendiente';

    function actualizarCoordenadasGPS(callbackEstado) {
        if (!navigator.geolocation) {
            coordenadasActuales = 'GPS no soportado';
            if (callbackEstado) callbackEstado(coordenadasActuales);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                const acc = Math.round(pos.coords.accuracy);
                coordenadasActuales = `${lat}, ${lng} (±${acc}m)`;
                if (callbackEstado) callbackEstado(coordenadasActuales);
            },
            () => {
                coordenadasActuales = 'GPS sin permiso o señal';
                if (callbackEstado) callbackEstado(coordenadasActuales);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    function obtenerCoordenadasActuales() {
        return coordenadasActuales;
    }

    function procesarFotoConMarcaAgua(file, metadatos) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No se seleccionó ninguna fotografía.'));
                return;
            }

            if (file.type && !file.type.startsWith('image/')) {
                reject(new Error('El archivo seleccionado no es una imagen válida.'));
                return;
            }

            const lector = new FileReader();
            lector.onload = (evento) => {
                const img = new Image();
                img.onload = () => {
                    const maxAncho = 1280;
                    const escala = img.width > maxAncho ? maxAncho / img.width : 1;
                    const ancho = Math.round(img.width * escala);
                    const alto = Math.round(img.height * escala);

                    const canvas = document.createElement('canvas');
                    canvas.width = ancho;
                    canvas.height = alto;
                    const ctx = canvas.getContext('2d');

                    ctx.drawImage(img, 0, 0, ancho, alto);

                    const ahora = new Date();
                    const fechaHoraStr = ahora.toLocaleString('es-MX', {
                        timeZone: 'America/Mexico_City',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });

                    const lineasSello = [
                        `MODISA FLOTILLA | ${fechaHoraStr}`,
                        `Resp: ${metadatos.usuario || 'N/A'} | Unidad: ${metadatos.unidad || 'N/A'}`,
                        `Mov: ${metadatos.movimiento || 'N/A'} | GPS: ${coordenadasActuales}`
                    ];

                    const fontSize = Math.max(14, Math.round(ancho * 0.018));
                    const lineHeight = Math.round(fontSize * 1.35);
                    const padding = Math.round(fontSize * 0.8);
                    const altoFranja = (lineasSello.length * lineHeight) + (padding * 2);

                    ctx.fillStyle = 'rgba(6, 18, 30, 0.82)';
                    ctx.fillRect(0, alto - altoFranja, ancho, altoFranja);

                    ctx.fillStyle = '#f8fafc';
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textBaseline = 'top';

                    lineasSello.forEach((linea, idx) => {
                        ctx.fillText(linea, padding, alto - altoFranja + padding + (idx * lineHeight));
                    });

                    const previewUrl = canvas.toDataURL('image/jpeg', 0.82);

                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('No se pudo generar la imagen certificada.'));
                            return;
                        }
                        const archivoFinal = new File([blob], `evidencia_${Date.now()}.jpg`, {
                            type: 'image/jpeg'
                        });
                        resolve({ archivoFinal, previewUrl });
                    }, 'image/jpeg', 0.82);
                };
                img.onerror = () => reject(new Error('Error al leer la imagen capturada.'));
                img.src = evento.target.result;
            };
            lector.onerror = () => reject(new Error('Error al abrir el archivo de cámara.'));
            lector.readAsDataURL(file);
        });
    }

    window.CamionetasCamera = {
        actualizarCoordenadasGPS,
        obtenerCoordenadasActuales,
        procesarFotoConMarcaAgua
    };
})();