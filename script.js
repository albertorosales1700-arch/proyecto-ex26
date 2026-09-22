// =========================================================
// TIQUETE — lógica (prototipo de frontend)
// Cuentas multi-usuario con billetera virtual + panel admin
// =========================================================

// ------------------ Claves de almacenamiento ------------------
const KEY_ACCOUNTS = "tiquete_accounts_v1";
const KEY_SESSION  = "tiquete_session_v1";
const KEY_MENU     = "tiquete_menu_v1";
const KEY_ORDERS   = "tiquete_orders_v1";
const KEY_COUNTER  = "tiquete_counter_v1";

const SALDO_INICIAL = 10; // saldo con el que nace una cuenta de estudiante

// ------------------ Datos por defecto ------------------
const DEFAULT_ACCOUNTS = [
  { id: "admin", name: "Administrador", email: "admin@cafetin.edu.sv", password: "admin123", role: "cafetin", wallet: 0 },
  { id: "maria", name: "María Hernández", email: "maria@colegio.edu.sv", password: "1234", role: "estudiante", wallet: 10 },
];

const DEFAULT_MENU = [
  { id: "m1", name: "Pupusas de queso (2)", price: 1.50, available: true },
  { id: "m2", name: "Sándwich de pollo",     price: 2.25, available: true },
  { id: "m3", name: "Baleada sencilla",      price: 1.75, available: true },
  { id: "m4", name: "Empanadas de frijol",   price: 1.00, available: true },
  { id: "m5", name: "Ensalada de fruta",     price: 1.25, available: true },
  { id: "m6", name: "Jugo de naranja",       price: 0.75, available: true },
  { id: "m7", name: "Agua embotellada",      price: 0.50, available: true },
  { id: "m8", name: "Café con leche",        price: 0.60, available: false },
];

// ------------------ Utilidades ------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `$${Number(n).toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}

// ------------------ Estado ------------------
const state = {
  user: null,       // cuenta activa (referencia dentro de state.accounts)
  accounts: [],     // todas las cuentas registradas
  menu: [],
  cart: {},         // { itemId: qty }
  orders: [],
  ticketCounter: 104,
};

// ------------------ Arranque ------------------
function init() {
  state.accounts = load(KEY_ACCOUNTS, null) || DEFAULT_ACCOUNTS.slice();
  state.menu = load(KEY_MENU, null) || DEFAULT_MENU.slice();
  state.orders = load(KEY_ORDERS, []);
  state.ticketCounter = load(KEY_COUNTER, 104);

  // Restaurar sesión si había una cuenta activa
  const sessionId = load(KEY_SESSION, null);
  if (sessionId) {
    const acc = state.accounts.find((a) => a.id === sessionId);
    if (acc) state.user = acc;
  }
  save(KEY_ACCOUNTS, state.accounts);

  updateAuthUi();
  if (state.user) enterApp(false);
}

// ------------------ Pantallas ------------------
function showView(id) {
  $$(".view").forEach((v) => v.classList.remove("is-active"));
  const view = $(`#${id}`);
  if (view) view.classList.add("is-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ------------------ Billetera ------------------
function currentWallet() { return state.user ? state.user.wallet : 0; }

function renderWallet() {
  const amount = $("#walletAmount");
  if (amount) amount.textContent = money(currentWallet());
  const owner = $("#walletOwner");
  if (owner) owner.textContent = state.user ? state.user.name : "";
}

// ------------------ Autenticación ------------------
let authMode = "login";              // "login" | "register"
let selectedRole = "estudiante";     // "estudiante" | "cafetin"

$$(".role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".role-btn").forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    selectedRole = btn.dataset.role;
    updateAuthUi();
  });
});

$$(".auth-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    authMode = btn.dataset.auth;
    $$(".auth-btn").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    updateAuthUi();
  });
});

function updateAuthUi() {
  const isAdmin = selectedRole === "cafetin";
  const register = authMode === "register" && !isAdmin;

  $("#authSwitch").hidden = isAdmin;      // el admin solo inicia sesión
  $("#fieldName").hidden = !register;     // el nombre solo al crear cuenta
  $("#btnSubmit").textContent = register ? "Crear cuenta" : "Entrar";
  $("#loginNote").textContent = isAdmin
    ? "Acceso de administrador. Demo: admin@cafetin.edu.sv / admin123"
    : "Demo estudiante: maria@colegio.edu.sv / 1234 · Elige «Crear cuenta» si eres nuevo.";
}

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#loginName").value.trim();
  const email = $("#loginEmail").value.trim().toLowerCase();
  const pass = $("#loginPass").value;
  const isAdmin = selectedRole === "cafetin";
  const register = authMode === "register" && !isAdmin;

  if (!email || pass.length < 4) {
    toast("Escribe un correo válido y una contraseña de al menos 4 caracteres.");
    return;
  }

  // ---- Crear cuenta (solo estudiantes) ----
  if (register) {
    if (!name) { toast("Escribe tu nombre completo."); return; }
    if (state.accounts.some((a) => a.email.toLowerCase() === email)) {
      toast("Ya existe una cuenta con ese correo.");
      return;
    }
    const acc = { id: uid(), name, email, password: pass, role: "estudiante", wallet: SALDO_INICIAL };
    state.accounts.push(acc);
    save(KEY_ACCOUNTS, state.accounts);
    state.user = acc;
    save(KEY_SESSION, acc.id);
    $("#loginForm").reset();
    enterApp(false);
    toast(`Cuenta creada. Saldo inicial: ${money(SALDO_INICIAL)}`);
    return;
  }

  // ---- Iniciar sesión ----
  const acc = state.accounts.find((a) => a.email.toLowerCase() === email && a.password === pass);
  if (!acc) { toast("Correo o contraseña incorrectos."); return; }
  if (isAdmin && acc.role !== "cafetin") { toast("Esta cuenta no es de administrador."); return; }
  if (!isAdmin && acc.role === "cafetin") { toast("Usa la pestaña «Administrador» para esa cuenta."); return; }

  state.user = acc;
  save(KEY_SESSION, acc.id);
  $("#loginForm").reset();
  enterApp();
});

$("#btnLogout").addEventListener("click", () => {
  state.user = null;
  state.cart = {};
  save(KEY_SESSION, null);
  $("#topnav").hidden = true;
  showView("view-login");
  toast("Sesión cerrada.");
});

function enterApp(withToast = true) {
  const role = state.user ? state.user.role : "estudiante";
  $("#topnav").hidden = false;
  $$(".nav-pill[data-role]").forEach((p) => { p.hidden = p.dataset.role !== role; });

  if (withToast) toast(`Bienvenido/a, ${state.user.name.split(" ")[0]}`);

  if (role === "cafetin") {
    renderBoard();
    renderAccounts();
    showView("view-admin");
  } else {
    renderMenu();
    showView("view-menu");
  }
}

// Navegación entre vistas (permite alternar demo estudiante/administrador)
$$(".nav-pill[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.goto === "view-menu") renderMenu();
    if (btn.dataset.goto === "view-admin") renderBoard();
    showView(btn.dataset.goto);
  });
});

// ------------------ Menú + carrito ------------------
function renderMenu() {
  renderWallet();
  const grid = $("#menuGrid");
  grid.innerHTML = "";

  state.menu.forEach((item) => {
    const qty = state.cart[item.id] || 0;
    const card = document.createElement("div");
    card.className = "item-card" + (item.available ? "" : " item-card--unavailable");

    card.innerHTML = `
      <span class="item-card__name">${escapeHtml(item.name)}</span>
      <span class="item-card__price">${money(item.price)}</span>
      <div class="item-card__row">
        ${
          item.available
            ? qty > 0
              ? `<div class="qty-control">
                   <button class="qty-btn" data-action="dec" data-id="${item.id}" aria-label="Quitar uno">−</button>
                   <span class="qty-value">${qty}</span>
                   <button class="qty-btn" data-action="inc" data-id="${item.id}" aria-label="Agregar uno">+</button>
                 </div>`
              : `<button class="item-card__add" data-action="inc" data-id="${item.id}">Agregar</button>`
            : `<span class="receipt-empty">Agotado hoy</span>`
        }
      </div>`;
    grid.appendChild(card);
  });

  grid.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => changeQty(btn.dataset.id, btn.dataset.action === "inc" ? 1 : -1));
  });

  renderCart();
}

function changeQty(id, delta) {
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = next;
  renderMenu();
}

function cartLines() {
  return Object.keys(state.cart).map((id) => {
    const item = state.menu.find((m) => m.id === id);
    return { id, name: item.name, price: item.price, qty: state.cart[id] };
  });
}

function cartTotal(lines) {
  return round2((lines || cartLines()).reduce((sum, l) => sum + l.price * l.qty, 0));
}

function renderCart() {
  const list = $("#cartList");
  const lines = cartLines();
  list.innerHTML = "";

  if (!lines.length) {
    list.innerHTML = `<li class="receipt-empty">Aún no has agregado productos.</li>`;
    $("#cartTotal").textContent = money(0);
    $("#btnPlaceOrder").disabled = true;
    $("#btnPlaceOrder").textContent = "Generar pedido";
    return;
  }

  lines.forEach((l) => {
    const li = document.createElement("li");
    li.className = "receipt-item";
    li.innerHTML = `
      <span>${l.qty} × ${escapeHtml(l.name)}</span>
      <span>${money(l.price * l.qty)} <button data-id="${l.id}">quitar</button></span>`;
    list.appendChild(li);
  });

  list.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => { delete state.cart[btn.dataset.id]; renderMenu(); });
  });

  const total = cartTotal(lines);
  $("#cartTotal").textContent = money(total);

  const falta = round2(total - currentWallet());
  const placeBtn = $("#btnPlaceOrder");
  placeBtn.disabled = false;
  placeBtn.textContent = falta > 0 ? `Faltan ${money(falta)}` : "Generar pedido";

  renderWallet();
}

$("#btnPlaceOrder").addEventListener("click", () => {
  const lines = cartLines();
  if (!lines.length) return;
  const total = cartTotal(lines);

  // Validar saldo de la cuenta activa
  if (total > currentWallet()) {
    toast(`💸 Saldo insuficiente. Te faltan ${money(total - currentWallet())}.`);
    return;
  }

  // Descontar el total del saldo de la cuenta
  state.user.wallet = round2(state.user.wallet - total);
  save(KEY_ACCOUNTS, state.accounts);

  state.ticketCounter += 1;
  save(KEY_COUNTER, state.ticketCounter);

  const order = {
    id: uid(),
    number: state.ticketCounter,
    accountId: state.user.id,
    student: { name: state.user.name, email: state.user.email },
    items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
    total,
    status: "Pendiente",
    time: new Date().toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" }),
  };
  state.orders.unshift(order);
  save(KEY_ORDERS, state.orders);
  state.cart = {};

  renderWallet();
  renderConfirm(order);
  renderBoard();
  showView("view-confirm");
  toast(`Pedido generado. Nuevo saldo: ${money(state.user.wallet)}`);
});

// ------------------ Confirmación del tiquete ------------------
function renderConfirm(order) {
  $("#confirmNumber").textContent = `#${order.number}`;
  $("#confirmItems").innerHTML = order.items
    .map((it) => `<li><span>${it.qty} × ${escapeHtml(it.name)}</span><span>${money(it.price * it.qty)}</span></li>`)
    .join("") + `<li><span><strong>Total</strong></span><span><strong>${money(order.total)}</strong></span></li>`;
  updateStatusTrack(order.status);
  $("#confirmHint").textContent = statusHint(order.status);
  $("#confirmNumber").dataset.orderId = order.id;
}

function statusHint(status) {
  if (status === "Pendiente") return "El cafetín está preparando tu pedido. Te avisaremos cuando esté listo.";
  if (status === "Listo para retirar") return "¡Tu pedido está listo! Pasa a la ventanilla de entregas rápidas.";
  return "Pedido entregado. ¡Buen provecho!";
}

function updateStatusTrack(status) {
  const flow = ["Pendiente", "Listo para retirar", "Entregado"];
  const currentIndex = flow.indexOf(status);
  $$("#statusTrack .status-step").forEach((step, i) => {
    step.classList.remove("is-active", "is-done");
    if (i < currentIndex) step.classList.add("is-done");
    if (i === currentIndex) step.classList.add("is-active");
  });
}

$("#btnNewOrder").addEventListener("click", () => {
  renderMenu();
  showView("view-menu");
});

// ------------------ Panel del cafetín ------------------
const STATUS_FLOW = ["Pendiente", "Listo para retirar", "Entregado"];

function renderBoard() {
  const cols = {
    "Pendiente": $("#colPendiente"),
    "Listo para retirar": $("#colListo"),
    "Entregado": $("#colEntregado"),
  };
  Object.values(cols).forEach((c) => (c.innerHTML = ""));

  const counts = { "Pendiente": 0, "Listo para retirar": 0, "Entregado": 0 };

  state.orders.forEach((order) => {
    if (!cols[order.status]) return;
    counts[order.status]++;

    const flowIndex = STATUS_FLOW.indexOf(order.status);
    const nextStatus = STATUS_FLOW[flowIndex + 1];
    const prevStatus = STATUS_FLOW[flowIndex - 1];
    const itemsHtml = order.items.map((it) => `<li>${it.qty} × ${escapeHtml(it.name)}</li>`).join("");

    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-card__top">
        <span class="order-card__num">#${order.number}</span>
        <span class="order-card__time">${order.time}</span>
      </div>
      <div class="order-card__student">${escapeHtml(order.student.name || "Estudiante")}</div>
      <ul class="order-card__items">${itemsHtml}</ul>
      <div class="order-card__actions">
        ${prevStatus ? `<button class="btn-back" data-id="${order.id}" data-dir="back">← ${prevStatus}</button>` : ""}
        ${nextStatus ? `<button class="btn-advance" data-id="${order.id}" data-dir="next">${nextStatus} →</button>` : ""}
      </div>`;
    cols[order.status].appendChild(card);
  });

  Object.values(cols).forEach((col) => {
    if (!col.children.length) col.innerHTML = `<p class="board-col__empty">Sin pedidos aquí.</p>`;
  });

  $("#countPendiente").textContent = counts["Pendiente"];
  $("#countListo").textContent = counts["Listo para retirar"];
  $("#countEntregado").textContent = counts["Entregado"];

  $$(".btn-advance, .btn-back").forEach((btn) => {
    btn.addEventListener("click", () => changeOrderStatus(btn.dataset.id, btn.dataset.dir));
  });
}

function changeOrderStatus(orderId, dir) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const idx = STATUS_FLOW.indexOf(order.status);
  const newIdx = dir === "next" ? idx + 1 : idx - 1;
  if (newIdx < 0 || newIdx >= STATUS_FLOW.length) return;

  order.status = STATUS_FLOW[newIdx];
  save(KEY_ORDERS, state.orders);
  renderBoard();

  if (order.status === "Listo para retirar") {
    toast(`📧 Aviso enviado a ${order.student.email}: pedido #${order.number} listo para retirar.`);
  } else if (order.status === "Entregado") {
    toast(`📧 Aviso enviado a ${order.student.email}: pedido #${order.number} entregado.`);
  }

  if ($("#confirmNumber").dataset.orderId === order.id) {
    updateStatusTrack(order.status);
    $("#confirmHint").textContent = statusHint(order.status);
  }
}

// ------------------ Editor de menú (cafetín) ------------------
$("#btnEditMenu").addEventListener("click", () => {
  renderMenuEditor();
  $("#menuEditor").hidden = false;
});
$("#btnCloseMenu").addEventListener("click", () => {
  $("#menuEditor").hidden = true;
  renderMenu();
});

function renderMenuEditor() {
  const list = $("#menuEditorList");
  list.innerHTML = state.menu
    .map((item) => `
      <li>
        <label>
          <input type="checkbox" data-id="${item.id}" ${item.available ? "checked" : ""}>
          ${escapeHtml(item.name)}
        </label>
        <span class="price-tag">${money(item.price)}</span>
      </li>`)
    .join("");

  list.querySelectorAll("input[type=checkbox]").forEach((box) => {
    box.addEventListener("change", () => {
      const item = state.menu.find((m) => m.id === box.dataset.id);
      item.available = box.checked;
      save(KEY_MENU, state.menu);
    });
  });
}

$("#addItemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = $("#newItemName");
  const priceInput = $("#newItemPrice");
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);
  if (!name || isNaN(price) || price < 0) { toast("Escribe un nombre y un precio válidos."); return; }

  state.menu.push({ id: `m${Date.now()}`, name, price: round2(price), available: true });
  save(KEY_MENU, state.menu);
  nameInput.value = "";
  priceInput.value = "";
  renderMenuEditor();
  toast(`"${name}" agregado al menú de hoy.`);
});

// ------------------ Cuentas y saldos (admin) ------------------
function ordersCount(accountId) {
  return state.orders.filter((o) => o.accountId === accountId).length;
}

function renderAccounts() {
  const list = $("#accountsList");
  const totalMoney = round2(state.accounts.reduce((sum, a) => sum + a.wallet, 0));
  $("#accountsSummary").textContent =
    `${state.accounts.length} cuenta(s) registrada(s) · ${money(totalMoney)} en billeteras`;

  list.innerHTML = state.accounts
    .map((a) => `
      <li class="account-row">
        <div class="account-info">
          <strong>${escapeHtml(a.name)}</strong>
          <span>${escapeHtml(a.email)} · ${a.role === "cafetin" ? "Administrador" : "Estudiante"} · ${ordersCount(a.id)} pedido(s)</span>
        </div>
        <div class="account-money">
          <span class="account-$">$</span>
          <input type="number" step="0.25" min="0" value="${a.wallet.toFixed(2)}" data-wallet="${a.id}">
          <button class="btn btn--primary btn--sm" data-savewallet="${a.id}">Guardar</button>
        </div>
      </li>`)
    .join("");

  list.querySelectorAll("[data-savewallet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.savewallet;
      const input = list.querySelector(`input[data-wallet="${id}"]`);
      const value = parseFloat(input.value);
      if (isNaN(value) || value < 0) { toast("Escribe un monto válido."); return; }

      const acc = state.accounts.find((a) => a.id === id);
      acc.wallet = round2(value);
      save(KEY_ACCOUNTS, state.accounts);
      if (state.user && state.user.id === id) renderWallet();
      renderAccounts();
      toast(`Saldo de ${acc.name} actualizado a ${money(acc.wallet)}.`);
    });
  });
}

$("#btnAccounts").addEventListener("click", () => {
  renderAccounts();
  $("#accountsPanel").hidden = false;
});
$("#btnCloseAccounts").addEventListener("click", () => { $("#accountsPanel").hidden = true; });

// ------------------ Iniciar ------------------
init();