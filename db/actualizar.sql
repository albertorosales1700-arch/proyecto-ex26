-- =========================================================
-- TIQUETE — ACTUALIZACIÓN DE LA BASE DE DATOS
-- Conserva los datos existentes
--
-- Lo ejecuta db/actualizar-db.js (dentro de una transacción).
-- Si lo corres a mano con psql, usa:  psql -1 -f db/actualizar.sql tiquete
-- Las cuentas de administrador y demo las crea server.js al arrancar,
-- con la contraseña protegida con hash.
-- =========================================================



-- =========================================================
-- 1. USUARIOS
-- =========================================================

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS nombre TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS correo TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS contrasena TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS rol TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS saldo NUMERIC(10,2);


-- Valores por defecto para datos existentes
UPDATE usuarios
SET rol = 'estudiante'
WHERE rol IS NULL OR TRIM(rol) = '';

UPDATE usuarios
SET saldo = 0
WHERE saldo IS NULL;


-- =========================================================
-- 2. ADMINISTRADOR
-- =========================================================

UPDATE usuarios
SET rol = 'cafetin'
WHERE LOWER(TRIM(correo)) =
      LOWER('admin@cafetin.edu.sv');


-- =========================================================
-- 3. PRODUCTOS
-- =========================================================

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS nombre TEXT;

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS precio NUMERIC(10,2);

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS disponible BOOLEAN;


UPDATE productos
SET precio = 0
WHERE precio IS NULL;

UPDATE productos
SET disponible = TRUE
WHERE disponible IS NULL;


-- =========================================================
-- 4. PEDIDOS
-- =========================================================

ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS numero_turno INTEGER;

ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS usuario_id INTEGER;

ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS total NUMERIC(10,2);

ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS estado TEXT;

ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS fecha TIMESTAMP;


UPDATE pedidos
SET total = 0
WHERE total IS NULL;

UPDATE pedidos
SET estado = 'Pendiente'
WHERE estado IS NULL
   OR estado NOT IN (
       'Pendiente',
       'Listo para retirar',
       'Entregado'
   );

UPDATE pedidos
SET fecha = NOW()
WHERE fecha IS NULL;


-- =========================================================
-- 5. DETALLE DE PEDIDOS
-- =========================================================

ALTER TABLE pedidos_detalle
ADD COLUMN IF NOT EXISTS pedido_id INTEGER;

ALTER TABLE pedidos_detalle
ADD COLUMN IF NOT EXISTS producto TEXT;

ALTER TABLE pedidos_detalle
ADD COLUMN IF NOT EXISTS precio NUMERIC(10,2);

ALTER TABLE pedidos_detalle
ADD COLUMN IF NOT EXISTS cantidad INTEGER;


UPDATE pedidos_detalle
SET precio = 0
WHERE precio IS NULL;

UPDATE pedidos_detalle
SET cantidad = 1
WHERE cantidad IS NULL;


-- =========================================================
-- 6. CONTADOR DE TURNOS
-- =========================================================

CREATE TABLE IF NOT EXISTS contador_turno (
    id INTEGER PRIMARY KEY,
    valor INTEGER NOT NULL DEFAULT 0
);


INSERT INTO contador_turno (
    id,
    valor
)
VALUES (
    1,
    0
)
ON CONFLICT (id)
DO NOTHING;


-- =========================================================
-- 7. AJUSTAR EL CONTADOR AL ÚLTIMO TURNO EXISTENTE
-- =========================================================

UPDATE contador_turno
SET valor = GREATEST(
    valor,
    COALESCE(
        (
            SELECT MAX(numero_turno)
            FROM pedidos
        ),
        0
    )
)
WHERE id = 1;


-- =========================================================
-- 8. ÍNDICES PARA LOS PEDIDOS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_usuario
ON pedidos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado
ON pedidos(estado);

CREATE INDEX IF NOT EXISTS idx_pedidos_fecha
ON pedidos(fecha);

CREATE INDEX IF NOT EXISTS idx_pedidos_detalle
ON pedidos_detalle(pedido_id);

CREATE INDEX IF NOT EXISTS idx_productos_disponible
ON productos(disponible);


-- =========================================================
-- 9. COMPROBACIÓN
-- =========================================================

SELECT
    id,
    nombre,
    correo,
    rol,
    saldo
FROM usuarios
ORDER BY id;


SELECT
    id,
    nombre,
    precio,
    disponible
FROM productos
ORDER BY id;


SELECT
    id,
    numero_turno,
    usuario_id,
    total,
    estado,
    fecha
FROM pedidos
ORDER BY fecha DESC;


SELECT
    id,
    valor
FROM contador_turno;
