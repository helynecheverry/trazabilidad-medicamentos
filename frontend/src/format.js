import { ethers } from 'ethers';

const ESTADOS = ['Registrado', 'EnTránsito', 'Recibido', 'Entregado', 'Rechazado'];

export function etiquetaEstado(valor) {
  return ESTADOS[Number(valor)] ?? 'Desconocido';
}

export function formatoFecha(timestamp) {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(Number(timestamp) * 1000));
}

export function condicionLegible(bytes32Hex) {
  const hex = String(bytes32Hex).replace(/^0x/, '');
  const bytes = hex.match(/.{2}/g) ?? [];
  let texto = '';
  for (const byte of bytes) {
    const valor = parseInt(byte, 16);
    if (valor >= 32 && valor <= 126) {
      texto += String.fromCharCode(valor);
    } else if (valor !== 0) {
      return bytes32Hex;
    }
  }
  texto = texto.trimEnd();
  return texto.length > 0 ? texto : bytes32Hex;
}

export function acortarDireccion(direccion) {
  if (!direccion) return direccion;
  return `${direccion.slice(0, 6)}...${direccion.slice(-4)}`;
}

export function decodificarCodigo(bytes32Hex) {
  try {
    return ethers.decodeBytes32String(bytes32Hex);
  } catch {
    return bytes32Hex;
  }
}