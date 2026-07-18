export interface StrategyCondition {
  stat: "corners" | "goals_diff" | "red_cards" | "possession" | "shots_on_target";
  period: number; // 0: full match, 1: first half, 2: second half
  comparison: "GreaterThan" | "LessThan" | "GreaterThanOrEqual" | "LessThanOrEqual" | "Equal";
  threshold: number;
}

export interface NDimensionalStrategy {
  name: string;
  description: string;
  conditions: StrategyCondition[];
  geometric_target?: { lat: number; lon: number };
  distance_predicate?: any;
  entry_signal: string;
  stake_usdt: number;
  max_positions: number;
}

export interface MatchStats {
  corners: number;
  goals_diff: number; // home_goals - away_goals
  red_cards: number;
  possession: number;
  shots_on_target: number;
  period: number;
}

export const PRE_BUILT_STRATEGIES: NDimensionalStrategy[] = [
  {
    name: "Momentum",
    description: "Trades in the direction of sudden odds movements, capturing high-velocity trends.",
    conditions: [
      { stat: "possession", period: 0, comparison: "GreaterThanOrEqual", threshold: 50 }
    ],
    entry_signal: "z_score > 2.0 on home/away win odds",
    stake_usdt: 5,
    max_positions: 3
  },
  {
    name: "Reversion",
    description: "Trades against extreme odds movements, betting on a mean-reverting path.",
    conditions: [
      { stat: "shots_on_target", period: 0, comparison: "GreaterThanOrEqual", threshold: 3 }
    ],
    entry_signal: "z_score < -2.0 on home/away win odds",
    stake_usdt: 5,
    max_positions: 3
  },
  {
    name: "Corner Storm",
    description: "Bets on high corners count when the match remains tight (goal diff <= 1).",
    conditions: [
      { stat: "corners", period: 0, comparison: "GreaterThan", threshold: 9 },
      { stat: "goals_diff", period: 0, comparison: "LessThanOrEqual", threshold: 1 },
      { stat: "goals_diff", period: 0, comparison: "GreaterThanOrEqual", threshold: -1 }
    ],
    entry_signal: "corners rate spike with a draw / close game scoreline",
    stake_usdt: 10,
    max_positions: 2
  },
  {
    name: "Upset Hunter",
    description: "Detects underdogs with high corners and possession index dominating favorites.",
    conditions: [
      { stat: "corners", period: 0, comparison: "GreaterThan", threshold: 5 },
      { stat: "possession", period: 0, comparison: "GreaterThanOrEqual", threshold: 55 },
      { stat: "goals_diff", period: 0, comparison: "LessThan", threshold: 0 }
    ],
    entry_signal: "favorite trailing by 1 but dominating corners and possession",
    stake_usdt: 10,
    max_positions: 2
  },
  {
    name: "Half-Time Edge",
    description: "Exploits high-scoring first-halves with intense pressure stats.",
    conditions: [
      { stat: "shots_on_target", period: 0, comparison: "GreaterThanOrEqual", threshold: 5 },
      { stat: "corners", period: 0, comparison: "GreaterThan", threshold: 4 }
    ],
    entry_signal: "active first half stats at interval",
    stake_usdt: 15,
    max_positions: 1
  }
];

/**
 * Checks if a single condition is met.
 */
export function evaluateCondition(cond: StrategyCondition, stats: MatchStats): boolean {
  const value = stats[cond.stat];
  if (value === undefined) return false;

  switch (cond.comparison) {
    case "GreaterThan":
      return value > cond.threshold;
    case "LessThan":
      return value < cond.threshold;
    case "GreaterThanOrEqual":
      return value >= cond.threshold;
    case "LessThanOrEqual":
      return value <= cond.threshold;
    case "Equal":
      return value === cond.threshold;
    default:
      return false;
  }
}

/**
 * Evaluates an entire NDimensionalStrategy's condition list against a match stats snapshot.
 */
export function evaluateStrategy(strategy: NDimensionalStrategy, stats: MatchStats): boolean {
  return strategy.conditions.every((cond) => evaluateCondition(cond, stats));
}
