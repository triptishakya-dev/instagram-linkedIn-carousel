/**
 * The content generation worker.
 *
 * Separate from `worker/image-generator.ts`, which polls the older
 * `image-generation-queue` and whose activities never wrote to S3 or the
 * database. This one serves `content-generation` and runs the real pipeline.
 */

import { NativeConnection, Worker } from "@temporalio/worker";
import { CONTENT_TASK_QUEUE, temporalAddress, temporalClient, temporalNamespace } from "../lib/temporal";
import * as activities from "./activities/generation";

export { CONTENT_TASK_QUEUE, temporalClient };

export async function runContentWorker(): Promise<void> {
  const address = temporalAddress();
  const namespace = temporalNamespace();
  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: CONTENT_TASK_QUEUE,
    workflowsPath: require.resolve("./workflows/generate-post"),
    activities,
    // Image generation is slow and rate limited upstream; letting many
    // activities run at once buys nothing and invites 429s.
    maxConcurrentActivityTaskExecutions: 2,
  });

  console.log(`[content-worker] listening on "${CONTENT_TASK_QUEUE}" at ${address}`);
  await worker.run();
}
