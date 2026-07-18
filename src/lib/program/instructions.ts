import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey, SystemProgram } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { Txoracle } from "@/lib/anchor/idl/types";
import { network } from "@/config/network";
import {
  orderIntentPda,
  intentVaultPda,
  escrowVaultPda,
  tradeVaultPda,
  tradeEscrowPda,
  matchedTradePda,
  tokenTreasuryPda,
  dailyScoresRootsPda,
  usdtTreasuryPda,
} from "@/lib/anchor/pda";
import { buildStatArgs, type StatValidationResponse } from "@/lib/txline/proofs";
import type { MarketDefinition } from "@/types/market";

const COMPUTE_BUDGET_IX = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

export function marketTermsHash(market: MarketDefinition, fixtureId: number): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${fixtureId}:${market.statKeyA}:${market.statKeyB}:${market.threshold}:${market.comparison}`);
  const out = new Array(32).fill(0);
  for (let i = 0; i < bytes.length; i++) out[i % 32] ^= bytes[i];
  return out;
}

/* ---------------------------- Order book: maker side ---------------------------- */

export async function createIntent(
  program: anchor.Program<Txoracle>,
  params: {
    maker: PublicKey;
    intentId: bigint;
    market: MarketDefinition;
    depositAmount: bigint;
    expirationTs: number;
    claimPeriodSeconds: number;
  }
) {
  const [orderIntent] = orderIntentPda(params.maker, params.intentId);
  const [intentVault] = intentVaultPda(orderIntent);
  const [treasuryPda] = tokenTreasuryPda();
  const makerTokenAccount = getAssociatedTokenAddressSync(
    network.usdtMint,
    params.maker,
    false,
    network.legacyTokenProgramId
  );

  const preIxs = [COMPUTE_BUDGET_IX];
  try {
    const info = await program.provider.connection.getAccountInfo(makerTokenAccount);
    if (!info) {
      console.log("[instructions] maker token account not initialized, adding init instruction...");
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          params.maker,
          makerTokenAccount,
          params.maker,
          network.usdtMint,
          network.legacyTokenProgramId
        )
      );
    }
  } catch (e) {
    console.error("Error checking maker token account:", e);
  }

  return program.methods
    .createIntent(
      new BN(params.intentId.toString()),
      marketTermsHash(params.market, params.market.fixtureId),
      new BN(params.depositAmount.toString()),
      new BN(params.expirationTs),
      new BN(params.claimPeriodSeconds.toString()),
      new BN(params.market.fixtureId)
    )
    .accounts({
      maker: params.maker,
      orderIntent,
      intentVault,
      makerTokenAccount,
      tokenMint: network.usdtMint,
      tokenTreasuryPda: treasuryPda,
      tokenProgram: network.legacyTokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions(preIxs)
    .rpc();
}

/** Solver-only: matches a maker intent against a taker intent. */
export async function executeMatch(
  program: anchor.Program<Txoracle>,
  params: {
    solver: PublicKey;
    tradeId: bigint;
    makerIntent: PublicKey;
    takerIntent: PublicKey;
    makerStake: bigint;
    takerStake: bigint;
  }
) {
  const [matchedTrade] = matchedTradePda(params.tradeId);
  return program.methods
    .executeMatch(new BN(params.tradeId.toString()), new BN(params.makerStake.toString()), new BN(params.takerStake.toString()))
    .accounts({
      solver: params.solver,
      makerIntent: params.makerIntent,
      takerIntent: params.takerIntent,
      makerVault: intentVaultPda(params.makerIntent)[0],
      takerVault: intentVaultPda(params.takerIntent)[0],
      matchedTrade,
      tradeVault: tradeVaultPda(params.tradeId)[0],
      tokenMint: network.usdtMint,
      tokenProgram: network.legacyTokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([COMPUTE_BUDGET_IX])
    .rpc();
}

/** Settles a matched order-book trade. */
export async function settleMatchedTrade(
  program: anchor.Program<Txoracle>,
  params: { winner: PublicKey; tradeId: bigint; validation: StatValidationResponse; terms: Record<string, unknown> }
) {
  const [matchedTrade] = matchedTradePda(params.tradeId);
  const { fixtureSummary, fixtureProof, mainTreeProof, stat1, stat2, targetTs, epochDay } = buildStatArgs(params.validation);
  const [scoresRoots] = dailyScoresRootsPda(epochDay);
  const winnerTokenAccount = getAssociatedTokenAddressSync(
    network.usdtMint,
    params.winner,
    false,
    network.legacyTokenProgramId
  );

  return program.methods
    .settleMatchedTrade(new BN(params.tradeId.toString()), new BN(targetTs), fixtureSummary, fixtureProof, mainTreeProof, stat1, stat2, params.terms)
    .accounts({
      winner: params.winner,
      dailyScoresMerkleRoots: scoresRoots,
      matchedTrade,
      tradeVault: tradeVaultPda(params.tradeId)[0],
      winnerTokenAccount,
      tokenMint: network.usdtMint,
      tokenTreasuryPda: tokenTreasuryPda()[0],
      tokenProgram: network.legacyTokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([COMPUTE_BUDGET_IX])
    .rpc();
}

/** Read-only on-chain audit simulator. */
export async function auditTradeResult(
  program: anchor.Program<Txoracle>,
  params: { payer: PublicKey; validation: StatValidationResponse; terms: Record<string, unknown> }
) {
  const { fixtureSummary, fixtureProof, mainTreeProof, stat1, stat2, targetTs, epochDay } = buildStatArgs(params.validation);
  const [scoresRoots] = dailyScoresRootsPda(epochDay);

  return program.methods
    .auditTradeResult(params.terms, fixtureSummary, mainTreeProof, fixtureProof, stat1, stat2, new BN(targetTs))
    .accounts({ payer: params.payer, dailyScoresMerkleRoots: scoresRoots })
    .preInstructions([COMPUTE_BUDGET_IX])
    .simulate();
}

/** Requests airdrop of devnet USDT to the specified wallet using the program's faucet instruction. */
export async function requestDevnetFaucet(
  program: anchor.Program<Txoracle>,
  params: { user: PublicKey }
) {
  const [usdtTreasury] = usdtTreasuryPda();
  const userUsdtAta = getAssociatedTokenAddressSync(network.usdtMint, params.user, false, network.legacyTokenProgramId);
  const [faucetTracker] = PublicKey.findProgramAddressSync(
    [Buffer.from("faucet_tracker"), params.user.toBuffer()],
    network.programId
  );

  return program.methods
    .requestDevnetFaucet()
    .accounts({
      user: params.user,
      faucetTracker,
      usdtMint: network.usdtMint,
      userUsdtAta,
      usdtTreasuryPda: usdtTreasury,
      tokenProgram: network.legacyTokenProgramId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
