import { NDimensionalStrategy } from "../strategyEngine";

export const reversionStrategy: NDimensionalStrategy = {
  name: "Reversion",
  description: "Trades against extreme odds movements, betting on a mean-reverting path.",
  conditions: [
    { stat: "shots_on_target", period: 0, comparison: "GreaterThanOrEqual", threshold: 3 }
  ],
  entry_signal: "z_score < -2.0 on home/away win odds",
  stake_usdt: 5,
  max_positions: 3
};
