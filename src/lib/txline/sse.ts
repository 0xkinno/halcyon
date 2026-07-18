import { network } from "@/config/network";
import { authHeaders } from "@/lib/auth/session";
import { getOrActivateServerSession } from "@/lib/auth/serverSession";

export interface SseMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

function parseSseBlock(block: string): SseMessage | null {
  const message: SseMessage = { data: "" };
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const sep = rawLine.indexOf(":");
    const field = sep === -1 ? rawLine : rawLine.slice(0, sep);
    const value = sep === -1 ? "" : rawLine.slice(sep + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
    if (field === "retry") message.retry = Number(value);
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

async function* readSseMessages(response: Response): AsyncGenerator<SseMessage> {
  if (!response.body) throw new Error("Stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.match(/\r?\n\r?\n/);
      while (sep?.index !== undefined) {
        const block = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep[0].length);
        const msg = parseSseBlock(block);
        if (msg) yield msg;
        sep = buffer.match(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    const msg = parseSseBlock(buffer);
    if (msg) yield msg;
  } finally {
    reader.releaseLock();
  }
}

export function parseSseData<T = unknown>(data: string): T | string {
  try {
    return JSON.parse(data) as T;
  } catch {
    return data;
  }
}

export type StreamKind = "odds" | "scores";

interface StreamOptions {
  kind: StreamKind;
  onMessage: (msg: SseMessage) => void;
  onError?: (err: unknown) => void;
  onReconnect?: (attempt: number) => void;
  signal?: AbortSignal;
}

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

export async function streamWithReconnect(opts: StreamOptions): Promise<void> {
  const { kind, onMessage, onError, onReconnect, signal } = opts;
  let attempt = 0;

  while (!signal?.aborted) {
    try {
      // Ensure we have a valid, active authenticated session before establishing the connection
      await getOrActivateServerSession();

      const res = await fetch(`${network.apiOrigin}/api/${kind}/stream`, {
        headers: {
          ...authHeaders(),
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        signal,
      });
      if (!res.ok) throw new Error(`Stream failed: ${res.status}`);

      attempt = 0; // reset backoff after a successful connection
      for await (const message of readSseMessages(res)) {
        onMessage(message);
      }
    } catch (err) {
      if (signal?.aborted) return;
      onError?.(err);
    }

    attempt += 1;
    // Exponential backoff: 2s, 4s, 8s, capped at 30s
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
    onReconnect?.(attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
