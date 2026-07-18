import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { Txoracle } from "./idl/types";
import idlJson from "./idl/txoracle.devnet.json";
import * as fs from "fs";
import * as path from "path";

const serviceWalletPath = path.join(process.cwd(), "service-wallet.json");

export function getConnection(): Connection {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return new Connection(rpcUrl, "confirmed");
}

export function keypairWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      txs.forEach((tx) => tx.partialSign(keypair));
      return txs;
    },
    payer: keypair,
  };
}

export function getServiceProgram(): anchor.Program<Txoracle> {
  const connection = getConnection();
  let keypair: Keypair;
  
  if (process.env.SERVICE_WALLET_SECRET_KEY) {
    const rawSec = JSON.parse(process.env.SERVICE_WALLET_SECRET_KEY);
    keypair = Keypair.fromSecretKey(Uint8Array.from(rawSec));
  } else {
    // Persist keypair to service-wallet.json to avoid address changes on restarts
    if (fs.existsSync(serviceWalletPath)) {
      try {
        const rawSec = JSON.parse(fs.readFileSync(serviceWalletPath, "utf-8"));
        keypair = Keypair.fromSecretKey(Uint8Array.from(rawSec));
      } catch (e) {
        keypair = Keypair.generate();
        fs.writeFileSync(serviceWalletPath, JSON.stringify(Array.from(keypair.secretKey)), "utf-8");
      }
    } else {
      keypair = Keypair.generate();
      fs.writeFileSync(serviceWalletPath, JSON.stringify(Array.from(keypair.secretKey)), "utf-8");
    }
  }

  console.log(`[ServiceWallet] Current Solver/Service Wallet Address: ${keypair.publicKey.toBase58()}`);
  const wallet = keypairWallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  return new anchor.Program(idlJson as any, provider);
}

export function getProgram(wallet: any): anchor.Program<Txoracle> {
  const connection = getConnection();
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new anchor.Program(idlJson as any, provider);
}
