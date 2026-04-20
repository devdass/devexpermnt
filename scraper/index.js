import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "./trademe-client.js";
import { extractListing } from "./extract.js";
import { scoreListing, rankListings } from "./score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
const HISTORY_DIR = resolve(DATA_DIR, "history");

const RAM_BUCKETS = [8, 16, 32, 64, 96, 128, 192];

function ramBucket(gb) {
  let best = RAM_BUCKETS[0];
  for (const b of RAM_BUCKETS) {
    if (gb >= b) best = b;
  }
  return best;
}

function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeStats(scoredListings) {
  const groups = {};
  for (const l of scoredListings) {
    if (l.chip === null || l.ram_gb === null) continue;
    const key = `${l.chip}__${ramBucket(l.ram_gb)}`;
    if (!groups[key]) groups[key] = { chip: l.chip, ram_bucket: ramBucket(l.ram_gb), prices: [], ids: [] };
    groups[key].prices.push(l.price_nzd);
    groups[key].ids.push(l.id);
  }

  const stats = {};
  for (const [key, g] of Object.entries(groups)) {
    stats[key] = {
      chip: g.chip,
      ram_bucket: g.ram_bucket,
      median_price: median(g.prices),
      count: g.prices.length,
      sample_listing_ids: g.ids.slice(0, 5),
    };
  }
  return stats;
}

function sortedKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[index] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const consumerKey    = requireEnv("TRADEME_CONSUMER_KEY");
  const consumerSecret = requireEnv("TRADEME_CONSUMER_SECRET");
  const token          = requireEnv("TRADEME_OAUTH_TOKEN");
  const tokenSecret    = requireEnv("TRADEME_OAUTH_SECRET");

  const client = createClient({ consumerKey, consumerSecret, token, tokenSecret });
  const scrapedAt = new Date().toISOString();

  console.log(`[index] Starting scrape at ${scrapedAt}`);
  const rawListings = await client.fetchAllListings();
  console.log(`[index] Fetched ${rawListings.length} raw listings`);

  const normalized = rawListings
    .map((r) => extractListing(r, scrapedAt))
    .filter(Boolean);
  console.log(`[index] ${normalized.length} listings passed keyword/extract filter`);

  const scored = normalized.map(scoreListing);
  const ranked = rankListings(scored);
  console.log(`[index] ${ranked.length} listings scored and ranked`);

  const stats = computeStats(scored);

  const listingsWithMeta = { scraped_at: scrapedAt, count: ranked.length, listings: ranked };

  mkdirSync(HISTORY_DIR, { recursive: true });

  const dateStamp = scrapedAt.slice(0, 10);
  writeFileSync(resolve(DATA_DIR, "listings.json"), JSON.stringify(sortedKeys(listingsWithMeta), null, 2));
  writeFileSync(resolve(HISTORY_DIR, `${dateStamp}.json`), JSON.stringify(sortedKeys(listingsWithMeta), null, 2));
  writeFileSync(resolve(DATA_DIR, "stats.json"), JSON.stringify(stats, null, 2));

  console.log(`[index] Written data/listings.json, data/history/${dateStamp}.json, data/stats.json`);
}

main().catch((err) => {
  console.error("[index] Fatal error:", err);
  process.exit(1);
});
