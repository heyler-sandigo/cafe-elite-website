require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sql, getPool } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "cafe-elite-dev-secret";
const DEMO_MODE = String(process.env.DEMO_MODE || "true").toLowerCase() === "true";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const demo = {
  users: [
    {
      id: 1,
      nombre: "Administrador Café Elite",
      correo: process.env.ADMIN_EMAIL || "admin@cafeelite.com",
      passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Admin123!", 10),
      rol: "ADMIN"
    }
  ],
  products: [
    { id: 1, nombre: "Espresso Elite", descripcion: "Espresso intenso con notas de cacao.", categoria: "Café", precio: 80.00, stock: 30, activo: true, emoji: "☕" },
    { id: 2, nombre: "Cappuccino Cobre", descripcion: "Espresso, leche vaporizada y espuma cremosa.", categoria: "Café", precio: 125.00, stock: 24, activo: true, emoji: "🥛" },
    { id: 3, nombre: "Latte Vainilla", descripcion: "Café suave con leche y un toque de vainilla.", categoria: "Café", precio: 135.00, stock: 20, activo: true, emoji: "🤎" },
    { id: 4, nombre: "Cold Brew", descripcion: "Extracción fría, refrescante y equilibrada.", categoria: "Bebida fría", precio: 145.00, stock: 16, activo: true, emoji: "🧊" },
    { id: 5, nombre: "Croissant Clásico", descripcion: "Hojaldre dorado, ligero y crujiente.", categoria: "Panadería", precio: 85.00, stock: 14, activo: true, emoji: "🥐" },
    { id: 6, nombre: "Cheesecake de Café", descripcion: "Postre cremoso con delicado sabor a café.", categoria: "Postre", precio: 155.00, stock: 10, activo: true, emoji: "🍰" },
    { id: 7, nombre: "Sándwich Ejecutivo", descripcion: "Pan artesanal, pavo, queso y vegetales frescos.", categoria: "Comida", precio: 195.00, stock: 12, activo: true, emoji: "🥪" },
    { id: 8, nombre: "Té Frutos Rojos", descripcion: "Infusión aromática, disponible caliente o fría.", categoria: "Té", precio: 95.00, stock: 18, activo: true, emoji: "🫖" }
  ],
  orders: [
    { id: 1001, cliente: "Ana López", total: 7.25, estado: "ENTREGADO", fecha: new Date(Date.now() - 86400000).toISOString() },
    { id: 1002, cliente: "Carlos Ruiz", total: 5.50, estado: "LISTO", fecha: new Date().toISOString() }
  ]
};

function signToken(user) {
  return jwt.sign(
    { id: user.id, correo: user.correo, rol: user.rol, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token requerido" });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requiredRole && payload.rol !== requiredRole) {
        return res.status(403).json({ error: "No autorizado" });
      }
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: "Token inválido o expirado" });
    }
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mode: DEMO_MODE ? "demo" : "sql-server" });
});

// RF01 - Registro de clientes
app.post("/api/auth/register", async (req, res) => {
  const { nombre, correo, password } = req.body;
  if (!nombre || !correo || !password) {
    return res.status(400).json({ error: "Nombre, correo y contraseña son obligatorios" });
  }

  try {
    if (DEMO_MODE) {
      if (demo.users.some(u => u.correo.toLowerCase() === correo.toLowerCase())) {
        return res.status(409).json({ error: "El correo ya está registrado" });
      }
      const user = {
        id: demo.users.length + 1,
        nombre,
        correo,
        passwordHash: await bcrypt.hash(password, 10),
        rol: "CLIENTE"
      };
      demo.users.push(user);
      return res.status(201).json({
        token: signToken(user),
        user: { id: user.id, nombre, correo, rol: user.rol }
      });
    }

    const pool = await getPool();
    const existing = await pool.request()
      .input("correo", sql.NVarChar(150), correo)
      .query("SELECT TOP 1 Id FROM Usuarios WHERE Correo = @correo");

    if (existing.recordset.length) return res.status(409).json({ error: "El correo ya está registrado" });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.request()
      .input("nombre", sql.NVarChar(120), nombre)
      .input("correo", sql.NVarChar(150), correo)
      .input("hash", sql.NVarChar(255), hash)
      .query(`
        INSERT INTO Usuarios (Nombre, Correo, PasswordHash, Rol)
        OUTPUT INSERTED.Id, INSERTED.Nombre, INSERTED.Correo, INSERTED.Rol
        VALUES (@nombre, @correo, @hash, 'CLIENTE')
      `);

    const user = result.recordset[0];
    res.status(201).json({ token: signToken(user), user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible registrar el usuario" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) return res.status(400).json({ error: "Correo y contraseña son obligatorios" });

  try {
    let user;

    if (DEMO_MODE) {
      user = demo.users.find(u => u.correo.toLowerCase() === correo.toLowerCase());
    } else {
      const pool = await getPool();
      const result = await pool.request()
        .input("correo", sql.NVarChar(150), correo)
        .query("SELECT TOP 1 Id AS id, Nombre AS nombre, Correo AS correo, PasswordHash AS passwordHash, Rol AS rol FROM Usuarios WHERE Correo = @correo");
      user = result.recordset[0];
    }

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    res.json({
      token: signToken(user),
      user: { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible iniciar sesión" });
  }
});

// RF02 - Menú actualizado
app.get("/api/menu", async (req, res) => {
  try {
    if (DEMO_MODE) {
      return res.json(demo.products.filter(p => p.activo));
    }

    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        Id AS id, Nombre AS nombre, Descripcion AS descripcion,
        Categoria AS categoria, Precio AS precio, Stock AS stock,
        Activo AS activo, Emoji AS emoji
      FROM Productos
      WHERE Activo = 1
      ORDER BY Categoria, Nombre
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible cargar el menú" });
  }
});

// RF03 y RF04 - Pedido + pago digital simulado
app.post("/api/pedido", auth(), async (req, res) => {
  const { items, metodoPago } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "El pedido no contiene productos" });
  if (!["TARJETA", "BILLETERA"].includes(metodoPago)) return res.status(400).json({ error: "Método de pago inválido" });

  try {
    if (DEMO_MODE) {
      let total = 0;
      for (const item of items) {
        const product = demo.products.find(p => p.id === Number(item.productoId));
        const qty = Number(item.cantidad);
        if (!product || qty < 1 || product.stock < qty) {
          return res.status(409).json({ error: `Stock insuficiente para ${product?.nombre || "un producto"}` });
        }
        total += product.precio * qty;
      }

      items.forEach(item => {
        const product = demo.products.find(p => p.id === Number(item.productoId));
        product.stock -= Number(item.cantidad);
      });

      const order = {
        id: 1000 + demo.orders.length + 1,
        cliente: req.user.nombre,
        total: Number(total.toFixed(2)),
        estado: "CONFIRMADO",
        metodoPago,
        fecha: new Date().toISOString()
      };
      demo.orders.push(order);
      return res.status(201).json({ ...order, mensaje: "Pago aprobado y pedido confirmado" });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let total = 0;
      const normalized = [];

      for (const item of items) {
        const result = await new sql.Request(transaction)
          .input("id", sql.Int, item.productoId)
          .query("SELECT Id, Nombre, Precio, Stock FROM Productos WITH (UPDLOCK, ROWLOCK) WHERE Id = @id AND Activo = 1");

        const product = result.recordset[0];
        const qty = Number(item.cantidad);
        if (!product || qty < 1 || product.Stock < qty) throw new Error(`Stock insuficiente para ${product?.Nombre || "un producto"}`);

        total += Number(product.Precio) * qty;
        normalized.push({ product, qty });
      }

      const orderResult = await new sql.Request(transaction)
        .input("usuarioId", sql.Int, req.user.id)
        .input("total", sql.Decimal(10, 2), total)
        .input("metodoPago", sql.NVarChar(30), metodoPago)
        .query(`
          INSERT INTO Pedidos (UsuarioId, Total, Estado, MetodoPago)
          OUTPUT INSERTED.Id
          VALUES (@usuarioId, @total, 'CONFIRMADO', @metodoPago)
        `);

      const pedidoId = orderResult.recordset[0].Id;

      for (const { product, qty } of normalized) {
        await new sql.Request(transaction)
          .input("pedidoId", sql.Int, pedidoId)
          .input("productoId", sql.Int, product.Id)
          .input("cantidad", sql.Int, qty)
          .input("precio", sql.Decimal(10, 2), product.Precio)
          .query(`
            INSERT INTO DetallePedido (PedidoId, ProductoId, Cantidad, PrecioUnitario)
            VALUES (@pedidoId, @productoId, @cantidad, @precio);

            UPDATE Productos SET Stock = Stock - @cantidad WHERE Id = @productoId;
          `);
      }

      await transaction.commit();
      res.status(201).json({
        id: pedidoId,
        total: Number(total.toFixed(2)),
        estado: "CONFIRMADO",
        mensaje: "Pago aprobado y pedido confirmado"
      });
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (error) {
    console.error(error);
    res.status(409).json({ error: error.message || "No fue posible procesar el pedido" });
  }
});

// RF05 - Inventario
app.get("/api/inventario", auth("ADMIN"), async (req, res) => {
  try {
    if (DEMO_MODE) return res.json(demo.products);

    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Id AS id, Nombre AS nombre, Categoria AS categoria, Precio AS precio,
             Stock AS stock, Activo AS activo, Emoji AS emoji
      FROM Productos
      ORDER BY Nombre
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible consultar el inventario" });
  }
});

app.put("/api/inventario/:id", auth("ADMIN"), async (req, res) => {
  const stock = Number(req.body.stock);
  if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: "Stock inválido" });

  try {
    const id = Number(req.params.id);

    if (DEMO_MODE) {
      const product = demo.products.find(p => p.id === id);
      if (!product) return res.status(404).json({ error: "Producto no encontrado" });
      product.stock = stock;
      return res.json(product);
    }

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("stock", sql.Int, stock)
      .query(`
        UPDATE Productos SET Stock = @stock, ActualizadoEn = SYSUTCDATETIME()
        OUTPUT INSERTED.Id AS id, INSERTED.Nombre AS nombre, INSERTED.Stock AS stock
        WHERE Id = @id
      `);

    if (!result.recordset.length) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(result.recordset[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible actualizar el inventario" });
  }
});

app.get("/api/reportes/resumen", auth("ADMIN"), async (req, res) => {
  try {
    if (DEMO_MODE) {
      const totalVentas = demo.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return res.json({
        pedidos: demo.orders.length,
        ventas: Number(totalVentas.toFixed(2)),
        bajoStock: demo.products.filter(p => p.stock <= 10).length,
        productos: demo.products.length,
        ultimosPedidos: demo.orders.slice().reverse().slice(0, 5)
      });
    }

    const pool = await getPool();
    const summary = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM Pedidos) AS pedidos,
        (SELECT ISNULL(SUM(Total),0) FROM Pedidos WHERE Estado <> 'CANCELADO') AS ventas,
        (SELECT COUNT(*) FROM Productos WHERE Stock <= 10 AND Activo = 1) AS bajoStock,
        (SELECT COUNT(*) FROM Productos WHERE Activo = 1) AS productos
    `);

    const latest = await pool.request().query(`
      SELECT TOP 5
        p.Id AS id, u.Nombre AS cliente, p.Total AS total,
        p.Estado AS estado, p.CreadoEn AS fecha
      FROM Pedidos p
      INNER JOIN Usuarios u ON u.Id = p.UsuarioId
      ORDER BY p.CreadoEn DESC
    `);

    res.json({ ...summary.recordset[0], ultimosPedidos: latest.recordset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible cargar los reportes" });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Café Elite disponible en http://localhost:${PORT}`);
  console.log(`Modo: ${DEMO_MODE ? "DEMO" : "SQL Server"}`);
});