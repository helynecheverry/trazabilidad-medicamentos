// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrazabilidadMedicamentos
/// @notice Cadena de custodia inmutable de lotes de medicamentos.
///         Cada actor autorizado (fabricante, distribuidor, farmacia) firma
///         su paso, con la condición del lote en ese momento.
contract TrazabilidadMedicamentos {
    // ---- Estado global ----
    address public owner;                          // administra quién es de confianza
    mapping(address => bool) public autorizado;    // actores/dispositivos de confianza

    // Estados posibles de un lote en cada punto de la cadena.
    enum Estado { Registrado, EnTransito, Recibido, Entregado, Rechazado }

    // Un lote de medicamento (identificado por el UID del tag RFID).
    struct Lote {
        bytes32 codigo;      // identidad del lote (viene del tag RFID)
        address fabricante;  // quién lo creó on-chain
        uint256 creadoEn;    // timestamp de creación
        bool existe;         // bandera para saber si ya fue registrado
    }

    // Un eslabón de la cadena de custodia.
    struct Evento {
        address actor;       // quién firmó este paso
        Estado estado;       // qué pasó (recibido, en tránsito, rechazado...)
        bytes32 condicion;   // estado físico: "OK", "DANADO", o hash de una lectura
        uint256 timestamp;   // cuándo (lo pone la cadena, no el usuario)
    }

    mapping(bytes32 => Lote) public lotes;         // codigo => datos del lote
    mapping(bytes32 => Evento[]) internal historial; // codigo => cadena de custodia completa

    // ---- Eventos (los escucha tu Pi / frontend) ----
    event Autorizado(address indexed actor);
    event LoteRegistrado(bytes32 indexed codigo, address indexed fabricante);
    event EventoRegistrado(bytes32 indexed codigo, address indexed actor, Estado estado);

    // ---- Errores personalizados ----
    error NoEsOwner();
    error NoAutorizado();
    error CodigoVacio();
    error LoteYaExiste();
    error LoteNoExiste();

    // ---- Candados reutilizables ----
    modifier soloOwner() {
        if (msg.sender != owner) revert NoEsOwner();
        _;
    }

    modifier soloAutorizado() {
        if (!autorizado[msg.sender]) revert NoAutorizado();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ---- Administración ----

    /// El owner da de alta a un actor de confianza (fábrica, distribuidor, farmacia).
    function autorizar(address actor) external soloOwner {
        autorizado[actor] = true;
        emit Autorizado(actor);
    }

    // ---- Lógica principal ----

    /// El fabricante registra un lote nuevo. Deja el primer eslabón de la cadena.
    function registrarLote(bytes32 codigo) external soloAutorizado {
        if (codigo == bytes32(0)) revert CodigoVacio();      // check 1: código válido
        if (lotes[codigo].existe) revert LoteYaExiste();     // check 2: no duplicar

        lotes[codigo] = Lote({                               // efecto: crea el lote
            codigo: codigo,
            fabricante: msg.sender,
            creadoEn: block.timestamp,
            existe: true
        });

        historial[codigo].push(Evento({                      // efecto: primer eslabón
            actor: msg.sender,
            estado: Estado.Registrado,
                            // forge-lint: disable-next-line(unsafe-typecast)
                condicion: bytes32("OK"),
            timestamp: block.timestamp
        }));

        emit LoteRegistrado(codigo, msg.sender);
        emit EventoRegistrado(codigo, msg.sender, Estado.Registrado);
    }

    /// Un actor autorizado firma su paso por la cadena, con la condición del lote.
    function registrarEvento(bytes32 codigo, Estado estado, bytes32 condicion)
        external
        soloAutorizado
    {
        if (!lotes[codigo].existe) revert LoteNoExiste();    // check: el lote debe existir

        historial[codigo].push(Evento({                      // efecto: nuevo eslabón
            actor: msg.sender,
            estado: estado,
            condicion: condicion,
            timestamp: block.timestamp
        }));

        emit EventoRegistrado(codigo, msg.sender, estado);
    }

    // ---- Lectura (gratis, no cambia estado) ----

    /// Cuántos eslabones tiene la cadena de custodia de un lote.
    function totalEventos(bytes32 codigo) external view returns (uint256) {
        return historial[codigo].length;
    }

    /// Devuelve un eslabón específico de la cadena.
    function obtenerEvento(bytes32 codigo, uint256 indice)
        external
        view
        returns (Evento memory)
    {
        return historial[codigo][indice];
    }
}