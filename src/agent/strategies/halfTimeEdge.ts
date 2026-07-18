import { NDimensionalStrategy } from "../strategyEngine";

export const halfTimeEdgeStrategy: NDimensionalStrategy = {
  name: "Half-Time Edge",
  description: "Exploits high-scoring first-halves with intense pressure stats.",
  conditions: [
    { stat: "shots_on_target", period: 0, comparison: "GreaterThanOrEqual", threshold: 5 },
    { stat: "corners", period: 0, comparison: "GreaterThan", threshold: 4 }
  ],
  entry_signal: "active first half stats at interval",
  stake_usdt: 15,
  max_positions: 1
};
