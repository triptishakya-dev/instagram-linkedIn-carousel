import { prepareImageGenerationTask } from "../worker/image-generator";
import fs from "fs";
import path from "path";

async function runTest() {
  console.log("=== Testing Image Generation Pipeline ===");

  const testParams = {
    topic: "Mastering Next.js 16 & Server Actions",
    style: "dark-mode-ui" as const,
    platform: "INSTAGRAM" as const,
    carouselSlideCount: 3,
  };

  console.log("Running prepareImageGenerationTask with params:", testParams);

  const result = await prepareImageGenerationTask(testParams);

  console.log("\nTask Result Summary:");
  console.log(`Topic: "${result.topic}"`);
  console.log(`Platform: ${result.platform}`);
  console.log(`Total Assets Generated: ${result.assets.length}\n`);

  result.assets.forEach((asset) => {
    console.log(`--- Slide ${asset.slideIndex} ---`);
    console.log(`URL: ${asset.imageUrl}`);
    console.log(`Aspect Ratio: ${asset.aspectRatio}`);
    console.log(`Prompt: ${asset.prompt.slice(0, 80)}...`);

    // Verify file exists in public/generated-images
    const publicPath = path.join(process.cwd(), "public", asset.imageUrl.replace(/^\//, ""));
    const exists = fs.existsSync(publicPath);
    console.log(`File Saved on Disk: ${publicPath} [${exists ? "EXISTS ✅" : "MISSING ❌"}]`);
    if (exists) {
      const stats = fs.statSync(publicPath);
      console.log(`File Size: ${stats.size} bytes`);
    }
    console.log();
  });

  console.log("=== Test Complete! All images saved to public/ folder successfully ===");
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
