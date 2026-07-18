import { RollingBaseline, calculateZScore, calculateVelocity } from "@/lib/math/stats";
import * as fs from "fs";
import * as path from "path";

export interface OddsSignal {
  id: string;
  timestamp: number;
  fixtureId: number;
  fixtureName: string;
  marketType: string;
  outcome: "home" | "draw" | "away";
  oldOdds: number;
  newOdds: number;
  zScore: number;
  velocity: number;
}

const signalsFilePath = path.join(process.cwd(), "signals.json");

let activeSignals: OddsSignal[] = [];

// Load historical signals on startup
try {
  if (fs.existsSync(signalsFilePath)) {
    activeSignals = JSON.parse(fs.readFileSync(signalsFilePath, "utf-8"));
  }
} catch (e) {
  console.error("[SignalDetector] Error loading signals.json:", e);
}

// In-memory stats directory mapping fixtureId -> outcome -> RollingBaseline
const rollingBaselines: Record<string, Record<string, RollingBaseline>> = {};

// Keep track of the last price points to calculate velocity
const lastPricePoints: Record<string, { odds: number; timestamp: number }> = {};

export function getSignals(): OddsSignal[] {
  return activeSignals;
}

export function clearSignals() {
  activeSignals = [];
  saveSignals();
}

function saveSignals() {
  try {
    fs.writeFileSync(signalsFilePath, JSON.stringify(activeSignals, null, 2), "utf-8");
  } catch (e) {
    console.error("[SignalDetector] Error saving signals.json:", e);
  }
}

export interface OddsUpdate {
  fixtureId: number;
  fixtureName: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  timestamp: number;
}

export type SignalCallback = (signal: OddsSignal) => void;

/**
 * Feeds a new odds update into the signal detection engine.
 */
export function processOddsUpdate(update: OddsUpdate, threshold: number, onSignal: SignalCallback) {
  const { fixtureId, fixtureName, homeOdds, drawOdds, awayOdds, timestamp } = update;
  
  const outcomes = [
    { key: "home", odds: homeOdds },
    { key: "draw", odds: drawOdds },
    { key: "away", odds: awayOdds },
  ] as const;

  for (const { key, odds } of outcomes) {
    const trackerKey = `${fixtureId}:${key}`;
    
    // Initialize baselines if missing
    if (!rollingBaselines[fixtureId]) {
      rollingBaselines[fixtureId] = {};
    }
    if (!rollingBaselines[fixtureId][key]) {
      rollingBaselines[fixtureId][key] = new RollingBaseline(15); // 15-minute default baseline
    }

    const baseline = rollingBaselines[fixtureId][key];
    const stats = baseline.getStats();
    
    const lastPoint = lastPricePoints[trackerKey];
    
    // We need at least some historical baselines to evaluate z-score
    let zScore = 0.0;
    let velocity = 0.0;

    if (stats.count >= 5 && stats.stdDev > 0) {
      zScore = calculateZScore(odds, stats.mean, stats.stdDev);
    }
    
    if (lastPoint) {
      const timeDiff = (timestamp - lastPoint.timestamp) / 1000;
      velocity = calculateVelocity(odds, lastPoint.odds, timeDiff);
    }

    // Add to baseline history
    baseline.addPrice(odds, timestamp);
    
    // Update last reference
    const oldOdds = lastPoint ? lastPoint.odds : odds;
    lastPricePoints[trackerKey] = { odds, timestamp };

    // Trigger signal if the z-score exceeds our sensitivity threshold
    if (stats.count >= 5 && Math.abs(zScore) >= threshold && odds !== oldOdds) {
      const signal: OddsSignal = {
        id: `sig_${fixtureId}_${key}_${timestamp}`,
        timestamp,
        fixtureId,
        fixtureName,
        marketType: "MATCH_ODDS",
        outcome: key,
        oldOdds,
        newOdds: odds,
        zScore,
        velocity,
      };

      // De-duplicate signals firing within the same minute for the same outcome
      const isDuplicate = activeSignals.some(
        (s) => s.fixtureId === fixtureId && s.outcome === key && Math.abs(s.timestamp - timestamp) < 30000
      );

      if (!isDuplicate) {
        activeSignals.unshift(signal);
        if (activeSignals.length > 500) activeSignals.pop();
        saveSignals();
        onSignal(signal);
      }
    }
  }
}
