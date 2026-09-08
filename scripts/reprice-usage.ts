/**
 * Recomputes `UsageEvent.costInr` from the models' current rates.
 *
 * The ledger records what a call cost using the rates configured at the moment
 * it was made, which is the right default: changing a price later does not
 * change what the provider charged. This exists for the case where the rates
 * themselves were wrong -- placeholder figures typed in to get a model working,
 * or an image model whose rates were only filled in after its first run, which
 * leaves its calls recorded as unpriced rather than as costing nothing.
 *
 * Token counts are never touched. They came from the provider and are the
 * authoritative record; only the arithmetic applied to them is redone.
 *
 * Dry run by default. Pass `--write` to persist.
 *
 *   npx tsx --env-file=.env scripts/reprice-usage.ts
 *   npx tsx --env-file=.env scripts/reprice-usage.ts --write
 */

import { prisma } from "@/lib/db";
import { captionCostInr, imageCostInr } from "@/lib/usage/cost";

const WRITE = process.argv.includes("--write");

const money = (v: number | null) => (v == null ? "not priced" : "Rs " + v.toFixed(2));

async function main() {
  const [events, models] = await Promise.all([
    prisma.usageEvent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.aiModel.findMany({
      select: {
        id: true,
        label: true,
        inputPricePerMTokInr: true,
        outputPricePerMTokInr: true,
        imagePriceInr: true,
      },
    }),
  ]);

  const byId = new Map(models.map((m) => [m.id, m]));
  const changes: { id: string; from: number | null; to: number | null; line: string }[] = [];

  for (const e of events) {
    const model = e.modelId ? byId.get(e.modelId) : undefined;

    if (!model) {
      // No row to price from -- the model was deleted. Leaving the recorded
      // cost alone is better than nulling a figure that was once correct.
      console.log(`skip  ${e.kind.padEnd(7)} ${e.apiModelId} — model row gone, keeping ${money(e.costInr)}`);
      continue;
    }

    const rates = {
      inputPricePerMTokInr: model.inputPricePerMTokInr,
      outputPricePerMTokInr: model.outputPricePerMTokInr,
    };
    const tokens = { inputTokens: e.inputTokens, outputTokens: e.outputTokens };

    const next =
      e.kind === "CAPTION"
        ? captionCostInr(tokens, rates)
        : imageCostInr(e.imageCount ?? 0, model.imagePriceInr, tokens, rates);

    const line =
      `${e.kind.padEnd(7)} ${e.apiModelId.padEnd(13)} ` +
      `${String(e.inputTokens ?? "-").padStart(5)} in / ${String(e.outputTokens ?? "-").padStart(5)} out  ` +
      `${money(e.costInr).padStart(12)} -> ${money(next)}`;

    if (next === e.costInr) {
      console.log(`same  ${line}`);
      continue;
    }

    changes.push({ id: e.id, from: e.costInr, to: next, line });
    console.log(`${WRITE ? "write" : "would"} ${line}`);
  }

  const sum = (v: (number | null)[]) => {
    const known = v.filter((x): x is number => x != null);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };

  console.log("");
  console.log(`events: ${events.length}, changing: ${changes.length}`);
  console.log(`total before: ${money(sum(events.map((e) => e.costInr)))}`);
  console.log(
    `total after:  ${money(sum(events.map((e) => changes.find((c) => c.id === e.id)?.to ?? e.costInr)))}`,
  );

  if (!WRITE) {
    console.log("\nDry run. Re-run with --write to persist.");
  } else if (changes.length) {
    // One statement per row rather than a bulk update: each row gets its own
    // recomputed figure, and there are few enough that a transaction of
    // individual updates is clearer than constructing a CASE expression.
    await prisma.$transaction(
      changes.map((c) => prisma.usageEvent.update({ where: { id: c.id }, data: { costInr: c.to } })),
    );
    console.log(`\nRepriced ${changes.length} event(s).`);
  }

  await prisma.$disconnect();
}

main();
