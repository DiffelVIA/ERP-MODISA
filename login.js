const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api' 
  : 'https://erp-modisa.onrender.com/api';

let usuarioActual = "";

// Elementos del DOM login normal
const formLogin = document.querySelector('#login form');
const inputUsuario = document.getElementById('usuario');
const inputContrasena = document.getElementById('contrasena');
const errorLogin = document.getElementById('error-login');
const contenedorLogin = document.getElementById('login');

// Elementos del DOM cambio de contraseña
const formCambio = document.querySelector('#login-primera form');
const inputNueva = document.getElementById('nueva-contrasena');
const inputConfirmar = document.getElementById('confirmar-contrasena');
const errorChange = document.getElementById('error-change');
const contenedorCambio = document.getElementById('login-primera');

// Validación de inicio de sesión real contra el servidor
formLogin.addEventListener('submit', async function(e){
    e.preventDefault();

    const userVal = inputUsuario.value.trim();
    const passVal = inputContrasena.value;

    errorLogin.style.display = "none";
    errorLogin.textContent = "";

    try {
        const respuesta = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: userVal, contrasena: passVal })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mostrarError(errorLogin, datos.mensaje || "Error al iniciar sesión.");
            return;
        }

        usuarioActual = userVal;

        if (datos.primerIngreso) {
            contenedorLogin.style.display = "none";
            contenedorCambio.style.display = "block";
        } else {

            localStorage.setItem("userRol", datos.rol);

            sessionStorage.setItem("usuarioMODISA", JSON.stringify({
                nombre: datos.nombre,
                rol: datos.rol
            }));
            window.location.href = "principal.html";
        }

    } catch (error) {
        console.error(error);
        mostrarError(errorLogin, "No se pudo conectar con el servidor local.");
    }
});

// Actualización de contraseña real en primer ingreso
formCambio.addEventListener('submit', async function(e){
    e.preventDefault();

    const nuevaVal = inputNueva.value;
    const confirmarVal = inputConfirmar.value;

    errorChange.style.display = "none";
    errorChange.textContent = "";

    if (nuevaVal.length < 6) {
        mostrarError(errorChange, "La nueva Contraseña debe tener mínimo 6 caracteres");
        return;
    }

    if (nuevaVal !== confirmarVal) {
        mostrarError(errorChange, "Las Contraseñas no coinciden. Verifica los datos");
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/auth/update-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: usuarioActual, nuevaContrasena: nuevaVal })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            mostrarError(errorChange, datos.error || "No se pudo actualizar la contraseña.");
            return;
        }

        localStorage.setItem("userRol", datos.rol || "Director Operativo");

        sessionStorage.setItem("usuarioMODISA", JSON.stringify({
            nombre: usuarioActual,
            rol: datos.rol || "Director Operativo"
        }));

        alert("Contraseña actualizada con éxito");
        window.location.href = "principal.html";

    } catch (error) {
        console.error(error);
        mostrarError(errorChange, "Error de red al actualizar la contraseña.");
    }
});

// Función para mostrar mensajes de error en el DOM
function mostrarError(elemento, mensaje) {
    elemento.textContent = mensaje;
    elemento.style.display = "block";
}

// 🛡️ BLOQUEO ESTRÉPITO DEL BOTÓN "ATRÁS"
// Genera estados artificiales en el historial del navegador para capturar y neutralizar el retroceso
window.history.pushState(null, "", window.location.href);
window.onpopstate = function () {
    window.history.pushState(null, "", window.location.href);
};

// 🧼 LIMPIEZA ABSOLUTA DE FORMULARIO Y DATOS DE SESIÓN AL CARGAR
window.addEventListener('pageshow', () => {
    // Si un usuario ya tiene sesión activa en este navegador, que no pueda ver el login (redirige al dashboard)
    if (localStorage.getItem('userRol') && sessionStorage.getItem('usuarioMODISA')) {
        window.location.replace('principal.html');
        return;
    }

    // Si llegó aquí tras un logout o redirección por timeout, limpiamos todo rastro de almacenamiento
    localStorage.removeItem('userRol');
    sessionStorage.removeItem('usuarioMODISA');

    // Forzamos al DOM a resetear físicamente los campos y evitar que la caché autocomplete el form al retroceder
    if (inputUsuario) inputUsuario.value = "";
    if (inputContrasena) inputContrasena.value = "";
});