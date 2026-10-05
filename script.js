// =========================================================
// TIQUETE — Lógica completa
// Frontend + API Node.js + PostgreSQL
// =========================================================


// =========================================================
// UTILIDADES
// =========================================================

const $ = (sel) =>
  document.querySelector(sel);

const $$ = (sel) =>
  Array.from(
    document.querySelectorAll(sel)
  );


const money = (n) =>
  `$${Number(n || 0).toFixed(2)}`;


const round2 = (n) =>
  Math.round(
    Number(n || 0) * 100
  ) / 100;


const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );


// =========================================================
// API
// =========================================================

async function api(
  url,
  options = {}
) {

  try {

    const config = {
      ...options,

      headers: {
        "Content-Type":
          "application/json",

        ...(options.headers || {}),
      },
    };


    const response =
      await fetch(
        url,
        config
      );


    let data = {};


    try {

      data =
        await response.json();

    } catch (e) {

      data = {};

    }


    if (!response.ok) {

      const message =
        data.error ||
        data.message ||
        `Error HTTP ${response.status}`;


      const error =
        new Error(message);


      error.isApiError =
        true;


      throw error;
    }


    return data;


  } catch (error) {

    if (error.isApiError) {

      toast(
        error.message
      );

    } else {

      toast(
        "No se pudo conectar con el servidor."
      );
    }


    throw error;
  }
}


// =========================================================
// ESTADO
// =========================================================

const state = {

  user: null,

  cart: {},

  orders: [],

  accounts: [],

  menu: [],

  currentOrderId: null,
};


// =========================================================
// TEMPORIZADORES
// =========================================================

let orderPollTimer = null;

let adminRefreshTimer = null;


// =========================================================
// ARRANQUE
// =========================================================

async function init() {

  updateAuthUi();


  const topnav =
    $("#topnav");

  if (topnav) {
    topnav.hidden = true;
  }


  const sessionId =
    sessionStorage.getItem(
      "tiquete_user_id"
    );


  if (!sessionId) {
    return;
  }


  try {

    const { user } =
      await api(
        "/api/user/" +
        sessionId
      );


    state.user =
      user;


    sessionStorage.setItem(
      "tiquete_user_id",
      user.id
    );


    await enterApp(false);


  } catch (e) {

    console.error(
      "Error restaurando sesión:",
      e
    );


    sessionStorage.removeItem(
      "tiquete_user_id"
    );


    state.user = null;
  }
}


// =========================================================
// PANTALLAS
// =========================================================

function showView(id) {

  $$(".view").forEach(
    (v) =>
      v.classList.remove(
        "is-active"
      )
  );


  const view =
    $(`#${id}`);


  if (view) {

    view.classList.add(
      "is-active"
    );
  }


  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}


// =========================================================
// TOAST
// =========================================================

function toast(message) {

  const stack =
    $("#toastStack");


  if (!stack) {

    console.log(
      message
    );

    return;
  }


  const el =
    document.createElement(
      "div"
    );


  el.className =
    "toast";


  el.textContent =
    message;


  stack.appendChild(
    el
  );


  setTimeout(
    () => {
      el.remove();
    },
    4200
  );
}


// =========================================================
// BILLETERA
// =========================================================

function renderWallet() {

  if (!state.user) {
    return;
  }


  const amount =
    $("#walletAmount");


  if (amount) {

    amount.textContent =
      money(
        state.user.saldo
      );
  }


  const owner =
    $("#walletOwner");


  if (owner) {

    owner.textContent =
      state.user.nombre;
  }
}


// =========================================================
// AUTENTICACIÓN
// =========================================================

let authMode =
  "login";


let selectedRole =
  "estudiante";


// =========================================================
// ROLES
// =========================================================

$$(".role-btn")
  .forEach((btn) => {

    btn.addEventListener(
      "click",
      () => {

        $$(".role-btn")
          .forEach((b) => {

            b.classList.remove(
              "is-active"
            );

            b.setAttribute(
              "aria-selected",
              "false"
            );

          });


        btn.classList.add(
          "is-active"
        );


        btn.setAttribute(
          "aria-selected",
          "true"
        );


        selectedRole =
          btn.dataset.role;


        if (
          selectedRole ===
          "cafetin"
        ) {

          authMode =
            "login";


          $$(".auth-btn")
            .forEach((b) => {

              b.classList.toggle(
                "is-active",
                b.dataset.auth ===
                  "login"
              );


              b.setAttribute(
                "aria-selected",
                String(
                  b.dataset.auth ===
                    "login"
                )
              );

            });
        }


        updateAuthUi();
      }
    );
  });


// =========================================================
// LOGIN / REGISTRO
// =========================================================

$$(".auth-btn")
  .forEach((btn) => {

    btn.addEventListener(
      "click",
      () => {

        authMode =
          btn.dataset.auth;


        $$(".auth-btn")
          .forEach((b) => {

            b.classList.toggle(
              "is-active",
              b === btn
            );


            b.setAttribute(
              "aria-selected",
              String(
                b === btn
              )
            );

          });


        updateAuthUi();
      }
    );
  });


// =========================================================
// UI AUTENTICACIÓN
// =========================================================

function updateAuthUi() {

  const isAdmin =
    selectedRole ===
    "cafetin";


  const register =
    authMode ===
      "register" &&
    !isAdmin;


  const authSwitch =
    $("#authSwitch");


  if (authSwitch) {

    authSwitch.hidden =
      isAdmin;
  }


  const fieldName =
    $("#fieldName");


  if (fieldName) {

    fieldName.hidden =
      !register;
  }


  const btnSubmit =
    $("#btnSubmit");


  if (btnSubmit) {

    btnSubmit.textContent =
      register
        ? "Crear cuenta"
        : "Entrar";
  }


  const loginNote =
    $("#loginNote");


  if (loginNote) {

    loginNote.textContent =
      isAdmin
        ? "Admin: admin@cafetin.edu.sv / admin123"
        : "Demo: maria@colegio.edu.sv / 1234 · Crea tu cuenta aquí.";
  }
}


// =========================================================
// LOGIN
// =========================================================

const loginForm =
  $("#loginForm");


if (loginForm) {

  loginForm.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();


      const name =
        (
          $("#loginName")?.value ||
          ""
        ).trim();


      const email =
        (
          $("#loginEmail")?.value ||
          ""
        )
          .trim()
          .toLowerCase();


      const pass =
        $("#loginPass")?.value ||
        "";


      const isAdmin =
        selectedRole ===
        "cafetin";


      const register =
        authMode ===
          "register" &&
        !isAdmin;


      try {

        if (
          !email ||
          pass.length < 4
        ) {

          toast(
            "Faltan datos o contraseña muy corta."
          );

          return;
        }


        // =====================================================
        // REGISTRO
        // =====================================================

        if (register) {

          if (!name) {

            toast(
              "Escribe tu nombre."
            );

            return;
          }


          const data =
            await api(
              "/api/register",
              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    name,
                    email,
                    password:
                      pass,
                  }),
              }
            );


          state.user =
            data.user;


          sessionStorage.setItem(
            "tiquete_user_id",
            data.user.id
          );


          loginForm.reset();


          toast(
            `Bienvenido, ${data.user.nombre}. Saldo inicial: ${money(
              data.user.saldo
            )}`
          );


          await enterApp(
            false
          );


          return;
        }


        // =====================================================
        // LOGIN
        // =====================================================

        const data =
          await api(
            "/api/login",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  email,
                  password:
                    pass,
                  expectRole:
                    selectedRole,
                }),
            }
          );


        state.user =
          data.user;


        sessionStorage.setItem(
          "tiquete_user_id",
          data.user.id
        );


        loginForm.reset();


        await enterApp(
          true
        );

      } catch (err) {

        console.error(
          "Error de autenticación:",
          err
        );
      }
    }
  );
}


// =========================================================
// CERRAR SESIÓN
// =========================================================

const btnLogout =
  $("#btnLogout");


if (btnLogout) {

  btnLogout.addEventListener(
    "click",
    () => {

      stopOrderPolling();
      stopAdminRefresh();


      state.user =
        null;


      state.cart =
        {};


      state.orders =
        [];


      state.currentOrderId =
        null;


      sessionStorage.removeItem(
        "tiquete_user_id"
      );


      const topnav =
        $("#topnav");


      if (topnav) {
        topnav.hidden = true;
      }


      showView(
        "view-login"
      );


      toast(
        "Sesión cerrada."
      );
    }
  );
}


// =========================================================
// ENTRAR A LA APP
// =========================================================

async function enterApp(
  withToast = true
) {

  if (!state.user) {

    showView(
      "view-login"
    );

    return;
  }


  const role =
    state.user.role;


  const topnav =
    $("#topnav");


  if (topnav) {
    topnav.hidden = false;
  }


  $$(".nav-pill[data-role]")
    .forEach((p) => {

      p.hidden =
        p.dataset.role !==
        role;

    });


  if (role === "cafetin") {

    stopOrderPolling();

    await loadMenu();

    await renderBoard();

    await renderAccounts();

    showView(
      "view-admin"
    );

    startAdminRefresh();

  } else {

    stopAdminRefresh();

    await refreshCurrentUser();

    await loadMenu();

    renderMenu();

    showView(
      "view-menu"
    );
  }


  if (
    withToast &&
    state.user.nombre
  ) {

    toast(
      `Bienvenido/a, ${state.user.nombre.split(" ")[0]}`
    );
  }
}


// =========================================================
// NAVEGACIÓN
// =========================================================

$$(".nav-pill[data-goto]")
  .forEach((btn) => {

    btn.addEventListener(
      "click",
      async () => {

        const destination =
          btn.dataset.goto;


        if (
          destination ===
          "view-menu"
        ) {

          stopAdminRefresh();

          await refreshCurrentUser();

          await loadMenu();

          renderMenu();

          showView(
            destination
          );

          return;
        }


        if (
          destination ===
          "view-admin"
        ) {

          if (
            state.user?.role !==
            "cafetin"
          ) {

            toast(
              "No tienes permisos de administrador."
            );

            return;
          }


          await loadMenu();

          await renderBoard();

          await renderAccounts();

          showView(
            destination
          );

          startAdminRefresh();

          return;
        }


        showView(
          destination
        );
      }
    );

  });


// =========================================================
// ACTUALIZAR USUARIO ACTUAL
// =========================================================

async function refreshCurrentUser() {

  if (!state.user) {
    return;
  }


  try {

    const { user } =
      await api(
        "/api/user/" +
        state.user.id
      );


    state.user =
      user;


    sessionStorage.setItem(
      "tiquete_user_id",
      user.id
    );


    renderWallet();

  } catch (e) {

    console.error(
      "Error actualizando usuario:",
      e
    );
  }
}


// =========================================================
// MENÚ
// =========================================================

async function loadMenu() {

  try {

    const { menu } =
      await api(
        "/api/menu"
      );


    state.menu =
      Array.isArray(menu)
        ? menu
        : [];


    renderMenu();

  } catch (e) {

    console.error(
      "Error cargando menú:",
      e
    );
  }
}


// =========================================================
// RENDERIZAR MENÚ
// =========================================================

function renderMenu() {

  renderWallet();


  const grid =
    $("#menuGrid");


  if (!grid) {
    return;
  }


  grid.innerHTML = "";


  state.menu.forEach(
    (item) => {

      const itemId =
        String(
          item.id
        );


      const qty =
        Number(
          state.cart[itemId] ||
          0
        );


      const disponible =
        Boolean(
          item.disponible
        );


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "item-card" +
        (
          disponible
            ? ""
            : " item-card--unavailable"
        );


      card.innerHTML = `

        <span class="item-card__name">
          ${escapeHtml(
            item.nombre
          )}
        </span>


        <span class="item-card__price">
          ${money(
            item.precio
          )}
        </span>


        <div class="item-card__row">

          ${
            disponible

              ? qty > 0

                ? `

                  <div class="qty-control">

                    <button
                      class="qty-btn"
                      data-action="dec"
                      data-id="${itemId}"
                      aria-label="Quitar uno"
                    >
                      −
                    </button>


                    <span class="qty-value">
                      ${qty}
                    </span>


                    <button
                      class="qty-btn"
                      data-action="inc"
                      data-id="${itemId}"
                      aria-label="Agregar uno"
                    >
                      +
                    </button>

                  </div>

                `

                : `

                  <button
                    class="item-card__add"
                    data-action="inc"
                    data-id="${itemId}"
                  >
                    Agregar
                  </button>

                `

              : `

                <span class="receipt-empty">
                  Agotado hoy
                </span>

              `
          }

        </div>

      `;


      grid.appendChild(
        card
      );
    }
  );


  // =====================================================
  // BOTONES + / -
  // =====================================================

  grid
    .querySelectorAll(
      "[data-action]"
    )
    .forEach(
      (btn) => {

        btn.addEventListener(
          "click",
          () => {

            changeQty(
              btn.dataset.id,
              btn.dataset.action ===
                "inc"
                ? 1
                : -1
            );

          }
        );

      }
    );


  renderCart();
}


// =========================================================
// CAMBIAR CANTIDAD
// =========================================================

function changeQty(
  id,
  delta
) {

  const key =
    String(id);


  const actual =
    Number(
      state.cart[key] ||
      0
    );


  const next =
    actual +
    Number(delta);


  if (next <= 0) {

    delete state.cart[key];

  } else {

    state.cart[key] =
      next;
  }


  renderMenu();
}


// =========================================================
// LÍNEAS DEL CARRITO
// =========================================================

function cartLines() {

  return Object.keys(
    state.cart
  )
    .map((id) => {

      const item =
        state.menu.find(
          (m) =>
            String(m.id) ===
            String(id)
        );


      if (!item) {
        return null;
      }


      return {

        id:
          String(item.id),

        name:
          item.nombre,

        price:
          Number(item.precio),

        qty:
          Number(
            state.cart[id]
          ) || 0,
      };

    })
    .filter(Boolean);
}


// =========================================================
// TOTAL
// =========================================================

function cartTotal(
  lines = cartLines()
) {

  return round2(
    lines.reduce(
      (sum, l) =>
        sum +
        Number(l.price) *
        Number(l.qty),
      0
    )
  );
}


// =========================================================
// RENDERIZAR CARRITO
// =========================================================

function renderCart() {

  const list =
    $("#cartList");


  if (!list) {
    return;
  }


  const lines =
    cartLines();


  list.innerHTML = "";


  if (!lines.length) {

    list.innerHTML = `

      <li class="receipt-empty">
        Aún no has agregado productos.
      </li>

    `;


    const totalElement =
      $("#cartTotal");


    if (totalElement) {

      totalElement.textContent =
        money(0);
    }


    const placeBtn =
      $("#btnPlaceOrder");


    if (placeBtn) {

      placeBtn.disabled =
        true;

      placeBtn.textContent =
        "Generar pedido";
    }


    return;
  }


  // =====================================================
  // PRODUCTOS DEL CARRITO
  // =====================================================

  lines.forEach(
    (l) => {

      const li =
        document.createElement(
          "li"
        );


      li.className =
        "receipt-item";


      li.innerHTML = `

        <span>
          ${l.qty} ×
          ${escapeHtml(
            l.name
          )}
        </span>


        <span>

          ${money(
            Number(l.price) *
            Number(l.qty)
          )}


          <button
            type="button"
            data-id="${l.id}"
          >
            quitar
          </button>

        </span>

      `;


      list.appendChild(
        li
      );
    }
  );


  // =====================================================
  // QUITAR PRODUCTO
  // =====================================================

  list
    .querySelectorAll(
      "button[data-id]"
    )
    .forEach(
      (btn) => {

        btn.addEventListener(
          "click",
          () => {

            delete state.cart[
              String(
                btn.dataset.id
              )
            ];


            renderMenu();
          }
        );

      }
    );


  // =====================================================
  // TOTAL
  // =====================================================

  const total =
    cartTotal(lines);


  const totalElement =
    $("#cartTotal");


  if (totalElement) {

    totalElement.textContent =
      money(total);
  }


  // =====================================================
  // SALDO
  // =====================================================

  const saldo =
    Number(
      state.user?.saldo ||
      0
    );


  const falta =
    round2(
      total -
      saldo
    );


  const placeBtn =
    $("#btnPlaceOrder");


  if (placeBtn) {

    if (falta > 0) {

      placeBtn.disabled =
        true;


      placeBtn.textContent =
        `Faltan ${money(
          falta
        )}`;

    } else {

      placeBtn.disabled =
        false;


      placeBtn.textContent =
        "Generar pedido";
    }
  }


  renderWallet();
}


// =========================================================
// GENERAR PEDIDO
// =========================================================

const placeOrderButton =
  $("#btnPlaceOrder");


if (placeOrderButton) {

  placeOrderButton.addEventListener(
    "click",
    async () => {

      const lines =
        cartLines();


      if (!lines.length) {

        toast(
          "El carrito está vacío."
        );

        return;
      }


      const total =
        cartTotal(lines);


      const saldoActual =
        Number(
          state.user?.saldo ||
          0
        );


      if (
        total >
        saldoActual
      ) {

        toast(
          `💸 Saldo insuficiente. Te faltan ${money(
            total -
            saldoActual
          )}.`
        );

        return;
      }


      placeOrderButton.disabled =
        true;


      placeOrderButton.textContent =
        "Procesando...";


      try {

        const { order } =
          await api(
            "/api/order",
            {
              method:
                "POST",

              body:
                JSON.stringify({

                  user: {
                    id:
                      state.user.id,
                  },

                  items:
                    lines.map(
                      (l) => ({
                        id:
                          String(
                            l.id
                          ),

                        name:
                          l.name,

                        price:
                          Number(
                            l.price
                          ),

                        qty:
                          Number(
                            l.qty
                          ),
                      })
                    ),

                  total:
                    Number(
                      total
                    ),

                  walletUser:
                    true,
                }),
            }
          );


        state.cart = {};


        // =================================================
        // USAR EL SALDO QUE DEVUELVE POSTGRESQL
        // =================================================

        if (
          order.saldo !==
          undefined
        ) {

          state.user.saldo =
            round2(
              Number(
                order.saldo
              )
            );

        } else {

          state.user.saldo =
            round2(
              saldoActual -
              total
            );
        }


        state.currentOrderId =
          order.id;


        sessionStorage.setItem(
          "tiquete_user_id",
          state.user.id
        );


        renderMenu();


        renderConfirm(
          order
        );


        showView(
          "view-confirm"
        );


        toast(
          `Pedido #${order.number} confirmado. Nuevo saldo: ${money(
            state.user.saldo
          )}`
        );


        startOrderPolling(
          order.id
        );


      } catch (e) {

        console.error(
          "Error creando pedido:",
          e
        );


        renderCart();
      }
    }
  );
}


// =========================================================
// CONFIRMACIÓN
// =========================================================

function renderConfirm(
  order
) {

  if (!order) {
    return;
  }


  const confirmNumber =
    $("#confirmNumber");


  if (confirmNumber) {

    confirmNumber.textContent =
      `#${order.number}`;


    confirmNumber.dataset.orderId =
      String(
        order.id
      );
  }


  const confirmItems =
    $("#confirmItems");


  if (confirmItems) {

    const items =
      Array.isArray(
        order.items
      )
        ? order.items
        : [];


    confirmItems.innerHTML =
      items
        .map(
          (it) => `

            <li>

              <span>
                ${Number(
                  it.qty
                )} ×

                ${escapeHtml(
                  it.name
                )}
              </span>


              <span>
                ${money(
                  Number(
                    it.price
                  ) *
                  Number(
                    it.qty
                  )
                )}
              </span>

            </li>

          `
        )
        .join("") +


      `

        <li>

          <span>
            <strong>
              Total
            </strong>
          </span>


          <span>
            <strong>
              ${money(
                order.total
              )}
            </strong>
          </span>

        </li>

      `;
  }


  const status =
    order.estado ||
    order.status ||
    "Pendiente";


  updateStatusTrack(
    status
  );


  const hint =
    $("#confirmHint");


  if (hint) {

    hint.textContent =
      statusHint(
        status
      );
  }
}


// =========================================================
// MENSAJE DEL ESTADO
// =========================================================

function statusHint(
  status
) {

  if (
    status ===
    "Pendiente"
  ) {

    return "El cafetín está preparando tu pedido. Te avisaremos cuando esté listo.";
  }


  if (
    status ===
    "Listo para retirar"
  ) {

    return "¡Tu pedido está listo! Pasa a la ventanilla de entregas rápidas.";
  }


  if (
    status ===
    "Entregado"
  ) {

    return "Pedido entregado. ¡Buen provecho!";
  }


  return "Estado del pedido actualizado.";
}


// =========================================================
// ESTADO VISUAL
// =========================================================

function updateStatusTrack(
  status
) {

  const steps =
    $$("#statusTrack .status-step");


  if (!steps.length) {
    return;
  }


  const flow = [

    "Pendiente",

    "Listo para retirar",

    "Entregado",

  ];


  const currentIndex =
    flow.indexOf(
      status
    );


  steps.forEach(
    (step, index) => {

      step.classList.remove(
        "is-active",
        "is-done"
      );


      if (
        index <
        currentIndex
      ) {

        step.classList.add(
          "is-done"
        );
      }


      if (
        index ===
        currentIndex
      ) {

        step.classList.add(
          "is-active"
        );
      }
    }
  );
}


// =========================================================
// POLLING DEL PEDIDO DEL ESTUDIANTE
// =========================================================

function startOrderPolling(
  orderId
) {

  stopOrderPolling();


  if (!orderId) {
    return;
  }


  state.currentOrderId =
    String(
      orderId
    );


  checkCurrentOrderStatus();


  orderPollTimer =
    setInterval(
      checkCurrentOrderStatus,
      5000
    );
}


// =========================================================
// DETENER POLLING
// =========================================================

function stopOrderPolling() {

  if (
    orderPollTimer
  ) {

    clearInterval(
      orderPollTimer
    );

    orderPollTimer =
      null;
  }
}


// =========================================================
// CONSULTAR ESTADO ACTUAL
// =========================================================

async function checkCurrentOrderStatus() {

  if (
    !state.currentOrderId ||
    !state.user
  ) {
    return;
  }


  if (
    state.user.role !==
    "estudiante"
  ) {
    return;
  }


  try {

    const { order } =
      await api(
        "/api/order/" +
        state.currentOrderId
      );


    if (!order) {
      return;
    }


    renderConfirm(
      order
    );


  } catch (e) {

    console.error(
      "Error actualizando estado del pedido:",
      e
    );
  }
}


// =========================================================
// NUEVO PEDIDO
// =========================================================

const btnNewOrder =
  $("#btnNewOrder");


if (btnNewOrder) {

  btnNewOrder.addEventListener(
    "click",
    async () => {

      stopOrderPolling();


      state.currentOrderId =
        null;


      await refreshCurrentUser();

      await loadMenu();


      renderMenu();


      showView(
        "view-menu"
      );
    }
  );
}


// =========================================================
// PANEL DEL CAFETÍN
// =========================================================

const STATUS_FLOW = [

  "Pendiente",

  "Listo para retirar",

  "Entregado",

];


async function renderBoard() {

  try {

    if (
      !state.user ||
      state.user.role !==
      "cafetin"
    ) {

      return;
    }


    const { orders } =
      await api(
        "/api/orders?adminId=" +
        encodeURIComponent(
          state.user.id
        )
      );


    state.orders =
      Array.isArray(
        orders
      )
        ? orders
        : [];


    const cols = {

      "Pendiente":
        $("#colPendiente"),

      "Listo para retirar":
        $("#colListo"),

      "Entregado":
        $("#colEntregado"),

    };


    Object.values(cols)
      .forEach(
        (c) => {

          if (c) {
            c.innerHTML =
              "";
          }

        }
      );


    const counts = {

      "Pendiente":
        0,

      "Listo para retirar":
        0,

      "Entregado":
        0,

    };


    state.orders.forEach(
      (order) => {

        const estado =
          order.estado ||
          "Pendiente";


        if (
          !cols[estado]
        ) {
          return;
        }


        counts[estado]++;


        const flowIndex =
          STATUS_FLOW.indexOf(
            estado
          );


        const nextStatus =
          STATUS_FLOW[
            flowIndex + 1
          ];


        const prevStatus =
          STATUS_FLOW[
            flowIndex - 1
          ];


        const items =
          Array.isArray(
            order.items
          )
            ? order.items
            : [];


        const itemsHtml =
          items
            .map(
              (it) => `

                <li>
                  ${Number(
                    it.qty
                  )} ×

                  ${escapeHtml(
                    it.name
                  )}
                </li>

              `
            )
            .join("");


        const card =
          document.createElement(
            "div"
          );


        card.className =
          "order-card";


        card.innerHTML = `

          <div class="order-card__top">

            <span class="order-card__num">

              #${
                order.numero_turno ??
                order.number ??
                order.id
              }

            </span>


            <span class="order-card__time">

              ${
                order.fecha
                  ? new Date(
                      order.fecha
                    ).toLocaleTimeString(
                      "es-SV",
                      {
                        hour:
                          "2-digit",

                        minute:
                          "2-digit",
                      }
                    )
                  : ""
              }

            </span>

          </div>


          <div class="order-card__student">

            ${escapeHtml(
              order.student_name ||
              "Estudiante"
            )}

          </div>


          <ul class="order-card__items">

            ${itemsHtml}

          </ul>


          <div class="order-card__actions">

            ${
              prevStatus
                ? `

                  <button
                    class="btn-back"
                    data-id="${order.id}"
                    data-dir="back"
                  >

                    ← ${prevStatus}

                  </button>

                `
                : ""
            }


            ${
              nextStatus
                ? `

                  <button
                    class="btn-advance"
                    data-id="${order.id}"
                    data-dir="next"
                  >

                    ${nextStatus} →

                  </button>

                `
                : ""
            }

          </div>

        `;


        cols[estado]
          .appendChild(
            card
          );
      }
    );


    Object.values(cols)
      .forEach(
        (col) => {

          if (
            col &&
            !col.children.length
          ) {

            col.innerHTML = `

              <p class="board-col__empty">
                Sin pedidos aquí.
              </p>

            `;
          }

        }
      );


    const countPendiente =
      $("#countPendiente");


    if (countPendiente) {

      countPendiente.textContent =
        counts["Pendiente"];
    }


    const countListo =
      $("#countListo");


    if (countListo) {

      countListo.textContent =
        counts[
          "Listo para retirar"
        ];
    }


    const countEntregado =
      $("#countEntregado");


    if (countEntregado) {

      countEntregado.textContent =
        counts["Entregado"];
    }


    $$(".btn-advance, .btn-back")
      .forEach(
        (btn) => {

          btn.addEventListener(
            "click",
            async () => {

              await changeOrderStatus(
                btn.dataset.id,
                btn.dataset.dir
              );

            }
          );
        }
      );


  } catch (e) {

    console.error(
      "Error cargando pedidos:",
      e
    );
  }
}


// =========================================================
// CAMBIAR ESTADO DEL PEDIDO
// =========================================================

async function changeOrderStatus(
  id,
  dir
) {

  try {

    const currentOrder =
      state.orders.find(
        (o) =>
          String(o.id) ===
          String(id)
      );


    if (!currentOrder) {
      return;
    }


    const currentStatus =
      currentOrder.estado ||
      "Pendiente";


    const idx =
      STATUS_FLOW.indexOf(
        currentStatus
      );


    if (
      idx < 0
    ) {
      return;
    }


    const newStatus =
      dir ===
        "next"
        ? STATUS_FLOW[
            idx + 1
          ]
        : STATUS_FLOW[
            idx - 1
          ];


    if (!newStatus) {
      return;
    }


    await api(
      `/api/order/${id}/status`,
      {
        method:
          "PATCH",

        body:
          JSON.stringify({

            status:
              newStatus,

            adminId:
              state.user.id,

          }),
      }
    );


    await renderBoard();


    toast(
      `Estado actualizado a: ${newStatus}`
    );


  } catch (e) {

    console.error(
      "Error cambiando estado:",
      e
    );
  }
}


// =========================================================
// AUTO ACTUALIZACIÓN ADMIN
// =========================================================

function startAdminRefresh() {

  stopAdminRefresh();


  adminRefreshTimer =
    setInterval(
      async () => {

        if (
          !state.user ||
          state.user.role !==
            "cafetin"
        ) {

          return;
        }


        const adminView =
          $("#view-admin");


        if (
          !adminView ||
          !adminView.classList.contains(
            "is-active"
          )
        ) {

          return;
        }


        await renderBoard();

      },
      5000
    );
}


// =========================================================
// DETENER AUTO ACTUALIZACIÓN ADMIN
// =========================================================

function stopAdminRefresh() {

  if (
    adminRefreshTimer
  ) {

    clearInterval(
      adminRefreshTimer
    );

    adminRefreshTimer =
      null;
  }
}


// =========================================================
// EDITOR DE MENÚ
// =========================================================

const btnEditMenu =
  $("#btnEditMenu");


if (btnEditMenu) {

  btnEditMenu.addEventListener(
    "click",
    async () => {

      await loadMenu();

      renderMenuEditor();


      const editor =
        $("#menuEditor");


      if (editor) {

        editor.hidden =
          false;
      }

    }
  );
}


// =========================================================
// RENDERIZAR EDITOR
// =========================================================

function renderMenuEditor() {

  const list =
    $("#menuEditorList");


  if (!list) {
    return;
  }


  if (!state.menu.length) {

    list.innerHTML = `

      <li>
        No hay productos registrados.
      </li>

    `;

    return;
  }


  list.innerHTML =
    state.menu
      .map(
        (item) => {

          const id =
            String(
              item.id
            );


          return `

            <li>

              <label>

                <input
                  type="checkbox"
                  data-id="${id}"
                  ${
                    item.disponible
                      ? "checked"
                      : ""
                  }
                >

                ${escapeHtml(
                  item.nombre
                )}

              </label>


              <span class="price-tag">
                ${money(
                  item.precio
                )}
              </span>

            </li>

          `;
        }
      )
      .join("");


  // =====================================================
  // DISPONIBILIDAD
  // =====================================================

  list
    .querySelectorAll(
      "input[type=checkbox]"
    )
    .forEach(
      (box) => {

        box.addEventListener(
          "change",
          async () => {

            const id =
              String(
                box.dataset.id
              );


            const disponible =
              box.checked;


            try {

              await api(
                `/api/menu/${id}`,
                {
                  method:
                    "PATCH",

                  body:
                    JSON.stringify({

                      adminId:
                        state.user.id,

                      disponible:
                        disponible,
                    }),
                }
              );


              const item =
                state.menu.find(
                  (m) =>
                    String(
                      m.id
                    ) ===
                    String(id)
                );


              if (item) {

                item.disponible =
                  disponible;
              }


              toast(
                disponible
                  ? "Producto disponible."
                  : "Producto marcado como agotado."
              );


              renderMenu();


              renderMenuEditor();


            } catch (e) {

              box.checked =
                !disponible;


              console.error(
                "Error actualizando producto:",
                e
              );
            }
          }
        );
      }
    );
}


// =========================================================
// AGREGAR PRODUCTO
// =========================================================

const addItemForm =
  $("#addItemForm");


if (addItemForm) {

  addItemForm.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();


      const nameInput =
        $("#newItemName");


      const priceInput =
        $("#newItemPrice");


      const name =
        (
          nameInput?.value ||
          ""
        ).trim();


      const price =
        parseFloat(
          priceInput?.value
        );


      if (
        !name ||
        Number.isNaN(price) ||
        price < 0
      ) {

        toast(
          "Datos inválidos."
        );

        return;
      }


      try {

        const { producto } =
          await api(
            "/api/menu",
            {
              method:
                "POST",

              body:
                JSON.stringify({

                  adminId:
                    state.user.id,

                  nombre:
                    name,

                  precio:
                    round2(
                      price
                    ),

                }),
            }
          );


        state.menu.push(
          producto
        );


        if (nameInput) {
          nameInput.value =
            "";
        }


        if (priceInput) {
          priceInput.value =
            "";
        }


        renderMenuEditor();

        renderMenu();


        toast(
          `"${name}" agregado al menú.`
        );


      } catch (e) {

        console.error(
          "Error agregando producto:",
          e
        );
      }
    }
  );
}


// =========================================================
// CERRAR EDITOR
// =========================================================

const btnCloseMenu =
  $("#btnCloseMenu");


if (btnCloseMenu) {

  btnCloseMenu.addEventListener(
    "click",
    () => {

      const editor =
        $("#menuEditor");


      if (editor) {

        editor.hidden =
          true;
      }


      renderMenu();
    }
  );
}


// =========================================================
// CUENTAS ADMIN
// =========================================================

async function renderAccounts() {

  try {

    if (
      !state.user ||
      state.user.role !==
        "cafetin"
    ) {

      return;
    }


    const { accounts } =
      await api(
        "/api/accounts?adminId=" +
        encodeURIComponent(
          state.user.id
        )
      );


    state.accounts =
      Array.isArray(
        accounts
      )
        ? accounts
        : [];


    const list =
      $("#accountsList");


    if (!list) {
      return;
    }


    const totalMoney =
      round2(
        state.accounts.reduce(
          (sum, a) =>
            sum +
            Number(
              a.saldo ||
              0
            ),
          0
        )
      );


    const summary =
      $("#accountsSummary");


    if (summary) {

      summary.textContent =
        `${state.accounts.length} cuenta(s) registrada(s) · ${money(
          totalMoney
        )} en billeteras`;
    }


    list.innerHTML =
      state.accounts
        .map(
          (a) => {

            const id =
              String(
                a.id
              );


            const esAdmin =
              a.rol ===
              "cafetin";


            return `

              <li class="account-row">

                <div class="account-info">

                  <strong>
                    ${escapeHtml(
                      a.nombre
                    )}
                  </strong>


                  <span>

                    ${escapeHtml(
                      a.correo
                    )}

                    ·

                    ${
                      esAdmin
                        ? "Administrador"
                        : "Estudiante"
                    }

                    ·

                    ${Number(
                      a.pedidos ||
                      0
                    )}

                    pedido(s)

                  </span>

                </div>


                <div class="account-money">

                  <span class="account-sign">
                    $
                  </span>


                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value="${Number(
                      a.saldo ||
                      0
                    ).toFixed(2)}"
                    data-wallet="${id}"
                    ${
                      esAdmin
                        ? "disabled"
                        : ""
                    }
                  >


                  <button
                    class="btn btn--primary btn--sm"
                    data-savewallet="${id}"
                    ${
                      esAdmin
                        ? "disabled"
                        : ""
                    }
                  >

                    ${
                      esAdmin
                        ? "Admin"
                        : "Guardar"
                    }

                  </button>

                </div>

              </li>

            `;
          }
        )
        .join("");


    // =====================================================
    // GUARDAR SALDO
    // =====================================================

    list
      .querySelectorAll(
        "[data-savewallet]"
      )
      .forEach(
        (btn) => {

          btn.addEventListener(
            "click",
            async () => {

              const id =
                String(
                  btn.dataset
                    .savewallet
                );


              const input =
                list.querySelector(
                  `input[data-wallet="${id}"]`
                );


              if (!input) {
                return;
              }


              const value =
                parseFloat(
                  input.value
                );


              if (
                Number.isNaN(value) ||
                value < 0
              ) {

                toast(
                  "El saldo no puede ser negativo."
                );

                return;
              }


              try {

                const { user } =
                  await api(
                    `/api/account/${id}`,
                    {
                      method:
                        "PATCH",

                      body:
                        JSON.stringify({

                          saldo:
                            round2(
                              value
                            ),

                          adminId:
                            state.user.id,

                        }),
                    }
                  );


                toast(
                  `Saldo de ${user.nombre} actualizado a ${money(
                    user.saldo
                  )}.`
                );


                if (
                  state.user &&
                  String(
                    state.user.id
                  ) ===
                    String(id)
                ) {

                  state.user.saldo =
                    round2(
                      Number(
                        user.saldo
                      )
                    );


                  renderWallet();
                }


                await renderAccounts();


              } catch (e) {

                console.error(
                  "Error actualizando saldo:",
                  e
                );
              }
            }
          );
        }
      );


  } catch (e) {

    console.error(
      "Error cargando cuentas:",
      e
    );
  }
}


// =========================================================
// BOTÓN CUENTAS
// =========================================================

const btnAccounts =
  $("#btnAccounts");


if (btnAccounts) {

  btnAccounts.addEventListener(
    "click",
    async () => {

      await renderAccounts();


      const panel =
        $("#accountsPanel");


      if (panel) {

        panel.hidden =
          false;
      }
    }
  );
}


// =========================================================
// CERRAR CUENTAS
// =========================================================

const btnCloseAccounts =
  $("#btnCloseAccounts");


if (btnCloseAccounts) {

  btnCloseAccounts.addEventListener(
    "click",
    () => {

      const panel =
        $("#accountsPanel");


      if (panel) {

        panel.hidden =
          true;
      }
    }
  );
}


// =========================================================
// INICIAR
// =========================================================

init();