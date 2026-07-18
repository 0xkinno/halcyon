import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { network } from "@/config/network";

export function orderIntentPda(maker: PublicKey, intentId: bigint): [PublicKey, number] {
  const bufId = new BN(intentId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("intent"), maker.toBuffer(), bufId],
    network.programId
  );
}

export function intentVaultPda(intentPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("intent_vault"), intentPda.toBuffer()],
    network.programId
  );
}

export function matchedTradePda(tradeId: bigint): [PublicKey, number] {
  const bufId = new BN(tradeId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trade"), bufId],
    network.programId
  );
}

export function tradeVaultPda(tradeId: bigint): [PublicKey, number] {
  const bufId = new BN(tradeId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trade_vault"), bufId],
    network.programId
  );
}

export function tradeEscrowPda(tradeId: bigint): [PublicKey, number] {
  const bufId = new BN(tradeId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), bufId],
    network.programId
  );
}

export function escrowVaultPda(tradeId: bigint): [PublicKey, number] {
  const bufId = new BN(tradeId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_vault"), bufId],
    network.programId
  );
}

export function dailyScoresRootsPda(epochDay: number): [PublicKey, number] {
  const bufDay = new BN(epochDay).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("scores_roots"), bufDay],
    network.programId
  );
}

export function pricingMatrixPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    network.programId
  );
}

export function tokenTreasuryPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    network.programId
  );
}

export function tokenTreasuryVault(): PublicKey {
  const [treasury] = tokenTreasuryPda();
  return getAssociatedTokenAddressSync(
    network.txlTokenMint,
    treasury,
    true,
    network.tokenProgramId
  );
}

export function usdtTreasuryPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("usdt_treasury")],
    network.programId
  );
}

export function epochDayFromMs(ms: number): number {
  return Math.floor(ms / 86400000);
}
