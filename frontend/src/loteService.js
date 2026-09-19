import { ethers } from 'ethers';
import { traza } from './contract';

// Convierte el texto legible del lote (ej: "LOTE-VACUNA-001") a bytes32.
// Si el usuario pega directamente un bytes32 (0x + 64 hex), lo acepta tal cual.
export function normalizarCodigo(input) {
  const texto = String(input ?? '').trim();
  if (texto.length === 0) {
    throw new Error('Introduce un código de lote para continuar.');
  }

  // Caso 1: el usuario ya pegó un bytes32 completo (0x + 64 dígitos hex) -> se usa tal cual.
  if (/^0x[0-9a-fA-F]{64}$/.test(texto)) {
    return texto.toLowerCase();
  }

  // Caso 2 (el normal): es texto legible -> se codifica a bytes32.
  // encodeBytes32String falla si el texto supera 31 bytes; lo avisamos claro.
  if (texto.length > 31) {
    throw new Error('El código es demasiado largo (máximo 31 caracteres).');
  }
  return ethers.encodeBytes32String(texto);
}

export async function consultarLote(codigoBytes32) {
  const lote = await traza.lotes(codigoBytes32);
  if (!lote.existe) {
    return { codigo: codigoBytes32, lote: null, eventos: [] };
  }
  const total = Number(await traza.totalEventos(codigoBytes32));

  // Solo trae los ultimos 10 (no los cientos), en paralelo para que sea rapido
  const desde = Math.max(0, total - 10);
  const indices = [];
  for (let i = desde; i < total; i++) indices.push(i);

  const eventos = await Promise.all(
    indices.map((i) => traza.obtenerEvento(codigoBytes32, i))
  );

  return { codigo: codigoBytes32, lote, eventos, totalReal: total };
}