(() => {
    const HOST_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://erp-modisa.onrender.com';
        
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

    document.addEventListener('DOMContentLoaded', async () => {
        if (resetToken) {
            try {
                const res = await fetch(`${API_URL}/auth/verify-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: resetToken })
                });

                const contentType = res.headers.get("content-type");
                let data = {};
                if (contentType && contentType.includes("application/json")) {
                    data = await res.json();
                }

                if (!res.ok) {
                    alert(data.mensaje || '⚠️ El token de recuperación expiró o no es válido. Por favor solicita uno nuevo.');
                    window.location.href = 'recuperar.html';
                    return;
                }

                if (contenedorVerificar) contenedorVerificar.style.display = "none";
                if (contenedorNuevaPass) contenedorNuevaPass.style.display = "block";
            } catch (err) {
                console.error('❌ Error al verificar token:', err);
                mostrarError(errorVerificar, "Error de comunicación al validar el enlace.");
            }
        }
    });

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

            if (nuevaVal.length < 6) {
                mostrarError(errorNueva, "La nueva contraseña debe tener mínimo 6 caracteres");
                return;
            }

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

                localStorage.clear();
                sessionStorage.clear();

                alert("Tu contraseña ha sido restablecida con éxito. Serás redirigido para iniciar sesión.");
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