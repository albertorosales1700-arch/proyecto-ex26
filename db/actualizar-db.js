// Actualiza la base de datos conservando los datos existentes.
//   Local:      npm run db:actualizar
//   En la nube: DATABASE_URL="postgres://..." npm run db:actualizar
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
      }
    : {
        user: process.env.PGUSER || "postgres",
        host: process.env.PGHOST || "127.0.0.1",
        database: process.env.PGDATABASE || "tiquete",
        password: process.env.PGPASSWORD || "tiquete123",
        port: Number(process.env.PGPORT) || 5432,
      }
);

async function actualizarBaseDatos() {
  const archivoSQL = path.join(__dirname, "actualizar.sql");

  if (!fs.existsSync(archivoSQL)) {
    console.error("❌ No se encontró el archivo actualizar.sql");
    process.exitCode = 1;
    return;
  }

  const sql = fs.readFileSync(archivoSQL, "utf8");
  const client = await pool.connect();

  try {
    console.log("🔄 Conectando a PostgreSQL...");

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    console.log("✅ Base de datos actualizada correctamente.");
    console.log("✅ Los datos existentes fueron conservados.");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("❌ Error al actualizar la base de datos:");
    console.error(error.message);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

actualizarBaseDatos();
