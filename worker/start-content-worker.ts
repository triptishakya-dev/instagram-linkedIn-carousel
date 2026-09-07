import { runContentWorker } from "./content-worker";

async function main() {
  try {
    await runContentWorker();
  } catch (err) {
    console.error("[content-worker] failed to start:", err);
    process.exit(1);
  }
}

void main();
