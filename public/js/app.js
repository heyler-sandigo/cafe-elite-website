const state = {
  menu: [],
  cart: JSON.parse(localStorage.getItem("cafeEliteCart") || "[]"),
  user: JSON.parse(localStorage.getItem("cafeEliteUser") || "null"),
  token: localStorage.getItem("cafeEliteToken"),
  category: "Todos",
  authMode: "login"
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const page = document.body.dataset.page;

function money(value) {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => el.classList.remove("show"), 2400);
}

async function api(url, options = {}) {
  const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ocurrió un error inesperado");
  return data;
}

function saveCart() {
  localStorage.setItem("cafeEliteCart", JSON.stringify(state.cart));
  refreshHeader();
}

function setSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("cafeEliteToken", data.token);
  localStorage.setItem("cafeEliteUser", JSON.stringify(data.user));
  refreshHeader();
}

function logout(redirect = true) {
  state.token = null;
  state.user = null;

  // El carrito se conserva para no perder una selección por un cierre accidental.
  // Se eliminan los datos asociados a la identidad y al último pedido.
  localStorage.removeItem("cafeEliteToken");
  localStorage.removeItem("cafeEliteUser");
  localStorage.removeItem("cafeEliteLastOrder");
  sessionStorage.removeItem("cafeEliteReturnTo");

  refreshHeader();

  if (redirect) {
    location.href = "/index.html";
  }
}

function refreshHeader() {
  const count = state.cart.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  if ($("#cartCount")) $("#cartCount").textContent = count;

  const account = $("#accountLink");
  const menu = $("#accountMenu");
  const dropdown = $("#accountDropdown");
  const name = $("#accountName");
  const email = $("#accountEmail");
  const adminLink = $("#adminPanelLink");

  if (account) {
    if (state.user) {
      const firstName = state.user.nombre?.split(" ")[0] || "Mi cuenta";
      account.textContent = `${firstName} ▾`;
      account.href = "#";
      account.setAttribute("aria-haspopup", "true");
      account.setAttribute("aria-expanded", menu?.classList.contains("open") ? "true" : "false");

      if (name) name.textContent = state.user.nombre || "Usuario";
      if (email) email.textContent = state.user.correo || "";

      if (adminLink) {
        adminLink.classList.toggle("hidden", state.user.rol !== "ADMIN");
      }
    } else {
      account.textContent = "Ingresar";
      account.href = "/login.html";
      account.removeAttribute("aria-haspopup");
      account.removeAttribute("aria-expanded");

      if (menu) menu.classList.remove("open");
      if (dropdown) dropdown.setAttribute("aria-hidden", "true");
      if (adminLink) adminLink.classList.add("hidden");
    }
  }

  const path = location.pathname.split("/").pop() || "index.html";
  $$(".nav > a").forEach(a => {
    const href = a.getAttribute("href")?.split("/").pop();
    a.classList.toggle("active", href === path);
  });
}

function setupAccountMenu() {
  const account = $("#accountLink");
  const menu = $("#accountMenu");
  const dropdown = $("#accountDropdown");
  const logoutButton = $("#logoutBtn");

  if (account && menu) {
    account.addEventListener("click", event => {
      if (!state.user) return;

      event.preventDefault();
      const isOpen = menu.classList.toggle("open");
      account.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (dropdown) dropdown.setAttribute("aria-hidden", isOpen ? "false" : "true");
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      if (confirm("¿Deseas cerrar tu sesión en Café Elite?")) {
        logout(true);
      }
    });
  }

  document.addEventListener("click", event => {
    if (!menu || !state.user) return;
    if (!menu.contains(event.target)) {
      menu.classList.remove("open");
      if (account) account.setAttribute("aria-expanded", "false");
      if (dropdown) dropdown.setAttribute("aria-hidden", "true");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu) {
      menu.classList.remove("open");
      if (account) account.setAttribute("aria-expanded", "false");
      if (dropdown) dropdown.setAttribute("aria-hidden", "true");
    }
  });
}

async function loadMenu() {
  try {
    state.menu = await api("/api/menu");
  } catch (error) {
    state.menu = [];
    if ($("#menuGrid")) $("#menuGrid").innerHTML = `<div class="loading-card">No se pudo cargar el menú. Verifica que el servidor esté iniciado.</div>`;
  }
}

function renderMenu() {
  if (!$("#menuGrid")) return;
  const items = state.category === "Todos" ? state.menu : state.menu.filter(p => p.categoria === state.category);

  $("#menuGrid").innerHTML = items.map(item => `
    <article class="menu-card">
      <div class="product-art">${item.emoji || "☕"}</div>
      <div class="menu-card-body">
        <span class="category">${item.categoria}</span>
        <h3>${item.nombre}</h3>
        <p>${item.descripcion}</p>
        <span class="stock ${Number(item.stock) <= 10 ? "low" : ""}">
          ${Number(item.stock) > 0 ? `${item.stock} disponibles` : "Agotado"}
        </span>
        <div class="menu-card-footer">
          <strong class="price">${money(item.precio)}</strong>
          <button class="add-button" data-add="${item.id}" ${Number(item.stock) <= 0 ? "disabled" : ""}>+</button>
        </div>
      </div>
    </article>
  `).join("") || `<div class="loading-card">No hay productos en esta categoría.</div>`;
}

function addToCart(id) {
  const product = state.menu.find(p => p.id === Number(id));
  if (!product || Number(product.stock) <= 0) return;

  const existing = state.cart.find(i => i.productoId === product.id);
  const current = existing?.cantidad || 0;

  if (current >= Number(product.stock)) {
    toast("No hay más unidades disponibles");
    return;
  }

  if (existing) existing.cantidad++;
  else state.cart.push({ productoId:product.id, cantidad:1 });

  saveCart();
  toast(`${product.nombre} agregado al carrito`);
}

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const p = state.menu.find(x => x.id === item.productoId);
    return sum + (p ? Number(p.precio) * item.cantidad : 0);
  }, 0);
}

function changeQty(id, delta) {
  const item = state.cart.find(i => i.productoId === Number(id));
  const product = state.menu.find(p => p.id === Number(id));
  if (!item || !product) return;

  const next = item.cantidad + Number(delta);
  if (next <= 0) state.cart = state.cart.filter(i => i.productoId !== Number(id));
  else if (next <= Number(product.stock)) item.cantidad = next;
  else toast("Cantidad máxima disponible alcanzada");

  saveCart();
  renderCartPage();
}

function renderCartPage() {
  if (!$("#cartItemsPage")) return;

  const rows = state.cart.map(item => {
    const p = state.menu.find(product => product.id === item.productoId);
    if (!p) return "";
    return `
      <article class="cart-line">
        <div class="cart-emoji">${p.emoji || "☕"}</div>
        <div>
          <h3>${p.nombre}</h3>
          <small>${money(p.precio)} c/u</small>
          <div class="qty">
            <button data-qty="${item.productoId}" data-delta="-1">−</button>
            <span>${item.cantidad}</span>
            <button data-qty="${item.productoId}" data-delta="1">+</button>
          </div>
        </div>
        <button class="cart-remove" data-remove="${item.productoId}" aria-label="Eliminar">×</button>
      </article>
    `;
  }).join("");

  $("#cartItemsPage").innerHTML = rows || `
    <div class="empty-state">
      <span>☕</span>
      Tu carrito está vacío.<br>
      <a class="text-link" href="/menu.html">Ir al menú</a>
    </div>
  `;

  if ($("#cartItemsCount")) $("#cartItemsCount").textContent = state.cart.reduce((s,i) => s + i.cantidad, 0);
  if ($("#cartTotal")) $("#cartTotal").textContent = money(cartTotal());

  const payment = $("#goPaymentBtn");
  if (payment) {
    payment.style.pointerEvents = state.cart.length ? "auto" : "none";
    payment.style.opacity = state.cart.length ? "1" : ".45";
  }
}

function renderCheckoutSummary() {
  if (!$("#checkoutSummary")) return;

  $("#checkoutSummary").innerHTML = state.cart.map(item => {
    const p = state.menu.find(x => x.id === item.productoId);
    return p ? `<div class="checkout-line"><span>${item.cantidad} × ${p.nombre}</span><span>${money(p.precio * item.cantidad)}</span></div>` : "";
  }).join("") + `
    <div class="checkout-line checkout-total"><span>Total</span><span>${money(cartTotal())}</span></div>
  `;
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$(".auth-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));
  if ($("#nameField")) $("#nameField").classList.toggle("hidden", mode !== "register");
  if ($("#authSubmit")) $("#authSubmit").textContent = mode === "register" ? "Registrarme" : "Ingresar";
  if ($("#authMessage")) $("#authMessage").textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();
  const msg = $("#authMessage");
  msg.textContent = "";

  const payload = {
    correo: $("#authEmail").value.trim(),
    password: $("#authPassword").value
  };
  if (state.authMode === "register") payload.nombre = $("#authName").value.trim();

  try {
    const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const data = await api(endpoint, { method:"POST", body:JSON.stringify(payload) });
    setSession(data);

    if (data.user.rol === "ADMIN") location.href = "/admin.html";
    else location.href = state.cart.length ? "/carrito.html" : "/menu.html";
  } catch (error) {
    msg.textContent = error.message;
  }
}

async function submitOrder(event) {
  event.preventDefault();
  const msg = $("#checkoutMessage");
  msg.textContent = "";

  if (!state.user) {
    sessionStorage.setItem("cafeEliteReturnTo", "/pago.html");
    location.href = "/login.html";
    return;
  }
  if (!state.cart.length) {
    location.href = "/menu.html";
    return;
  }

  try {
    const result = await api("/api/pedido", {
      method:"POST",
      body:JSON.stringify({ items:state.cart, metodoPago:$("#paymentMethod").value })
    });

    localStorage.setItem("cafeEliteLastOrder", JSON.stringify(result));
    state.cart = [];
    saveCart();
    location.href = "/confirmacion.html";
  } catch (error) {
    msg.textContent = error.message;
  }
}

function renderConfirmation() {
  const order = JSON.parse(localStorage.getItem("cafeEliteLastOrder") || "null");
  if (!order) {
    $("#confirmationText").textContent = "No encontramos un pedido reciente para mostrar.";
    $("#confirmationDetails").innerHTML = `<a class="text-link" href="/menu.html">Realizar un pedido →</a>`;
    return;
  }

  $("#confirmationText").textContent = "Tu pago fue aprobado y estamos preparando tu pedido.";
  $("#confirmationDetails").innerHTML = `
    <div class="confirmation-detail"><span>Número de pedido</span><strong>#${order.id}</strong></div>
    <div class="confirmation-detail"><span>Estado</span><strong>${order.estado}</strong></div>
    <div class="confirmation-detail"><span>Total</span><strong>${money(order.total)}</strong></div>
  `;
}

function ordersTable(orders, title="Pedidos") {
  const rows = (orders || []).map(o => `
    <tr>
      <td>#${o.id}</td><td>${o.cliente}</td><td>${money(o.total)}</td>
      <td><span class="status-pill">${o.estado}</span></td>
      <td>${new Date(o.fecha).toLocaleString("es-NI")}</td>
    </tr>
  `).join("");

  return `
    <section class="admin-card">
      <h2>${title}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5">Sin pedidos registrados.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function setAdminNav(view) {
  $$(".admin-nav[data-admin-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.adminView === view));
}

async function renderAdminDashboard() {
  setAdminNav("dashboard");
  $("#adminView").innerHTML = `<div class="loading-card">Cargando resumen…</div>`;
  try {
    const data = await api("/api/reportes/resumen");
    $("#adminView").innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><span>Pedidos</span><strong>${data.pedidos}</strong></div>
        <div class="stat-card"><span>Ventas</span><strong>${money(data.ventas)}</strong></div>
        <div class="stat-card"><span>Productos</span><strong>${data.productos}</strong></div>
        <div class="stat-card"><span>Bajo stock</span><strong>${data.bajoStock}</strong></div>
      </div>
      ${ordersTable(data.ultimosPedidos, "Últimos pedidos")}
    `;
  } catch (error) {
    $("#adminView").innerHTML = `<div class="loading-card">${error.message}</div>`;
  }
}

async function renderInventory() {
  setAdminNav("inventory");
  $("#adminView").innerHTML = `<div class="loading-card">Cargando inventario…</div>`;
  try {
    const items = await api("/api/inventario");
    $("#adminView").innerHTML = `
      <section class="admin-card">
        <h2>Inventario</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Acción</th></tr></thead>
            <tbody>
              ${items.map(p => `
                <tr>
                  <td>${p.emoji || "☕"} ${p.nombre}</td>
                  <td>${p.categoria}</td>
                  <td>${money(p.precio)}</td>
                  <td><input class="stock-input" type="number" min="0" value="${p.stock}" data-stock-input="${p.id}"></td>
                  <td><button class="table-action" data-save-stock="${p.id}">Guardar</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  } catch (error) {
    $("#adminView").innerHTML = `<div class="loading-card">${error.message}</div>`;
  }
}

async function saveStock(id) {
  const input = document.querySelector(`[data-stock-input="${id}"]`);
  try {
    await api(`/api/inventario/${id}`, {
      method:"PUT",
      body:JSON.stringify({ stock:Number(input.value) })
    });
    toast("Stock actualizado");
  } catch (error) {
    toast(error.message);
  }
}

async function renderReports() {
  setAdminNav("reports");
  $("#adminView").innerHTML = `<div class="loading-card">Cargando reporte…</div>`;
  try {
    const data = await api("/api/reportes/resumen");
    $("#adminView").innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><span>Ventas registradas</span><strong>${money(data.ventas)}</strong></div>
        <div class="stat-card"><span>Pedidos totales</span><strong>${data.pedidos}</strong></div>
        <div class="stat-card"><span>Productos activos</span><strong>${data.productos}</strong></div>
        <div class="stat-card"><span>Requieren reposición</span><strong>${data.bajoStock}</strong></div>
      </div>
      ${ordersTable(data.ultimosPedidos, "Actividad reciente")}
    `;
  } catch (error) {
    $("#adminView").innerHTML = `<div class="loading-card">${error.message}</div>`;
  }
}

async function init() {
  refreshHeader();
  setupAccountMenu();
  if ($("#year")) $("#year").textContent = new Date().getFullYear();

  if ($("#menuToggle")) {
    $("#menuToggle").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
  }

  if (["menu","carrito","pago"].includes(page)) await loadMenu();

  if (page === "menu") {
    renderMenu();

    $("#filters").addEventListener("click", e => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      state.category = btn.dataset.category;
      $$(".filter").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      renderMenu();
    });

    document.addEventListener("click", e => {
      const add = e.target.closest("[data-add]");
      if (add) addToCart(add.dataset.add);
    });
  }

  if (page === "carrito") {
    renderCartPage();

    document.addEventListener("click", e => {
      const qty = e.target.closest("[data-qty]");
      if (qty) changeQty(qty.dataset.qty, qty.dataset.delta);

      const remove = e.target.closest("[data-remove]");
      if (remove) {
        state.cart = state.cart.filter(i => i.productoId !== Number(remove.dataset.remove));
        saveCart();
        renderCartPage();
      }
    });

    $("#goPaymentBtn").addEventListener("click", e => {
      if (!state.cart.length) e.preventDefault();
      else if (!state.user) {
        e.preventDefault();
        sessionStorage.setItem("cafeEliteReturnTo", "/pago.html");
        location.href = "/login.html";
      }
    });
  }

  if (page === "login") {
    if (state.user && state.user.rol !== "ADMIN") {
      const info = document.createElement("div");
      info.className = "demo-access session-active";
      info.innerHTML = `
        <strong>Sesión activa</strong>
        <span>${state.user.nombre} (${state.user.correo})</span>
        <button class="btn secondary full" id="logoutPageBtn" type="button" style="margin-top:10px">Cerrar sesión</button>
      `;
      $(".form-card").appendChild(info);

      $("#logoutPageBtn").addEventListener("click", () => {
        if (confirm("¿Deseas cerrar tu sesión en Café Elite?")) {
          logout(true);
        }
      });
    }

    $$(".auth-tab").forEach(tab => tab.addEventListener("click", () => setAuthMode(tab.dataset.mode)));
    $("#authForm").addEventListener("submit", submitAuth);
  }

  if (page === "pago") {
    if (!state.user) {
      sessionStorage.setItem("cafeEliteReturnTo", "/pago.html");
      location.href = "/login.html";
      return;
    }
    if (!state.cart.length) {
      location.href = "/menu.html";
      return;
    }
    renderCheckoutSummary();
    $("#paymentMethod").addEventListener("change", e => {
      $("#cardFields").classList.toggle("hidden", e.target.value !== "TARJETA");
    });
    $("#checkoutForm").addEventListener("submit", submitOrder);
  }

  if (page === "confirmacion") renderConfirmation();

  if (page === "admin") {
    if (!state.user || state.user.rol !== "ADMIN") {
      location.href = "/login.html";
      return;
    }
    $("#adminUser").textContent = state.user.nombre;

    const adminLogoutBtn = $("#adminLogoutBtn");
    if (adminLogoutBtn) {
      adminLogoutBtn.addEventListener("click", () => {
        if (confirm("¿Deseas cerrar la sesión del administrador?")) {
          logout(true);
        }
      });
    }

    renderAdminDashboard();

    $$(".admin-nav[data-admin-view]").forEach(btn => btn.addEventListener("click", () => {
      if (btn.dataset.adminView === "dashboard") renderAdminDashboard();
      if (btn.dataset.adminView === "inventory") renderInventory();
      if (btn.dataset.adminView === "reports") renderReports();
    }));

    document.addEventListener("click", e => {
      const save = e.target.closest("[data-save-stock]");
      if (save) saveStock(save.dataset.saveStock);
    });
  }

  const returnTo = sessionStorage.getItem("cafeEliteReturnTo");
  if (page === "login" && state.user && returnTo) {
    sessionStorage.removeItem("cafeEliteReturnTo");
  }
}

init();
