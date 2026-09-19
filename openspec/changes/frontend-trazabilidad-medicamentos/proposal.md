## Why

El contrato `TrazabilidadMedicamentos` ya está desplegado en HashKey Chain Testnet y almacena la cadena de custodia de lotes de medicamentos, pero hoy no existe ninguna interfaz que permita consultarla. Se necesita un frontend web para que farmacias, distribuidores y el público puedan ver, con solo el código del lote (UID del tag RFID), todo su recorrido on-chain.

## What Changes

- Crear una aplicación web React + Vite nueva dentro de `frontend/` del proyecto.
- Conectarse de solo lectura al contrato desplegado en HashKey Chain Testnet.
- Permitir consultar un lote por su código y mostrar:
  - Datos del lote (fabricante, fecha de creación, si existe).
  - La cadena de custodia completa (cada eslabón: actor, estado, condición, timestamp).
  - Estados en texto legible (Registrado, En Tránsito, Recibido, Entregado, Rechazado).
- Consultar en vivo únicamente (sin backend, sin base de datos, sin firmar transacciones).
- Interfaz completa en español, con CSS simple sin librerías de UI pesadas.
- Manejar códigos de lote inválidos (lote inexistente, código vacío, código no registrado).

## Capabilities

### New Capabilities

- `frontend-trazabilidad-medicamentos`: Interfaz web de sola lectura que consulta el contrato `TrazabilidadMedicamentos` en HashKey Chain Testnet para mostrar los datos y la cadena de custodia de un lote de medicamentos.

### Modified Capabilities

- Ninguna (el directorio `openspec/specs/` aún no tiene specs existentes).

## Impact

- **Código**: nueva carpeta `frontend/` (React + Vite, JavaScript). No se toca el contrato Solidity ni `TrazabilidadMedicamentos/`.
- **Dependencias**: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `ethers` (v6).
- **Red**: HashKey Chain Testnet, RPC `https://testnet.hsk.xyz`.
- **Contrato**: `0x50cB8085f4529E4E2B40128314Cc41fF896cd2F8`.
- **APIs del contrato usadas**: `lotes(bytes32)`, `totalEventos(bytes32)`, `obtenerEvento(bytes32,uint256)` (todas `view`, sin cambios de estado).