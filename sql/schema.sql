IF DB_ID('CafeElite') IS NULL
BEGIN
  CREATE DATABASE CafeElite;
END
GO

USE CafeElite;
GO

IF OBJECT_ID('DetallePedido', 'U') IS NOT NULL DROP TABLE DetallePedido;
IF OBJECT_ID('Pedidos', 'U') IS NOT NULL DROP TABLE Pedidos;
IF OBJECT_ID('Productos', 'U') IS NOT NULL DROP TABLE Productos;
IF OBJECT_ID('Usuarios', 'U') IS NOT NULL DROP TABLE Usuarios;
GO

CREATE TABLE Usuarios (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  Nombre NVARCHAR(120) NOT NULL,
  Correo NVARCHAR(150) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255) NOT NULL,
  Rol NVARCHAR(20) NOT NULL DEFAULT 'CLIENTE'
      CHECK (Rol IN ('CLIENTE','ADMIN')),
  CreadoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE Productos (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  Nombre NVARCHAR(120) NOT NULL,
  Descripcion NVARCHAR(500) NULL,
  Categoria NVARCHAR(60) NOT NULL,
  Precio DECIMAL(10,2) NOT NULL CHECK (Precio >= 0),
  Stock INT NOT NULL DEFAULT 0 CHECK (Stock >= 0),
  Activo BIT NOT NULL DEFAULT 1,
  Emoji NVARCHAR(10) NULL,
  ActualizadoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE Pedidos (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  UsuarioId INT NOT NULL,
  Total DECIMAL(10,2) NOT NULL CHECK (Total >= 0),
  Estado NVARCHAR(30) NOT NULL DEFAULT 'CONFIRMADO'
      CHECK (Estado IN ('CONFIRMADO','PREPARANDO','LISTO','ENTREGADO','CANCELADO')),
  MetodoPago NVARCHAR(30) NOT NULL
      CHECK (MetodoPago IN ('TARJETA','BILLETERA')),
  CreadoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Pedidos_Usuarios FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id)
);
GO

CREATE TABLE DetallePedido (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  PedidoId INT NOT NULL,
  ProductoId INT NOT NULL,
  Cantidad INT NOT NULL CHECK (Cantidad > 0),
  PrecioUnitario DECIMAL(10,2) NOT NULL CHECK (PrecioUnitario >= 0),
  CONSTRAINT FK_DetallePedido_Pedidos FOREIGN KEY (PedidoId) REFERENCES Pedidos(Id),
  CONSTRAINT FK_DetallePedido_Productos FOREIGN KEY (ProductoId) REFERENCES Productos(Id)
);
GO

CREATE INDEX IX_Productos_Categoria ON Productos(Categoria);
CREATE INDEX IX_Pedidos_UsuarioId ON Pedidos(UsuarioId);
CREATE INDEX IX_Pedidos_CreadoEn ON Pedidos(CreadoEn DESC);
GO

INSERT INTO Productos (Nombre, Descripcion, Categoria, Precio, Stock, Emoji)
VALUES
('Espresso Elite', 'Espresso intenso con notas de cacao.', 'Café', 80.00, 30, N'☕'),
('Cappuccino Cobre', 'Espresso, leche vaporizada y espuma cremosa.', 'Café', 125.00, 24, N'🥛'),
('Latte Vainilla', 'Café suave con leche y un toque de vainilla.', 'Café', 135.00, 20, N'🤎'),
('Cold Brew', 'Extracción fría, refrescante y equilibrada.', 'Bebida fría', 145.00, 16, N'🧊'),
('Croissant Clásico', 'Hojaldre dorado, ligero y crujiente.', 'Panadería', 85.00, 14, N'🥐'),
('Cheesecake de Café', 'Postre cremoso con delicado sabor a café.', 'Postre', 155.00, 10, N'🍰'),
('Sándwich Ejecutivo', 'Pan artesanal, pavo, queso y vegetales frescos.', 'Comida', 195.00, 12, N'🥪'),
('Té Frutos Rojos', 'Infusión aromática, disponible caliente o fría.', 'Té', 95.00, 18, N'🫖');
GO

/*
  IMPORTANTE:
  Para crear un ADMIN real, primero genera un hash bcrypt con Node.js:

  node -e "console.log(require('bcryptjs').hashSync('Admin123!',10))"

  Luego ejecutar, reemplazando EL_HASH_GENERADO:
  INSERT INTO Usuarios (Nombre, Correo, PasswordHash, Rol)
  VALUES ('Administrador Café Elite','admin@cafeelite.com','EL_HASH_GENERADO','ADMIN');
*/