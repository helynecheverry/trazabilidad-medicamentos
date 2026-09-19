// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TrazabilidadMedicamentos.sol";

contract TrazabilidadMedicamentosTest is Test {
    TrazabilidadMedicamentos traza;

    // Actores de la cadena (direcciones ficticias de prueba)
    address fabricante  = address(0xFAB);
    address distribuidor = address(0xD15);
    address farmacia    = address(0xFA4);
    address atacante    = address(0xBAD);

    bytes32 lote = bytes32("LOTE-VACUNA-001");   // el "UID" que vendría del tag RFID

    // setUp() corre antes de CADA test, con estado limpio.
    function setUp() public {
        traza = new TrazabilidadMedicamentos();  // el owner es este contrato de test
        // El owner autoriza a los 3 actores legítimos de la cadena.
        traza.autorizar(fabricante);
        traza.autorizar(distribuidor);
        traza.autorizar(farmacia);
    }

    // ---------- Camino feliz: lo que SÍ debe funcionar ----------

    function test_FabricantePuedeRegistrarLote() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);
        assertEq(traza.totalEventos(lote), 1);   // primer eslabón creado
    }

    function test_CadenaDeCustodiaCompleta() public {
        // 1) Fabricante crea el lote (queda como Registrado / OK)
        vm.prank(fabricante);
        traza.registrarLote(lote);

        // 2) Distribuidor lo recibe en buen estado
        vm.prank(distribuidor);
        traza.registrarEvento(lote, TrazabilidadMedicamentos.Estado.Recibido, bytes32("OK"));

        // 3) Farmacia lo recibe DAÑADO
        vm.prank(farmacia);
        traza.registrarEvento(lote, TrazabilidadMedicamentos.Estado.Recibido, bytes32("DANADO"));

        // La cadena tiene 3 eslabones
        assertEq(traza.totalEventos(lote), 3);

        // Y el daño quedó registrado en el eslabón del distribuidor -> farmacia
        TrazabilidadMedicamentos.Evento memory ultimo = traza.obtenerEvento(lote, 2);
        assertEq(ultimo.condicion, bytes32("DANADO"));
        assertEq(ultimo.actor, farmacia);
    }

    // ---------- Seguridad: lo que DEBE ser rechazado ----------

    function test_Revert_NoAutorizadoRegistraLote() public {
        vm.prank(atacante);
        vm.expectRevert(TrazabilidadMedicamentos.NoAutorizado.selector);
        traza.registrarLote(bytes32("LOTE-FALSO"));   // atacante intenta crear un lote
    }

    function test_Revert_NoAutorizadoRegistraEvento() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);                    // lote legítimo existe

        vm.prank(atacante);
        vm.expectRevert(TrazabilidadMedicamentos.NoAutorizado.selector);
        traza.registrarEvento(lote, TrazabilidadMedicamentos.Estado.Entregado, bytes32("OK"));
    }

    function test_Revert_LoteDuplicado() public {
        vm.prank(fabricante);
        traza.registrarLote(lote);

        vm.prank(fabricante);
        vm.expectRevert(TrazabilidadMedicamentos.LoteYaExiste.selector);
        traza.registrarLote(lote);                    // mismo código otra vez
    }

    function test_Revert_EventoSobreLoteInexistente() public {
        vm.prank(distribuidor);
        vm.expectRevert(TrazabilidadMedicamentos.LoteNoExiste.selector);
        traza.registrarEvento(bytes32("NO-EXISTE"), TrazabilidadMedicamentos.Estado.Recibido, bytes32("OK"));
    }
}