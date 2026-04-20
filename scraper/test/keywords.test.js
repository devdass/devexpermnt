import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldInclude } from "../keywords.js";

describe("shouldInclude — positive cases", () => {
  it("M2 Pro Mac mini passes", () => {
    assert.equal(shouldInclude("Apple Mac mini M2 Pro 16GB RAM 512GB SSD", ""), true);
  });
  it("M1 MacBook Air passes with chip in body", () => {
    assert.equal(shouldInclude("MacBook Air Space Grey", "M1 chip 8GB unified memory"), true);
  });
  it("M3 MacBook Pro passes", () => {
    assert.equal(shouldInclude("MacBook Pro M3 Max 36GB 1TB", ""), true);
  });
  it("M4 Mac Studio passes", () => {
    assert.equal(shouldInclude("Mac Studio M4 Pro 48GB", ""), true);
  });
  it("iMac M1 passes", () => {
    assert.equal(shouldInclude("iMac 24\" M1 8GB 256GB Blue", ""), true);
  });
});

describe("shouldInclude — negative / exclude cases", () => {
  it("iPad M1 excluded", () => {
    assert.equal(shouldInclude("Apple iPad Pro M1 11-inch 256GB", ""), false);
  });
  it("iPhone excluded", () => {
    assert.equal(shouldInclude("iPhone 13 Pro 256GB", ""), false);
  });
  it("charger excluded", () => {
    assert.equal(shouldInclude("MacBook charger USB-C 96W", "fits M1 MacBook Pro"), false);
  });
  it("broken Mac excluded", () => {
    assert.equal(shouldInclude("MacBook Pro M1 broken — for parts", ""), false);
  });
  it("Intel Mac with year <= 2020 excluded", () => {
    assert.equal(shouldInclude("MacBook Pro 2019 Space Grey 16GB", "Intel Core i7"), false);
  });
  it("Intel Mac 2020 without chip token excluded", () => {
    assert.equal(shouldInclude("MacBook Air 2020 Gold 8GB", "Intel Core i5"), false);
  });
  it("no model token excluded", () => {
    assert.equal(shouldInclude("M2 chip upgrade kit", ""), false);
  });
  it("no chip token excluded", () => {
    assert.equal(shouldInclude("MacBook Pro 2022 Space Grey", ""), false);
  });
});

describe("shouldInclude — tricky edge cases", () => {
  it("HDMI does not trigger M1 match (no Mac model)", () => {
    assert.equal(shouldInclude("HDMI 4K cable 2m", ""), false);
  });
  it("HDMI with Mac model — M1 not falsely detected in HDMI", () => {
    // Title has MacBook Pro and HDMI but no real M1 token
    assert.equal(shouldInclude("MacBook Pro HDMI adapter 2022", ""), false);
  });
  it("M1 MacBook with year 2020 in title still passes (chip token present)", () => {
    // Edge: 2020 + chip token → should still pass
    assert.equal(shouldInclude("MacBook Air M1 2020 Silver 8GB", ""), true);
  });
  it("Mac Pro M2 Ultra passes", () => {
    assert.equal(shouldInclude("Mac Pro M2 Ultra 192GB 8TB", ""), true);
  });
  it("AirPods excluded even with Mac in title", () => {
    assert.equal(shouldInclude("AirPods Pro + MacBook Air M2", "bundle deal"), false);
  });
});
