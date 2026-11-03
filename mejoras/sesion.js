// =========================================================
// TIQUETE — Sesiones seguras (token firmado)
//
// - Al iniciar sesión o registrarse, el servidor entrega un token.
// - El navegador lo envía en cada petición (Authorization: Bearer ...).
// - El servidor ignora el "adminId" / "userId" que mande el navegador y
//   usa SIEMPRE la identidad que viene dentro del token. Así nadie puede
//   hacerse pasar por otro usuario ni por el administrador.
// =========================================================

const crypto = require("crypto");

// Clave secreta para firmar los tokens.
// En un hosting define la variable SESSION_SECRET (texto largo y aleatorio).
// Si no existe, se genera una al arrancar (las sesiones se cierran al reiniciar).
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString("hex");
  console.warn(
    " AVISO: falta SESSION_SECRET. Se usó una clave temporal; " +
      "las sesiones se cerrarán cada vez que se reinicie el servidor."
  );
}

const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas
const MAX_INTENTOS = 10; // intentos fallidos de login
const BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos

const b64 = (txt) => Buffer.from(txt).toString("base64url");

function firmar(data) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

function crearToken(id) {
  const payload = b64(JSON.stringify({ id: Number(id), exp: Date.now() + DURACION_MS }));
  return payload + "." + firmar(payload);
}

// Devuelve el id del usuario si el token es válido; si no, null.
function verificarToken(token) {
  if (typeof token !== "string") return null;
  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;

  const [payload, firma] = partes;
  const a = Buffer.from(firma);
  const b = Buffer.from(firmar(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const datos = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!Number.isInteger(datos.id) || datos.id <= 0) return null;
    if (typeof datos.exp !== "number" || datos.exp < Date.now()) return null;
    return datos.id;
  } catch (e) {
    return null;
  }
}

// Rutas que NO necesitan token
const PUBLICAS = new Set([
  "POST /api/login",
  "POST /api/register",
  "GET /api/turno",
  "GET /api/menu",
  "GET /api/health",
]);

function middleware(pool) {
  const intentos = new Map();

  // Limpieza periódica de bloqueos vencidos
  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of intentos) if (v.hasta < ahora) intentos.delete(k);
  }, 10 * 60 * 1000);
  if (limpieza.unref) limpieza.unref();

  return async function (req, res, next) {
    if (!req.path.startsWith("/api/")) return next();

    const ruta = `${req.method} ${req.path}`;

    // ---------- Login / registro: entregan el token ----------
    if (ruta === "POST /api/login" || ruta === "POST /api/register") {
      const original = res.json.bind(res);
      res.json = (cuerpo) => {
        if (cuerpo && cuerpo.ok && cuerpo.user && cuerpo.user.id) {
          cuerpo.token = crearToken(cuerpo.user.id);
        }
        return original(cuerpo);
      };

      if (ruta === "POST /api/login") {
        const clave = `${req.ip}|${String((req.body && req.body.email) || "").toLowerCase()}`;
        const reg = intentos.get(clave);

        if (reg && reg.hasta > Date.now() && reg.n >= MAX_INTENTOS) {
          return res.status(429).json({
            error: "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.",
          });
        }

        res.on("finish", () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            const ahora = Date.now();
            const actual = intentos.get(clave);
            if (!actual || actual.hasta < ahora) {
              intentos.set(clave, { n: 1, hasta: ahora + BLOQUEO_MS });
            } else {
              actual.n += 1;
            }
          } else if (res.statusCode === 200) {
            intentos.delete(clave);
          }
        });
      }
      return next();
    }

    // ---------- Rutas públicas ----------
    if (PUBLICAS.has(ruta)) return next();

    // ---------- Todo lo demás exige token ----------
    const cabecera = req.headers.authorization || "";
    const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
    const id = verificarToken(token);

    if (!id) {
      return res.status(401).json({
        error: "Sesión no válida o expirada. Inicia sesión de nuevo.",
      });
    }

    // La cuenta debe seguir existiendo y activa (así, al desactivar un
    // usuario, su sesión deja de funcionar de inmediato).
    try {
      const q = await pool.query("SELECT activo FROM usuarios WHERE id = $1", [id]);
      if (!q.rows.length || q.rows[0].activo === false) {
        return res.status(401).json({
          error: "Tu cuenta ya no está activa. Inicia sesión de nuevo.",
        });
      }
    } catch (e) {
      console.error("Error verificando sesión:", e);
      return res.status(500).json({ error: "Error interno del servidor." });
    }

    // Un usuario solo puede consultar su propia ficha.
    const m = req.path.match(/^\/api\/user\/(\d+)$/);
    if (m && Number(m[1]) !== id) {
      return res.status(403).json({ error: "No tienes permiso para ver esta cuenta." });
    }

    // Se fuerza la identidad real: lo que mande el navegador se ignora.
    if (req.body && typeof req.body === "object") {
      req.body.adminId = id;
      req.body.userId = id;
      if (ruta === "POST /api/order") {
        req.body.user = { ...(req.body.user || {}), id };
      }
    }
    Object.defineProperty(req, "query", {
      value: { ...req.query, adminId: id, userId: id },
      writable: true,
      configurable: true,
      enumerable: true,
    });

    req.authId = id;
    next();
  };
}

module.exports = { crearToken, verificarToken, middleware };
