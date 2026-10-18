// =========================================================
// TIQUETE â€” Servidor
// Node.js + Express + PostgreSQL
// =========================================================

const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const os = require("os");

const bcrypt = require("bcryptjs");

const app = express();

const PORT = Number(process.env.PORT) || 8123;


// =========================================================
// CONEXIÃ“N A POSTGRESQL
// =========================================================

// En un hosting (Render, Railway, Neon...) se usa DATABASE_URL.
// En tu computadora se usan los valores de abajo.
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.PGSSL === "false"
            ? false
            : { rejectUnauthorized: false },
      }
    : {
        user: process.env.PGUSER || "postgres",
        host: process.env.PGHOST || "127.0.0.1",
        database: process.env.PGDATABASE || "tiquete",
        password: process.env.PGPASSWORD || "tiquete123",
        port: Number(process.env.PGPORT) || 5432,
      }
);


// =========================================================
// CONFIGURACIÃ“N
// =========================================================

app.use(express.json());

// Solo se publican los archivos del frontend.
// (Antes se servÃ­a toda la carpeta y cualquiera podÃ­a descargar
//  server.js con la contraseÃ±a de la base de datos.)
const PUBLIC_FILES = new Set([
  "/index.html",
  "/Index.html",
  "/script.js",
  "/styles.css",
  "/cocodrilo.png",
  "/logo.inti.jpeg",
  "/perfil.inti.jpeg",
]);

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  if (!PUBLIC_FILES.has(req.path)) {
    return next();
  }

  const archivo =
    req.path === "/index.html" || req.path === "/Index.html"
      ? "Index.html"
      : req.path.slice(1);

  res.sendFile(path.join(__dirname, archivo));
});


// =========================================================
// UTILIDADES
// =========================================================

const r2 = (n) => {
  const value = Number(n || 0);

  return Math.round(value * 100) / 100;
};


// =========================================================
// NORMALIZAR ROL
// =========================================================

function normalizeRole(role) {

  const value =
    String(role || "")
      .trim()
      .toLowerCase();


  if (
    value === "cafetin" ||
    value === "admin" ||
    value === "administrador"
  ) {

    return "cafetin";
  }


  return "estudiante";
}


// =========================================================
// VALIDAR ADMINISTRADOR
// =========================================================

async function validateAdmin(
  db,
  adminId
) {

  if (!adminId) {
    return false;
  }


  try {

    const q =
      await db.query(
        `
        SELECT
          id,
          rol
        FROM usuarios
        WHERE id = $1
        `,
        [adminId]
      );


    if (!q.rows.length) {
      return false;
    }


    return (
      normalizeRole(
        q.rows[0].rol
      ) === "cafetin"
    );

  } catch (e) {

    console.error(
      "Error validando administrador:",
      e
    );

    return false;
  }
}


async function getAdminCafetinId(db, adminId) {
  const q = await db.query("SELECT cafetin_id FROM usuarios WHERE id = $1 AND lower(rol) IN ('cafetin','admin','administrador')", [adminId]);
  return q.rows.length ? Number(q.rows[0].cafetin_id || 1) : null;
}

// =========================================================
// AUTENTICACIÃ“N
// =========================================================


 // =========================================================
 // LOGIN â€” Compatible con contraseÃ±as antiguas y bcrypt
 // =========================================================

app.post("/api/login", async (req, res) => {
  try {
    const {
      email,
      password,
      expectRole,
      cafeteriaId = 1,
    } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        error: "Faltan datos.",
      });
    }

    const idCafeteria = Number(cafeteriaId) || 1;

    const q = await pool.query(
      `
      SELECT
        id,
        nombre,
        correo,
        rol,
        saldo,
        cafetin_id,
        contrasena
      FROM usuarios
      WHERE lower(correo) = lower($1)
        AND cafetin_id = $2
      LIMIT 1
      `,
      [email.trim(), idCafeteria]
    );

    if (!q.rows.length) {
      return res.status(401).json({
        error: "Credenciales incorrectas.",
      });
    }

    const rawUser = q.rows[0];
    const storedPassword = rawUser.contrasena;

    const isBcryptHash =
      typeof storedPassword === "string" &&
      /^\$2[aby]\$\d{2}\$/.test(storedPassword);

    let passwordCorrecta = false;

    if (isBcryptHash) {
      passwordCorrecta = await bcrypt.compare(
        password,
        storedPassword
      );
    } else {
      // Compatibilidad temporal con contraseÃ±as antiguas.
      passwordCorrecta = password === storedPassword;
    }

    if (!passwordCorrecta) {
      return res.status(401).json({
        error: "Credenciales incorrectas.",
      });
    }

    // Migrar la contraseÃ±a antigua a bcrypt tras
    // comprobar que la contraseÃ±a ingresada es correcta.
    if (!isBcryptHash) {
      const hashedPassword = await bcrypt.hash(password, 12);

      await pool.query(
        `
        UPDATE usuarios
        SET contrasena = $1
        WHERE id = $2
          AND contrasena = $3
        `,
        [hashedPassword, rawUser.id, storedPassword]
      );
    }

    // No enviar nunca la contraseÃ±a ni su hash al navegador.
    const {
      contrasena: _contrasena,
      ...safeUser
    } = rawUser;

    const user = {
      ...safeUser,
      rol: normalizeRole(safeUser.rol),
      saldo: Number(safeUser.saldo || 0),
    };

    if (
      expectRole &&
      normalizeRole(expectRole) !== user.rol
    ) {
      return res.status(403).json({
        error: "Rol incorrecto para este acceso.",
      });
    }

    return res.json({
      ok: true,
      user,
    });
  } catch (e) {
    console.error("Error en login:", e);

    return res.status(500).json({
      error: "Error interno al iniciar sesiÃ³n.",
    });
  }
});




 // =========================================================
 // REGISTRO â€” ContraseÃ±as protegidas con bcrypt
 // =========================================================

app.post("/api/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      cafeteriaId,
    } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 4
    ) {
      return res.status(400).json({
        error: "Datos incompletos. La contraseÃ±a debe tener al menos 4 caracteres.",
      });
    }

    const idCafeteria = Number(cafeteriaId);

    if (
      !Number.isInteger(idCafeteria) ||
      idCafeteria < 1
    ) {
      return res.status(400).json({
        error: "Selecciona una cafeterÃ­a vÃ¡lida.",
      });
    }

    const cafeteriaExiste = await pool.query(
      `
      SELECT 1
      FROM usuarios
      WHERE cafetin_id = $1
        AND LOWER(rol) IN ('cafetin', 'admin', 'administrador')
      LIMIT 1
      `,
      [idCafeteria]
    );

    if (cafeteriaExiste.rows.length === 0) {
      return res.status(400).json({
        error: "La cafeterÃ­a seleccionada no existe o no estÃ¡ configurada.",
      });
    }

    const correo = email.trim();

    const existe = await pool.query(
      `
      SELECT 1
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
      LIMIT 1
      `,
      [correo]
    );

    if (existe.rows.length > 0) {
      return res.status(409).json({
        error: "Correo ya registrado.",
      });
    }

    // Generar el hash antes de guardar la contraseÃ±a.
    const passwordHash = await bcrypt.hash(password, 12);

    const q = await pool.query(
      `
      INSERT INTO usuarios
        (
          nombre,
          correo,
          contrasena,
          rol,
          saldo,
          cafetin_id
        )
      VALUES ($1, $2, $3, 'estudiante', 10, $4)
      RETURNING
        id,
        nombre,
        correo,
        rol,
        saldo
      `,
      [
        name.trim(),
        correo,
        passwordHash,
        idCafeteria,
      ]
    );

    const nuevo = q.rows[0];

    return res.json({
      ok: true,
      user: {
        ...nuevo,
        rol: normalizeRole(nuevo.rol),
        saldo: Number(nuevo.saldo || 0),
      },
    });
  } catch (e) {
    console.error("Error en registro:", e);

    // Manejar tambiÃ©n una posible duplicaciÃ³n concurrente.
    if (e.code === "23505") {
      return res.status(409).json({
        error: "El correo ya estÃ¡ registrado.",
      });
    }

    return res.status(500).json({
      error: "Error interno al registrar el usuario.",
    });
  }
});


// =========================================================
// SESIÃ“N
// =========================================================

app.get(
  "/api/user/:id",
  async (req, res) => {

    try {

      const q =
        await pool.query(
          `
          SELECT
            id,
            nombre,
            correo,
            rol,
            saldo,
            cafetin_id
          FROM usuarios
          WHERE id = $1
          `,
          [req.params.id]
        );


      if (
        !q.rows.length
      ) {

        return res
          .status(404)
          .json({
            error:
              "SesiÃ³n expirada.",
          });
      }


      const rawUser =
        q.rows[0];


      const user = {

        ...rawUser,

        rol:
          normalizeRole(
            rawUser.rol
          ),

        saldo:
          Number(
            rawUser.saldo || 0
          ),
      };


      res.json({

        ok: true,

        user,

      });


    } catch (e) {

      console.error(
        "Error recuperando sesiÃ³n:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// MENÃš
// =========================================================


// =========================================================
// OBTENER MENÃš
// =========================================================

app.get(
  "/api/menu",
  async (req, res) => {

    try {

      const q =
        await pool.query(
          `
          SELECT
            id,
            nombre,
            precio,
            disponible,
            cafetin_id
          FROM productos
          WHERE cafetin_id = $1
          ORDER BY id
          `,
          [Number(req.query.cafeteriaId) || 1]
        );


      const menu =
        q.rows.map(
          (item) => ({

            id:
              item.id,

            nombre:
              item.nombre,

            precio:
              Number(
                item.precio
              ),

            disponible:
              Boolean(
                item.disponible
              ),

          })
        );


      res.json({

        ok: true,

        menu,

      });


    } catch (e) {

      console.error(
        "Error obteniendo menÃº:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// MODIFICAR PRODUCTO
// =========================================================
//
// Permite modificar:
// - disponible
// - nombre
// - precio
//
// El administrador debe enviar adminId.
// =========================================================

app.patch(
  "/api/menu/:id",
  async (req, res) => {

    try {

      const {
        adminId,
        disponible,
        nombre,
        precio,
      } =
        req.body || {};


      const isAdmin =
        await validateAdmin(pool, adminId);
      const adminCafetinId = await getAdminCafetinId(pool, adminId);


      if (!isAdmin) {

        return res
          .status(403)
          .json({
            error:
              "Permiso denegado. Solo el administrador puede modificar productos.",
          });
      }


      // Obtener producto actual

      const actual =
        await pool.query(
          `
          SELECT
            id,
            nombre,
            precio,
            disponible
          FROM productos
          WHERE id = $1 AND cafetin_id = $2
          `,
          [req.params.id, adminCafetinId]
        );


      if (
        !actual.rows.length
      ) {

        return res
          .status(404)
          .json({
            error:
              "Producto no encontrado.",
          });
      }


      const productoActual =
        actual.rows[0];


      // =====================================================
      // NOMBRE
      // =====================================================

      let nuevoNombre =
        productoActual.nombre;


      if (
        nombre !== undefined
      ) {

        if (
          typeof nombre !==
          "string" ||
          !nombre.trim()
        ) {

          return res
            .status(400)
            .json({
              error:
                "El nombre del producto no es vÃ¡lido.",
            });
        }


        nuevoNombre =
          nombre.trim();
      }


      // =====================================================
      // PRECIO
      // =====================================================

      let nuevoPrecio =
        Number(
          productoActual.precio
        );


      if (
        precio !== undefined
      ) {

        nuevoPrecio =
          Number(
            precio
          );


        if (
          !Number.isFinite(
            nuevoPrecio
          ) ||
          nuevoPrecio < 0
        ) {

          return res
            .status(400)
            .json({
              error:
                "El precio no es vÃ¡lido.",
            });
        }


        nuevoPrecio =
          r2(
            nuevoPrecio
          );
      }


      // =====================================================
      // DISPONIBILIDAD
      // =====================================================

      let nuevaDisponibilidad =
        Boolean(
          productoActual.disponible
        );


      if (
        disponible !==
        undefined
      ) {

        if (
          typeof disponible !==
          "boolean"
        ) {

          return res
            .status(400)
            .json({
              error:
                "La disponibilidad no es vÃ¡lida.",
            });
        }


        nuevaDisponibilidad =
          disponible;
      }


      // =====================================================
      // ACTUALIZAR
      // =====================================================

      const q =
        await pool.query(
          `
          UPDATE productos
          SET
            nombre = $1,
            precio = $2,
            disponible = $3
          WHERE id = $4 AND cafetin_id = $5
          RETURNING
            id,
            nombre,
            precio,
            disponible
          `,
          [
            nuevoNombre,
            nuevoPrecio,
            nuevaDisponibilidad,
            req.params.id,
            adminCafetinId,
          ]
        );


      const producto =
        q.rows[0];


      res.json({

        ok: true,

        producto,

      });


    } catch (e) {

      console.error(
        "Error modificando producto:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


 // =========================================================
 // ELIMINAR PRODUCTO â€” SOLO ADMINISTRADOR
 // =========================================================

app.delete("/api/menu/:id", async (req, res) => {
  try {
    const { adminId } = req.body || {};

    const isAdmin = await validateAdmin(pool, adminId);

    if (!isAdmin) {
      return res.status(403).json({
        error: "Solo el administrador puede eliminar productos."
      });
    }

    const productoId = Number(req.params.id);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({
        error: "Identificador de producto no vÃ¡lido."
      });
    }

    const cafeteriaId = await getAdminCafetinId(pool, adminId);

    const resultado = await pool.query(
      `DELETE FROM productos
       WHERE id = $1 AND cafetin_id = $2
       RETURNING id, nombre`,
      [productoId, cafeteriaId]
    );

    if (!resultado.rows.length) {
      return res.status(404).json({
        error: "Producto no encontrado en tu cafetÃ­n."
      });
    }

    return res.json({
      ok: true,
      mensaje: "Producto eliminado correctamente.",
      producto: resultado.rows[0]
    });

  } catch (error) {
    console.error("Error eliminando producto:", error);

    return res.status(500).json({
      error: "No se pudo eliminar el producto."
    });
  }
});


// =========================================================
// AGREGAR PRODUCTO
// =========================================================

app.post(
  "/api/menu",
  async (req, res) => {

    try {

      const {
        adminId,
        nombre,
        precio,
      } =
        req.body || {};


      const isAdmin =
        await validateAdmin(pool, adminId);
      const adminCafetinId = await getAdminCafetinId(pool, adminId);


      if (!isAdmin) {

        return res
          .status(403)
          .json({
            error:
              "Permiso denegado.",
          });
      }


      if (
        !nombre ||
        typeof nombre !==
          "string"
      ) {

        return res
          .status(400)
          .json({
            error:
              "El nombre del producto es obligatorio.",
          });
      }


      const precioNumero =
        Number(
          precio
        );


      if (
        !Number.isFinite(
          precioNumero
        ) ||
        precioNumero < 0
      ) {

        return res
          .status(400)
          .json({
            error:
              "El precio no es vÃ¡lido.",
          });
      }


      const q =
        await pool.query(
          `
          INSERT INTO productos
            (
              nombre,
              precio,
              disponible,
              cafetin_id
            )
          VALUES ($1, $2, true, $3)
          RETURNING
            id,
            nombre,
            precio,
            disponible
          `,
          [
            nombre.trim(),
            r2(precioNumero),
            adminCafetinId,
          ]
        );


      res.json({

        ok: true,

        producto:
          q.rows[0],

      });


    } catch (e) {

      console.error(
        "Error agregando producto:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// PEDIDOS
// =========================================================


// =========================================================
// CREAR PEDIDO
// =========================================================

app.post(
  "/api/order",
  async (req, res) => {

    const client =
      await pool.connect();


    let transactionStarted =
      false;


    try {

      const {
        user,
        items,
      } =
        req.body || {};


      // =====================================================
      // VALIDAR USUARIO
      // =====================================================

      if (
        !user ||
        !user.id
      ) {

        throw new Error(
          "Usuario no vÃ¡lido."
        );
      }


      const userQuery =
        await client.query(
          `
          SELECT
            id,
            nombre,
            correo,
            rol,
            saldo
          FROM usuarios
          WHERE id = $1
          `,
          [
            user.id,
          ]
        );


      if (
        !userQuery.rows.length
      ) {

        throw new Error(
          "El usuario no existe."
        );
      }


      const dbUser =
        userQuery.rows[0];


      if (
        normalizeRole(
          dbUser.rol
        ) !== "estudiante"
      ) {

        throw new Error(
          "Solo un estudiante puede realizar pedidos."
        );
      }


      // =====================================================
      // VALIDAR PRODUCTOS
      // =====================================================

      if (
        !Array.isArray(items) ||
        !items.length
      ) {

        throw new Error(
          "El pedido no contiene productos."
        );
      }


      const normalizedItems =
        [];


      let totalServer =
        0;


      // =====================================================
      // LEER PRODUCTOS DIRECTAMENTE DE POSTGRESQL
      // =====================================================

      for (
        const item of items
      ) {

        const productoId =
          item?.id;


        const cantidad =
          Number(
            item?.qty
          );


        if (
          productoId ===
            undefined ||
          productoId ===
            null
        ) {

          throw new Error(
            "Producto invÃ¡lido."
          );
        }


        if (
          !Number.isInteger(
            cantidad
          ) ||
          cantidad <= 0
        ) {

          throw new Error(
            "Cantidad de producto invÃ¡lida."
          );
        }


        const productoQuery =
          await client.query(
            `
            SELECT
              id,
              nombre,
              precio,
              disponible,
              cafetin_id
            FROM productos
            WHERE id = $1 AND cafetin_id = $2
            `,
            [productoId, Number(dbUser.cafetin_id) || 1]
          );


        if (
          !productoQuery.rows.length
        ) {

          throw new Error(
            "Uno de los productos ya no existe."
          );
        }


        const producto =
          productoQuery.rows[0];


        if (
          !producto.disponible
        ) {

          throw new Error(
            `El producto "${producto.nombre}" estÃ¡ agotado.`
          );
        }


        const precio =
          Number(
            producto.precio
          );


        totalServer +=
          precio *
          cantidad;


        normalizedItems.push({

          id:
            String(
              producto.id
            ),

          name:
            producto.nombre,

          price:
            precio,

          qty:
            cantidad,

        });
      }


      totalServer =
        r2(
          totalServer
        );


      if (
        totalServer <= 0
      ) {

        throw new Error(
          "El total del pedido no es vÃ¡lido."
        );
      }


      // =====================================================
      // INICIAR TRANSACCIÃ“N
      // =====================================================

      await client.query(
        "BEGIN"
      );


      transactionStarted =
        true;


      // =====================================================
      // DESCONTAR BILLETERA
      // =====================================================

      const saldoQuery =
        await client.query(
          `
          UPDATE usuarios
          SET
            saldo =
              saldo - $1
          WHERE
            id = $2
            AND saldo >= $1
          RETURNING
            saldo
          `,
          [
            totalServer,
            dbUser.id,
          ]
        );


      if (
        !saldoQuery.rows.length
      ) {

        throw new Error(
          "Saldo insuficiente."
        );
      }


      const nuevoSaldo =
        r2(
          saldoQuery
            .rows[0]
            .saldo
        );


      // =====================================================
      // GENERAR TURNO
      // =====================================================

      const contadorQuery =
        await client.query(
          `
          UPDATE contador_turno
          SET valor = valor + 1
          WHERE id = $1
          RETURNING
            valor
          `,
          [Number(dbUser.cafetin_id) || 1]
        );


      if (
        !contadorQuery.rows.length
      ) {

        throw new Error(
          "No se pudo obtener el nÃºmero de turno."
        );
      }


      const turno =
        contadorQuery
          .rows[0]
          .valor;


      // =====================================================
      // INSERTAR PEDIDO
      // =====================================================

      const pedidoQuery =
        await client.query(
          `
          INSERT INTO pedidos
            (
              numero_turno,
              usuario_id,
              total,
              estado,
              fecha,
              cafetin_id
            )
          VALUES ($1, $2, $3, 'Pendiente', NOW(), $4)
          RETURNING
            id,
            numero_turno,
            usuario_id,
            total,
            estado,
            fecha
          `,
          [
            turno,
            dbUser.id,
            totalServer,
            Number(dbUser.cafetin_id) || 1,
          ]
        );


      const pedido =
        pedidoQuery
          .rows[0];


      // =====================================================
      // INSERTAR DETALLES
      // =====================================================

      for (
        const item
          of normalizedItems
      ) {

        await client.query(
          `
          INSERT INTO pedidos_detalle
            (
              pedido_id,
              producto,
              precio,
              cantidad
            )
          VALUES
            (
              $1,
              $2,
              $3,
              $4
            )
          `,
          [
            pedido.id,
            item.name,
            r2(
              item.price
            ),
            item.qty,
          ]
        );
      }


      // =====================================================
      // CONFIRMAR
      // =====================================================

      await client.query(
        "COMMIT"
      );


      transactionStarted =
        false;


      // =====================================================
      // RESPUESTA
      // =====================================================

      res.json({

        ok: true,

        order: {

          id:
            pedido.id,

          number:
            pedido.numero_turno,

          usuario_id:
            pedido.usuario_id,

          estado:
            pedido.estado,

          fecha:
            pedido.fecha,

          items:
            normalizedItems,

          total:
            totalServer,

          saldo:
            nuevoSaldo,

        },

      });


    } catch (e) {

      if (
        transactionStarted
      ) {

        try {

          await client.query(
            "ROLLBACK"
          );

        } catch (
          rollbackError
        ) {

          console.error(
            "Error en rollback:",
            rollbackError
          );
        }
      }


      console.error(
        "Error creando pedido:",
        e
      );


      res
        .status(400)
        .json({
          error:
            e.message,
        });


    } finally {

      client.release();

    }
  }
);


// =========================================================
// OBTENER UN PEDIDO
// =========================================================

app.get(
  "/api/order/:id",
  async (req, res) => {

    try {

      const pedidoQuery =
        await pool.query(
          `
          SELECT
            p.id,
            p.numero_turno,
            p.usuario_id,
            p.total,
            p.estado,
            p.fecha,
            u.nombre AS student_name,
            u.correo
          FROM pedidos p
          JOIN usuarios u
            ON p.usuario_id = u.id
          WHERE p.id = $1
          `,
          [
            req.params.id,
          ]
        );


      if (
        !pedidoQuery.rows.length
      ) {

        return res
          .status(404)
          .json({
            error:
              "Pedido no encontrado.",
          });
      }


      const o =
        pedidoQuery
          .rows[0];


      const detalleQuery =
        await pool.query(
          `
          SELECT
            producto,
            precio,
            cantidad
          FROM pedidos_detalle
          WHERE pedido_id = $1
          `,
          [
            o.id,
          ]
        );


      const order = {

        id:
          o.id,

        number:
          o.numero_turno,

        usuario_id:
          o.usuario_id,

        total:
          r2(
            o.total
          ),

        estado:
          o.estado,

        fecha:
          o.fecha,

        student_name:
          o.student_name,

        correo:
          o.correo,

        items:
          detalleQuery.rows.map(
            (d) => ({

              name:
                d.producto,

              price:
                Number(
                  d.precio
                ),

              qty:
                Number(
                  d.cantidad
                ),

            })
          ),
      };


      res.json({

        ok: true,

        order,

      });


    } catch (e) {

      console.error(
        "Error obteniendo pedido:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// OBTENER PEDIDOS â€” ADMIN
// =========================================================

app.get(
  "/api/orders",
  async (req, res) => {

    try {

      const {
        adminId
      } =
        req.query;


      const isAdmin =
        await validateAdmin(
          pool,
          adminId
        );


      if (!isAdmin) {

        return res
          .status(403)
          .json({
            error:
              "Permiso denegado. Solo el administrador puede ver los pedidos.",
          });
      }


      const adminCafetinId = await getAdminCafetinId(pool, adminId);
      const q =
        await pool.query(
          `
          SELECT
            p.id,
            p.numero_turno,
            p.usuario_id,
            p.total,
            p.estado,
            p.fecha,
            u.nombre AS student_name,
            u.correo
          FROM pedidos p
          JOIN usuarios u
            ON p.usuario_id = u.id
          WHERE p.cafetin_id = $1 AND (
            p.estado <> 'Entregado'
            OR p.fecha >= (SELECT reiniciado_en FROM contador_turno WHERE id = $1)
          )
          ORDER BY
            p.fecha DESC
          `,
          [adminCafetinId]
        );


      const orders =
        await Promise.all(
          q.rows.map(
            async (o) => {

              const det =
                await pool.query(
                  `
                  SELECT
                    producto,
                    precio,
                    cantidad
                  FROM pedidos_detalle
                  WHERE pedido_id = $1
                  `,
                  [
                    o.id,
                  ]
                );


              return {

                id:
                  o.id,

                numero_turno:
                  o.numero_turno,

                usuario_id:
                  o.usuario_id,

                total:
                  r2(
                    o.total
                  ),

                estado:
                  o.estado,

                fecha:
                  o.fecha,

                student_name:
                  o.student_name,

                correo:
                  o.correo,

                items:
                  det.rows.map(
                    (d) => ({

                      name:
                        d.producto,

                      price:
                        Number(
                          d.precio
                        ),

                      qty:
                        Number(
                          d.cantidad
                        ),

                    })
                  ),
              };
            }
          )
        );


      res.json({

        ok: true,

        orders,

      });


    } catch (e) {

      console.error(
        "Error obteniendo pedidos:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// CAMBIAR ESTADO DEL PEDIDO
// =========================================================

app.patch(
  "/api/order/:id/status",
  async (req, res) => {

    try {

      const {
        status,
        adminId,
      } =
        req.body || {};


      // =====================================================
      // VALIDAR ADMIN
      // =====================================================

      const isAdmin =
        await validateAdmin(
          pool,
          adminId
        );


      if (!isAdmin) {

        return res
          .status(403)
          .json({
            error:
              "Solo el administrador puede cambiar el estado.",
          });
      }


      // =====================================================
      // ESTADOS PERMITIDOS
      // =====================================================

      const estadosValidos = [

        "Pendiente",

        "Listo para retirar",

        "Entregado",

      ];


      if (
        !estadosValidos.includes(
          status
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "Estado de pedido no vÃ¡lido.",
          });
      }


      // =====================================================
      // ACTUALIZAR
      // =====================================================

      const adminCafetinId = await getAdminCafetinId(pool, adminId);
      const q =
        await pool.query(
          `
          UPDATE pedidos
          SET estado = $1
          WHERE id = $2 AND cafetin_id = $3
          RETURNING
            id,
            estado
          `,
          [
            status,
            req.params.id,
            adminCafetinId,
          ]
        );


      if (
        !q.rows.length
      ) {

        return res
          .status(404)
          .json({
            error:
              "Pedido no encontrado.",
          });
      }


      res.json({

        ok: true,

        pedido:
          q.rows[0],

      });


    } catch (e) {

      console.error(
        "Error actualizando estado:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// CUENTAS â€” ADMIN
// =========================================================

app.get(
  "/api/accounts",
  async (req, res) => {

    try {

      const {
        adminId
      } =
        req.query;


      // =====================================================
      // VALIDAR ADMIN
      // =====================================================

      const isAdmin =
        await validateAdmin(
          pool,
          adminId
        );


      if (!isAdmin) {

        return res
          .status(403)
          .json({
            error:
              "Permiso denegado.",
          });
      }


      
const adminCafetinId = await getAdminCafetinId(pool, adminId);

const q = await pool.query(
  `
  SELECT
    u.id,
    u.nombre,
    u.correo,
    u.rol,
    u.saldo,
    u.cafetin_id,
    COUNT(p.id) AS pedidos
  FROM usuarios u
 LEFT JOIN pedidos p
  ON u.id = p.usuario_id
  AND p.cafetin_id = u.cafetin_id
WHERE u.cafetin_id = $1
  GROUP BY u.id
  ORDER BY u.nombre
  `,
  [adminCafetinId]
);


      const accounts =
        q.rows.map(
          (a) => ({

            id:
              a.id,

            nombre:
              a.nombre,

            correo:
              a.correo,

            rol:
              normalizeRole(
                a.rol
              ),

            saldo: Number(a.saldo || 0),
            cafetin_id: Number(a.cafetin_id || 1),

            pedidos:
              Number(
                a.pedidos || 0
              ),

          })
        );


      res.json({

        ok: true,

        accounts,

      });


    } catch (e) {

      console.error(
        "Error obteniendo cuentas:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// MODIFICAR SALDO â€” ADMIN
// =========================================================

app.patch(
  "/api/account/:id",
  async (req, res) => {

    try {

      const {
        saldo,
        adminId,
      } =
        req.body || {};


      // =====================================================
      // VALIDAR ADMIN
      // =====================================================

      const isAdmin =
        await validateAdmin(
          pool,
          adminId
        );


      if (!isAdmin) {

        return res
          .status(403)
          .json({
            error:
              "Permiso denegado. Solo el administrador puede modificar saldos.",
          });
      }


      // =====================================================
      // VALIDAR MONTO
      // =====================================================

      const saldoNumero =
        Number(
          saldo
        );


      if (
        !Number.isFinite(
          saldoNumero
        ) ||
        saldoNumero < 0
      ) {

        return res
          .status(400)
          .json({
            error:
              "Monto invÃ¡lido.",
          });
      }


      // =====================================================
      // BUSCAR CUENTA DESTINO
      // =====================================================

      const adminCafetinId = await getAdminCafetinId(pool, adminId);
      const target =
        await pool.query(
          `
          SELECT id, nombre, correo, rol, saldo, cafetin_id
          FROM usuarios
          WHERE id = $1 AND cafetin_id = $2
          `,
          [
            req.params.id,
            adminCafetinId,
          ]
        );


      if (
        !target.rows.length
      ) {

        return res
          .status(404)
          .json({
            error:
              "La cuenta no existe.",
          });
      }


      // =====================================================
      // NO MODIFICAR LA CUENTA ADMIN
      // =====================================================

      if (
        normalizeRole(
          target.rows[0].rol
        ) ===
        "cafetin"
      ) {

        return res
          .status(403)
          .json({
            error:
              "El saldo del administrador no se puede modificar desde este panel.",
          });
      }


      // =====================================================
      // ACTUALIZAR SALDO
      // =====================================================

      const q =
        await pool.query(
          `
          UPDATE usuarios
          SET
            saldo = $1
          WHERE id = $2 AND cafetin_id = $3
          RETURNING id, nombre, correo, rol, saldo
          `,
          [
            r2(saldoNumero),
            req.params.id,
            adminCafetinId,
          ]
        );


      const user = {

        ...q.rows[0],

        rol:
          normalizeRole(
            q.rows[0].rol
          ),

        saldo:
          Number(
            q.rows[0].saldo ||
            0
          ),
      };


      res.json({

        ok: true,

        user,

      });


    } catch (e) {

      console.error(
        "Error actualizando saldo:",
        e
      );


      res
        .status(500)
        .json({
          error:
            e.message,
        });
    }
  }
);


// =========================================================
// TURNOS
// =========================================================

// PrÃ³ximo turno que se entregarÃ¡ (pÃºblico: se muestra en la portada)
app.get("/api/turno", async (req, res) => {
  try {
    const cafeteriaId = Number(req.query.cafeteriaId) || 1;
    const q = await pool.query("SELECT valor FROM contador_turno WHERE id = $1", [cafeteriaId]);

    const actual = q.rows.length ? Number(q.rows[0].valor) : 0;

    res.json({ ok: true, actual, siguiente: actual + 1 });
  } catch (e) {
    console.error("Error leyendo turno:", e);
    res.status(500).json({ error: e.message });
  }
});

// Reiniciar turnos (solo administrador): el prÃ³ximo pedido serÃ¡ el 1
app.post("/api/turno/reset", async (req, res) => {
  try {
    const { adminId } = req.body || {};

    if (!(await validateAdmin(pool, adminId))) {
      return res.status(403).json({
        error: "Solo el administrador puede reiniciar los turnos.",
      });
    }

    const cafeteriaId = await getAdminCafetinId(pool, adminId);
    await pool.query(
      `INSERT INTO contador_turno (id, valor, reiniciado_en)
       VALUES ($1, 0, NOW()) ON CONFLICT (id)
       DO UPDATE SET valor = 0, reiniciado_en = NOW()`, [cafeteriaId]
    );

    res.json({ ok: true, actual: 0, siguiente: 1 });
  } catch (e) {
    console.error("Error reiniciando turno:", e);
    res.status(500).json({ error: e.message });
  }
});


// =========================================================
// PRUEBA DE CONEXIÃ“N
// =========================================================

app.get(
  "/api/health",
  async (req, res) => {

    try {

      const q =
        await pool.query(
          "SELECT NOW() AS fecha"
        );


      res.json({

        ok: true,

        servidor:
          "funcionando",

        postgresql:
          "conectado",

        fecha:
          q.rows[0].fecha,

      });


    } catch (e) {

      res
        .status(500)
        .json({

          ok: false,

          servidor:
            "funcionando",

          postgresql:
            "error",

          error:
            e.message,

        });
    }
  }
);


// =========================================================
// RUTA PRINCIPAL
// =========================================================

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "Index.html"
      )
    );
  }
);


// =========================================================
// MANEJO DE RUTA NO ENCONTRADA
// =========================================================

app.use(
  (req, res) => {

    res
      .status(404)
      .json({
        error:
          "Ruta no encontrada.",
      });
  }
);


// =========================================================
// MANEJO GENERAL DE ERRORES
// =========================================================

app.use(
  (err, req, res, next) => {

    console.error(
      "Error general:",
      err
    );


    res
      .status(500)
      .json({
        error:
          "Error interno del servidor.",
      });
  }
);


// =========================================================
// PREPARAR BASE DE DATOS (tablas + datos iniciales)
// =========================================================
//
// Es seguro ejecutarlo siempre: usa IF NOT EXISTS y no pisa datos.
// Garantiza que exista la cuenta del administrador.
// =========================================================

const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || "admin@cafetin.edu.sv"
).toLowerCase();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafeterias (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE
    );
   
INSERT INTO cafeterias (id, nombre) VALUES
  (1, 'CafetÃ­n 1'), (2, 'CafetÃ­n 2'), (3, 'CafetÃ­n 3')
  ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS usuarios (
      id         SERIAL PRIMARY KEY,
      nombre     TEXT NOT NULL,
      correo     TEXT NOT NULL,
      contrasena TEXT NOT NULL,
      rol        TEXT NOT NULL DEFAULT 'estudiante',
      saldo      NUMERIC(10,2) NOT NULL DEFAULT 0,
      cafetin_id INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id)
    );

    CREATE TABLE IF NOT EXISTS productos (
      id         SERIAL PRIMARY KEY,
      nombre     TEXT NOT NULL,
      precio     NUMERIC(10,2) NOT NULL DEFAULT 0,
      disponible BOOLEAN NOT NULL DEFAULT TRUE,
      cafetin_id INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id)
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id           SERIAL PRIMARY KEY,
      numero_turno INTEGER NOT NULL,
      usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
      total        NUMERIC(10,2) NOT NULL DEFAULT 0,
      estado       TEXT NOT NULL DEFAULT 'Pendiente',
      fecha        TIMESTAMP NOT NULL DEFAULT NOW(),
      cafetin_id INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id)
    );

    CREATE TABLE IF NOT EXISTS pedidos_detalle (
      id        SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      producto  TEXT NOT NULL,
      precio    NUMERIC(10,2) NOT NULL,
      cantidad  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contador_turno (
      id    INTEGER PRIMARY KEY,
      valor INTEGER NOT NULL DEFAULT 0
    );
  `);

  // MigraciÃ³n compatible con la base existente.
  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cafetin_id INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id);
    ALTER TABLE productos ADD COLUMN IF NOT EXISTS cafetin_id INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cafetin_id INTEGER NOT NULL DEFAULT 1 REFERENCES cafeterias(id);
    ALTER TABLE contador_turno ADD COLUMN IF NOT EXISTS reiniciado_en TIMESTAMP NOT NULL DEFAULT '1970-01-01';
    INSERT INTO contador_turno (id, valor, reiniciado_en) VALUES (1,0,NOW()),(2,0,NOW()),(3,0,NOW()) ON CONFLICT (id) DO NOTHING;
  `);
  // La cuenta histÃ³rica sigue perteneciendo al CafetÃ­n 1.
  await pool.query("UPDATE usuarios SET cafetin_id = 1 WHERE cafetin_id IS NULL");
  await pool.query("UPDATE productos SET cafetin_id = 1 WHERE cafetin_id IS NULL");
  await pool.query("UPDATE pedidos SET cafetin_id = 1 WHERE cafetin_id IS NULL");

  // Columna para saber desde cuÃ¡ndo empezÃ³ el ciclo de turnos actual
  await pool.query(
    `ALTER TABLE contador_turno
     ADD COLUMN IF NOT EXISTS reiniciado_en TIMESTAMP NOT NULL
     DEFAULT '1970-01-01'`
  );

  // Contador de turnos
  await pool.query(
    `INSERT INTO contador_turno (id, valor) VALUES (1, 0)
     ON CONFLICT (id) DO NOTHING`
  );

  // Cuenta del administrador
  
const admin = await pool.query(
  "SELECT id FROM usuarios WHERE lower(correo) = $1",
  [ADMIN_EMAIL]
);

if (!admin.rows.length) {
  if (!ADMIN_PASSWORD) {
    throw new Error(
      "Falta configurar ADMIN_PASSWORD para crear el administrador."
    );
  }

  const adminPasswordHash = await bcrypt.hash(
    ADMIN_PASSWORD,
    12
  );

  await pool.query(
    `INSERT INTO usuarios
      (nombre, correo, contrasena, rol, saldo)
     VALUES ('Administrador', $1, $2, 'cafetin', 0)`,
    [ADMIN_EMAIL, adminPasswordHash]
  );
} else {
  // El administrador ya existe: no modificar su contraseÃ±a.
}
    
    // Restablecer la contraseÃ±a solo si se solicita explÃ­citamente.
    if (process.env.RESET_ADMIN === "1") {
      if (!ADMIN_PASSWORD) {
        throw new Error(
          "No se puede restablecer la contraseÃ±a: falta configurar ADMIN_PASSWORD."
        );
      }

      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

      const resultado = await pool.query(
        "UPDATE usuarios SET contrasena = $1 WHERE lower(correo) = lower($2)",
        [passwordHash, ADMIN_EMAIL]
      );

      if (resultado.rowCount === 0) {
        throw new Error(
          "No se encontrÃ³ el administrador para restablecer la contraseÃ±a."
        );
      }

      console.log("ContraseÃ±a del administrador restablecida con bcrypt.");
    }

 
  // Administradores independientes por cafetÃ­n.
  // No modificar automÃ¡ticamente cuentas existentes.
  const administradoresCafetin = [
    {
      id: 2,
      email: process.env.ADMIN2_EMAIL || 'admin2@cafetin.edu.sv',
      password: process.env.ADMIN2_PASSWORD,
      name: 'Administrador CafetÃ­n 2'
    },
    {
      id: 3,
      email: process.env.ADMIN3_EMAIL || 'admin3@cafetin.edu.sv',
      password: process.env.ADMIN3_PASSWORD,
      name: 'Administrador CafetÃ­n 3'
    }
  ];

  
  for (const a of administradoresCafetin) {
    const existente = await pool.query(
      'SELECT id FROM usuarios WHERE lower(correo) = lower($1) LIMIT 1',
      [a.email]
    );

    // Si la cuenta ya existe, no modificarla.
    if (existente.rows.length) {
      continue;
    }

    // Solo crear la cuenta si hay una contraseÃ±a configurada.
    if (!a.password) {
      console.log(
        `No se creÃ³ ${a.email}: falta configurar su contraseÃ±a.`
      );
      continue;
    }

    
    const passwordHash = await bcrypt.hash(a.password, 12);

    await pool.query(
      `INSERT INTO usuarios
        (nombre, correo, contrasena, rol, saldo, cafetin_id)
       VALUES ($1, $2, $3, 'cafetin', 0, $4)`,
      [a.name, a.email, passwordHash, a.id]
    );

  }

  
// Estudiante de demostraciÃ³n: solo en desarrollo local.
if (process.env.NODE_ENV !== "production") {
  const demoEmail = "maria@colegio.edu.sv";

  const demoExists = await pool.query(
    `SELECT 1
     FROM usuarios
     WHERE lower(correo) = lower($1)
     LIMIT 1`,
    [demoEmail]
  );

  if (demoExists.rows.length === 0) {
    const demoPasswordHash = await bcrypt.hash("1234", 12);

    await pool.query(
      `INSERT INTO usuarios
        (nombre, correo, contrasena, rol, saldo)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "MarÃ­a HernÃ¡ndez",
        demoEmail,
        demoPasswordHash,
        "estudiante",
        10,
      ]
    );
  }
}
  
  // MenÃº inicial: crear productos de ejemplo solo en desarrollo.
  if (process.env.NODE_ENV !== 'production') {
    const prod = await pool.query(
      "SELECT COUNT(*)::int AS n FROM productos"
    );

    if (prod.rows[0].n === 0) {
      await pool.query(
        `INSERT INTO productos (nombre, precio, disponible, cafetin_id)
         VALUES
          ('Pupusa de queso', 0.50, true, 1),
          ('Pan con pollo', 1.25, true, 1),
          ('SÃ¡ndwich de jamÃ³n', 1.00, true, 1),
          ('Refresco natural', 0.50, true, 1),
          ('Jugo de cajita', 0.40, true, 1),
          ('Galletas', 0.25, true, 1)`
      );
    }
  }



// Cierre de la funciÃ³n initDatabase
}
// =========================================================
// INICIAR SERVIDOR
// =========================================================

async function start() {
  console.log("=================================================");
  console.log(" TIQUETE â€” SERVIDOR");

  try {
    await initDatabase();
    console.log(" PostgreSQL: conectado y tablas listas");
    } catch (e) {
    console.error("PostgreSQL: ERROR ->", e.message);
    console.error("No se iniciarÃ¡ el servidor porque fallÃ³ la inicializaciÃ³n de la base de datos.");
    process.exit(1);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(` En esta computadora: http://localhost:${PORT}`);

    // Direcciones para abrir desde el telÃ©fono (misma red Wi-Fi)
    Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal)
      .forEach((n) =>
        console.log(` Desde el telÃ©fono:     http://${n.address}:${PORT}`)
      );

    console.log("=================================================");
  });
}

start();
