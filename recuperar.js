(() => {
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000/api' : 'https://erp-modisa.onrender.com/api';
    
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
        contenedorVerificar.style.display = "none";
        contenedorNuevaPass.style.display = "block";
    }

    formVerificar.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorVerificar.style.display = "none";

        const correo = inputCorreo.value.trim();

        try {
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
        }
    });

    formNuevaPass.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorNueva.style.display = "none";

        const nuevaVal = inputNueva.value;
        const confirmarVal = inputConfirmar.value;

        if (nuevaVal !== confirmarVal) {
            mostrarError(errorNueva, "Las contraseñas no coinciden.");
            return;
        }

        try {
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
        }
    });

    function mostrarError(elemento, mensaje) {
        elemento.textContent = mensaje;
        elemento.style.display = "block";
    }
})();