import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { network } from "@/config/network";
import { getProgram, getServiceProgram, getConnection, keypairWallet } from "@/lib/anchor/client";
import {
  orderIntentPda,
  intentVaultPda,
  matchedTradePda,
  tradeVaultPda,
  tradeEscrowPda,
  escrowVaultPda,
  tokenTreasuryPda,
} from "@/lib/anchor/pda";
import { createIntent, executeMatch, requestDevnetFaucet, marketTermsHash } from "@/lib/program/instructions";
import type { MarketDefinition } from "@/types/market";
import type { Txoracle } from "@/lib/anchor/idl/types";
import * as fs from "fs";
import * as path from "path";

export interface TradePosition {
  id: string; // tradeId string
  makerIntentId: string;
  takerIntentId: string;
  fixtureId: number;
  fixtureName: string;
  marketType: string;
  outcome: "home" | "draw" | "away";
  agent: "Agent A" | "Agent B";
  strategyName: string;
  stake: number; // in USDT (whole units)
  odds: number;
  status: "OPEN" | "MATCHED" | "SETTLED" | "FAILED";
  makerIntentPda: string;
  takerIntentPda: string;
  matchedTradePda: string;
  txSignature: string;
  settleTxSignature?: string;
  winner?: string;
  timestamp: number;
}

const walletsFilePath = path.join(process.cwd(), "wallets.json");
const tradesFilePath = path.join(process.cwd(), "trades.json");

let agentAKeypair: Keypair | null = null;
let agentBKeypair: Keypair | null = null;
let activePositions: TradePosition[] = [];

// Load historical positions on startup
try {
  if (fs.existsSync(tradesFilePath)) {
    activePositions = JSON.parse(fs.readFileSync(tradesFilePath, "utf-8"));
  }
} catch (e) {
  console.error("[Executor] Error loading trades.json:", e);
}

export function getPositions(): TradePosition[] {
  return activePositions;
}

export function clearPositions() {
  activePositions = [];
  savePositions();
}

function savePositions() {
  try {
    fs.writeFileSync(tradesFilePath, JSON.stringify(activePositions, null, 2), "utf-8");
  } catch (e) {
    console.error("[Executor] Error saving trades.json:", e);
  }
}

/**
 * Initializes and loads the local agent keypairs. Generates them if missing.
 */
export async function initAgentWallets(): Promise<{ agentA: string; agentB: string }> {
  let wallets: { agentASecret: number[]; agentBSecret: number[] } | null = null;

  if (fs.existsSync(walletsFilePath)) {
    try {
      wallets = JSON.parse(fs.readFileSync(walletsFilePath, "utf-8"));
    } catch (e) {
      console.error("[Executor] Error reading wallets.json:", e);
    }
  }

  if (!wallets) {
    console.log("[Executor] Keypairs not found. Generating fresh Agent A & Agent B wallets...");
    const keypairA = Keypair.generate();
    const keypairB = Keypair.generate();
    wallets = {
      agentASecret: Array.from(keypairA.secretKey),
      agentBSecret: Array.from(keypairB.secretKey),
    };
    fs.writeFileSync(walletsFilePath, JSON.stringify(wallets, null, 2), "utf-8");
  }

  agentAKeypair = Keypair.fromSecretKey(Uint8Array.from(wallets.agentASecret));
  agentBKeypair = Keypair.fromSecretKey(Uint8Array.from(wallets.agentBSecret));

  console.log(`[Executor] Agent A (Momentum) wallet: ${agentAKeypair.publicKey.toBase58()}`);
  console.log(`[Executor] Agent B (Reversion) wallet: ${agentBKeypair.publicKey.toBase58()}`);

  return {
    agentA: agentAKeypair.publicKey.toBase58(),
    agentB: agentBKeypair.publicKey.toBase58(),
  };
}

export function getAgentKeypair(agent: "Agent A" | "Agent B"): Keypair {
  if (agent === "Agent A" && agentAKeypair) return agentAKeypair;
  if (agent === "Agent B" && agentBKeypair) return agentBKeypair;
  throw new Error(`Agent wallets not initialized!`);
}

/**
 * Funds an agent's wallet with SOL (airdrop retry loop) and USDT (faucet instruction).
 */
export async function fundAgentWallet(agent: "Agent A" | "Agent B") {
  const kp = getAgentKeypair(agent);
  const conn = getConnection();

  console.log(`[Executor] Funding ${agent} (${kp.publicKey.toBase58()}). Checking SOL balance...`);
  
  let bal = 0;
  try {
    bal = await conn.getBalance(kp.publicKey);
  } catch (e) {}
  
  if (bal < 0.05 * 10 ** 9) {
    console.log(`[Executor] Requesting SOL airdrop (2 SOL) for ${agent}...`);
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const sig = await conn.requestAirdrop(kp.publicKey, 2 * 10 ** 9);
        await conn.confirmTransaction(sig, "confirmed");
        console.log(`[Executor] SOL airdrop completed on attempt #${attempt}.`);
        success = true;
        break;
      } catch (e: any) {
        console.warn(`[Executor] SOL airdrop attempt #${attempt} failed: ${e.message || e}`);
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
    if (!success) {
      console.error(`[Executor] SOL airdrop exhausted. User needs to manually fund this wallet: ${kp.publicKey.toBase58()}`);
    }
  }

  // Request USDT from program faucet if ATA has low balance
  const userUsdtAta = getAssociatedTokenAddressSync(
    network.usdtMint,
    kp.publicKey,
    false,
    network.legacyTokenProgramId
  );

  let usdtBal = 0n;
  try {
    const info = await conn.getTokenAccountBalance(userUsdtAta);
    usdtBal = BigInt(info.value.amount);
  } catch (e) {}

  if (usdtBal < BigInt(10) * BigInt(10) ** BigInt(6)) {
    console.log(`[Executor] USDT balance is low (${(Number(usdtBal) / 10**6).toFixed(2)} USDT). Requesting program faucet...`);
    try {
      const wallet = keypairWallet(kp);
      const program = getProgram(wallet);
      const sig = await requestDevnetFaucet(program, { user: kp.publicKey });
      console.log(`[Executor] USDT Faucet claimed successfully! Tx: ${sig}`);
    } catch (e: any) {
      console.warn(`[Executor] USDT Faucet claim warning: ${e.message || e}`);
    }
  }
}

/**
 * Creates and submits an order intent on-chain.
 */
export async function openPosition(params: {
  agent: "Agent A" | "Agent B";
  strategyName: string;
  market: MarketDefinition;
  stake: number; // in USDT
  odds: number;
}): Promise<TradePosition> {
  const { agent, strategyName, market, stake, odds } = params;
  const kp = getAgentKeypair(agent);
  const wallet = keypairWallet(kp);
  const program = getProgram(wallet);
  const connection = getConnection();

  console.log("[EXECUTOR] Signal received, attempting trade...");
  console.log("[EXECUTOR] Agent wallet:", wallet.publicKey.toBase58());
  
  let solBal = 0;
  try {
    solBal = await connection.getBalance(wallet.publicKey);
  } catch (e) {}
  console.log("[EXECUTOR] SOL balance:", solBal / 10**9);

  // Automatic funding lock immediately before trade attempt
  if (solBal < 0.01 * 10 ** 9) {
    console.log("[EXECUTOR] Requesting SOL airdrop...");
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 2 * 10 ** 9); // 2 SOL
      await connection.confirmTransaction(sig, "confirmed");
      console.log("[EXECUTOR] SOL airdrop confirmed");
    } catch (e: any) {
      console.error("[EXECUTOR] SOL airdrop request failed:", e.message || e);
    }
  }

  // Request USDT from program faucet if ATA has low balance
  const userUsdtAta = getAssociatedTokenAddressSync(
    network.usdtMint,
    kp.publicKey,
    false,
    network.legacyTokenProgramId
  );

  let usdtBal = 0n;
  try {
    const info = await connection.getTokenAccountBalance(userUsdtAta);
    usdtBal = BigInt(info.value.amount);
  } catch (e) {}

  if (usdtBal < BigInt(10) * BigInt(10) ** BigInt(6)) {
    console.log(`[EXECUTOR] USDT balance low (${(Number(usdtBal) / 10**6).toFixed(2)} USDT). Requesting program faucet...`);
    try {
      await requestDevnetFaucet(program, { user: kp.publicKey });
      console.log("[EXECUTOR] USDT Faucet claim complete.");
    } catch (e: any) {
      console.warn(`[EXECUTOR] USDT Faucet claim warning: ${e.message || e}`);
    }
  }

  const intentId = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  const [makerIntent] = orderIntentPda(kp.publicKey, intentId);

  console.log(`[EXECUTOR] [${agent}] Submitting createIntent for strategy "${strategyName}" (Stake: ${stake} USDT)...`);

  const depositAmount = BigInt(stake) * BigInt(10) ** BigInt(6); // 6 decimals for USDT
  const expirationTs = Math.floor(Date.now() / 1000) + 86400; // 24-hour expiration
  const claimPeriodHours = 168; // u16 representation of hours (168 hours = 7 days)

  let txSig = "";
  try {
    console.log("[EXECUTOR] Calling create_intent...");
    txSig = await createIntent(program, {
      maker: kp.publicKey,
      intentId,
      market,
      depositAmount,
      expirationTs,
      claimPeriodSeconds: claimPeriodHours,
    });
    console.log("[EXECUTOR] Trade executed! Sig:", txSig);
  } catch (error: any) {
    console.error("[EXECUTOR] Trade FAILED:", error.message || error);
    throw error;
  }

  const [mIntentPda] = orderIntentPda(kp.publicKey, intentId);

  const position: TradePosition = {
    id: intentId.toString(),
    makerIntentId: intentId.toString(),
    takerIntentId: "",
    fixtureId: market.fixtureId,
    fixtureName: market.label.split("—")[1]?.trim() || "Match",
    marketType: market.type,
    outcome: params.market.comparison === "GreaterThan" ? "home" : "away", // simplified outcome matching
    agent,
    strategyName,
    stake,
    odds,
    status: "OPEN",
    makerIntentPda: mIntentPda.toBase58(),
    takerIntentPda: "",
    matchedTradePda: "",
    txSignature: txSig,
    timestamp: Date.now(),
  };

  activePositions.unshift(position);
  savePositions();

  // Trigger background matching solver simulation
  triggerSolverMatch(position);

  return position;
}

/**
 * Direct call to create_trade instruction to establish on-chain escrow 
 * between Trader A and Trader B.
 */
async function executeCreateTrade(
  program: anchor.Program<Txoracle>,
  params: {
    authority: Keypair;
    traderA: Keypair;
    traderB: Keypair;
    tradeId: bigint;
    market: MarketDefinition;
    stakeA: bigint;
    stakeB: bigint;
  }
) {
  const authority = params.authority.publicKey;
  const traderA = params.traderA.publicKey;
  const traderB = params.traderB.publicKey;
  const [tradeEscrow] = tradeEscrowPda(params.tradeId);
  const [escrowVault] = escrowVaultPda(params.tradeId);
  const [tokenTreasury] = tokenTreasuryPda();
  
  const traderATokenAccount = getAssociatedTokenAddressSync(
    network.usdtMint,
    traderA,
    false,
    network.legacyTokenProgramId
  );
  const traderBTokenAccount = getAssociatedTokenAddressSync(
    network.usdtMint,
    traderB,
    false,
    network.legacyTokenProgramId
  );

  const preIxs = [anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
  const connection = program.provider.connection;

  // Ensure Trader A ATA exists
  try {
    const info = await connection.getAccountInfo(traderATokenAccount);
    if (!info) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          params.authority.publicKey,
          traderATokenAccount,
          traderA,
          network.usdtMint,
          network.legacyTokenProgramId
        )
      );
    }
  } catch (e) {}

  // Ensure Trader B ATA exists
  try {
    const info = await connection.getAccountInfo(traderBTokenAccount);
    if (!info) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          params.authority.publicKey,
          traderBTokenAccount,
          traderB,
          network.usdtMint,
          network.legacyTokenProgramId
        )
      );
    }
  } catch (e) {}

  const termsHash = marketTermsHash(params.market, params.market.fixtureId);

  return program.methods
    .createTrade(
      new anchor.BN(params.tradeId.toString()),
      new anchor.BN(params.stakeA.toString()),
      new anchor.BN(params.stakeB.toString()),
      termsHash
    )
    .accounts({
      authority,
      traderA,
      traderB,
      traderATokenAccount,
      traderBTokenAccount,
      tradeEscrow,
      escrowVault,
      stakeTokenMint: network.usdtMint,
      tokenTreasuryPda: tokenTreasury,
      tokenProgram: network.legacyTokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions(preIxs)
    .signers([params.authority, params.traderA, params.traderB])
    .rpc();
}

/**
 * Automates matching open intents on-chain using direct create_trade contract escrow.
 */
async function triggerSolverMatch(pos: TradePosition) {
  setTimeout(async () => {
    const kpA = getAgentKeypair("Agent A");
    const kpB = getAgentKeypair("Agent B");
    
    const serviceProgram = getServiceProgram();
    const solverWallet = (serviceProgram.provider as any).wallet;
    const solverKp = solverWallet.payer;
    if (!solverKp) {
      console.warn("[Solver] Service wallet keypair not available. Skipping match.");
      return;
    }

    const [tradeEscrow] = tradeEscrowPda(BigInt(pos.id));
    const depositAmount = BigInt(pos.stake) * BigInt(10) ** BigInt(6);

    try {
      console.log(`[Solver] Triggering direct create_trade escrow between Agent A and Agent B for fixture ${pos.fixtureId}...`);
      
      const market: MarketDefinition = {
        id: pos.id,
        fixtureId: pos.fixtureId,
        type: pos.marketType as any,
        label: pos.fixtureName,
        statKeyA: 1, // goals
        statKeyB: null,
        threshold: 0,
        comparison: pos.outcome === "home" ? "GreaterThan" : "LessThan",
        op: null,
      };

      const matchSig = await executeCreateTrade(serviceProgram, {
        authority: solverKp,
        traderA: kpA,
        traderB: kpB,
        tradeId: BigInt(pos.id),
        market,
        stakeA: depositAmount,
        stakeB: depositAmount,
      });

      // Update position status to MATCHED
      const updated = activePositions.find((p) => p.id === pos.id);
      if (updated) {
        updated.status = "MATCHED";
        updated.takerIntentId = "direct_escrow";
        updated.takerIntentPda = kpB.publicKey.toBase58();
        updated.matchedTradePda = tradeEscrow.toBase58();
        updated.txSignature = matchSig;
        savePositions();
      }

      console.log(`[Solver] Direct create_trade escrow verified on-chain! Trade PDA: ${tradeEscrow.toBase58()} | Tx: ${matchSig}`);

    } catch (e: any) {
      console.error(`[Solver] Direct create_trade escrow failed:`, e.message || e);
      // Mark position as FAILED if the real on-chain transaction fails (no fallback/mock state!)
      const updated = activePositions.find((p) => p.id === pos.id);
      if (updated) {
        updated.status = "FAILED";
        savePositions();
      }
    }
  }, 3000);
}
