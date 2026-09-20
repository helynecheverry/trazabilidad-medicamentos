# Documentación Técnica — Trazabilidad de Medicamentos

## 1. Track seleccionado

Este proyecto se presenta bajo los siguientes tracks:

- **EAG — Smart Devices, Open Hardware & Privacy Hardware**: el sistema nace de un dispositivo físico (ESP32 + sensores DHT11, ADXL345, HC-SR501) que captura condiciones reales del mundo físico y las lleva a la cadena. La decisión de arquitectura más relevante para este track es que **la llave privada nunca vive en el hardware de campo**: el ESP32 es un cliente HTTP sin secretos, lo que lo hace seguro de desplegar, reemplazar o incluso perder físicamente sin comprometer el sistema.
- **EAG — Real-World Ethereum Applications**: la trazabilidad de medicamentos es un caso de uso real de cadena de suministro, con impacto directo en salud pública, resuelto con contratos inteligentes verificables públicamente en un L2 de Ethereum.
- **HashKey — RWA / Payments / AI Agents**: el medicamento en tránsito es un activo del mundo real (RWA) cuyo estado físico determina, de forma autónoma y sin intervención humana, el movimiento de un pago on-chain. El mecanismo de escrow condicionado es un ejemplo directo de pago automatizado disparado por una condición verificable — el mismo patrón que necesitan los agentes autónomos (AI Agents) para pagar por servicios físicos solo cuando se cumple una condición objetiva.

## 2. Arquitectura central en detalle

### 2.1 Vista general — patrón Edge → Gateway → Chain

El sistema se divide en tres capas con una responsabilidad de seguridad muy específica cada una: el Edge **nunca firma nada**, el Gateway **firma pero no decide reglas de negocio** (esas viven en el contrato), y la Chain **es la única fuente de verdad**.

```
ESP32 (sensores)  --HTTP POST-->  Cloudflare Worker (viem)  --tx firmada-->  Contrato Solidity (HashKey Chain)
                                                                                     |
                                                                                     v
                                                                   Frontend React (lee con ethers, opcionalmente firma confirmarEntrega)
```

### 2.2 Capa 1 — Edge (ESP32)

- Sensores: DHT11 (temperatura/humedad), ADXL345 (aceleración/golpes), HC-SR501 (PIR, apertura/movimiento).
- El firmware evalúa umbrales localmente (por ejemplo, temperatura fuera de rango o pico de aceleración) y, al detectar una anomalía, arma un payload JSON y lo envía por HTTP POST al Worker:

  ```json
  { "lote": "LOTE-VACUNA-001", "alerta": "GOLPE", "temp": 24, "acel": 85, "mov": 1 }
  ```

- No mantiene estado de la blockchain, no firma transacciones, no conoce la dirección del contrato más allá de la URL del Worker al que reporta. El firmware vive fuera de este repositorio (es Arduino/C++, un artefacto de hardware separado del stack de software documentado aquí).

### 2.3 Capa 2 — Gateway (`firmante-hsk/src/index.js`)

Cloudflare Worker que implementa el patrón *signer-as-a-service*:

1. **Recepción**: acepta únicamente `POST`; cualquier otro método responde `405`.
2. **Empaquetado de sensores**: los tres sensores más el tipo de alerta se comprimen en un único campo `bytes32` con formato posicional `ALERTA|T<temp>|A<acel>|M<mov>` mediante `stringToHex(texto, { size: 32 })` de viem. Esto evita tener que ampliar el ABI del contrato cada vez que se agrega un sensor, a costa de que el frontend deba parsear ese formato (ver `frontend/src/App.jsx`, función `parsearCondicion`).
3. **Gestión de la llave**: la llave privada del dispositivo autorizado se lee de `env.LLAVE_PRIVADA`, un secreto de Cloudflare Workers (`wrangler secret put`), nunca del código fuente ni de un archivo versionado. `normalizarLlave()` tolera que el secreto se guarde con o sin el prefijo `0x`.
4. **Firma y envío**: con `viem`, se crea una `WalletClient` sobre la cadena `hashkey` (definida con `defineChain`, chain ID `133`, RPC `https://testnet.hsk.xyz`), se codifica el llamado a `registrarEvento(codigo, estado, condicion)` con `encodeFunctionData`, y se envía con `sendTransaction`. El Worker fija `estado = 2` (`Recibido`) para los eventos que reporta.
5. **Respuesta**: devuelve `{ ok, hash, condicion }` o, en caso de error, `{ ok: false, error }` con status `500`.

Esta capa es el único componente del sistema con acceso a un secreto criptográfico persistente, y su superficie de ataque se reduce a: (a) el secreto de Cloudflare, gestionado por su plataforma de gestión de secretos, y (b) la lógica del propio Worker, que no contiene lógica de negocio sensible más allá de reenviar la lectura del sensor.

### 2.4 Capa 3 — Chain (`TrazabilidadMedicamentos/src/TrazabilidadMedicamentos.sol`)

Contrato en Solidity `^0.8.20` que hereda de `Ownable`, `AccessControl` y `ReentrancyGuard` de OpenZeppelin v5.7.0 (vía submódulo `lib/openzeppelin-contracts`).

**Modelo de datos:**

```solidity
struct Lote {
    bytes32 codigo;
    address fabricante;
    uint256 creadoEn;
    bool existe;
    bool tuvoDano;
    bool pagoLiberado;
    uint256 montoEscrow;
    address pagador;
}

struct Evento {
    address actor;
    Estado estado;      // Registrado, EnTransito, Recibido, Entregado, Rechazado
    bytes32 condicion;   // "OK", "DANADO", o el empaquetado de sensores
    uint256 timestamp;
}
```

**Ciclo de vida de un lote:**

1. `autorizar(actor)` — el `owner` otorga `ROL_DISPOSITIVO` (un rol de `AccessControl`, `keccak256("ROL_DISPOSITIVO")`) a la dirección del Worker (o de cualquier otro actor de confianza: fabricante, distribuidor, farmacia).
2. `registrarLote(codigo)` — solo direcciones con `ROL_DISPOSITIVO`. Crea el `Lote` y el primer eslabón del historial con condición `"OK"`.
3. `registrarEvento(codigo, estado, condicion)` — solo `ROL_DISPOSITIVO`. Añade un eslabón al historial. **Si `condicion != "OK"`, marca `lotes[codigo].tuvoDano = true` de forma permanente** — este flag nunca se revierte, ni siquiera si un evento posterior reporta `"OK"` de nuevo, por diseño: un daño detectado en cualquier punto del trayecto contamina la entrega completa.
4. `depositarEscrow(codigo)` — función `payable`, abierta a cualquiera (típicamente el comprador/asegurador). Suma `msg.value` al `montoEscrow` del lote y registra `msg.sender` como `pagador`.
5. `confirmarEntrega(codigo)` — protegida con `nonReentrant`. Verifica, en orden: que el lote exista, que el pago no se haya liberado ya (`PagoYaLiberado`), y que haya fondos en escrow (`SinEscrow`). Si `tuvoDano == true`, emite `PagoRetenido` y revierte con `LoteConDano` — el pago queda intacto en el contrato. Si `tuvoDano == false`, sigue el patrón *checks-effects-interactions*: primero pone `pagoLiberado = true` y `montoEscrow = 0`, y **después** transfiere los fondos con `call{value: monto}("")`, verificando el éxito con `require`.
6. `estadoPago(codigo)` — vista pública que devuelve `(tuvoDano, pagoLiberado, montoEscrow)`, consumida por el frontend para pintar el estado del escrow en tiempo real.

### 2.5 Frontend (`frontend/src/App.jsx`, `contract.js`, `loteService.js`, `format.js`)

- **Lectura pública**: `loteService.js` normaliza el código de lote (texto legible → `bytes32` con `ethers.encodeBytes32String`, o acepta un `bytes32` ya formado) y trae `lotes()`, `totalEventos()` y los últimos `obtenerEvento()` en paralelo con un `JsonRpcProvider` de solo lectura — no requiere wallet.
- **Escritura opcional**: `contract.js` expone `conectarWallet()`, que solicita `eth_requestAccounts` a MetaMask vía `BrowserProvider`, intenta cambiar la red a HashKey Chain (`wallet_switchEthereumChain` a `0x85` = 133) y, si no existe, la agrega con `wallet_addEthereumChain`. Devuelve un `Contract` con `signer` para llamar `confirmarEntrega`.
- **UX de pago**: el componente muestra tres estados visuales derivados de `estadoPago()` — pago liberado (verde), pago retenido por daño (rojo, sin botón de acción), o escrow pendiente (con el botón "Confirmar entrega y liberar pago", deshabilitado mientras se procesa la transacción).

## 3. Características clave

- **Separación de lectura y escritura**: consultar la trazabilidad es público y gratuito (RPC de solo lectura); mover fondos requiere una wallet firmando explícitamente.
- **Un solo campo, múltiples sensores**: el empaquetado `ALERTA|T..|A..|M..` en `bytes32` mantiene el ABI del contrato estable sin importar cuántos sensores reporte el hardware.
- **Daño "pegajoso" (`tuvoDano`)**: una vez detectado un daño en cualquier eslabón, el lote completo queda marcado, evitando que un evento posterior "limpio" borre evidencia de una anomalía real.
- **Pago sin árbitro**: no existe una parte humana ni un oráculo externo que decida si se paga o no — la propia cadena de custodia, escrita por el dispositivo autorizado, es la que determina el resultado del escrow.
- **ABI y dirección versionados con el frontend**: el ABI se copia a `frontend/src/abi/` en vez de resolverse en tiempo de ejecución contra un explorador, para que la app funcione incluso si el servicio de verificación del explorador no está disponible.

## 4. Enfoque de seguridad

### 4.1 Defensa en capas

| Capa | Amenaza que mitiga | Mecanismo |
|---|---|---|
| Edge (ESP32) | Robo/clonación física del dispositivo | No contiene llaves privadas; su compromiso no permite firmar transacciones |
| Gateway (Worker) | Exposición de la llave de firma | Secreto gestionado por Cloudflare (`env.LLAVE_PRIVADA`), nunca en código ni en el cliente |
| Gateway (Worker) | Payloads malformados | `try/catch` alrededor de la lectura del JSON y el envío de la transacción; errores devueltos como `500` sin filtrar detalles de la llave |
| Chain (Contrato) | Escritura no autorizada | `AccessControl` (`onlyRole(ROL_DISPOSITIVO)`) en `registrarLote` y `registrarEvento` |
| Chain (Contrato) | Reentrancy al liberar fondos | `ReentrancyGuard` (`nonReentrant`) en `confirmarEntrega`, más patrón checks-effects-interactions |
| Chain (Contrato) | Doble liberación de pago | Flag `pagoLiberado` verificado antes de transferir, con error dedicado `PagoYaLiberado` |
| Chain (Contrato) | Administración centralizada indefinida | `Ownable` acota quién puede otorgar el rol de dispositivo (`autorizar`), auditable on-chain vía `OwnershipTransferred`/`RoleGranted` |
| Frontend | Confusión de red / firma en cadena equivocada | `conectarWallet()` fuerza el cambio a HashKey Chain (133) antes de exponer el contrato con firma |

### 4.2 Modelo de amenazas (STRIDE)

| Categoría | Amenaza concreta | Mitigación implementada |
|---|---|---|
| **S**poofing (suplantación) | Un actor no autorizado intenta registrar lotes o eventos haciéndose pasar por un dispositivo válido | `onlyRole(ROL_DISPOSITIVO)` de `AccessControl`; probado en `test_Revert_NoAutorizadoRegistraLote` y `test_Revert_NoAutorizadoRegistraEvento` |
| **T**ampering (manipulación) | Alterar el historial de eventos ya registrado para ocultar un daño | El `historial` es un arreglo `internal` de solo *append* (`push`); no existe función de edición o borrado de eventos pasados |
| **R**epudiation (repudio) | Un actor niega haber registrado un evento o recibido un lote dañado | Cada `Evento` guarda `actor` (la dirección `msg.sender`) y `timestamp` puestos por la EVM, no por el llamador; los eventos (`EventoRegistrado`, `PagoLiberado`, `PagoRetenido`) quedan indexados y son auditables en el explorador |
| **I**nformation Disclosure (divulgación) | Filtración de la llave privada de firma | La llave nunca sale del entorno de secretos de Cloudflare ni se expone al ESP32, al frontend, o en logs de error (`e.message` no incluye el secreto) |
| **D**enial of Service (denegación de servicio) | Saturar el Worker o el contrato con eventos falsos para inflar costos o ruido | Fuera del alcance actual del hackathon: mitigación parcial de facto por el costo de gas de cada transacción y por requerir el rol `ROL_DISPOSITIVO`; no hay rate-limiting explícito en el Worker (ver Roadmap) |
| **E**levation of Privilege (elevación de privilegios) | Un actor con rol de dispositivo intenta ejercer funciones de administración (otorgar roles, transferir ownership) | `autorizar()` está protegido por `onlyOwner` (`Ownable`), separado del rol `ROL_DISPOSITIVO`; un dispositivo comprometido no puede escalar a administrador |

### 4.3 Por qué OpenZeppelin y no control de acceso propio

La versión inicial del contrato usaba un `mapping(address => bool) autorizado` y un modificador propio. La versión actual migra a `AccessControl` de OpenZeppelin v5.7.0 porque:

- Es una librería auditada externamente y ampliamente usada en producción, reduciendo la superficie de bugs de control de acceso escritos a mano.
- Da errores tipados y estandarizados (`AccessControlUnauthorizedAccount(account, role)`), más fáciles de testear y de interpretar por herramientas externas (exploradores, indexadores).
- Permite escalar a múltiples roles (por ejemplo, distinguir `ROL_DISPOSITIVO` de un futuro `ROL_AUDITOR`) sin reescribir la lógica de permisos.

### 4.4 Cobertura de tests (Foundry)

`TrazabilidadMedicamentos/test/TrazabilidadMedicamentos.t.sol` cubre camino feliz, seguridad y lógica de pago:

- `test_DispositivoAutorizadoRegistraLote` — un dispositivo con rol puede registrar un lote.
- `test_CadenaDeCustodia` — un evento con condición distinta de `"OK"` marca `tuvoDano = true`.
- `test_Revert_NoAutorizadoRegistraLote` — un atacante sin rol es rechazado con `AccessControlUnauthorizedAccount`.
- `test_Revert_NoAutorizadoRegistraEvento` — igual que el anterior, sobre `registrarEvento`.
- `test_Revert_LoteDuplicado` — no se puede registrar dos veces el mismo código de lote.
- `test_PagoRetenidoSiHuboDano` — con escrow depositado y un evento dañado, `confirmarEntrega` revierte con `LoteConDano` y el pago no se mueve.
- `test_PagoLiberadoSiTodoOK` — sin daños registrados, `confirmarEntrega` transfiere el escrow completo al fabricante.

## 5. Roadmap futuro

- **Lector RFID para identidad física del lote**: hoy el código de lote se introduce como texto (UID simulado). El siguiente paso es leer el UID real de un tag RFID/NFC físico adherido al empaque, para que la identidad on-chain esté atada criptográficamente a un objeto físico verificable en el punto de entrega, no solo a un string escrito manualmente.
- **Evolución hacia una DAO para gobernanza**: reemplazar el `owner` único (`Ownable`) por una gobernanza multi-actor (por ejemplo, un `TimelockController` + votación de los participantes de la cadena de suministro — fabricantes, distribuidores, reguladores) para decidir de forma descentralizada qué direcciones obtienen `ROL_DISPOSITIVO`, en vez de depender de una sola cuenta administradora.
- **Buffer offline en el dispositivo**: el ESP32 actual depende de conectividad HTTP inmediata hacia el Worker. Un buffer local (por ejemplo, en SPIFFS/flash) permitiría almacenar lecturas durante cortes de red y reenviarlas en orden cuando se recupere la conexión, sin perder eventos de la cadena de custodia.
- **x402 / Machine Payment Protocol (MPP) completo**: el escrow actual es un primer paso de "pago condicionado a un evento verificado". El roadmap completo apunta a integrar un protocolo de pago máquina-a-máquina estándar (x402) para que el propio dispositivo o un agente autónomo pueda negociar, facturar y liquidar micropagos por tramo de la cadena de custodia (por ejemplo, un pago parcial por cada checkpoint superado sin daño), no solo un pago único al final.
- **Expansión a cadena de frío alimentaria**: la misma arquitectura (sensores de temperatura/golpes/apertura + registro inmutable + pago condicionado) aplica directamente a alimentos perecederos que requieren cadena de frío, ampliando el mercado del sistema más allá de medicamentos.
