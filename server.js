// =========================================================
// TIQUETE — Servidor
// Node.js + Express + PostgreSQL
// =========================================================

const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();

const PORT = 8123;


// =========================================================
// CONEXIÓN POSTGRESQL
// =========================================================

const pool = new Pool({
  user: "postgres",
  host: "127.0.0.1",
  database: "tiquete",
  password: "tiquete123",
  port: 5432,
});


// =========================================================
// CONFIGURACIÓN
// =========================================================

app.use(
  express.json()
);

app.use(
  express.static(
    __dirname
  )
);


const r2 = (n) =>
  Math.round(
    Number(n || 0) * 100
  ) / 100;


// =========================================================
// VALIDAR ADMIN
// =========================================================

async function validateAdmin(
  db,
  adminId
) {

  if (!adminId) {

    return false;
  }


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


  return (
    q.rows.length > 0 &&
    q.rows[0].rol ===
      "cafetin"
  );
}


// =========================================================
// AUTENTICACIÓN
// =========================================================


// -------------------- LOGIN --------------------

app.post(
  "/api/login",
  async (req, res) => {

    try {

      const {
        email,
        password,
        expectRole,
      } = req.body || {};


      if (
        !email ||
        !password
      ) {

        return res
          .status(400)
          .json({
            error:
              "Faltan datos.",
          });
      }


      const q =
        await pool.query(
          `
          SELECT
            id,
            nombre,
            correo,
            rol,
            saldo
          FROM usuarios
          WHERE lower(correo) =
                lower($1)
            AND contrasena = $2
          `,
          [
            email,
            password,
          ]
        );


      if (!q.rows.length) {

        return res
          .status(401)
          .json({
            error:
              "Credenciales incorrectas.",
          });
      }


      const user =
        q.rows[0];


      if (
        expectRole &&
        user.rol !==
          expectRole
      ) {

        return res
          .status(403)
          .json({
            error:
              "Rol incorrecto para este acceso.",
          });
      }


      res.json({

        ok: true,

        user,

      });


    } catch (e) {

      console.error(
        "Error en login:",
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


// -------------------- REGISTRO --------------------

app.post(
  "/api/register",
  async (req, res) => {

    try {

      const {
        name,
        email,
        password,
      } =
        req.body || {};


      if (
        !name ||
        !email ||
        !password ||
        password.length < 4
      ) {

        return res
          .status(400)
          .json({
            error:
              "Datos incompletos.",
          });
      }


      const existe =
        await pool.query(
          `
          SELECT 1
          FROM usuarios
          WHERE lower(correo) =
                lower($1)
          `,
          [email]
        );


      if (
        existe.rows.length
      ) {

        return res
          .status(409)
          .json({
            error:
              "Correo ya registrado.",
          });
      }


      const q =
        await pool.query(
          `
          INSERT INTO usuarios
            (
              nombre,
              correo,
              contrasena,
              rol,
              saldo
            )
          VALUES
            (
              $1,
              $2,
              $3,
              'estudiante',
              10
            )
          RETURNING
            id,
            nombre,
            correo,
            rol,
            saldo
          `,
          [
            name.trim(),
            email.trim(),
            password,
          ]
        );


      res.json({

        ok: true,

        user:
          q.rows[0],

      });


    } catch (e) {

      console.error(
        "Error en registro:",
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
// SESIÓN
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
            saldo
          FROM usuarios
          WHERE id = $1
          `,
          [req.params.id]
        );


      if (!q.rows.length) {

        return res
          .status(404)
          .json({
            error:
              "Sesión expirada.",
          });
      }


      res.json({

        ok: true,

        user:
          q.rows[0],

      });


    } catch (e) {

      console.error(
        "Error recuperando sesión:",
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
// MENÚ
// =========================================================


// -------------------- OBTENER MENÚ --------------------

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
            disponible
          FROM productos
          ORDER BY id
          `
        );


      res.json({

        ok: true,

        menu:
          q.rows,

      });


    } catch (e) {

      console.error(
        "Error obteniendo menú:",
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


// -------------------- CAMBIAR DISPONIBILIDAD --------------------

app.patch(
  "/api/menu/:id",
  async (req, res) => {

    try {

      const {
        adminId,
        disponible,
      } =
        req.body || {};


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


      if (
        typeof disponible !==
        "boolean"
      ) {

        return res
          .status(400)
          .json({
            error:
              "El estado de disponibilidad no es válido.",
          });
      }


      const q =
        await pool.query(
          `
          UPDATE productos
          SET disponible = $1
          WHERE id = $2
          RETURNING
            id,
            nombre,
            precio,
            disponible
          `,
          [
            disponible,
            req.params.id,
          ]
        );


      if (!q.rows.length) {

        return res
          .status(404)
          .json({
            error:
              "Producto no encontrado.",
          });
      }


      res.json({

        ok: true,

        producto:
          q.rows[0],

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


// -------------------- AGREGAR PRODUCTO --------------------

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
              "El precio no es válido.",
          });
      }


      const q =
        await pool.query(
          `
          INSERT INTO productos
            (
              nombre,
              precio
            )
          VALUES
            (
              $1,
              $2
            )
          RETURNING
            id,
            nombre,
            precio,
            disponible
          `,
          [
            nombre.trim(),
            r2(
              precioNumero
            ),
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
          "Usuario no válido."
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
          [user.id]
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
        dbUser.rol !==
        "estudiante"
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
            "Producto inválido."
          );
        }


        if (
          !Number.isInteger(
            cantidad
          ) ||
          cantidad <= 0
        ) {

          throw new Error(
            "Cantidad de producto inválida."
          );
        }


        const productoQuery =
          await client.query(
            `
            SELECT
              id,
              nombre,
              precio,
              disponible
            FROM productos
            WHERE id = $1
            `,
            [
              productoId,
            ]
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
            `El producto "${producto.nombre}" está agotado.`
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
          "El total del pedido no es válido."
        );
      }


      // =====================================================
      // INICIAR TRANSACCIÓN
      // =====================================================

      await client.query(
        "BEGIN"
      );


      transactionStarted =
        true;


      // =====================================================
      // DESCONTAR SALDO
      // =====================================================

      const saldoQuery =
        await client.query(
          `
          UPDATE usuarios
          SET saldo =
              saldo - $1
          WHERE id = $2
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
          SET valor =
              valor + 1
          WHERE id = 1
          RETURNING
            valor
          `
        );


      if (
        !contadorQuery.rows.length
      ) {

        throw new Error(
          "No se pudo obtener el número de turno."
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
              fecha
            )
          VALUES
            (
              $1,
              $2,
              $3,
              'Pendiente',
              NOW()
            )
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
      // COMMIT
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
            ON p.usuario_id =
               u.id
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
        pedidoQuery.rows[0];


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
    [o.id]
  );


      const order = {

        id:
          o.id,

        number:
          o.numero_turno,

        usuario_id:
          o.usuario_id,

        total:
          r2(o.total),

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
// OBTENER TODOS LOS PEDIDOS — ADMIN
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
              "Permiso denegado.",
          });
      }


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
            ON p.usuario_id =
               u.id
          ORDER BY
            p.fecha DESC
          `
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
    [o.id]
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
              "Estado de pedido no válido.",
          });
      }


      const q =
        await pool.query(
          `
          UPDATE pedidos
          SET estado = $1
          WHERE id = $2
          RETURNING
            id,
            estado
          `,
          [
            status,
            req.params.id,
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
// CUENTAS — ADMIN
// =========================================================

app.get(
  "/api/accounts",
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
              "Permiso denegado.",
          });
      }


      const q =
        await pool.query(
          `
          SELECT
            u.id,
            u.nombre,
            u.correo,
            u.rol,
            u.saldo,
            COUNT(p.id) AS pedidos
          FROM usuarios u
          LEFT JOIN pedidos p
            ON u.id =
               p.usuario_id
          GROUP BY
            u.id
          ORDER BY
            u.nombre
          `
        );


      res.json({

        ok: true,

        accounts:
          q.rows,

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
// MODIFICAR SALDO — ADMIN
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
              "Permiso denegado. Solo el administrador del cafetín puede modificar saldos.",
          });
      }


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
              "Monto inválido.",
          });
      }


      // =====================================================
      // EVITAR MODIFICAR LA CUENTA ADMINISTRADORA
      // =====================================================

      const target =
        await pool.query(
          `
          SELECT
            id,
            rol
          FROM usuarios
          WHERE id = $1
          `,
          [
            req.params.id,
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


      if (
        target.rows[0].rol ===
        "cafetin"
      ) {

        return res
          .status(403)
          .json({
            error:
              "El saldo del administrador no se puede modificar desde este panel.",
          });
      }


      const q =
        await pool.query(
          `
          UPDATE usuarios
          SET saldo = $1
          WHERE id = $2
          RETURNING
            id,
            nombre,
            correo,
            rol,
            saldo
          `,
          [
            r2(
              saldoNumero
            ),
            req.params.id,
          ]
        );


      res.json({

        ok: true,

        user:
          q.rows[0],

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
// RUTA PRINCIPAL
// =========================================================

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);


// =========================================================
// INICIAR SERVIDOR
// =========================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Tiquete corriendo en http://127.0.0.1:${PORT}`
    );

  }
);