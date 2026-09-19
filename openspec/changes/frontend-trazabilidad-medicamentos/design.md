## Context

Ver `proposal.md` para la motivación. El contrato `TrazabilidadMedicamentos` está desplegado en `0x50cB8085f4529E4E2B40128314Cc41fF896cd2F8` sobre HashKey Chain Testnet (RPC `https://testnet.hsk.xyz`) y expone solo funciones `view`: `lotes(bytes32)`, `totalEventos(bytes32)` y `obtenerEvento(bytes32,uint256)`. La carpeta `frontend/` está vacía; se parte desde cero. Stack fijado: React + Vite (JavaScript), ethers v6, texto en español, CSS simple.

## Goals / Non-Goals

**Goals:**
- Aplicación de una sola página (SPA) liviana que lee el contrato de solo lectura.
- Consulta de lote por código bytes32 y visualización de su cadena de custodia completa.
- ABI del contrato mantenido en el repo del frontend para no depender de fuentes externas de verificación de ABI.

**Non-Goals:**
- Escritura en el contrato: sin funciones que firmen transacciones ni botones de autorizar/registrar.
- Conexión con billeteras (MetaMask, WalletConnect) — no aplica a modo lectura puro.
- Backend, base de datos, caché persistente o indexado de eventos fuera de cadena.
- Autenticación/roles en el frontend: la visibilidad es pública por diseño.

## Decisions

1. **React + Vite (JavaScript)** — Stack fijado por el proyecto. `npm create vite@latest` con plantilla `react` (JS). Sin TypeScript para mantenerlo simple.

2. **ethers v6 con JsonRpcProvider (no BrowserProvider)** — El frontend no necesita billetera ni signer; un `new JsonRpcProvider("https://testnet.hsk.xyz")` alcanza para las llamadas `view`. Alternativa descartada: `BrowserProvider` + MetaMask, que introduce dependencia de wallet y no aporta nada para lectura pura.

3. **ABI incrustado en el repo** — Se copia el ABI del contrato (de `TrazabilidadMedicamentos/out/TrazabilidadMedicamentos.sol/TrazabilidadMedicamentos.json`) a `frontend/src/abi/`. Evita resolver ABI en runtime y funciona sin conectividad a explorers. Alternativa descartada: buscar ABI en block explorers desde el frontend (red no soportada/estable).

4. **Lectura secuencial de eventos con límite** — Se consulta `totalEventos(codigo)` y luego `obtenerEvento(codigo, i)` para `i` de 0 a total-1. Gráfico simple y predecible; los lotes tienen cadenas cortas. Alternativa descartada: filtrar logs de eventos de emisión (requiere histórico indexado y no da el estado completo por eslabón).

5. **Normalización del input a bytes32** — Manejador normalizador: si el usuario pega un hex sin prefijo o menos de 64 dígitos, se completa con ceros a la izquierda a 32 bytes antes de llamar `lotes(bytes32)`. Esto mantiene la spec de aceptar bytes32 válido mientras tolera errores de copiado comunes.

6. **Formato de lecturas** — Los timestamps (`createdEn`, `timestamp`) se muestran como fecha/hora local con `Intl.DateTimeFormat("es-ES")`. El enum `Estado` se mapea a etiquetas en español (0=Registrado, 1=EnTránsito, 2=Recibido, 3=Entregado, 4=Rechazado; otro valor → "Desconocido"). `condition` (bytes32) se muestra en formato legible si es ASCII (*strip* de ceros a la derecha) y como hex en caso contrario.

7. **Estilos simples en un único `styles.css`** — CSS plano, sin preprocesadores ni framework de UI. Layout de una columna: encabezado, buscador, tarjeta de lote y lista de eslabones de la cadena.

## Risks / Trade-offs

- **[RPC público puede ser inestable o lento]** → Se muestra mensaje de error claro en español y se permite reintentar la consulta desde el mismo formulario.
- **[El consumo de eventos por índice asume cadenas cortas]** → Aceptable para hackathon; si un lote tuviera cientos de eslabones sería lento, pero el dominio (cadena de custodia de medicamentos) produce pocos eventos por lote.
- **[Sin TypeScript se pierden checks de tipos]** → Mitigado con diseño simple y revisión manual; ABI tipado por ethers v6 (`Interface`) que valida entradas/salidas en runtime.
- **[bytes32 de 32 bytes es un input incómodo para humanos]** → Mitigado con el normalizador de la decisión 5 y una pista visual en el formulario (placeholder en español).

## Migration Plan

Proyecto nuevo dentro de `frontend/`, sin impacto en el repo de Solidity. No hay despliegue previo que reemplazar. Rollback: eliminar la carpeta `frontend/`.

## Open Questions

Ninguna. El alcance de lectura pura es claro y los valores de contrato (ruta RPC, dirección y hash del ABI) están definidos.