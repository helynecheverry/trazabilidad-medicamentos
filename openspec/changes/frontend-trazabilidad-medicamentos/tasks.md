## 1. Setup

- [x] 1.1 Scaffold el proyecto React + Vite (JavaScript) dentro de `frontend/` y verificar que `npm install` y `npm run build` funcionan
- [x] 1.2 Añadir `ethers` v6 a las dependencias y copiar el ABI del contrato a `frontend/src/abi/`, verificando que `npm install` es exitoso y el JSON del ABI existe

## 2. Capa de datos (lectura del contrato)

- [x] 2.1 Implementar la config inicial (RPC `https://testnet.hsk.xyz`, dirección `0x50cB8085f4529E4E2B40128314Cc41fF896cd2F8`) y verificar que el provider `JsonRpcProvider` se construye sin errores
- [x] 2.2 Implementar el normalizador de código a `bytes32` y verificar en devtools que convierte inputs hex cortos/sin prefijo a 64 dígitos hex
- [x] 2.3 Implementar `consultarLote(codigo)` que lee `lotes()`, `totalEventos()` y `obtenerEvento()` de forma secuencial y verificar con devtools/proxy del contrato que se obtienen los datos esperados
- [x] 2.4 Implementar el mapeo de `Estado` a etiquetas en español (0-4 y "Desconocido" fuera de rango) y formateo de timestamps a fecha/hora local en español, verificando con pruebas unitarias simples
- [x] 2.5 Manejar errores (red, lote inexistente, código inválido) y verificar que cada caso produce un mensaje de error en español

## 3. Interfaz de usuario

- [x] 3.1 Crear el layout básico (encabezado, buscador, tarjeta de lote y lista de eslabones) con texto en español y verificar que se renderiza en el navegador
- [x] 3.2 Conectar el formulario de búsqueda al estado de la app y verificar que al enviar un código se muestra el resultado o el error correspondiente
- [x] 3.3 Renderizar los datos del lote (fabricante, fecha de creación) y los eslabones de la cadena (actor, estado en español, condición, timestamp local) y verificar visualmente con un lote real registrado
- [x] 3.4 Estilizar con CSS simple (`styles.css`) respetando el layout definido en design.md y verificar que se ve aceptable en un ancho de escritorio y móvil

## 4. Verificación final

- [x] 4.1 Ejecutar `npm run build` sin errores y verificar que el bundle de producción se genera
- [x] 4.2 Ejecutar `npm run dev` y verificar end-to-end: consultar un lote existente de la Testnet muestra su cadena de custodia completa en español