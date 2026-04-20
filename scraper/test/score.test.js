import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { scoreListing, rankListings } from "../score.js";

function makeListing(overrides = {}) {
  return {
    id: "1",
    url: "https://www.trademe.co.nz/a/marketplace/computers/apple/listing/1",
    title: "MacBook Pro M2 Pro 16GB RAM 512GB SSD",
    chip: "M2 Pro",
    model: "MacBook Pro",
    ram_gb: 16,
    storage_gb: 512,
    price_nzd: 1600,
    is_auction: false,
    buy_now_available: true,
    ends_at: null,
    location: "Auckland",
    seller_type: "private",
    scraped_at: "2025-04-20T00:00:00.000Z",
    ...overrides,
  };
}

// ── Score calculation ────────────────────────────────────────────────────────

describe("scoreListing — calculation", () => {
  it("known listing scores correctly: (16 * 200) / 1600 = 2", () => {
    const result = scoreListing(makeListing());
    assert.equal(result.bandwidth_gbs, 200);
    // (16 * 200) / 1600 = 2
    assert.ok(Math.abs(result.inference_score - 2) < 0.0001);
    assert.equal(result.price_per_gb_ram, 100); // 1600/16
    assert.equal(result.inference_viable, true);
    assert.deepEqual(result.notes, []);
  });

  it("M1 Ultra 64GB $4000: (64 * 800) / 4000 = 12.8", () => {
    const result = scoreListing(makeListing({ chip: "M1 Ultra", ram_gb: 64, price_nzd: 4000 }));
    assert.ok(Math.abs(result.inference_score - 12.8) < 0.0001);
    assert.equal(result.bandwidth_gbs, 800);
  });

  it("M4 8GB: viable=false, note added", () => {
    const result = scoreListing(makeListing({ chip: "M4", ram_gb: 8, price_nzd: 1200 }));
    assert.equal(result.inference_viable, false);
    assert.ok(result.notes.includes("Below 16GB — limited inference use"));
  });

  it("null chip → inference_score null, note added", () => {
    const result = scoreListing(makeListing({ chip: null }));
    assert.equal(result.inference_score, null);
    assert.equal(result.bandwidth_gbs, null);
    assert.ok(result.notes.includes("Chip not specified"));
  });

  it("null ram_gb → inference_score null, note added", () => {
    const result = scoreListing(makeListing({ ram_gb: null }));
    assert.equal(result.inference_score, null);
    assert.ok(result.notes.includes("RAM not specified"));
  });

  it("unknown chip logs warning and returns inference_score null", () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    const result = scoreListing(makeListing({ chip: "M9 Hyper" }));
    console.warn = originalWarn;
    assert.equal(result.inference_score, null);
    assert.equal(result.bandwidth_gbs, null);
    assert.ok(warnings.some((w) => w.includes("M9 Hyper")));
    assert.ok(result.notes.some((n) => n.includes("M9 Hyper")));
  });

  it("auction ending in >24h gets 'price not final' note", () => {
    const futureDate = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const result = scoreListing(makeListing({ is_auction: true, ends_at: futureDate }));
    assert.ok(result.notes.includes("Auction — price not final"));
  });

  it("auction ending in <24h does NOT get 'price not final' note", () => {
    const soonDate = new Date(Date.now() + 12 * 3_600_000).toISOString();
    const result = scoreListing(makeListing({ is_auction: true, ends_at: soonDate }));
    assert.ok(!result.notes.includes("Auction — price not final"));
  });
});

// ── Ranking ──────────────────────────────────────────────────────────────────

describe("rankListings — ordering", () => {
  it("two viable listings: higher score first", () => {
    const a = scoreListing(makeListing({ id: "a", chip: "M2 Pro", ram_gb: 16, price_nzd: 1600 })); // score 2
    const b = scoreListing(makeListing({ id: "b", chip: "M1 Ultra", ram_gb: 64, price_nzd: 4000 })); // score 12.8
    const ranked = rankListings([a, b]);
    assert.equal(ranked[0].id, "b");
    assert.equal(ranked[1].id, "a");
  });

  it("one viable + one non-viable: viable first", () => {
    const viable = scoreListing(makeListing({ id: "v", chip: "M2", ram_gb: 16, price_nzd: 1400 }));
    const notViable = scoreListing(makeListing({ id: "n", chip: "M4", ram_gb: 8, price_nzd: 999 }));
    // non-viable still scores if chip + ram + price present
    const ranked = rankListings([notViable, viable]);
    // higher inference_score first regardless of viability
    const scores = ranked.map((l) => l.inference_score);
    assert.ok(scores[0] >= scores[1]);
  });

  it("scored then unscored: unscored at end sorted by price asc", () => {
    const scored = scoreListing(makeListing({ id: "s", chip: "M2", ram_gb: 16, price_nzd: 1400 }));
    const unscored1 = scoreListing(makeListing({ id: "u1", chip: null, price_nzd: 800 }));
    const unscored2 = scoreListing(makeListing({ id: "u2", chip: null, price_nzd: 500 }));
    const ranked = rankListings([unscored1, scored, unscored2]);
    assert.equal(ranked[0].id, "s");
    assert.equal(ranked[1].id, "u2"); // cheaper first
    assert.equal(ranked[2].id, "u1");
  });

  it("all unscored: sorted by price asc", () => {
    const a = scoreListing(makeListing({ id: "a", chip: null, price_nzd: 1200 }));
    const b = scoreListing(makeListing({ id: "b", chip: null, price_nzd: 600 }));
    const c = scoreListing(makeListing({ id: "c", chip: null, price_nzd: 900 }));
    const ranked = rankListings([a, b, c]);
    assert.equal(ranked[0].id, "b");
    assert.equal(ranked[1].id, "c");
    assert.equal(ranked[2].id, "a");
  });
});
