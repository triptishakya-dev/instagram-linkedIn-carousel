/**
 * The content generation worker.
 *
 * Separate from `worker/image-generator.ts`, which polls the older
 * `image-generation-queue` and whose activities never wrote to S3 or the
 * database. This one serves `content-generation` and runs the real pipeline.
 */

import { NativeConnection, Worker } from "@temporalio/worker";
import { Client, Connection } from "@temporalio/client";
import * as activities from "./activities/generation";

export const CONTENT_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "content-generation";

function address(): string {
  return process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
}

function namespace(): string {
  return process.env.TEMPORAL_NAMESPACE ?? "default";
}

/** A client for starting workflows, used by the API routes. */
export async function temporalClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const connection = await Connection.connect({ address: address(), connectTimeout: "10s" });
  return {
    client: new Client({ connection, namespace: namespace() }),
    close: () => connection.close(),
  };
}

export async function runContentWorker(): Promise<void> {
  const connection = await NativeConnection.connect({ address: address() });

  const worker = await Worker.create({
    connection,
    namespace: namespace(),
    taskQueue: CONTENT_TASK_QUEUE,
    workflowsPath: require.resolve("./workflows/generate-post"),
    activities,
    // Image generation is slow and rate limited upstream; letting many
    // activities run at once buys nothing and invites 429s.
    maxConcurrentActivityTaskExecutions: 2,
  });

  console.log(`[content-worker] listening on "${CONTENT_TASK_QUEUE}" at ${address()}`);
  await worker.run();
}
