import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/image-generator";

const {
  preparePromptsActivity,
  generateImageWithApiActivity,
  uploadToStorageActivity,
  updatePostDatabaseActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    maximumAttempts: 5,
    backoffCoefficient: 2,
  },
});

export interface ImageGenerationWorkflowParams {
  postId?: string;
  topic: string;
  style?: activities.PreparePromptsInput["style"];
  platform?: activities.PreparePromptsInput["platform"];
  carouselSlideCount?: number;
  customOptions?: activities.PreparePromptsInput["customOptions"];
}

export interface ImageGenerationWorkflowOutput {
  status: "COMPLETED" | "FAILED";
  postId?: string;
  topic: string;
  totalSlides: number;
  assets: activities.ImageGenerationResultAsset[];
}

/**
 * Temporal Workflow: Orchestrates parallel image generation for social media posts & carousels.
 */
export async function imageGenerationWorkflow(
  params: ImageGenerationWorkflowParams
): Promise<ImageGenerationWorkflowOutput> {
  const {
    postId,
    topic,
    style = "3d-render",
    platform = "INSTAGRAM",
    carouselSlideCount = 1,
    customOptions,
  } = params;

  // 1. Prepare visual prompts for each slide
  const promptAssets = await preparePromptsActivity({
    topic,
    style,
    platform,
    carouselSlideCount,
    customOptions,
  });

  // 2. Generate images for all slides in parallel with Temporal resilience
  const imagePromises = promptAssets.map(async (asset) => {
    // Generate image via API
    const rawResult = await generateImageWithApiActivity(asset);
    
    // Upload raw asset to permanent storage (S3 / Cloudinary)
    const storageResult = await uploadToStorageActivity(
      rawResult.slideIndex,
      rawResult.rawImageUrl
    );

    return {
      slideIndex: asset.slideIndex,
      imageUrl: storageResult.permanentUrl,
      aspectRatio: asset.aspectRatio,
      prompt: asset.prompt,
    };
  });

  const finalAssets = await Promise.all(imagePromises);

  // Sort assets by slideIndex
  finalAssets.sort((a, b) => a.slideIndex - b.slideIndex);

  // 3. Update database record if postId was provided
  if (postId) {
    await updatePostDatabaseActivity(postId, finalAssets);
  }

  return {
    status: "COMPLETED",
    postId,
    topic,
    totalSlides: finalAssets.length,
    assets: finalAssets,
  };
}
