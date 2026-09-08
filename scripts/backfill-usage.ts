/**
 * Reconstructs ledger events for posts generated before the ledger existed.
 *
 * Those posts carry three denormalised columns -- `inputTokens`,
 * `outputTokens`, `estimatedCostInr` -- written once at the end of a run. That
 * is enough to reconstruct the caption call and nothing else, so that is all
 * this creates.
 *
 * Two rules, both deliberate:
 *
 *   - Every row is marked `isBackfilled`, so a reconstructed figure is never
 *     mistaken for one observed at call time.
 *   - No image events. The old pipeline never recorded an image call, and
 *     inventing one -- even with a plausible token count -- would fabricate
 *     provider usage that was never measured. Those images stay uncounted, and
 *     that gap is the honest answer.
 *
 * Cost is recomputed from the model's current rates rather than copied from
 * `estimatedCostInr`, which was written with whatever rates were configured at
 * the time and is stale wherever they have since been corrected.
 *
 * Idempotent: a synthetic `invocationId` derived from the post id means
 * re-running updates rather than duplicating.
 *
 *   npx tsx --env-file=.env scripts/backfill-usage.ts
 *   npx tsx --env-file=.env scripts/backfill-usage.ts --write
 */

import { prisma } from "@/lib/db";
import { captionCostInr } from "@/lib/usage/cost";

const WRITE = process.argv.includes("--write");
const money = (v: number | null) => (v == null ? "not priced" : "Rs " + v.toFixed(2));

async function main() {
  const posts = await prisma.post.findMany({
    where: { OR: [{ inputTokens: { not: null } }, { outputTokens: { not: null } }] },
    orderBy: { createdAt: "asc" },
  });

  const models = await prisma.aiModel.findMany({
    select: { id: true, provider: true, apiModelId: true, inputPricePerMTokInr: true, outputPricePerMTokInr: true },
  });
  const byId = new Map(models.map((m) => [m.id, m]));

  let created = 0;
  let skipped = 0;

  for (const post of posts) {
    // Derived from the post, not random: re-running must not duplicate.
    const invocationId = `backfill:caption:${post.id}`;

    const existing = await prisma.usageEvent.findFirst({
      where: { postId: post.id, kind: "CAPTION" },
      select: { id: true, invocationId: true },
    });

    if (existing && existing.invocationId !== invocationId) {
      // A real, observed event already covers this post's caption. Never
      // overwrite a measured row with a reconstructed one.
      console.log(`skip   ${post.id} — already has an observed caption event`);
      skipped += 1;
      continue;
    }

    const model = post.modelId ? byId.get(post.modelId) : undefined;
    const tokens = { inputTokens: post.inputTokens, outputTokens: post.outputTokens };
    const cost = model
      ? captionCostInr(tokens, {
          inputPricePerMTokInr: model.inputPricePerMTokInr,
          outputPricePerMTokInr: model.outputPricePerMTokInr,
        })
      : null;

    console.log(
      `${WRITE ? "write " : "would "} ${post.id}  ` +
        `${String(post.inputTokens ?? 0).padStart(5)} in / ${String(post.outputTokens ?? 0).padStart(4)} out  ` +
        `was ${money(post.estimatedCostInr)} -> ${money(cost)}`,
    );

    if (WRITE) {
      const data = {
        userId: post.userId,
        goalId: post.goalId,
        postId: post.id,
        generationRunId: post.generationRunId,
        modelId: post.modelId,
        provider: model?.provider ?? "unknown",
        apiModelId: model?.apiModelId ?? "unknown",
        kind: "CAPTION" as const,
        inputTokens: post.inputTokens,
        outputTokens: post.outputTokens,
        costInr: cost,
        status: "OK" as const,
        isBackfilled: true,
        // Dated to when the generation actually ran, so it lands in the right
        // period rather than today's.
        createdAt: post.createdAt,
      };

      await prisma.usageEvent.upsert({
        where: { invocationId },
        create: { invocationId, ...data },
        update: data,
      });
    }
    created += 1;
  }

  console.log(`\nposts with recorded usage: ${posts.length}, backfilling: ${created}, skipped: ${skipped}`);
  console.log("Image calls are not backfilled — the old pipeline never recorded any.");
  if (!WRITE) console.log("\nDry run. Re-run with --write to persist.");

  await prisma.$disconnect();
}

main();
