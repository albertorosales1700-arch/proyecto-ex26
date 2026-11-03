// =========================================================
// TIQUETE - Dirección del servidor (API)
// =========================================================
// Firebase Hosting solo sirve archivos estáticos.
// El servidor (server.js) funciona en Render.

(function () {
  var URL_DEL_SERVIDOR = "https://proyecto-ex26.onrender.com";

  var host = location.hostname;
  var enFirebase = /\.(web\.app|firebaseapp\.com)$/.test(host);

  if (enFirebase) {
    window.TIQUETE_API_BASE = URL_DEL_SERVIDOR;

    if (URL_DEL_SERVIDOR.indexOf("TU-SERVICIO") !== -1) {
      console.error(
        "Falta configurar public/config.js con la URL del servidor."
      );
    }
  } else if (location.port === "5000") {
    // Firebase Emulator en tu computadora.
    window.TIQUETE_API_BASE = "http://localhost:8123";
  } else {
    // npm start: Express sirve la página y la API juntas.
    window.TIQUETE_API_BASE = "";
  }
})();
