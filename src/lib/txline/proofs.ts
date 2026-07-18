import { BN } from "@coral-xyz/anchor";
import { txlineGet } from "./http";
import { epochDayFromMs } from "@/lib/anchor/pda";

export interface RawProofNode {
  hash: string | number[] | Uint8Array;
  isRightSibling: boolean;
}

export interface ProofNode {
  hash: number[];
  isRightSibling: boolean;
}

export function toBytes32(value: string | number[] | Uint8Array): number[] {
  const bytes = Array.isArray(value)
    ? Uint8Array.from(value)
    : value instanceof Uint8Array
    ? value
    : value.startsWith("0x")
    ? Buffer.from(value.slice(2), "hex")
    : Buffer.from(value, "base64");

  if (bytes.length !== 32) {
    throw new Error(`Expected 32 bytes, received ${bytes.length}`);
  }
  return Array.from(bytes);
}

export function toProofNodes(nodes: RawProofNode[]): ProofNode[] {
  return nodes.map((node) => ({
    hash: toBytes32(node.hash),
    isRightSibling: node.isRightSibling,
  }));
}

export interface StatValidationResponse {
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    eventStatsSubTreeRoot: string;
  };
  subTreeProof: RawProofNode[];
  mainTreeProof: RawProofNode[];
  statToProve: { key: number; value: number; period: number };
  eventStatRoot: string;
  statProof: RawProofNode[];
  statToProve2?: { key: number; value: number; period: number };
  statProof2?: RawProofNode[];
}

export async function fetchStatValidation(params: {
  fixtureId: number;
  seq: number;
  statKey: number;
  statKey2?: number;
}): Promise<StatValidationResponse> {
  const query: any = {
    fixtureId: params.fixtureId,
    seq: params.seq,
    statKey: params.statKey,
  };
  if (params.statKey2 !== undefined) {
    query.statKey2 = params.statKey2;
  }
  return txlineGet("/api/scores/stat-validation", query);
}

export function buildStatArgs(validation: StatValidationResponse) {
  const fixtureSummary = {
    fixtureId: new BN(validation.summary.fixtureId),
    updateStats: {
      updateCount: validation.summary.updateStats.updateCount,
      minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
  };

  const fixtureProof = toProofNodes(validation.subTreeProof);
  const mainTreeProof = toProofNodes(validation.mainTreeProof);

  const stat1 = {
    statToProve: validation.statToProve,
    eventStatRoot: toBytes32(validation.eventStatRoot),
    statProof: toProofNodes(validation.statProof),
  };

  const stat2 =
    validation.statToProve2 && validation.statProof2
      ? {
          statToProve: validation.statToProve2,
          eventStatRoot: toBytes32(validation.eventStatRoot),
          statProof: toProofNodes(validation.statProof2),
        }
      : null;

  const targetTs = validation.summary.updateStats.minTimestamp;
  const epochDay = epochDayFromMs(targetTs);

  return { fixtureSummary, fixtureProof, mainTreeProof, stat1, stat2, targetTs, epochDay };
}
