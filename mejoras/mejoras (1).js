// =========================================================
// TIQUETE — Mejoras del frontend
// Se carga DESPUÉS de script.js (usa state, api, toast, money, etc.)
//  - Panel de estadísticas (admin)
//  - Buzón de opiniones (estudiante + admin)
// =========================================================

// ---------------------------------------------------------
// PRODUCTOS
// ---------------------------------------------------------

// Botón "Editar": nombre, precio y costo.
async function editarProducto(id) {
  try {
    const { menu } = await api(
      "/api/menu/admin?adminId=" + encodeURIComponent(state.user.id)
    );
    const item = menu.find((p) => String(p.id) === String(id));
    if (!item) return toast("No se encontró el producto.");

    const nombreIn = window.prompt("Nuevo nombre del producto:", item.nombre);
    if (nombreIn === null) return;
    const nombre = nombreIn.trim();
    if (!nombre) return toast("El nombre no puede quedar vacío.");

    const precioIn = window.prompt("Precio de venta:", Number(item.precio).toFixed(2));
    if (precioIn === null) return;
    const precio = Number(precioIn);
    if (precioIn.trim() === "" || !Number.isFinite(precio) || precio < 0) {
      return toast("Escribe un precio válido.");
    }

    const costoIn = window.prompt(
      "Costo del producto (lo que te cuesta prepararlo; sirve para calcular la ganancia):",
      Number(item.costo).toFixed(2)
    );
    if (costoIn === null) return;
    const costo = Number(costoIn);
    if (costoIn.trim() === "" || !Number.isFinite(costo) || costo < 0) {
      return toast("Escribe un costo válido.");
    }

    await api("/api/menu/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify({
        adminId: state.user.id,
        nombre,
        precio: round2(precio),
        costo: round2(costo),
      }),
    });
    toast(`Producto actualizado: ${nombre}`);
    await loadMenu();
    renderMenuEditor();
  } catch (e) {
    console.error("Error editando producto:", e);
  }
}

// ---------------------------------------------------------
// ESTADÍSTICAS (ADMIN)
// ---------------------------------------------------------

function fmtDia(iso, corto) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  return corto
    ? String(d)
    : f.toLocaleDateString("es-SV", { weekday: "short", day: "numeric" });
}

async function cargarStats() {
  if (state.user?.rol !== "cafetin") return;
  const body = $("#statsBody");
  if (!body) return;
  const dias = Number($("#statsDias")?.value || 7);
  body.innerHTML = '<p class="view-sub">Cargando estadísticas…</p>';

  try {
    const { stats } = await api(
      `/api/stats?adminId=${encodeURIComponent(state.user.id)}&dias=${dias}`
    );

    const maxV = Math.max(1, ...stats.diario.map((d) => d.ventas));
    const largo = stats.dias > 10;

    const barras = stats.diario
      .map(
        (d) => `
        <div class="bar-col" title="${escapeHtml(d.dia)}: ${money(d.ventas)} · ${d.pedidos} pedido(s)">
          <span class="bar-val">${largo ? "" : money(d.ventas)}</span>
          <div class="bar-track">
            <div class="bar" style="height:${Math.max(2, (d.ventas / maxV) * 100)}%"></div>
          </div>
          <span class="bar-lbl">${fmtDia(d.dia, largo)}</span>
        </div>`
      )
      .join("");

    const maxU = Math.max(1, ...stats.top.map((t) => t.unidades));
    const top = stats.top.length
      ? stats.top
          .map(
            (t, i) => `
          <li class="top-row">
            <span class="top-rank">${i + 1}</span>
            <div class="top-main">
              <div class="top-line">
                <strong>${escapeHtml(t.nombre)}</strong>
                <span>${t.unidades} u. · ${money(t.ventas)}</span>
              </div>
              <div class="top-bar"><span style="width:${(t.unidades / maxU) * 100}%"></span></div>
            </div>
          </li>`
          )
          .join("")
      : '<li class="top-empty">Aún no hay ventas en este período.</li>';

    const aviso = stats.lineasSinCosto
      ? `<p class="stats-note">⚠️ Algunas ventas no tienen costo registrado, así que su ganancia se cuenta como el precio completo. Entra a <strong>Editar menú del día → Editar</strong> y escribe el costo de cada producto para una ganancia real.</p>`
      : "";

    body.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><span>Ventas</span><strong>${money(stats.ventas)}</strong></div>
        <div class="stat-card stat-card--gain"><span>Ganancia</span><strong>${money(stats.ganancia)}</strong></div>
        <div class="stat-card"><span>Pedidos</span><strong>${stats.pedidos}</strong></div>
        <div class="stat-card"><span>Ticket promedio</span><strong>${money(stats.ticketPromedio)}</strong></div>
      </div>
      ${aviso}
      <div class="stats-panel">
        <h2>Ventas por día</h2>
        <div class="bars${largo ? " bars--dense" : ""}">${barras}</div>
      </div>
      <div class="stats-panel">
        <h2>Productos más vendidos</h2>
        <ol class="top-list">${top}</ol>
      </div>`;
  } catch (e) {
    body.innerHTML =
      '<p class="view-sub">No se pudieron cargar las estadísticas. Intenta de nuevo.</p>';
  }
}

// ---------------------------------------------------------
// BUZÓN DE OPINIONES
// ---------------------------------------------------------

const claseTipo = (t) =>
  ({ "Opinión": "op", "Sugerencia": "sug", "Inconformidad": "inc" }[t] || "op");

function tarjetaOpinion(o, admin) {
  const fecha = new Date(o.fecha).toLocaleString("es-SV");
  return `
    <li class="fb-card">
      <div class="fb-top">
        <span class="fb-tag fb-tag--${claseTipo(o.tipo)}">${escapeHtml(o.tipo)}</span>
        <span class="fb-state fb-state--${o.estado === "Nueva" ? "new" : "ok"}">${escapeHtml(o.estado)}</span>
        <span class="fb-date">${escapeHtml(fecha)}</span>
      </div>
      ${admin ? `<div class="fb-who">${escapeHtml(o.nombre)}</div>` : ""}
      <p class="fb-msg">${escapeHtml(o.mensaje)}</p>
      ${
        o.respuesta
          ? `<div class="fb-reply"><strong>Respuesta del cafetín:</strong> ${escapeHtml(o.respuesta)}</div>`
          : ""
      }
      ${
        admin
          ? `<div class="fb-actions">
              <button type="button" class="btn btn--sm btn--primary" data-fb-reply="${o.id}">${o.respuesta ? "Editar respuesta" : "Responder"}</button>
              ${o.estado === "Nueva" ? `<button type="button" class="btn btn--sm" data-fb-done="${o.id}">Marcar revisada</button>` : ""}
            </div>`
          : ""
      }
    </li>`;
}

// ----- Estudiante -----

async function cargarMisOpiniones() {
  const list = $("#myFeedbackList");
  if (!list || state.user?.rol !== "estudiante") return;
  list.innerHTML = "<li>Cargando…</li>";
  try {
    const { items } = await api(
      "/api/feedback/mine?userId=" + encodeURIComponent(state.user.id)
    );
    list.innerHTML = items.length
      ? items.map((o) => tarjetaOpinion(o, false)).join("")
      : "<li>Aún no has enviado mensajes.</li>";
  } catch (e) {
    list.innerHTML = "<li>No se pudieron cargar tus mensajes.</li>";
  }
}

const feedbackForm = $("#feedbackForm");
if (feedbackForm) {
  feedbackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipo = $("#feedbackTipo")?.value;
    const mensaje = ($("#feedbackMsg")?.value || "").trim();
    if (mensaje.length < 5) return toast("Escribe al menos 5 caracteres.");
    const btn = feedbackForm.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ userId: state.user.id, tipo, mensaje }),
      });
      feedbackForm.reset();
      toast("¡Gracias! Tu mensaje fue enviado al cafetín.");
      await cargarMisOpiniones();
    } catch (err) {
      console.error("Error enviando opinión:", err);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// ----- Administrador -----

let buzonItems = [];
let buzonFiltro = "Todas";

function renderBuzon() {
  const list = $("#adminFeedbackList");
  const sum = $("#feedbackSummary");
  if (!list) return;

  const nuevas = buzonItems.filter((o) => o.estado === "Nueva").length;
  const cuenta = (t) => buzonItems.filter((o) => o.tipo === t).length;
  if (sum) {
    sum.textContent = `${buzonItems.length} mensaje(s) · ${nuevas} nuevo(s) · ${cuenta(
      "Opinión"
    )} opiniones · ${cuenta("Sugerencia")} sugerencias · ${cuenta("Inconformidad")} inconformidades`;
  }

  $$("#feedbackFilters [data-filter]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.filter === buzonFiltro)
  );

  const visibles =
    buzonFiltro === "Todas"
      ? buzonItems
      : buzonItems.filter((o) => o.tipo === buzonFiltro);

  list.innerHTML = visibles.length
    ? visibles.map((o) => tarjetaOpinion(o, true)).join("")
    : "<li>No hay mensajes en esta categoría.</li>";
}

async function cargarBuzon() {
  if (state.user?.rol !== "cafetin") return;
  try {
    const { items } = await api(
      "/api/feedback?adminId=" + encodeURIComponent(state.user.id)
    );
    buzonItems = items;
    renderBuzon();
  } catch (e) {
    const list = $("#adminFeedbackList");
    if (list) list.innerHTML = "<li>No se pudo cargar el buzón.</li>";
  }
}

const feedbackFilters = $("#feedbackFilters");
if (feedbackFilters) {
  feedbackFilters.addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    buzonFiltro = b.dataset.filter;
    renderBuzon();
  });
}

const adminFeedbackList = $("#adminFeedbackList");
if (adminFeedbackList) {
  adminFeedbackList.addEventListener("click", async (e) => {
    const reply = e.target.closest("[data-fb-reply]");
    const done = e.target.closest("[data-fb-done]");
    try {
      if (reply) {
        const id = reply.dataset.fbReply;
        const actual = buzonItems.find((o) => String(o.id) === String(id));
        const texto = window.prompt(
          "Escribe tu respuesta (el estudiante la verá en su buzón):",
          actual?.respuesta || ""
        );
        if (texto === null || !texto.trim()) return;
        await api("/api/feedback/" + encodeURIComponent(id), {
          method: "PATCH",
          body: JSON.stringify({
            adminId: state.user.id,
            respuesta: texto.trim(),
            estado: "Revisada",
          }),
        });
        toast("Respuesta enviada.");
        await cargarBuzon();
      } else if (done) {
        await api("/api/feedback/" + encodeURIComponent(done.dataset.fbDone), {
          method: "PATCH",
          body: JSON.stringify({ adminId: state.user.id, estado: "Revisada" }),
        });
        await cargarBuzon();
      }
    } catch (err) {
      console.error("Error en buzón:", err);
    }
  });
}

// ---------------------------------------------------------
// NAVEGACIÓN: carga los datos al entrar a cada panel
// (script.js ya hace showView; aquí solo se cargan los datos)
// ---------------------------------------------------------
$$(".nav-pill[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const d = btn.dataset.goto;
    if (d === "view-stats") cargarStats();
    if (d === "view-feedback") cargarMisOpiniones();
    if (d === "view-feedback-admin") cargarBuzon();
  });
});

const statsDias = $("#statsDias");
if (statsDias) statsDias.addEventListener("change", cargarStats);
