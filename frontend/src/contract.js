import { JsonRpcProvider, Contract } from 'ethers';
import abi from './abi/TrazabilidadMedicamentos.json';

export const RPC_URL = 'https://testnet.hsk.xyz';
export const CONTRACT_ADDRESS = '0x50cB8085f4529E4E2B40128314Cc41fF896cd2F8';

const provider = new JsonRpcProvider(RPC_URL);

export const traza = new Contract(CONTRACT_ADDRESS, abi, provider);