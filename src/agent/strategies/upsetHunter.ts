import { NDimensionalStrategy } from "../strategyEngine";

export const upsetHunterStrategy: NDimensionalStrategy = {
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
};
