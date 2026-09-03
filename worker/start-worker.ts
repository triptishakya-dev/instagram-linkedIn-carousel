import { runImageGeneratorWorker } from "./image-generator";

async function main() {
  console.log("Starting Temporal Image Generation Worker...");
  try {
    await runImageGeneratorWorker();
  } catch (err) {
    console.error("Failed to run Temporal worker:", err);
    process.exit(1);
  }
}

main();
