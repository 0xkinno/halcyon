import { NDimensionalStrategy } from "../strategyEngine";

export const cornerStormStrategy: NDimensionalStrategy = {
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
};
