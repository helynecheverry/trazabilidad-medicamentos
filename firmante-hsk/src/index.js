import { createWalletClient, http, defineChain, encodeFunctionData, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const hashkey = defineChain({
  id: 133,
  name: 'HashKey Testnet',
  nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hsk.xyz'] } },
});

const CONTRATO = '0x75B81d9dCd1101b0C5854509d0065368d9596d13';

const ABI = [{
  name: 'registrarEvento',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'codigo', type: 'bytes32' },
    { name: 'estado', type: 'uint8' },
    { name: 'condicion', type: 'bytes32' },
  ],
  outputs: [],
}];

function aBytes32(texto) {
  return stringToHex(texto, { size: 32 });
}

function normalizarLlave(llave) {
  let k = (llave || '').trim();
  if (!k.startsWith('0x')) k = '0x' + k;
  return k;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Envia un POST con los datos del sensor', { status: 405 });
    }
    try {
      const datos = await request.json();
      const lote = datos.lote || 'DESCONOCIDO';

      // Empaqueta los 3 sensores + tipo de alerta en el bytes32
      const alerta = datos.alerta || 'ALERTA';
      const t = datos.temp !== undefined ? Math.round(datos.temp) : '?';
      const a = datos.acel !== undefined ? Math.round(datos.acel) : '?';
      const m = datos.mov !== undefined ? datos.mov : '?';
      const condicion = `${alerta}|T${t}|A${a}|M${m}`;

      const llave = normalizarLlave(env.LLAVE_PRIVADA);
      const account = privateKeyToAccount(llave);
      const cliente = createWalletClient({ account, chain: hashkey, transport: http() });

      const data = encodeFunctionData({
        abi: ABI,
        functionName: 'registrarEvento',
        args: [aBytes32(lote), 2, aBytes32(condicion)],
      });

      const hash = await cliente.sendTransaction({ to: CONTRATO, data });

      return new Response(JSON.stringify({ ok: true, hash, condicion }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
