// =========================================================
// TIQUETE â€” Mejoras del servidor
//  - Costo de productos (para calcular ganancias)
//  - EstadÃ­sticas de ventas y ganancias (admin)
//  - BuzÃ³n de opiniones, sugerencias e inconformidades
// =========================================================

const TIPOS = ["OpiniÃ³n", "Sugerencia", "Inconformidad"];
const ESTADOS = ["Nueva", "Revisada"];

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function registrarMejoras(app, pool, helpers) {
  const { validateAdmin, getAdminCafetinId, normalizeRole } = helpers;

  // -------------------------------------------------------
  // MENÃš (reemplaza las versiones anteriores: se registran antes)
  // -------------------------------------------------------

  // MenÃº pÃºblico: NO incluye el costo.
  app.get("/api/menu", async (req, res) => {
    try {
      const q = await pool.query(
        `SELECT id, nombre, precio, disponible
         FROM productos WHERE cafetin_id = $1 ORDER BY id`,
        [Number(req.query.cafeteriaId) || 1]
      );
      res.json({
        ok: true,
        menu: q.rows.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          precio: Number(i.precio),
          disponible: Boolean(i.disponible),
        })),
      });
    } catch (e) {
      console.error("Error obteniendo menÃº:", e);
      res.status(500).json({ error: "No se pudo cargar el menÃº." });
    }
  });

  // MenÃº para el administrador: incluye el costo.
  app.get("/api/menu/admin", async (req, res) => {
    try {
      const { adminId } = req.query;
      if (!(await validateAdmin(pool, adminId))) {
        return res.status(403).json({ error: "Permiso denegado." });
      }
      const cid = await getAdminCafetinId(pool, adminId);
      const q = await pool.query(
        `SELECT id, nombre, precio, costo, disponible
         FROM productos WHERE cafetin_id = $1 ORDER BY id`,
        [cid]
      );
      res.json({
        ok: true,
        menu: q.rows.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          precio: Number(i.precio),
          costo: Number(i.costo || 0),
          disponible: Boolean(i.disponible),
        })),
      });
    } catch (e) {
      console.error("Error menÃº admin:", e);
      res.status(500).json({ error: "No se pudo cargar el menÃº." });
    }
  });

  // Agregar producto (con costo)
  app.post("/api/menu", async (req, res) => {
    try {
      const { adminId, nombre, precio, costo } = req.body || {};
      if (!(await validateAdmin(pool, adminId))) {
        return res.status(403).json({ error: "Permiso denegado." });
      }
      const cid = await getAdminCafetinId(pool, adminId);

      if (typeof nombre !== "string" || !nombre.trim()) {
        return res.status(400).json({ error: "El nombre del producto es obligatorio." });
      }
      const p = Number(precio);
      const c = costo === undefined || costo === "" ? 0 : Number(costo);
      if (!Number.isFinite(p) || p < 0) {
        return res.status(400).json({ error: "El precio no es vÃ¡lido." });
      }
      if (!Number.isFinite(c) || c < 0) {
        return res.status(400).json({ error: "El costo no es vÃ¡lido." });
      }

      const q = await pool.query(
        `INSERT INTO productos (nombre, precio, costo, disponible, cafetin_id)
         VALUES ($1, $2, $3, true, $4)
         RETURNING id, nombre, precio, disponible`,
        [nombre.trim(), r2(p), r2(c), cid]
      );
      const prod = q.rows[0];
      res.json({
        ok: true,
        producto: { ...prod, precio: Number(prod.precio) },
      });
    } catch (e) {
      console.error("Error agregando producto:", e);
      res.status(500).json({ error: "No se pudo agregar el producto." });
    }
  });

  // Modificar producto: nombre, precio, costo, disponibilidad
  app.patch("/api/menu/:id", async (req, res) => {
    try {
      const { adminId, nombre, precio, costo, disponible } = req.body || {};
      if (!(await validateAdmin(pool, adminId))) {
        return res.status(403).json({
          error: "Permiso denegado. Solo el administrador puede modificar productos.",
        });
      }
      const cid = await getAdminCafetinId(pool, adminId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Identificador no vÃ¡lido." });
      }

      const cur = await pool.query(
        "SELECT * FROM productos WHERE id = $1 AND cafetin_id = $2",
        [id, cid]
      );
      if (!cur.rows.length) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }
      const a = cur.rows[0];

      let nNombre = a.nombre;
      if (nombre !== undefined) {
        if (typeof nombre !== "string" || !nombre.trim()) {
          return res.status(400).json({ error: "El nombre del producto no es vÃ¡lido." });
        }
        nNombre = nombre.trim();
      }

      let nPrecio = Number(a.precio);
      if (precio !== undefined) {
        nPrecio = Number(precio);
        if (!Number.isFinite(nPrecio) || nPrecio < 0) {
          return res.status(400).json({ error: "El precio no es vÃ¡lido." });
        }
        nPrecio = r2(nPrecio);
      }

      let nCosto = Number(a.costo || 0);
      if (costo !== undefined) {
        nCosto = Number(costo);
        if (!Number.isFinite(nCosto) || nCosto < 0) {
          return res.status(400).json({ error: "El costo no es vÃ¡lido." });
        }
        nCosto = r2(nCosto);
      }

      let nDisp = Boolean(a.disponible);
      if (disponible !== undefined) {
        if (typeof disponible !== "boolean") {
          return res.status(400).json({ error: "La disponibilidad no es vÃ¡lida." });
        }
        nDisp = disponible;
      }
      const q = await pool.query(
        `UPDATE productos
         SET nombre = $1, precio = $2, costo = $3, disponible = $4
         WHERE id = $5 AND cafetin_id = $6
         RETURNING id, nombre, precio, disponible`,
        [nNombre, nPrecio, nCosto, nDisp, id, cid]
      );
      res.json({ ok: true, producto: q.rows[0] });
    } catch (e) {
      console.error("Error modificando producto:", e);
      res.status(500).json({ error: "No se pudo modificar el producto." });
    }
  });

  // -------------------------------------------------------
  // ESTADÃSTICAS (admin)
  // -------------------------------------------------------
  app.get("/api/stats", async (req, res) => {
    try {
      const { adminId } = req.query;
      if (!(await validateAdmin(pool, adminId))) {
        return res.status(403).json({ error: "Solo el administrador puede ver las estadÃ­sticas." });
      }
      const cid = await getAdminCafetinId(pool, adminId);
      const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 7, 1), 90);

      const desde = "CURRENT_DATE - ($2::int - 1)";

      const resumen = await pool.query(
        `SELECT
           COUNT(DISTINCT p.id)::int AS pedidos,
           COALESCE(SUM(d.precio * d.cantidad), 0) AS ventas,
           COALESCE(SUM((d.precio - d.costo) * d.cantidad), 0) AS ganancia,
           COUNT(*) FILTER (WHERE d.costo = 0)::int AS sin_costo
         FROM pedidos p
         JOIN pedidos_detalle d ON d.pedido_id = p.id
         WHERE p.cafetin_id = $1 AND p.fecha >= ${desde}`,
        [cid, dias]
      );

      const top = await pool.query(
        `SELECT d.producto AS nombre,
                SUM(d.cantidad)::int AS unidades,
                SUM(d.precio * d.cantidad) AS ventas,
                SUM((d.precio - d.costo) * d.cantidad) AS ganancia
         FROM pedidos p
         JOIN pedidos_detalle d ON d.pedido_id = p.id
         WHERE p.cafetin_id = $1 AND p.fecha >= ${desde}
         GROUP BY d.producto
         ORDER BY unidades DESC, ventas DESC
         LIMIT 10`,
        [cid, dias]
      );

      const diario = await pool.query(
        `SELECT to_char(g, 'YYYY-MM-DD') AS dia,
                COALESCE(SUM(d.precio * d.cantidad), 0) AS ventas,
                COALESCE(SUM((d.precio - d.costo) * d.cantidad), 0) AS ganancia,
                COUNT(DISTINCT p.id)::int AS pedidos
         FROM generate_series(
                (CURRENT_DATE - ($2::int - 1))::timestamp,
                CURRENT_DATE::timestamp,
                interval '1 day') g
         LEFT JOIN pedidos p
                ON p.fecha::date = g::date AND p.cafetin_id = $1
         LEFT JOIN pedidos_detalle d ON d.pedido_id = p.id
         GROUP BY g
         ORDER BY g`,
        [cid, dias]
      );

      const r = resumen.rows[0];
      const ventas = r2(r.ventas);

      res.json({
        ok: true,
        stats: {
          dias,
          pedidos: r.pedidos,
          ventas,
          ganancia: r2(r.ganancia),
          ticketPromedio: r.pedidos ? r2(ventas / r.pedidos) : 0,
          lineasSinCosto: r.sin_costo,
          top: top.rows.map((t) => ({
            nombre: t.nombre,
            unidades: t.unidades,
            ventas: r2(t.ventas),
            ganancia: r2(t.ganancia),
          })),
          diario: diario.rows.map((d) => ({
            dia: d.dia,
            ventas: r2(d.ventas),
            ganancia: r2(d.ganancia),
            pedidos: d.pedidos,
          })),
        },
      });
    } catch (e) {
      console.error("Error en estadÃ­sticas:", e);
      res.status(500).json({ error: "No se pudieron calcular las estadÃ­sticas." });
    }
  });

  // -------------------------------------------------------
  // BUZÃ“N DE OPINIONES
  // -------------------------------------------------------

  // Estudiante envÃ­a un mensaje
  app.post("/api/feedback", async (req, res) => {
    try {
      const { userId, tipo, mensaje } = req.body || {};
      const uid = Number(userId);
      if (!Number.isInteger(uid) || uid <= 0) {
        return res.status(400).json({ error: "Usuario no vÃ¡lido." });
      }
      if (!TIPOS.includes(tipo)) {
        return res.status(400).json({ error: "Tipo de mensaje no vÃ¡lido." });
      }
      const texto = typeof mensaje === "string" ? mensaje.trim() : "";
      if (texto.length < 5 || texto.length > 1000) {
        return res.status(400).json({ error: "Escribe entre 5 y 1000 caracteres." });
      }

      const u = await pool.query(
        "SELECT id, rol, cafetin_id, activo FROM usuarios WHERE id = $1",
        [uid]
      );
      if (
        !u.rows.length ||
        u.rows[0].activo === false ||
        normalizeRole(u.rows[0].rol) !== "estudiante"
      ) {
        return res.status(403).json({ error: "Solo los estudiantes pueden enviar mensajes." });
      }

      const q = await pool.query(
        `INSERT INTO opiniones (usuario_id, cafetin_id, tipo, mensaje)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tipo, mensaje, estado, respuesta, fecha`,
        [uid, Number(u.rows[0].cafetin_id) || 1, tipo, texto]
      );
      res.json({ ok: true, opinion: q.rows[0] });
    } catch (e) {
      console.error("Error guardando opiniÃ³n:", e);
      res.status(500).json({ error: "No se pudo enviar tu mensaje." });
    }
  });

  // Estudiante ve sus propios mensajes
  app.get("/api/feedback/mine", async (req, res) => {
    try {
      const uid = Number(req.query.userId);
      if (!Number.isInteger(uid) || uid <= 0) {
        return res.status(400).json({ error: "Usuario no vÃ¡lido." });
      }
      const q = await pool.query(
        `SELECT id, tipo, mensaje, estado, respuesta, fecha
         FROM opiniones WHERE usuario_id = $1 ORDER BY fecha DESC`,
        [uid]
      );
      res.json({ ok: true, items: q.rows });
    } catch (e) {
      console.error("Error leyendo mis opiniones:", e);
      res.status(500).json({ error: "No se pudieron cargar tus mensajes." });
    }
  });

  // Administrador ve todos los mensajes de su cafetÃ­n
  app.get("/api/feedback", async (req, res) => {
    try {
      const { adminId } = req.query;
      if (!(await validateAdmin(pool, adminId))) {
        return res.status(403).json({ error: "Permiso denegado." });
      }
      const cid = await getAdminCafetinId(pool, adminId);
      const q = await pool.query(
        `SELECT o.id, o.tipo, o.mensaje, o.estado, o.respuesta, o.fecha,
                u.nombre
         FROM opiniones o
         JOIN usuarios u ON u.id = o.usuario_id
         WHERE o.cafetin_id = $1
         ORDER BY (o.estado = 'Nueva') DESC, o.fecha DESC`,
        [cid]
      );
      res.json({ ok: true, items: q.rows });
    } catch (e) {
      console.error("Error leyendo buzÃ³n:", e);
      res.status(500).json({ error: "No se pudo cargar el buzÃ³n." });
    }
  });

  // Administrador marca como revisada y/o responde
  app.patch("/api/feedback/:id", async (req, res) => {
    try {
      const { adminId, estado, respuesta } = req.body || {};
      if (!(await validateAdmin(pool, adminId))) {
        return res.status(403).json({ error: "Permiso denegado." });
      }
      const cid = await getAdminCafetinId(pool, adminId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Identificador no vÃ¡lido." });
      }
      if (estado !== undefined && !ESTADOS.includes(estado)) {
        return res.status(400).json({ error: "Estado no vÃ¡lido." });
      }
      if (
        respuesta !== undefined &&
        (typeof respuesta !== "string" || respuesta.length > 1000)
      ) {
        return res.status(400).json({ error: "La respuesta no es vÃ¡lida (mÃ¡x. 1000 caracteres)." });
      }

      const q = await pool.query(
        `UPDATE opiniones
         SET estado = COALESCE($1, estado),
             respuesta = COALESCE($2, respuesta)
         WHERE id = $3 AND cafetin_id = $4
         RETURNING id, estado, respuesta`,
        [estado ?? null, respuesta === undefined ? null : respuesta.trim(), id, cid]
      );
      if (!q.rows.length) {
        return res.status(404).json({ error: "Mensaje no encontrado." });
      }
      res.json({ ok: true, opinion: q.rows[0] });
    } catch (e) {
      console.error("Error actualizando opiniÃ³n:", e);
      res.status(500).json({ error: "No se pudo actualizar el mensaje." });
    }
  });
}

// Migraciones seguras (se pueden ejecutar siempre)
registrarMejoras.init = async function (pool) {
  await pool.query(`
    ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE pedidos_detalle ADD COLUMN IF NOT EXISTS costo NUMERIC(10,2) NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS opiniones (
      id          SERIAL PRIMARY KEY,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
      cafetin_id  INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id),
      tipo        TEXT NOT NULL,
      mensaje     TEXT NOT NULL,
      estado      TEXT NOT NULL DEFAULT 'Nueva',
      respuesta   TEXT,
      fecha       TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pedidos_cafetin_fecha ON pedidos (cafetin_id, fecha);
  `);
};

module.exports = registrarMejoras;
