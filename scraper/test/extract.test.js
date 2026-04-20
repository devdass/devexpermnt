import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractListing } from "../extract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "../fixtures");

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));
}

// ── Fixture contract tests ───────────────────────────────────────────────────

describe("fixture contract", () => {
  it("fixture 01 — M2 Pro Mac mini buy-now", () => {
    const raw = loadFixture("api-response-01-m2pro-macmini-buynow.json");
    const expected = loadFixture("expected-01-m2pro-macmini-buynow.json");
    const scrapedAt = "2025-04-20T00:00:00.000Z";
    const result = extractListing(raw, scrapedAt);
    // Replace __SCRAPED_AT__ placeholder in expected
    const exp = { ...expected, scraped_at: scrapedAt };
    assert.deepEqual(result, exp);
  });

  it("fixture 02 — M1 MacBook Air auction (RAM in body)", () => {
    const raw = loadFixture("api-response-02-m1-macbookair-auction.json");
    const expected = loadFixture("expected-02-m1-macbookair-auction.json");
    const scrapedAt = "2025-04-20T00:00:00.000Z";
    const result = extractListing(raw, scrapedAt);
    const exp = { ...expected, scraped_at: scrapedAt };
    assert.deepEqual(result, exp);
  });

  it("fixture 03 — iPad M1 excluded → null", () => {
    const raw = loadFixture("api-response-03-ipad-m1-excluded.json");
    const result = extractListing(raw, "2025-04-20T00:00:00.000Z");
    assert.equal(result, null);
  });
});

// ── Chip detection unit tests ────────────────────────────────────────────────

describe("chip detection", () => {
  function chip(title, body = "") {
    const raw = { ListingId: 1, Title: title, Body: body, StartPrice: 100, IsAuction: false, HasBuyNow: false };
    const r = extractListing(raw, "");
    return r === null ? "EXCLUDED" : r.chip;
  }

  it("bare M1", () => assert.equal(chip("MacBook Air M1 8GB"), "M1"));
  it("M1 Pro", () => assert.equal(chip("MacBook Pro M1 Pro 16GB"), "M1 Pro"));
  it("M1 Max", () => assert.equal(chip("MacBook Pro M1 Max 32GB"), "M1 Max"));
  it("M1 Ultra", () => assert.equal(chip("Mac Studio M1 Ultra 64GB"), "M1 Ultra"));
  it("bare M2", () => assert.equal(chip("MacBook Air M2 8GB"), "M2"));
  it("M2 Pro", () => assert.equal(chip("Mac mini M2 Pro 16GB"), "M2 Pro"));
  it("M2 Max", () => assert.equal(chip("MacBook Pro M2 Max 32GB"), "M2 Max"));
  it("M2 Ultra", () => assert.equal(chip("Mac Studio M2 Ultra 192GB"), "M2 Ultra"));
  it("M3 Pro", () => assert.equal(chip("MacBook Pro M3 Pro 18GB"), "M3 Pro"));
  it("M4 Pro", () => assert.equal(chip("Mac mini M4 Pro 24GB"), "M4 Pro"));
  it("HDMI in title does not match M1", () => {
    // no real M1 token — should be excluded by keyword filter
    assert.equal(chip("MacBook HDMI cable"), "EXCLUDED");
  });
  it("M2 not confused with M2 Pro when Pro also present", () => {
    assert.equal(chip("Mac mini M2 Pro 16GB RAM 512GB SSD"), "M2 Pro");
  });
});

// ── Model detection unit tests ───────────────────────────────────────────────

describe("model detection", () => {
  function model(title) {
    const raw = { ListingId: 1, Title: title, Body: "", StartPrice: 100, IsAuction: false, HasBuyNow: false };
    const r = extractListing(raw, "");
    return r === null ? "EXCLUDED" : r.model;
  }

  it("MacBook Air", () => assert.equal(model("MacBook Air M2 8GB"), "MacBook Air"));
  it("MacBook Pro", () => assert.equal(model("MacBook Pro M3 Pro 18GB"), "MacBook Pro"));
  it("Mac mini", () => assert.equal(model("Mac mini M2 Pro"), "Mac mini"));
  it("Mac Studio", () => assert.equal(model("Mac Studio M1 Ultra"), "Mac Studio"));
  it("iMac", () => assert.equal(model("iMac 24 M3 8GB"), "iMac"));
  it("Mac Pro", () => assert.equal(model("Mac Pro M2 Ultra 192GB"), "Mac Pro"));
});

// ── RAM extraction unit tests ────────────────────────────────────────────────

describe("ram_gb extraction", () => {
  function ram(title, body = "") {
    const raw = { ListingId: 1, Title: title, Body: body, StartPrice: 100, IsAuction: false, HasBuyNow: false };
    const r = extractListing(raw, "");
    return r === null ? "EXCLUDED" : r.ram_gb;
  }

  it("GB RAM in title", () => assert.equal(ram("MacBook Air M2 8GB RAM"), 8));
  it("GB Memory in title", () => assert.equal(ram("MacBook Pro M1 Pro 16GB Memory 512GB SSD"), 16));
  it("Unified in body", () => assert.equal(ram("MacBook Air M1", "8GB unified memory, 256GB SSD"), 8));
  it("RAM only in body", () => assert.equal(ram("MacBook Air M1 Space Grey", "Has 8GB RAM and 256GB storage"), 8));
  it("no memory keyword → null", () => assert.equal(ram("MacBook Air M2 8GB 256GB"), null));
  it("32GB RAM", () => assert.equal(ram("MacBook Pro M1 Max 32GB RAM"), 32));
  it("96GB Unified Memory", () => assert.equal(ram("Mac Studio M2 Ultra 96GB Unified Memory"), 96));
});

// ── Storage extraction unit tests ────────────────────────────────────────────

describe("storage_gb extraction", () => {
  function storage(title, body = "") {
    const raw = { ListingId: 1, Title: title, Body: body, StartPrice: 100, IsAuction: false, HasBuyNow: false };
    const r = extractListing(raw, "");
    return r === null ? "EXCLUDED" : r.storage_gb;
  }

  it("512GB SSD in title", () => assert.equal(storage("MacBook Air M2 8GB RAM 512GB SSD"), 512));
  it("1TB SSD converts to GB", () => assert.equal(storage("MacBook Pro M1 Pro 16GB RAM 1TB SSD"), 1024));
  it("2TB SSD", () => assert.equal(storage("Mac Studio M2 Ultra 64GB RAM 2TB SSD"), 2048));
  it("256GB SSD in body", () => assert.equal(storage("MacBook Air M1 8GB RAM", "256GB SSD, great condition"), 256));
  it("no storage keyword → null", () => assert.equal(storage("MacBook Air M2 8GB RAM 256GB"), null));
  it("Storage keyword", () => assert.equal(storage("MacBook Air M2 8GB RAM 512GB Storage"), 512));
});
