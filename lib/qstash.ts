import { Client, Receiver } from "@upstash/qstash";
import { Stage } from "./types";

export interface WorkerPayload {
  campaign_id: number;
  stage: Stage;
  smtp_account_id: number;
}

/** Absolute base URL QStash should call back. Must be publicly reachable. */
export function baseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Background sending is possible only with a token AND a public callback URL. */
export function backgroundEnabled(): boolean {
  return Boolean(process.env.QSTASH_TOKEN) && !baseUrl().includes("localhost");
}

/** Enqueue a worker run (optionally after `delaySeconds`). */
export async function enqueueWorker(
  payload: WorkerPayload,
  delaySeconds = 0
): Promise<void> {
  const client = new Client({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: process.env.QSTASH_URL || undefined,
  });
  await client.publishJSON({
    url: `${baseUrl()}/api/send-worker`,
    body: payload,
    delay: delaySeconds,
    retries: 2,
  });
}

/** Verify an incoming QStash request body against its signature. */
export async function verifyQstash(signature: string, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  // If keys aren't configured (e.g. local manual testing), skip verification.
  if (!currentSigningKey || !nextSigningKey) return true;
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
