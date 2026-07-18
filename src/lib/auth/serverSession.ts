import { getServiceProgram } from "../anchor/client";
import { startGuestSession, activateApiToken, setSession, getSession, isSessionStale } from "./session";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { pricingMatrixPda, tokenTreasuryPda, tokenTreasuryVault } from "../anchor/pda";
import { network } from "@/config/network";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as path from "path";

let cachedSubscribeTxSig = "d2CXWbt52bydEq1C1BDdPwngo8oYYrT7FWzoiRQfvMEcaVeQUampCTs4a48fuzsMiFvGhDwEvCSrc6CY6CkEqc5";
const SELECTED_LEAGUES: number[] = [];
const sessionFilePath = path.join(process.cwd(), "session.json");

/**
 * Executes a fresh on-chain subscription to generate a new transaction signature.
 */
async function performOnChainSubscription(program: any, user: any): Promise<string> {
  console.log(`[serverSession] Executing on-chain subscription for Service Wallet ${user.toBase58()}...`);
  
  const connection = program.provider.connection;
  let bal = 0;
  try {
    bal = await connection.getBalance(user);
  } catch (e) {}

  if (bal < 0.1 * 10 ** 9) {
    console.log(`[serverSession] Service wallet has low balance (${(bal / 10**9).toFixed(4)} SOL). Requesting airdrop...`);
    try {
      const sig = await connection.requestAirdrop(user, 1 * 10 ** 9);
      await connection.confirmTransaction(sig, "confirmed");
      console.log("[serverSession] Service wallet airdrop confirmed.");
    } catch (e: any) {
      console.warn(`[serverSession] Service wallet airdrop failed: ${e.message || e}. Please manually fund: ${user.toBase58()}`);
    }
  }

  const userTokenAccount = getAssociatedTokenAddressSync(
    network.txlTokenMint,
    user,
    false,
    network.tokenProgramId
  );
  
  // Prepend ATA creation instruction if it doesn't exist (idempotent format)
  const preIxs = [];
  try {
    const info = await connection.getAccountInfo(userTokenAccount);
    if (!info) {
      console.log("[serverSession] Service wallet user_token_account not initialized. Appending creation instruction...");
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          userTokenAccount,
          user,
          network.txlTokenMint,
          network.tokenProgramId
        )
      );
    }
  } catch (e) {
    console.error("[serverSession] Error checking service wallet ATA:", e);
  }

  const [pricingMatrix] = pricingMatrixPda();
  const [tokenTreasury] = tokenTreasuryPda();
  const tokenTreasuryVaultSync = tokenTreasuryVault();
  
  const sig = await program.methods
    .subscribe(1, 4) // 1 row, 4 weeks
    .accounts({
      user,
      pricingMatrix,
      tokenMint: network.txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault: tokenTreasuryVaultSync,
      tokenTreasuryPda: tokenTreasury,
      tokenProgram: network.tokenProgramId,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .preInstructions(preIxs)
    .rpc();

  console.log(`[serverSession] On-chain subscription successful! Sig: ${sig}`);
  return sig;
}

/**
 * Ensures a valid, authenticated server session is active for calling TxLINE APIs.
 */
export async function getOrActivateServerSession() {
  if (getSession() && !isSessionStale()) {
    return getSession()!;
  }

  if (fs.existsSync(sessionFilePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(sessionFilePath, "utf-8"));
      const ageMs = Date.now() - cached.issuedAt;
      if (ageMs < 45 * 60 * 1000) {
        setSession(cached);
        if (cached.subscribeTxSig) {
          cachedSubscribeTxSig = cached.subscribeTxSig;
        }
        return cached;
      }
    } catch (e) {}
  }

  console.log("[serverSession] Initializing fresh TxLINE API token...");
  const program = getServiceProgram();
  const wallet = (program.provider as any).wallet;
  
  // Custom wallet check support
  const payer = (wallet as any).payer || (wallet as any).payerWallet?.payer;
  if (!payer) {
    throw new Error("Service program provider is not initialized with a Keypair wallet.");
  }
  const keypair = payer as Keypair;

  let currentSig = cachedSubscribeTxSig;
  let jwt = await startGuestSession();
  let apiToken: string;

  try {
    apiToken = await activateApiToken({
      txSig: currentSig,
      selectedLeagues: SELECTED_LEAGUES,
      jwt,
      signMessage: (message) => nacl.sign.detached(message, keypair.secretKey)
    });
  } catch (err: any) {
    const errMsg = err.response?.data || err.message || "";
    const status = err.response?.status;
    console.warn(`[serverSession] Direct activation failed (Status: ${status}, Message: ${errMsg}). Retrying with fresh subscription...`);
    
    try {
      currentSig = await performOnChainSubscription(program, keypair.publicKey);
      jwt = await startGuestSession();
      apiToken = await activateApiToken({
        txSig: currentSig,
        selectedLeagues: SELECTED_LEAGUES,
        jwt,
        signMessage: (message) => nacl.sign.detached(message, keypair.secretKey)
      });
      cachedSubscribeTxSig = currentSig;
    } catch (innerErr: any) {
      console.error("[serverSession] Fresh on-chain subscription or activation failed:", innerErr.response?.data || innerErr.message);
      throw innerErr;
    }
  }

  const session = {
    jwt,
    apiToken,
    subscribeTxSig: currentSig,
    issuedAt: Date.now()
  };

  setSession(session);
  try {
    fs.writeFileSync(sessionFilePath, JSON.stringify(session, null, 2), "utf-8");
  } catch (e) {}

  console.log("[serverSession] TxLINE API token successfully activated!");
  return session;
}
