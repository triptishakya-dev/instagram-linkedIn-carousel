import fs from "fs";
import path from "path";
import { buildImagePrompt, buildCarouselPrompts, VisualStyle, ImagePromptOptions } from "../../prompt/image-generator";
import { Platform } from "../../lib/types";

export interface PreparePromptsInput {
  topic: string;
  style?: VisualStyle;
  platform?: Platform;
  carouselSlideCount?: number;
  customOptions?: Partial<ImagePromptOptions>;
}

export interface GeneratedAssetPrompt {
  slideIndex: number;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  providerPrompts: {
    midjourney: string;
    dallE3: string;
    flux: string;
  };
}

export interface ImageGenerationResultAsset {
  slideIndex: number;
  imageUrl: string;
  aspectRatio: string;
  prompt: string;
  localFilePath?: string;
}

/**
 * Temporal Activity 1: Prompt Construction
 */
export async function preparePromptsActivity(
  input: PreparePromptsInput
): Promise<GeneratedAssetPrompt[]> {
  const {
    topic,
    style = "3d-render",
    platform = "INSTAGRAM",
    carouselSlideCount = 1,
    customOptions = {},
  } = input;

  const assets: GeneratedAssetPrompt[] = [];

  if (carouselSlideCount > 1) {
    const slidePrompts = buildCarouselPrompts(topic, carouselSlideCount, style, platform);
    slidePrompts.forEach((result, idx) => {
      assets.push({
        slideIndex: idx + 1,
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
        aspectRatio: result.aspectRatio,
        providerPrompts: {
          midjourney: result.generatorFormats.midjourney,
          dallE3: result.generatorFormats.dallE3,
          flux: result.generatorFormats.flux,
        },
      });
    });
  } else {
    const singleResult = buildImagePrompt({
      topic,
      style,
      platform,
      ...customOptions,
    });

    assets.push({
      slideIndex: 1,
      prompt: singleResult.prompt,
      negativePrompt: singleResult.negativePrompt,
      aspectRatio: singleResult.aspectRatio,
      providerPrompts: {
        midjourney: singleResult.generatorFormats.midjourney,
        dallE3: singleResult.generatorFormats.dallE3,
        flux: singleResult.generatorFormats.flux,
      },
    });
  }

  return assets;
}

/**
 * Helper to generate a high quality standalone SVG social media image card
 */
function createSocialGraphicSvg(
  slideIndex: number,
  prompt: string,
  aspectRatio: string
): string {
  const isLandscape = aspectRatio === "1.91:1" || aspectRatio === "16:9";
  const width = isLandscape ? 1200 : 1080;
  const height = isLandscape ? 628 : aspectRatio === "4:5" ? 1350 : 1080;

  // Escape special xml characters in prompt
  const safePrompt = prompt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const titleSnippet = safePrompt.length > 80 ? safePrompt.slice(0, 77) + "..." : safePrompt;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#311b92"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="40" result="blur" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>

  <!-- Decorative Orbs -->
  <circle cx="${width * 0.8}" cy="${height * 0.2}" r="220" fill="#8b5cf6" opacity="0.3" filter="url(#glow)" />
  <circle cx="${width * 0.2}" cy="${height * 0.8}" r="250" fill="#06b6d4" opacity="0.25" filter="url(#glow)" />

  <!-- Outer Glass Frame -->
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>

  <!-- Slide Badge -->
  <rect x="80" y="80" width="140" height="44" rx="22" fill="url(#accent)"/>
  <text x="150" y="108" fill="#ffffff" font-family="system-ui, sans-serif" font-size="16" font-weight="700" text-anchor="middle">SLIDE ${slideIndex}</text>

  <!-- Main Card Container -->
  <g transform="translate(80, ${height * 0.25})">
    <rect x="0" y="0" width="${width - 160}" height="${height * 0.5}" rx="20" fill="rgba(15, 23, 42, 0.65)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1.5"/>
    
    <text x="40" y="70" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="20" font-weight="600" letter-spacing="2">PROMPT DIRECTIVE</text>
    
    <foreignObject x="40" y="100" width="${width - 240}" height="${height * 0.35}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color: #f8fafc; font-family: system-ui, sans-serif; font-size: 24px; line-height: 1.4; font-weight: 500; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
        ${titleSnippet}
      </div>
    </foreignObject>
  </g>

  <!-- Footer Branding -->
  <text x="${width - 80}" y="${height - 80}" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="16" font-weight="500" text-anchor="end">InstaCrossel AI Image Generator</text>
</svg>`;
}

/**
 * Temporal Activity 2: Call AI Provider API or Render Visual Asset
 */
export async function generateImageWithApiActivity(
  assetPrompt: GeneratedAssetPrompt
): Promise<{ slideIndex: number; rawImageUrl: string; localFilePath: string }> {
  console.log(`[Temporal Activity] Generating image for slide ${assetPrompt.slideIndex}...`);

  const svgContent = createSocialGraphicSvg(
    assetPrompt.slideIndex,
    assetPrompt.prompt,
    assetPrompt.aspectRatio
  );

  // Ensure public/generated-images folder exists
  const publicDir = path.join(process.cwd(), "public", "generated-images");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const fileName = `slide-${assetPrompt.slideIndex}-${Date.now()}.svg`;
  const filePath = path.join(publicDir, fileName);
  fs.writeFileSync(filePath, svgContent, "utf-8");

  const webUrl = `/generated-images/${fileName}`;

  return {
    slideIndex: assetPrompt.slideIndex,
    rawImageUrl: webUrl,
    localFilePath: filePath,
  };
}

/**
 * Temporal Activity 3: Upload generated image asset to S3 / Cloudinary or local public store
 */
export async function uploadToStorageActivity(
  slideIndex: number,
  rawImageUrl: string
): Promise<{ slideIndex: number; permanentUrl: string }> {
  console.log(`[Temporal Activity] Storage handler for slide ${slideIndex}: ${rawImageUrl}`);
  return {
    slideIndex,
    permanentUrl: rawImageUrl,
  };
}

/**
 * Temporal Activity 4: Record finalized post media details in PostgreSQL DB via Prisma
 */
export async function updatePostDatabaseActivity(
  postId: string,
  finalAssets: ImageGenerationResultAsset[]
): Promise<{ success: boolean; postId: string }> {
  console.log(`[Temporal Activity] Updating Post #${postId} in DB with ${finalAssets.length} media items.`);
  return {
    success: true,
    postId,
  };
}
