import axios from "axios";
import { network } from "@/config/network";

export interface Session {
  jwt: string;
  apiToken: string;
  subscribeTxSig: string;
  issuedAt: number;
}

const REFRESH_INTERVAL_MS = 50 * 60 * 1000;
let cachedSession: Session | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export async function startGuestSession(): Promise<string> {
  const res = await axios.post(`${network.apiOrigin}/auth/guest/start`);
  return res.data.token as string;
}

export async function activateApiToken(params: {
  txSig: string;
  selectedLeagues: number[];
  jwt: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array> | Uint8Array;
}): Promise<string> {
  const { txSig, selectedLeagues, jwt, signMessage } = params;
  const messageString = `${txSig}:${selectedLeagues.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = await signMessage(message);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  const res = await axios.post(
    `${network.apiOrigin}/api/token/activate`,
    { txSig, walletSignature, leagues: selectedLeagues },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  return (res.data.token ?? res.data) as string;
}

export function setSession(session: Session) {
  cachedSession = session;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (cachedSession) cachedSession = { ...cachedSession, issuedAt: 0 };
  }, REFRESH_INTERVAL_MS);
}

export function getSession(): Session | null {
  return cachedSession;
}

export function isSessionStale(): boolean {
  if (!cachedSession) return true;
  return Date.now() - cachedSession.issuedAt > REFRESH_INTERVAL_MS;
}

export function authHeaders(): Record<string, string> {
  if (!cachedSession) throw new Error("No active TxLINE session — call startGuestSession + activateApiToken first");
  return {
    Authorization: `Bearer ${cachedSession.jwt}`,
    "X-Api-Token": cachedSession.apiToken,
  };
}
