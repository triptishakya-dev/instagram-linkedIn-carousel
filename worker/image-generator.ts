import { Connection, Client } from "@temporalio/client";
import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities/image-generator";
import {
  imageGenerationWorkflow,
  ImageGenerationWorkflowParams,
  ImageGenerationWorkflowOutput,
} from "./workflows/image-generator";

export const IMAGE_GENERATION_TASK_QUEUE = "image-generation-queue";

/**
 * Trigger an async Image Generation Workflow on the Temporal Queue.
 */
export async function startImageGenerationWorkflow(
  params: ImageGenerationWorkflowParams,
  temporalAddress: string = process.env.TEMPORAL_ADDRESS || "localhost:7233"
): Promise<{ workflowId: string; runId: string }> {
  const connection = await Connection.connect({ address: temporalAddress });
  const client = new Client({ connection });

  const workflowId = `image-gen-${params.postId || Date.now()}`;

  const handle = await client.workflow.start(imageGenerationWorkflow, {
    taskQueue: IMAGE_GENERATION_TASK_QUEUE,
    workflowId,
    args: [params],
  });

  console.log(`[Temporal Client] Started workflow ${handle.workflowId} (Run ID: ${handle.firstExecutionRunId})`);

  return {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  };
}

/**
 * Temporal Worker: Listens on the 'image-generation-queue' and executes workflows & activities.
 */
export async function runImageGeneratorWorker(
  temporalAddress: string = process.env.TEMPORAL_ADDRESS || "localhost:7233"
): Promise<void> {
  const connection = await NativeConnection.connect({
    address: temporalAddress,
  });

  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: IMAGE_GENERATION_TASK_QUEUE,
    workflowsPath: require.resolve("./workflows/image-generator"),
    activities,
  });

  console.log(`[Temporal Worker] Worker listening on queue: "${IMAGE_GENERATION_TASK_QUEUE}"`);
  await worker.run();
}

/**
 * Direct inline fallback generator for environments without an active Temporal server.
 */
export async function prepareImageGenerationTask(
  params: activities.PreparePromptsInput
) {
  const promptAssets = await activities.preparePromptsActivity(params);

  const assets = await Promise.all(
    promptAssets.map(async (asset) => {
      const raw = await activities.generateImageWithApiActivity(asset);
      const storage = await activities.uploadToStorageActivity(raw.slideIndex, raw.rawImageUrl);
      return {
        slideIndex: asset.slideIndex,
        prompt: asset.prompt,
        negativePrompt: asset.negativePrompt,
        aspectRatio: asset.aspectRatio,
        imageUrl: storage.permanentUrl,
        providerPrompts: asset.providerPrompts,
      };
    })
  );

  return {
    topic: params.topic,
    platform: params.platform || "INSTAGRAM",
    assets,
  };
}

// Re-export type definitions for usage in API handlers & UI
export type {
  ImageGenerationWorkflowParams,
  ImageGenerationWorkflowOutput,
} from "./workflows/image-generator";
