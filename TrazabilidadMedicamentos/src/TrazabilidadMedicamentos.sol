// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TrazabilidadMedicamentos
/// @notice Cadena de custodia + escrow con pago condicionado a integridad.
///         Usa OpenZeppelin (Ownable, AccessControl, ReentrancyGuard) auditados.
contract TrazabilidadMedicamentos is Ownable, AccessControl, ReentrancyGuard {
    bytes32 public constant ROL_DISPOSITIVO = keccak256("ROL_DISPOSITIVO");

    enum Estado { Registrado, EnTransito, Recibido, Entregado, Rechazado }

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
        Estado estado;
        bytes32 condicion;
        uint256 timestamp;
    }

    mapping(bytes32 => Lote) public lotes;
    mapping(bytes32 => Evento[]) internal historial;

    event LoteRegistrado(bytes32 indexed codigo, address indexed fabricante);
    event EventoRegistrado(bytes32 indexed codigo, address indexed actor, Estado estado);
    event EscrowDepositado(bytes32 indexed codigo, address indexed pagador, uint256 monto);
    event PagoLiberado(bytes32 indexed codigo, address indexed receptor, uint256 monto);
    event PagoRetenido(bytes32 indexed codigo, string razon);

    error CodigoVacio();
    error LoteYaExiste();
    error LoteNoExiste();
    error LoteConDano();
    error PagoYaLiberado();
    error SinEscrow();

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// El owner autoriza un dispositivo dándole el rol.
    function autorizar(address actor) external onlyOwner {
        _grantRole(ROL_DISPOSITIVO, actor);
    }

    /// Compatibilidad: consultar si una dirección está autorizada.
    function autorizado(address actor) external view returns (bool) {
        return hasRole(ROL_DISPOSITIVO, actor);
    }

    function registrarLote(bytes32 codigo) external onlyRole(ROL_DISPOSITIVO) {
        if (codigo == bytes32(0)) revert CodigoVacio();
        if (lotes[codigo].existe) revert LoteYaExiste();

        lotes[codigo] = Lote({
            codigo: codigo,
            fabricante: msg.sender,
            creadoEn: block.timestamp,
            existe: true,
            tuvoDano: false,
            pagoLiberado: false,
            montoEscrow: 0,
            pagador: address(0)
        });

        historial[codigo].push(Evento({
            actor: msg.sender,
            estado: Estado.Registrado,
            condicion: bytes32("OK"),
            timestamp: block.timestamp
        }));

        emit LoteRegistrado(codigo, msg.sender);
        emit EventoRegistrado(codigo, msg.sender, Estado.Registrado);
    }

    function registrarEvento(bytes32 codigo, Estado estado, bytes32 condicion)
        external
        onlyRole(ROL_DISPOSITIVO)
    {
        if (!lotes[codigo].existe) revert LoteNoExiste();

        historial[codigo].push(Evento({
            actor: msg.sender,
            estado: estado,
            condicion: condicion,
            timestamp: block.timestamp
        }));

        if (condicion != bytes32("OK")) {
            lotes[codigo].tuvoDano = true;
        }

        emit EventoRegistrado(codigo, msg.sender, estado);
    }

    function depositarEscrow(bytes32 codigo) external payable {
        if (!lotes[codigo].existe) revert LoteNoExiste();
        lotes[codigo].montoEscrow += msg.value;
        lotes[codigo].pagador = msg.sender;
        emit EscrowDepositado(codigo, msg.sender, msg.value);
    }

    function confirmarEntrega(bytes32 codigo) external nonReentrant {
        Lote storage lote = lotes[codigo];
        if (!lote.existe) revert LoteNoExiste();
        if (lote.pagoLiberado) revert PagoYaLiberado();
        if (lote.montoEscrow == 0) revert SinEscrow();

        if (lote.tuvoDano) {
            emit PagoRetenido(codigo, "Pago retenido: se detectaron danos");
            revert LoteConDano();
        }

        lote.pagoLiberado = true;
        uint256 monto = lote.montoEscrow;
        lote.montoEscrow = 0;

        historial[codigo].push(Evento({
            actor: msg.sender,
            estado: Estado.Entregado,
            condicion: bytes32("ENTREGADO-OK"),
            timestamp: block.timestamp
        }));

        (bool ok, ) = lote.fabricante.call{value: monto}("");
        require(ok, "Fallo al enviar el pago");

        emit PagoLiberado(codigo, lote.fabricante, monto);
        emit EventoRegistrado(codigo, msg.sender, Estado.Entregado);
    }

    function totalEventos(bytes32 codigo) external view returns (uint256) {
        return historial[codigo].length;
    }

    function obtenerEvento(bytes32 codigo, uint256 indice)
        external
        view
        returns (Evento memory)
    {
        return historial[codigo][indice];
    }

    function estadoPago(bytes32 codigo)
        external
        view
        returns (bool tuvoDano, bool pagoLiberado, uint256 montoEscrow)
    {
        Lote storage l = lotes[codigo];
        return (l.tuvoDano, l.pagoLiberado, l.montoEscrow);
    }
}