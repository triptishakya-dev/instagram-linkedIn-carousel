import { NextResponse } from "next/server";
import {
  preparePromptsActivity,
  generateImageWithApiActivity,
  uploadToStorageActivity,
} from "@/worker/activities/image-generator";

const PRESET_TOPICS = [
  {
    topic: "What Happens After Your Request Reaches the Server?",
    style: "tech-infographic" as const,
    platform: "LINKEDIN" as const,
    carouselSlideCount: 1,
    useTechInfographic: true,
  },
  {
    topic: "How Next.js 16 Server Actions & Caching Work Under the Hood",
    style: "tech-infographic" as const,
    platform: "LINKEDIN" as const,
    carouselSlideCount: 1,
    useTechInfographic: true,
  },
  {
    topic: "5 AI Prompt Engineering Tools That Save 10 Hours a Week",
    style: "dark-mode-ui" as const,
    platform: "INSTAGRAM" as const,
    carouselSlideCount: 3,
    useTechInfographic: false,
  },
  {
    topic: "Scalable Microservices Architecture with Redis & Kafka",
    style: "architecture-diagram" as const,
    platform: "LINKEDIN" as const,
    carouselSlideCount: 1,
    useTechInfographic: true,
  },
  {
    topic: "Designing Modern Glassmorphism Social Media Graphics",
    style: "glassmorphism" as const,
    platform: "INSTAGRAM" as const,
    carouselSlideCount: 3,
    useTechInfographic: false,
  },
];

export async function POST(req: Request) {
  try {
    console.log("[API /api/worker/start] Triggering Image Generation Worker task...");

    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      // Empty or non-JSON body
    }

    // Pick dynamic preset if no topic provided in request body
    const randomIndex = Math.floor(Math.random() * PRESET_TOPICS.length);
    const selectedPreset = PRESET_TOPICS[randomIndex];

    const topic = payload.topic || selectedPreset.topic;
    const style = payload.style || selectedPreset.style;
    const platform = payload.platform || selectedPreset.platform;
    const carouselSlideCount = payload.carouselSlideCount || selectedPreset.carouselSlideCount;
    const useTechInfographic = payload.useTechInfographic ?? selectedPreset.useTechInfographic;
    const infographicDetails = payload.infographicDetails;

    // 1. Prepare Prompts using New Master System
    const promptAssets = await preparePromptsActivity({
      topic,
      style,
      platform,
      carouselSlideCount,
      useTechInfographic,
      infographicDetails,
    });

    // 2. Generate Images via Gemini API (or SVG card fallback) & Store in /public/generated-images/
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
      message: `Worker task completed! Generated ${assets.length} visual asset(s) using new prompt engine.`,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      task: {
        topic,
        style,
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
