import { NDimensionalStrategy } from "../strategyEngine";

export const momentumStrategy: NDimensionalStrategy = {
  name: "Momentum",
  description: "Trades in the direction of sudden odds movements, capturing high-velocity trends.",
  conditions: [
    { stat: "possession", period: 0, comparison: "GreaterThanOrEqual", threshold: 50 }
  ],
  entry_signal: "z_score > 2.0 on home/away win odds",
  stake_usdt: 5,
  max_positions: 3
};
