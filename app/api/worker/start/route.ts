import { NextResponse } from "next/server";
import {
  preparePromptsActivity,
  generateImageWithApiActivity,
  uploadToStorageActivity,
} from "@/worker/activities/image-generator";

export async function POST() {
  try {
    console.log("[API /api/worker/start] Triggering Image Generation Worker task...");

    const topic = "Automated Social Media Post Generation";
    const platform = "INSTAGRAM";
    const carouselSlideCount = 3;

    // 1. Prepare Prompts
    const promptAssets = await preparePromptsActivity({
      topic,
      style: "dark-mode-ui",
      platform,
      carouselSlideCount,
    });

    // 2. Generate Images & Store in /public/generated-images/
    const assets = await Promise.all(
      promptAssets.map(async (asset) => {
        const raw = await generateImageWithApiActivity(asset);
        const storage = await uploadToStorageActivity(raw.slideIndex, raw.rawImageUrl);
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

    return NextResponse.json({
      success: true,
      message: "Worker task completed successfully! Assets saved to /public/generated-images/",
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      task: {
        topic,
        platform,
        generatedAssetsCount: assets.length,
        assets,
      },
    });
  } catch (error: any) {
    console.error("[API /api/worker/start] Error starting worker:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to start worker process",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "READY",
    message: "Temporal Worker Endpoint Active",
    workerQueue: "image-generation-queue",
  });
}
