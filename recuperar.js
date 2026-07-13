const API_URL = "http://localhost:3000/api"; // Cambiar por tu URL de Render en producción

// Elementos del Paso 1
const formVerificar = document.getElementById('form-verificar');
const inputUsuario = document.getElementById('recuperar-usuario');
const inputCorreo = document.getElementById('recuperar-correo');
const errorVerificar = document.getElementById('error-verificar');
const contenedorVerificar = document.getElementById('contenedor-verificar');

// Elementos del Paso 2
const formNuevaPass = document.getElementById('form-nueva-pass');
const inputNueva = document.getElementById('nueva-pass');
const inputConfirmar = document.getElementById('confirmar-pass');
const errorNueva = document.getElementById('error-nueva');
const contenedorNuevaPass = document.getElementById('contenedor-nueva-pass');

// Variable para recordar qué usuario se está modificando tras pasar el paso 1
let usuarioVerificado = "";

// Paso 1: Validar si el usuario y teléfono coinciden en la Base de Datos
formVerificar.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorVerificar.style.display = "none";

    const usuario = inputUsuario.value.trim();
    const correo = inputCorreo.value.trim();

    try {
        const respuesta = await fetch(`${API_URL}/auth/verify-identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: usuario, email: correo })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mostrarError(errorVerificar, datos.mensaje || "Los datos no coinciden.");
            return;
        }

        // Si es correcto, avanzamos al paso 2
        usuarioVerificado = usuario;
        contenedorVerificar.style.display = "none";
        contenedorNuevaPass.style.display = "block";

    } catch (err) {
        mostrarError(errorVerificar, "Error de conexión con el servidor.");
        console.error(err);
    }
});

// Paso 2: Cambiar la contraseña en la BD
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
            body: JSON.stringify({ name: usuarioVerificado, nuevaContrasena: nuevaVal })
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