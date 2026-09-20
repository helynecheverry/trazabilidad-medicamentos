# Trazabilidad de Medicamentos con Pago Condicionado a la Integridad

Sistema de trazabilidad de medicamentos que registra en blockchain (**HashKey Chain**, un L2 de Ethereum) las condiciones físicas de un medicamento durante su transporte, y libera automáticamente un pago en escrow al fabricante **solo si el lote llega sin daños**.

> Proyecto construido para el hackathon **EAG / ETH Cali Builders Tour**.

## El problema

En la cadena de suministro de medicamentos, la integridad del producto (temperatura, golpes, manipulación) es crítica pero difícil de auditar: los registros en papel o en sistemas centralizados se pueden alterar, y el pago al fabricante o distribuidor suele liberarse por confianza o por proceso manual, sin importar si el medicamento llegó realmente en buen estado.

Este proyecto resuelve ambos problemas a la vez:

- **Trazabilidad verificable**: cada evento del transporte (registro, tránsito, recepción, daño) queda escrito de forma inmutable en un contrato inteligente, firmado por un dispositivo autorizado.
- **Pago condicionado automáticamente**: el comprador deposita el pago en un escrow on-chain al momento del envío. El contrato solo libera ese pago al fabricante si, al confirmar la entrega, el historial del lote no registra ningún evento de daño. Si hubo un daño, el pago queda retenido on-chain sin intervención humana.

## Arquitectura (Edge → Gateway → Chain)

El sistema sigue un patrón IoT de 3 capas, pensado explícitamente para que **ninguna llave privada viva en el dispositivo físico**:

```
┌─────────────────────┐      HTTP POST       ┌──────────────────────┐      tx firmada      ┌───────────────────────┐
│   Capa 1 · Edge      │  (lote, sensores)    │  Capa 2 · Gateway     │   (viem + llave)     │   Capa 3 · Chain       │
│                      │ ───────────────────► │                       │ ───────────────────► │                        │
│  ESP32 + sensores    │                      │  Cloudflare Worker    │                      │  HashKey Chain L2      │
│  (Arduino/C++)       │                      │  firmante-hsk         │                      │  Contrato Solidity     │
└─────────────────────┘                      └──────────────────────┘                      └───────────┬───────────┘
                                                                                                          │ lecturas view
                                                                                                          ▼
                                                                                              ┌───────────────────────┐
                                                                                              │   Frontend (React)    │
                                                                                              │  consulta + wallet    │
                                                                                              └───────────────────────┘
```

### Capa 1 — Edge (hardware, fuera de este repositorio)

Un ESP32 con tres sensores lee en tiempo real las condiciones del medicamento en tránsito:

- **DHT11** — temperatura y humedad.
- **ADXL345** — acelerómetro, para detectar golpes o caídas.
- **HC-SR501 (PIR)** — sensor de movimiento/presencia, para detectar aperturas no autorizadas del contenedor.

Cuando el ESP32 detecta una anomalía (temperatura fuera de rango, golpe fuerte, o apertura), empaqueta la lectura y la envía por HTTP (POST) al Worker. **El firmware nunca tiene una llave privada** — es un cliente HTTP simple, así que si el dispositivo es robado o clonado, no compromete el contrato. El firmware (Arduino/C++) se mantiene fuera de este repositorio, que se enfoca en el software de backend, contrato y frontend.

### Capa 2 — Gateway (`firmante-hsk/`)

Un **Cloudflare Worker** escrito en JavaScript con [viem](https://viem.sh/) que actúa como puente de confianza:

1. Recibe el POST del ESP32 con `{ lote, alerta, temp, acel, mov }`.
2. Empaqueta los tres sensores y la alerta en un solo campo `condicion` con el formato `ALERTA|T<temp>|A<acel>|M<mov>` (por ejemplo `GOLPE|T24|A85|M1`), codificado como `bytes32`.
3. Carga la llave privada del dispositivo autorizado desde una variable de entorno secreta (`env.LLAVE_PRIVADA`, nunca hardcodeada ni expuesta al cliente).
4. Firma y envía la transacción `registrarEvento(codigo, estado, condicion)` directamente a HashKey Chain con `viem` (`createWalletClient` + `sendTransaction`).
5. Devuelve el hash de la transacción al llamador.

Esta capa es la razón por la que el ESP32 no necesita guardar secretos: la llave vive únicamente en el entorno seguro del Worker (Cloudflare Secrets), y solo la dirección derivada de esa llave está autorizada (`ROL_DISPOSITIVO`) para escribir en el contrato.

### Capa 3 — Chain (`TrazabilidadMedicamentos/`)

Un contrato inteligente en Solidity, con [Foundry](https://book.getfoundry.sh/) como toolchain y [OpenZeppelin](https://www.openzeppelin.com/contracts) (`Ownable`, `AccessControl`, `ReentrancyGuard`) como base auditada:

- **Control de acceso por rol**: solo direcciones con `ROL_DISPOSITIVO` (otorgado por el `owner` vía `autorizar()`) pueden registrar lotes y eventos.
- **Cadena de custodia inmutable**: cada lote (`Lote`) tiene un historial de eventos (`Evento[]`) — actor, estado, condición y timestamp — que nunca se puede editar ni borrar, solo añadir.
- **Escrow con pago condicionado a integridad**: cualquiera puede depositar fondos para un lote (`depositarEscrow`, `payable`). Al confirmar la entrega (`confirmarEntrega`), el contrato revisa si el lote tuvo algún evento con condición distinta de `"OK"` (`tuvoDano`). Si tuvo daño, la transacción revierte y el pago queda retenido; si no, transfiere el escrow completo al fabricante y emite `PagoLiberado`.
- **Protección contra reentrancy**: `confirmarEntrega` usa `nonReentrant` de OpenZeppelin porque mueve fondos nativos (`call{value: ...}`).

Contrato desplegado y verificado en **HashKey Chain Testnet** (chain ID `133`):

- **Dirección**: [`0x75B81d9dCd1101b0C5854509d0065368d9596d13`](https://testnet-explorer.hskchain.net/address/0x75B81d9dCd1101b0C5854509d0065368d9596d13)
- **Explorer**: https://testnet-explorer.hskchain.net/address/0x75B81d9dCd1101b0C5854509d0065368d9596d13
- **RPC**: `https://testnet.hsk.xyz`

### Frontend (`frontend/`)

Aplicación **React + Vite + ethers v6**, en español, que cumple dos funciones:

1. **Consulta pública de solo lectura**: cualquiera puede buscar un lote por su código (UID del tag RFID) y ver toda su cadena de custodia — cada eslabón con actor, fecha, estado y los tres sensores decodificados del campo `condicion`.
2. **Liberación de pago con wallet**: conectando MetaMask (`BrowserProvider` de ethers, cambio automático a la red HashKey chain 133), el usuario autorizado puede ejecutar `confirmarEntrega` desde la interfaz con el botón **"Confirmar entrega y liberar pago"**. El estado del escrow (pendiente, retenido por daño, o liberado) se muestra en tiempo real leyendo `estadoPago()`.

## Características

- ✅ Cadena de custodia inmutable y pública, auditable por cualquiera desde el explorador de HashKey.
- ✅ Ninguna llave privada en el dispositivo de campo (ESP32); la firma ocurre en un Worker con secretos gestionados.
- ✅ Control de acceso basado en roles (OpenZeppelin `AccessControl`) — solo dispositivos autorizados escriben en el contrato.
- ✅ Pago automático condicionado a un evento verificado on-chain (sin árbitro humano, sin intermediario financiero).
- ✅ Protección contra reentrancy en la liberación de fondos.
- ✅ Frontend público en español, con lectura sin wallet y escritura opcional con MetaMask.
- ✅ Suite de tests de seguridad y de negocio en Foundry (7 tests, incluyendo intentos de ataque rechazados).

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Hardware / Edge | ESP32, DHT11, ADXL345, HC-SR501, Arduino/C++ *(fuera de este repo)* |
| Gateway | Cloudflare Workers, JavaScript, [viem](https://viem.sh/) |
| Contrato | Solidity ^0.8.20, [Foundry](https://book.getfoundry.sh/), [OpenZeppelin Contracts v5.7.0](https://docs.openzeppelin.com/contracts/5.x/) |
| Blockchain | [HashKey Chain](https://www.hashkey.com/) Testnet (L2 de Ethereum, chain ID 133) |
| Frontend | React 18, Vite, [ethers v6](https://docs.ethers.org/v6/) |

## Estructura del repositorio

```
.
├── TrazabilidadMedicamentos/   # Contrato Solidity + tests (Foundry)
│   ├── src/TrazabilidadMedicamentos.sol
│   └── test/TrazabilidadMedicamentos.t.sol
├── firmante-hsk/               # Cloudflare Worker que firma transacciones (viem)
│   └── src/index.js
├── frontend/                   # SPA React + Vite + ethers
│   └── src/App.jsx
└── DOCUMENTACION_TECNICA.md
```

## Instalación y ejecución

### 1. Contrato (`TrazabilidadMedicamentos/`) — Foundry

Requiere [Foundry](https://book.getfoundry.sh/getting-started/installation) instalado.

```bash
cd TrazabilidadMedicamentos

# Instalar dependencias (forge-std y OpenZeppelin, vía submódulos)
forge install

# Compilar
forge build

# Correr la suite de tests (incluye tests de seguridad y de escrow)
forge test -vv

# Desplegar (ejemplo, requiere una cuenta financiada en HashKey Testnet)
forge create src/TrazabilidadMedicamentos.sol:TrazabilidadMedicamentos \
  --rpc-url https://testnet.hsk.xyz \
  --private-key <TU_LLAVE_PRIVADA>
```

Tras desplegar, el `owner` debe llamar a `autorizar(direccion)` con la dirección que usará el Worker (la derivada de `LLAVE_PRIVADA` en `firmante-hsk`) para que pueda registrar lotes y eventos.

### 2. Worker firmante (`firmante-hsk/`) — Wrangler

Requiere [Node.js](https://nodejs.org/) y una cuenta de Cloudflare.

```bash
cd firmante-hsk
npm install

# Configurar la llave privada del dispositivo autorizado como secreto
# (nunca se guarda en el código ni en variables de entorno del repo)
npx wrangler secret put LLAVE_PRIVADA

# Levantar en local
npm run dev

# Desplegar a Cloudflare
npm run deploy
```

El Worker expone un único endpoint `POST /` que espera un JSON con la forma:

```json
{ "lote": "LOTE-VACUNA-001", "alerta": "GOLPE", "temp": 24, "acel": 85, "mov": 1 }
```

y responde con `{ "ok": true, "hash": "0x...", "condicion": "GOLPE|T24|A85|M1" }`.

### 3. Frontend (`frontend/`) — npm + Vite

```bash
cd frontend
npm install

# Desarrollo local
npm run dev

# Build de producción
npm run build
npm run preview
```

El frontend ya apunta al contrato desplegado en `frontend/src/contract.js` (dirección y RPC de HashKey Testnet), así que funciona en local sin configuración adicional. Para liberar pagos necesitas MetaMask instalado y HSK de prueba en la red HashKey Chain Testnet (chain ID `133`).

## Cumplimiento del hackathon

- **HashKey Chain (HSK)**: todo el sistema — contrato, escrow y pagos — corre sobre HashKey Chain Testnet (chain ID `133`), un L2 de Ethereum. El Worker firma y envía transacciones directamente a `https://testnet.hsk.xyz`, y el frontend cambia automáticamente la red de MetaMask a HashKey Chain si no está configurada.
- **Conexión de wallet para liberar pagos**: el frontend integra conexión de wallet (MetaMask vía `ethers.BrowserProvider`) para que el actor autorizado firme con su propia cuenta la transacción `confirmarEntrega`, que es la que mueve fondos reales del escrow. La consulta de trazabilidad, en cambio, es pública y no requiere wallet — separando claramente lectura pública de escritura autenticada.
- **Pagos automáticos máquina-a-máquina (principio x402 / MPP)**: el mecanismo de escrow con liberación condicionada implementa la idea central de x402/Machine Payment Protocol — un pago que se libera **automáticamente cuando se cumple una condición verificable on-chain**, sin intervención humana ni intermediario financiero. Aquí la condición es "el historial de eventos del lote no registra ningún daño" (`tuvoDano == false`), verificada por el propio contrato en el momento de `confirmarEntrega`. Si el ESP32 reportó una anomalía en cualquier punto del trayecto, el contrato **revierte la liberación del pago de forma autónoma** — el mismo evento de sensor que documenta la trazabilidad es el que dispara (o bloquea) el pago.
- **Auditoría verificable (Blocks Out / explorador)**: cada lote, evento y movimiento de escrow queda como transacción pública y verificable en el [explorador de HashKey Chain Testnet](https://testnet-explorer.hskchain.net/address/0x75B81d9dCd1101b0C5854509d0065368d9596d13). Esto convierte al explorador en la capa de auditoría del sistema: cualquier fabricante, distribuidor, farmacia o regulador puede verificar independientemente, sin confiar en el frontend ni en el Worker, que el pago se liberó (o se retuvo) exactamente según las condiciones registradas on-chain.

## Documentación técnica

Para el detalle de la arquitectura de seguridad (modelo STRIDE, defensa en capas), las decisiones de diseño y el roadmap futuro, ver [`DOCUMENTACION_TECNICA.md`](./DOCUMENTACION_TECNICA.md).
