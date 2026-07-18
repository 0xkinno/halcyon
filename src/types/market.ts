export type MarketType = "WINNER" | "TOTAL_GOALS" | "FIRST_SCORER" | "PROP";

export interface MarketDefinition {
  id: string;               // deterministic: `${fixtureId}:${type}:${paramsHash}`
  fixtureId: number;
  type: MarketType;
  label: string;             // human-readable, e.g. "Winner — ARG vs FRA"
  statKeyA: number;
  statKeyB: number | null;
  threshold: number;
  comparison: "GreaterThan" | "LessThan" | "EqualTo";
  op: "Add" | "Subtract" | null;
}
