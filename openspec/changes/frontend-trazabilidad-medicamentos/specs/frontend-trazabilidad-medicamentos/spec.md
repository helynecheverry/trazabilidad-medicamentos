## Purpose

Interfaz web de solo lectura para consultar en HashKey Chain Testnet la cadena de custodia de lotes de medicamentos registrados en el contrato `TrazabilidadMedicamentos`.

## ADDED Requirements

### Requirement: Conexión de solo lectura al contrato
La aplicación SHALL conectarse al contrato `TrazabilidadMedicamentos` desplegado en `0x50cB8085f4529E4E2B40128314Cc41fF896cd2F8` sobre HashKey Chain Testnet usando el RPC `https://testnet.hsk.xyz`. La aplicación MUST funcionar únicamente en modo lectura: no SHOULD requerir conexión con billetera, firma de transacciones ni modificar el estado del contrato.

#### Scenario: Conexión a Testnet sin billetera
- **WHEN** la aplicación carga e intenta consultar el contrato
- **THEN** se conecta mediante el RPC público de HashKey Chain Testnet sin solicitar firma ni transacción

#### Scenario: Fallo de red
- **WHEN** la red no está disponible o el RPC no responde
- **THEN** la aplicación muestra un mensaje de error claro en español indicando que no se puede conectar a la red

### Requirement: Consulta de lote por código
La aplicación SHALL permitir consultar un lote introduciendo su código (bytes32 en formato hex, con prefijo `0x`). La consulta MUST devolver los datos del lote (fabricante, fecha de creación y existencia) mediante `lotes(bytes32)`.

#### Scenario: Código válido de un lote existente
- **WHEN** el usuario introduce un código bytes32 válido de un lote ya registrado
- **THEN** la aplicación muestra los datos del lote: fabricante, fecha de creación y existencia

#### Scenario: Código de lote no registrado
- **WHEN** el usuario introduce un código bytes32 válido pero que no pertenece a ningún lote registrado
- **THEN** la aplicación muestra un mensaje en español indicando que el lote no está registrado

#### Scenario: Código vacío o mal formado
- **WHEN** el usuario intenta consultar con un código vacío o que no es un bytes32 válido
- **THEN** la aplicación no realiza la consulta y muestra un mensaje en español indicando que debe introducir un código bytes32 válido

### Requirement: Visualización de la cadena de custodia
La aplicación SHALL mostrar la cadena de custodia completa de un lote, en orden cronológico, leyendo el número total de eventos con `totalEventos(bytes32)` y cada eslabón con `obtenerEvento(bytes32,uint256)`. Cada eslabón MUST mostrar el actor, el estado, la condición física y la fecha y hora del evento.

#### Scenario: Lote con eventos registrados
- **WHEN** el usuario consulta un lote que sí tiene eventos en su cadena de custodia
- **THEN** la aplicación muestra cada eslabón en orden, con actor, estado, condición y timestamp legible (fecha y hora local)

#### Scenario: Lote registrado sin eventos posteriores
- **WHEN** el usuario consulta un lote cuyo historial contiene solo el evento de registro
- **THEN** la aplicación muestra al menos el evento de registro como primer eslabón de la cadena

### Requirement: Traducción de estados a español
La aplicación SHALL traducir el valor numérico del enum `Estado` del contrato a una etiqueta en español legible: `Registrado`, `EnTránsito`, `Recibido`, `Entregado` y `Rechazado`. Un estado fuera de ese rango MUST mostrarse como "Desconocido".

#### Scenario: Estado conocido
- **WHEN** un eslabón tiene un estado del 0 al 4
- **THEN** la aplicación muestra la etiqueta en español correspondiente (0=Registrado, 1=EnTránsito, 2=Recibido, 3=Entregado, 4=Rechazado)

#### Scenario: Estado fuera de rango
- **WHEN** un eslabón tiene un estado numérico mayor que 4
- **THEN** la aplicación muestra la etiqueta "Desconocido"

### Requirement: Interfaz en español
Todos los textos visibles de la interfaz de usuario SHALL estar en español: instrucciones, botones, etiquetas, títulos y mensajes de error o de estado.

#### Scenario: Textos de la interfaz
- **WHEN** el usuario navega por la aplicación
- **THEN** todos los textos visibles (mensajes, botones, etiquetas y errores) están en español

#### Scenario: Fechas y horas legibles
- **WHEN** la aplicación muestra timestamps de eventos
- **THEN** los muestra como fecha y hora local legibles en español en lugar de un número crudo de Unix