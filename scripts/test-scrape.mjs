// Smoke test: hit TradeMe's Apple computer categories and print what we got.
// Usage: node scripts/test-scrape.mjs
//
// Exits with a non-zero code if nothing was scraped, if any URL is outside
// the expected computer categories, or if any title looks like a non-Mac
// listing (cars, bikes, etc.).

import { scrapeListings } from "../scraper/trademe-client.js";
import { extractListing } from "../scraper/extract.js";

const MAX = 20;

const BAD_URL_PATTERNS = [
  /\/motors\//i,
  /\/trade-me-motors\//i,
  /\/property\//i,
  /\/jobs\//i,
];

const BAD_TITLE_PATTERNS = [
  /\bnissan\b/i,
  /\btoyota\b/i,
  /\bford\b/i,
  /\bhonda\b/i,
  /\bmazda\b/i,
  /\bsubaru\b/i,
  /\bbmw\b/i,
  /\bharley\b/i,
];

const start = Date.now();
console.log(`[test] Scraping up to ${MAX} listings (detail pages disabled)...`);

let listings;
try {
  listings = await scrapeListings({ maxListings: MAX, visitDetailPages: false });
} catch (err) {
  console.error("[test] FAIL: scraper threw:", err);
  process.exit(1);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n=== Got ${listings.length} listings in ${elapsed}s ===\n`);

if (listings.length === 0) {
  console.error("[test] FAIL: zero listings returned. Selectors likely broke.");
  process.exit(1);
}

let bad = 0;
for (const l of listings) {
  const id = l.ListingId;
  const title = (l.Title || "").substring(0, 70);
  const url = (l._url || "").substring(0, 100);

  const badUrl = BAD_URL_PATTERNS.find((p) => p.test(l._url || ""));
  const badTitle = BAD_TITLE_PATTERNS.find((p) => p.test(l.Title || ""));
  const flag = badUrl ? " ❌ WRONG-CATEGORY-URL" : badTitle ? " ❌ NON-MAC-TITLE" : "";
  if (badUrl || badTitle) bad++;

  console.log(`${id} | ${title}`);
  console.log(`    URL: ${url}${flag}`);
}

console.log();
if (bad > 0) {
  console.error(`[test] FAIL: ${bad}/${listings.length} listings are not Apple computers.`);
  process.exit(1);
}

const withPrice = listings.filter((l) => l.StartPrice || l.BuyNowPrice).length;
console.log(`[test] Raw scraper: ${listings.length} Apple listings, ${withPrice} with prices.`);

// Now run through extract/filter to show what would actually reach the site
console.log(`\n=== After extract filter (chip + Mac model required, accessories excluded) ===\n`);
const extracted = listings
  .map((raw) => extractListing(raw, new Date().toISOString()))
  .filter(Boolean);

if (extracted.length === 0) {
  console.log("(nothing survived — all were Intel, accessories, or missed tokens)");
} else {
  for (const l of extracted) {
    console.log(
      `${l.id} | ${l.chip || "?"} | ${l.model || "?"} | ${l.ram_gb ? l.ram_gb + "GB" : "?GB"} | $${l.price_nzd}`
    );
    console.log(`    ${l.title.substring(0, 80)}`);
  }
}
console.log(`\n[test] PASS: ${listings.length} raw → ${extracted.length} post-filter Apple Silicon Macs.`);
