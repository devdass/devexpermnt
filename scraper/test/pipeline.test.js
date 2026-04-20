import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractListing } from "../extract.js";
import { scoreListing, rankListings } from "../score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawFive = JSON.parse(
  readFileSync(resolve(__dirname, "../fixtures/api-pipeline-5listings.json"), "utf8")
);

describe("full pipeline integration", () => {
  it("filters, extracts, scores, and ranks 5 raw listings correctly", () => {
    const scrapedAt = "2025-04-20T00:00:00.000Z";
    const normalized = rawFive.map((r) => extractListing(r, scrapedAt)).filter(Boolean);

    // iPad (200000004) should be excluded
    assert.equal(normalized.length, 4, "4 listings pass keyword filter (iPad excluded)");
    assert.ok(!normalized.find((l) => l.id === "200000004"), "iPad excluded");

    const scored = normalized.map(scoreListing);
    const ranked = rankListings(scored);
    assert.equal(ranked.length, 4);

    // All scored (chip + ram_gb + price all present)
    assert.ok(ranked.every((l) => l.inference_score !== null), "all 4 should be scored");

    // M1 Ultra 64GB/$4500 score = (64*800)/4500 ≈ 11.38  → rank 1
    // M1 Max 32GB/$2800 score  = (32*400)/2800 ≈ 4.57   → rank 2
    // M2 Pro 16GB/$1299 score  = (16*200)/1299 ≈ 2.46   → rank 3
    // M2 8GB/$899 score        = (8*100)/899  ≈ 0.89   → rank 4
    assert.equal(ranked[0].id, "200000005", "M1 Ultra should rank first");
    assert.equal(ranked[1].id, "200000002", "M1 Max should rank second");
    assert.equal(ranked[2].id, "200000001", "M2 Pro should rank third");
    assert.equal(ranked[3].id, "200000003", "M2 MacBook Air should rank last");

    const macbookAir = ranked.find((l) => l.id === "200000003");
    assert.ok(macbookAir.notes.includes("Below 16GB — limited inference use"));
    assert.equal(macbookAir.inference_viable, false);

    const macStudio = ranked.find((l) => l.id === "200000005");
    assert.equal(macStudio.seller_type, "dealer");
  });
});
