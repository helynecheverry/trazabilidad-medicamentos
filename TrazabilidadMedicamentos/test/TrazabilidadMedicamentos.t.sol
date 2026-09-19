// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TrazabilidadMedicamentos.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

contract TrazabilidadMedicamentosTest is Test {
    TrazabilidadMedicamentos traza;

    address fabricante = address(0xFAB);
    address atacante = address(0xBAD);
    bytes32 lote = bytes32("LOTE-VACUNA-001");

    function setUp() public {
        traza = new TrazabilidadMedicamentos();
        traza.autorizar(fabricante);
    }

    // ---- Camino feliz ----

    function test_DispositivoAutorizadoRegistraLote() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);
        assertEq(traza.totalEventos(lote), 1);
    }

    function test_CadenaDeCustodia() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);

        vm.prank(fabricante);
        traza.registrarEvento(lote, TrazabilidadMedicamentos.Estado.Recibido, bytes32("DANADO"));

        assertEq(traza.totalEventos(lote), 2);

        (bool tuvoDano, , ) = traza.estadoPago(lote);
        assertTrue(tuvoDano);
    }

    // ---- Seguridad: ataques rechazados por OpenZeppelin AccessControl ----

    function test_Revert_NoAutorizadoRegistraLote() public {
        bytes32 rol = traza.ROL_DISPOSITIVO();
        vm.prank(atacante);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                atacante,
                rol
            )
        );
        traza.registrarLote(bytes32("LOTE-FALSO"));
    }

    function test_Revert_NoAutorizadoRegistraEvento() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);

        bytes32 rol = traza.ROL_DISPOSITIVO();
        vm.prank(atacante);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                atacante,
                rol
            )
        );
        traza.registrarEvento(lote, TrazabilidadMedicamentos.Estado.Recibido, bytes32("OK"));
    }

    function test_Revert_LoteDuplicado() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);

        vm.prank(fabricante);
        vm.expectRevert(TrazabilidadMedicamentos.LoteYaExiste.selector);
        traza.registrarLote(lote);
    }

    // ---- Pago condicionado a la integridad ----

    function test_PagoRetenidoSiHuboDano() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);

        traza.depositarEscrow{value: 1 ether}(lote);

        vm.prank(fabricante);
        traza.registrarEvento(lote, TrazabilidadMedicamentos.Estado.Recibido, bytes32("DANADO"));

        vm.expectRevert(TrazabilidadMedicamentos.LoteConDano.selector);
        traza.confirmarEntrega(lote);
    }

    function test_PagoLiberadoSiTodoOK() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);

        traza.depositarEscrow{value: 1 ether}(lote);

        uint256 balanceAntes = fabricante.balance;
        traza.confirmarEntrega(lote);

        assertEq(fabricante.balance, balanceAntes + 1 ether);
    }
}