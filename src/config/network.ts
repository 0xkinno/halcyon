import { PublicKey } from "@solana/web3.js";

export type TxlineNetwork = "mainnet" | "devnet";

export interface NetworkConfig {
  network: TxlineNetwork;
  rpcUrl: string;
  apiOrigin: string;
  programId: PublicKey;
  txlTokenMint: PublicKey;
  usdtMint: PublicKey;
  tokenProgramId: PublicKey; // Token22 for TxL
  legacyTokenProgramId: PublicKey; // Standard Token Program for USDT
}

const CONFIG: Record<TxlineNetwork, NetworkConfig> = {
  mainnet: {
    network: "mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET ?? "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
    usdtMint: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    tokenProgramId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
    legacyTokenProgramId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  },
  devnet: {
    network: "devnet",
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET ?? "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    usdtMint: new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh"),
    tokenProgramId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
    legacyTokenProgramId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  },
};

export const ACTIVE_NETWORK: TxlineNetwork =
  (process.env.NEXT_PUBLIC_TXLINE_NETWORK as TxlineNetwork) ?? "devnet";

export function getNetworkConfig(net: TxlineNetwork = ACTIVE_NETWORK): NetworkConfig {
  const cfg = CONFIG[net];
  if (!cfg) throw new Error(`Unknown TxLINE network: ${net}`);
  return cfg;
}

export const network = getNetworkConfig();
