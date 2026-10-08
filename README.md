# Todo a 10.000 — Sistema de organización y control

Sistema web para reemplazar poco a poco los registros en papel del almacén.
Incluye la **Etapa 1** (usuarios con permisos, ventas, total del día), la
**Etapa 2** (gastos, compras y copias de seguridad automáticas) y la
**Etapa 3** (trabajadores y préstamos). Ningún registro se puede borrar ni
editar; solo se puede solicitar su anulación, que queda registrada para
siempre.

---

## 1. Qué necesitas instalado

Solo una cosa: **Node.js**, versión **22.5 o más nueva** (para que traiga
incluido su motor de base de datos SQLite; así no hay que instalar nada más).

Descárgalo aquí: https://nodejs.org
Para saber qué versión tienes, abre una terminal y escribe:

```
node -v
```

Si te muestra `v22.5.0` o más (por ejemplo `v24.14.0`), estás bien.

---

## 2. Cómo abrir el proyecto

1. Descomprime la carpeta `todo-a-10000`.

   **Recomendación para usuarios de OneDrive:** si tu carpeta de Documentos
   está sincronizada con OneDrive (como
   `C:\Users\...\OneDrive\Documentos`), es mejor descomprimir el proyecto
   en una carpeta que **no** se sincronice, por ejemplo `C:\Proyectos\`.
   OneDrive a veces bloquea archivos mientras se instalan las dependencias
   y puede causar errores confusos durante `npm install`.

2. Ábrela en Visual Studio Code (`Archivo → Abrir carpeta...`).
3. Abre una terminal dentro de VS Code (`Terminal → Nueva terminal`).
4. Instala las dependencias (solo la primera vez):

   ```
   npm install
   ```

5. Inicia el sistema:

   ```
   npm start
   ```

   Es normal ver un mensaje amarillo que dice `ExperimentalWarning: SQLite
   is an experimental feature...`. No es un error, es solo un aviso de
   Node.js; el sistema funciona con normalidad.

6. Abre el navegador en:

   ```
   http://localhost:3000
   ```

Para detener el sistema, vuelve a la terminal y presiona `Ctrl + C`.

### Si ya intentaste instalar antes y falló

Si en un intento anterior viste errores sobre `better-sqlite3`, `node-gyp`
o "Visual Studio", borra estas dos cosas antes de volver a intentar (ya no
se necesitan, el proyecto se corrigió para no depender de eso):

```
rmdir /s /q node_modules
del package-lock.json
npm install
```

---

## 3. Usuario inicial

La primera vez que se inicia el sistema, se crea automáticamente un usuario
administrador (rol "dueño"):

```
Usuario:     admin
Contraseña:  cambiar123
```

**Inicia sesión con este usuario y ve a la pestaña "Usuarios" para crear tu
propio usuario de dueño y los usuarios de las cajeras.** Luego, por seguridad,
cambia la contraseña del usuario `admin` (botón "Nueva contraseña") o
desactívalo si ya no lo necesitas.

---

## 4. Cómo se guarda la información

Toda la información se guarda en un solo archivo:

```
database/almacen.db
```

Este archivo **es tu negocio**: contiene todas las ventas, usuarios y
productos. Recomendaciones:

- Haz una copia de este archivo de vez en cuando (por ejemplo, cada noche)
  a una USB, un correo o una carpeta en la nube.
- No lo borres ni lo muevas mientras el sistema está encendido.
- No lo subas a repositorios públicos de código (ya está excluido en
  `.gitignore`).

---

## 5. Copias de seguridad automáticas

Cada vez que se enciende el sistema, y luego cada hora, se guarda una copia
completa de la información en:

```
database/respaldos/almacen-AAAA-MM-DD.db
```

- Hay una copia por día (se va actualizando durante el día) y se conservan
  las de los últimos 60 días.
- Aun así, copia esa carpeta `respaldos` a una USB o a la nube de vez en
  cuando: si el computador se daña, las copias que están dentro de él
  también se pierden.

**Cómo restaurar una copia:**

1. Apaga el sistema (`Ctrl + C` en la terminal).
2. En la carpeta `database`, borra `almacen.db` y, si existen,
   `almacen.db-wal` y `almacen.db-shm`.
3. Copia el respaldo que quieras a `database` y renómbralo `almacen.db`.
4. Vuelve a iniciar con `npm start`.

---

## 6. Qué incluye

- Inicio de sesión con usuario y contraseña.
- Dos roles: **dueño** (acceso total) y **cajera** (solo registra ventas).
- Registro de ventas: producto, cantidad, valor, forma de pago, quién y
  cuándo la registró.
- Precios rápidos: la venta se registra con un clic en **$10.000** o
  **$20.000** (se multiplica solo por la cantidad). Para cambiar esos
  valores, edita los botones `btn-precio` en `public/cajera.html` y
  `public/dueno.html`.
- **Productos rápidos:** sobre el campo "Producto" aparecen botones con
  las prendas del catálogo, separadas en dos columnas, **Hombre a la
  izquierda y Mujer a la derecha**, para elegir con un clic en momentos
  de mucha gente. Si es algo que no está en la lista, se escribe (o se
  busca) normalmente en el campo de abajo, igual que antes — nada de
  eso se quitó.
  Estos botones se arman solos a partir de la pestaña "Productos" del
  dueño: al agregar un producto nuevo ahí, se elige si es de **Hombre**,
  **Mujer** o **Ambos**, y automáticamente aparece en el recuadro
  correcto al registrar la próxima venta (no hay que tocar código). La
  tienda ya arranca con 17 prendas típicas precargadas con su género
  asignado; se pueden quitar o agregar más cuando haga falta.
- Total del día, calculado automáticamente.
- **Ninguna venta se puede editar ni borrar.** Si hay un error, se debe
  "solicitar anulación" indicando el motivo; el dueño la autoriza o la
  rechaza. El registro original nunca desaparece del historial.
- Historial de ventas por rango de fechas (solo para el dueño).
- Catálogo simple de productos (para llenar las ventas más rápido; no es
  control de inventario).
- Gestión de usuarios: crear, activar/desactivar, restablecer contraseña.
- **Gastos** (papel, bolsas, aseo, transporte...): los registran el dueño y
  las cajeras. Se ve el total de gastos del día junto al total vendido.
- **Compras** (ropa, bolsas, etc.): proveedor, qué se compró, número de
  factura (opcional) y valor. Las registran el dueño y las cajeras; el
  historial completo por fechas es solo del dueño.
- Gastos y compras tienen la misma protección que las ventas: no se editan
  ni se borran, solo se solicita la anulación con motivo y el dueño la
  autoriza o rechaza.
- **Pendientes:** el dueño tiene una pestaña con TODAS las solicitudes de
  anulación esperando su decisión (ventas, gastos, compras y préstamos),
  en un solo lugar, con un contador que avisa cuántas hay.
- **Trabajadores:** el dueño crea los trabajadores y les asigna un pago
  diario (por defecto $60.000).
- **Préstamos:** el cajero y el dueño pueden registrar un préstamo a un
  trabajador durante el día. El sistema no deja prestar más de lo que ese
  trabajador gana ese mismo día, sumando todos los préstamos ya hechos.
  Si se anula un préstamo, ese cupo se libera automáticamente.
- **Pagos de hoy:** una tabla en vivo por trabajador con su pago diario,
  lo que ya se le prestó hoy y lo que queda por pagar.
- **Reportes (solo dueño):** una pestaña nueva para ver, por el período
  que elijas (hoy, esta semana, este mes, mes anterior, o un rango de
  fechas a tu gusto):
  - Tarjetas con el total de ventas, compras, gastos y préstamos del
    período, y si vendiste más o menos de lo que compraste (en verde o
    rojo).
  - Un gráfico de barras comparando ventas, compras, gastos y préstamos
    día por día, semana por semana o mes por mes (se puede ver también
    como tabla con los valores exactos).
  - Un gráfico con los productos más vendidos en el período.
  - Un botón para **descargar todo en un Excel** (`.xlsx`), con una hoja
    de resumen y una hoja de detalle completa por cada tipo de
    movimiento (ventas, gastos, compras, préstamos y productos más
    vendidos), lista para abrir en Excel o Google Sheets, ordenar,
    filtrar o enviar al contador si alguna vez hace falta.

  Esto es lo que reemplaza al "control de inventario" como tal: como la
  propuesta original no incluye contar existencias físicas, este
  reporte le permite al dueño comparar cuánto compró contra cuánto
  vendió en cualquier período, para notar a simple vista si está
  comprando de más.

## 7. Qué falta

Con esto quedan cubiertas las 5 etapas de la propuesta original. Lo que
queda pendiente es ajustar el sistema según el uso real en la tienda
(por ejemplo, si algún reporte necesita otro dato, o si algún flujo se
siente lento o incómodo en el día a día).

---

## 8. Estructura del proyecto

```
todo-a-10000/
├── server.js              Servidor principal (Express)
├── database/
│   ├── db.js               Conexión y esquema de la base de datos SQLite
│   └── respaldos.js        Copias de seguridad automáticas
├── middleware/
│   └── auth.js              Verifica sesión y permisos por rol
├── routes/
│   ├── auth.js               Iniciar/cerrar sesión
│   ├── ventas.js              Registrar y consultar ventas, anulaciones
│   ├── movimientos.js         Lógica compartida de gastos, compras y préstamos
│   ├── gastos.js / compras.js / prestamos.js
│   ├── trabajadores.js        Perfiles de trabajadores y su pago diario
│   ├── pendientes.js          Todas las anulaciones pendientes, juntas
│   ├── productos.js           Catálogo simple de productos
│   └── usuarios.js            Gestión de usuarios (solo dueño)
└── public/                 Lo que se ve en el navegador
    ├── login.html
    ├── cajera.html            Pantalla para registrar ventas
    ├── dueno.html             Panel completo (hoy, historial, productos, usuarios)
    ├── css/style.css
    └── js/ (comun.js, movimientos.js, trabajadores.js, pendientes.js,
           login.js, cajera.js, dueno.js)
```

Para seguir con la Etapa 4 (productos más vendidos y el cierre diario con
PDF descargable), dile a Claude que continúe con ese módulo sobre esta
misma base.
