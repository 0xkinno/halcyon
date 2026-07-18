import { getPositions, type TradePosition } from "./executor";

export interface SafeModeConfig {
  maxPositionsPerFixture: number;
  maxTotalExposureUsdt: number;
  maxSessionLossUsdt: number;
  zScoreThreshold: number;
}

export let config: SafeModeConfig = {
  maxPositionsPerFixture: 3,
  maxTotalExposureUsdt: 50,
  maxSessionLossUsdt: 30,
  zScoreThreshold: 2.0,
};

export let isSafeModeActive = false;
export let safeModeReason = "";

export function updateConfig(newConfig: Partial<SafeModeConfig>) {
  config = { ...config, ...newConfig };
}

export function activateSafeMode(reason: string) {
  isSafeModeActive = true;
  safeModeReason = reason;
  console.warn(`[SafeMode] Safe Mode ACTIVATED! Reason: ${reason}`);
}

export function deactivateSafeMode() {
  isSafeModeActive = false;
  safeModeReason = "";
  console.log(`[SafeMode] Safe Mode DEACTIVATED.`);
}

/**
 * Checks risk metrics and triggers circuit breakers if thresholds are exceeded.
 */
export function checkCircuitBreakers(incomingFixtureId: number): boolean {
  if (isSafeModeActive) {
    return false;
  }

  const positions = getPositions();
  const active = positions.filter((p) => p.status === "OPEN" || p.status === "MATCHED");

  // 1. Max positions per fixture
  const fixtureCount = active.filter((p) => p.fixtureId === incomingFixtureId).length;
  if (fixtureCount >= config.maxPositionsPerFixture) {
    console.log(`[SafeMode] Blocked: Max positions (${config.maxPositionsPerFixture}) reached for fixture ${incomingFixtureId}`);
    return false;
  }

  // 2. Max total exposure
  const totalExposure = active.reduce((sum, p) => sum + p.stake, 0);
  if (totalExposure >= config.maxTotalExposureUsdt) {
    activateSafeMode(`Total exposure of ${totalExposure} USDT exceeds limit of ${config.maxTotalExposureUsdt} USDT`);
    return false;
  }

  // 3. Max session loss (realized P&L checks)
  const settled = positions.filter((p) => p.status === "SETTLED");
  
  // A simplistic P&L calculation: if winner is agent, we get stake * odds. If not, we lose stake.
  let totalLoss = 0;
  for (const pos of settled) {
    const isWinner = pos.winner && pos.winner !== pos.takerIntentPda;
    if (!isWinner) {
      totalLoss += pos.stake;
    }
  }

  if (totalLoss >= config.maxSessionLossUsdt) {
    activateSafeMode(`Session loss of ${totalLoss} USDT exceeds threshold of ${config.maxSessionLossUsdt} USDT`);
    return false;
  }

  return true;
}
