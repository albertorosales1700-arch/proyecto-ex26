# Tiquete — Preventa del cafetín INTI

```
tiquete/
├─ public/            ← lo que ve el navegador (se sube a Firebase Hosting)
│  ├─ index.html  script.js  styles.css
│  ├─ config.js       ← aquí se pega la URL del servidor
│  └─ img/            ← logo-inti.jpeg, cocodrilo.png, cocodrilo.svg
├─ server.js          ← API (Express + PostgreSQL). Se sube a Render, NO a Firebase
├─ db/                ← actualizar.sql y actualizar-db.js (opcionales)
├─ firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
└─ package.json  .env.example  .gitignore
```

**Cómo encaja todo:** Firebase Hosting solo sirve archivos estáticos, así que la web
vive en `aipac-70d92.web.app` y el servidor (login, pedidos, turnos) en Render,
con la base de datos en Neon. Los tres tienen plan gratuito.

## 1. Probar en tu computadora

1. Ten PostgreSQL encendido con una base llamada `tiquete`.
2. `npm install`
3. `npm start` → abre http://localhost:8123

Cuentas de prueba (solo en local): `admin@cafetin.edu.sv` / `admin123` y `maria@colegio.edu.sv` / `1234`.

## 2. Base de datos en la nube (Neon)

1. Crea un proyecto en https://neon.tech y una base llamada `tiquete`.
2. Copia la *connection string* (`postgres://...?sslmode=require`).

## 3. Servidor en Render

1. Sube esta carpeta a GitHub (`.env` no se sube; ya está en `.gitignore`).
2. En https://render.com → **New → Web Service** → elige el repositorio.
3. Build command: `npm install` · Start command: `npm start`
4. En **Environment** agrega las variables de `.env.example`
   (`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD`, `NODE_ENV=production`).
5. Cuando termine, abre `https://TU-SERVICIO.onrender.com/api/health`: debe decir `"postgresql": "conectado"`.

> El plan gratuito de Render "duerme" tras unos minutos sin uso; la primera visita puede tardar ~30 s.

## 4. Publicar la web en Firebase

1. Edita `public/config.js` y cambia `https://TU-SERVICIO.onrender.com` por la URL real de Render.
2. Desde esta carpeta (la que contiene `firebase.json`):

```
firebase deploy --only hosting,firestore
```

Debe decir `found N files in public` con todos tus archivos (`index.html`, `script.js`, `styles.css`, `config.js` e `img/`).

## Seguridad

- Las contraseñas se guardan con hash (scrypt). Las cuentas antiguas en texto plano se convierten solas la próxima vez que inicien sesión.
- La sesión es un token firmado que dura 12 horas; los permisos de administrador salen del token, no de datos que envía el navegador.
- Después de 8 intentos fallidos de login se bloquea esa combinación IP + correo por 15 minutos.
- Firestore queda cerrado por completo (la app no lo usa).
- En producción no se crea la cuenta demo de María y, si no defines contraseñas de administrador, se generan al azar y se muestran una vez en el log de Render.
