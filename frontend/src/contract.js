import { JsonRpcProvider, Contract, BrowserProvider } from 'ethers';
import abi from './abi/TrazabilidadMedicamentos.json';

export const RPC_URL = 'https://testnet.hsk.xyz';
export const CONTRACT_ADDRESS = '0x75B81d9dCd1101b0C5854509d0065368d9596d13';
export const CHAIN_ID = 133;

// Provider de solo lectura (para consultar el contrato)
const provider = new JsonRpcProvider(RPC_URL);
export const traza = new Contract(CONTRACT_ADDRESS, abi, provider);

// Conecta MetaMask y devuelve el contrato con firma (para escribir)
export async function conectarWallet() {
  if (!window.ethereum) {
    throw new Error('No se detectó MetaMask. Instálalo para continuar.');
  }

  // Pide conexión a MetaMask
  const browserProvider = new BrowserProvider(window.ethereum);
  await browserProvider.send('eth_requestAccounts', []);

  // Verifica/cambia a la red HashKey (chain 133)
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x85' }],  // 133 en hexadecimal
    });
  } catch (e) {
    // Si la red no está agregada, la agrega
    if (e.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x85',
          chainName: 'HashKey Chain Testnet',
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
          blockExplorerUrls: ['https://testnet-explorer.hskchain.net'],
        }],
      });
    }
  }

  const signer = await browserProvider.getSigner();
  const direccion = await signer.getAddress();
  const contratoConFirma = new Contract(CONTRACT_ADDRESS, abi, signer);
  return { direccion, contratoConFirma };
}