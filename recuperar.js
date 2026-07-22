(() => {
    const HOST_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : 'https://erp-modisa.onrender.com';
        
    const API_URL = `${HOST_BASE}/api`;
    
    const formVerificar = document.getElementById('form-verificar');
    const inputCorreo = document.getElementById('recuperar-correo');
    const errorVerificar = document.getElementById('error-verificar');
    const contenedorVerificar = document.getElementById('contenedor-verificar');

    const formNuevaPass = document.getElementById('form-nueva-pass');
    const inputNueva = document.getElementById('nueva-pass');
    const inputConfirmar = document.getElementById('confirmar-pass');
    const errorNueva = document.getElementById('error-nueva');
    const contenedorNuevaPass = document.getElementById('contenedor-nueva-pass');

    const urlParams = new URLSearchParams(window.location.search);
    let resetToken = urlParams.get('token') || "";

    if (resetToken) {
        if (contenedorVerificar) contenedorVerificar.style.display = "none";
        if (contenedorNuevaPass) contenedorNuevaPass.style.display = "block";
    }

    if (formVerificar) {
        formVerificar.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = formVerificar.querySelector('button[type="submit"]') || formVerificar.querySelector('button');
            const textoOriginal = btnSubmit ? btnSubmit.textContent : '';

            if (errorVerificar) errorVerificar.style.display = "none";

            const correo = inputCorreo ? inputCorreo.value.trim() : '';

            if (!correo) {
                mostrarError(errorVerificar, "Por favor, ingresa tu correo electrónico.");
                return;
            }

            try {
                if (btnSubmit) {
                    btnSubmit.disabled = true;
                    btnSubmit.textContent = 'Enviando...';
                }

                const respuesta = await fetch(`${API_URL}/auth/request-reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: correo })
                });

                const datos = await respuesta.json();

                if (!respuesta.ok) {
                    mostrarError(errorVerificar, datos.mensaje || "El correo ingresado no es válido.");
                    return;
                }

                alert(datos.mensaje || "Revisa tu bandeja de entrada para continuar con el restablecimiento.");
                formVerificar.reset();

            } catch (err) {
                mostrarError(errorVerificar, "Error de conexión con el servidor.");
                console.error(err);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = textoOriginal;
                }
            }
        });
    }

    if (formNuevaPass) {
        formNuevaPass.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = formNuevaPass.querySelector('button[type="submit"]') || formNuevaPass.querySelector('button');
            const textoOriginal = btnSubmit ? btnSubmit.textContent : '';

            if (errorNueva) errorNueva.style.display = "none";

            const nuevaVal = inputNueva ? inputNueva.value : '';
            const confirmarVal = inputConfirmar ? inputConfirmar.value : '';

            if (nuevaVal !== confirmarVal) {
                mostrarError(errorNueva, "Las contraseñas no coinciden.");
                return;
            }

            try {
                if (btnSubmit) {
                    btnSubmit.disabled = true;
                    btnSubmit.textContent = 'Actualizando...';
                }

                const respuesta = await fetch(`${API_URL}/auth/reset-password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: resetToken, nuevaContrasena: nuevaVal })
                });

                const datos = await respuesta.json();

                if (!respuesta.ok) {
                    mostrarError(errorNueva, datos.mensaje || "No se pudo actualizar la contraseña.");
                    return;
                }

                alert("Tu contraseña ha sido restablecida con éxito. Ya puedes iniciar sesión.");
                window.location.href = "index.html";

            } catch (err) {
                mostrarError(errorNueva, "Error de red al intentar actualizar.");
                console.error(err);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = textoOriginal;
                }
            }
        });
    }

    function mostrarError(elemento, mensaje) {
        if (elemento) {
            elemento.textContent = mensaje;
            elemento.style.display = "block";
        }
    }
})();