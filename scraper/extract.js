import { shouldInclude } from "./keywords.js";

// Parse /Date(ms)/ or ISO string → ISO8601 string or null
function parseDate(val) {
  if (!val) return null;
  const msMatch = String(val).match(/\/Date\((\d+)\)\//);
  if (msMatch) return new Date(parseInt(msMatch[1], 10)).toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Chip detection — most-specific variant first
const CHIP_PATTERNS = [
  { re: /\bM1\s+Ultra\b/i, chip: "M1 Ultra" },
  { re: /\bM1\s+Max\b/i,   chip: "M1 Max"   },
  { re: /\bM1\s+Pro\b/i,   chip: "M1 Pro"   },
  { re: /\bM2\s+Ultra\b/i, chip: "M2 Ultra" },
  { re: /\bM2\s+Max\b/i,   chip: "M2 Max"   },
  { re: /\bM2\s+Pro\b/i,   chip: "M2 Pro"   },
  { re: /\bM3\s+Max\b/i,   chip: "M3 Max"   },
  { re: /\bM3\s+Pro\b/i,   chip: "M3 Pro"   },
  { re: /\bM4\s+Max\b/i,   chip: "M4 Max"   },
  { re: /\bM4\s+Pro\b/i,   chip: "M4 Pro"   },
  // Bare chip — only after variants exhausted
  { re: /(?<![A-Za-z0-9])M1(?![A-Za-z0-9])/i, chip: "M1" },
  { re: /(?<![A-Za-z0-9])M2(?![A-Za-z0-9])/i, chip: "M2" },
  { re: /(?<![A-Za-z0-9])M3(?![A-Za-z0-9])/i, chip: "M3" },
  { re: /(?<![A-Za-z0-9])M4(?![A-Za-z0-9])/i, chip: "M4" },
];

const MODEL_PATTERNS = [
  { re: /\bMacBook\s+Air\b/i,  model: "MacBook Air"  },
  { re: /\bMacBook\s+Pro\b/i,  model: "MacBook Pro"  },
  { re: /\bMac\s+mini\b/i,     model: "Mac mini"     },
  { re: /\bMac\s+Studio\b/i,   model: "Mac Studio"   },
  { re: /\bMac\s+Pro\b/i,      model: "Mac Pro"      },
  { re: /\biMac\b/i,           model: "iMac"          },
];

// Find RAM by looking for GB directly adjacent to a memory keyword.
// Pattern 1: <N>GB <keyword>  e.g. "16GB RAM", "8GB Unified"
// Pattern 2: <keyword> <N>GB  e.g. "Memory: 16GB"
function extractRamGb(text) {
  // GB immediately before a memory keyword (most common: "16GB RAM", "8GB Unified Memory")
  const beforeKw = /(\d+)\s*GB\s+(?:RAM|Unified|Memory)/gi;
  // GB immediately after a memory keyword ("Memory: 16GB", "RAM 16GB")
  const afterKw = /(?:RAM|Unified\s+Memory|Memory)\s*:?\s*(\d+)\s*GB/gi;

  let m;
  if ((m = beforeKw.exec(text)) !== null) return parseInt(m[1], 10);
  if ((m = afterKw.exec(text)) !== null) return parseInt(m[1], 10);
  return null;
}

// Storage: look for GB/TB near SSD/Storage/HDD keywords, or standalone large GB values.
function extractStorageGb(text) {
  const storageKw = /\b(SSD|HDD|Storage|Flash|Fusion)\b/gi;
  const gbToken = /(\d+)\s*GB/gi;
  const tbToken = /(\d+(?:\.\d+)?)\s*TB/gi;

  const kwPositions = [];
  let m;
  while ((m = storageKw.exec(text)) !== null) {
    kwPositions.push(m.index);
  }

  const candidates = [];
  while ((m = gbToken.exec(text)) !== null) {
    candidates.push({ val: parseInt(m[1], 10), idx: m.index, unit: "GB" });
  }
  while ((m = tbToken.exec(text)) !== null) {
    candidates.push({ val: Math.round(parseFloat(m[1]) * 1024), idx: m.index, unit: "TB" });
  }

  if (candidates.length === 0) return null;
  if (kwPositions.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    for (const kw of kwPositions) {
      const dist = Math.abs(c.idx - kw);
      if (dist < bestDist) {
        bestDist = dist;
        best = c.val;
      }
    }
  }
  return best;
}

function detectChip(text) {
  for (const { re, chip } of CHIP_PATTERNS) {
    if (re.test(text)) return chip;
  }
  return null;
}

function detectModel(text) {
  for (const { re, model } of MODEL_PATTERNS) {
    if (re.test(text)) return model;
  }
  return null;
}

export function extractListing(raw, scrapedAt) {
  const title = raw.Title || "";
  const body = raw.Body || raw.Description || "";

  if (!shouldInclude(title, body)) return null;

  const combined = `${title} ${body}`;
  const id = String(raw.ListingId);
  const price = raw.BuyNowPrice || raw.StartPrice || 0;
  const isAuction = Boolean(raw.IsAuction);
  const hasBuyNow = Boolean(raw.HasBuyNow || raw.IsBuyNow || raw.BuyNowPrice);
  // ends_at is only meaningful for auctions; fixed-price listings have placeholder far-future dates
  const endsAt = isAuction ? parseDate(raw.EndDate) : null;
  const sellerRaw = (raw.SellerType || (raw.MemberProfile?.IsDealer ? "dealer" : null) || "").toLowerCase();
  const sellerType = sellerRaw === "dealer" ? "dealer" : sellerRaw === "private" ? "private" : null;

  return {
    id,
    url: `https://www.trademe.co.nz/a/marketplace/computers/apple/listing/${id}`,
    title,
    chip: detectChip(combined),
    model: detectModel(combined),
    ram_gb: extractRamGb(combined),
    storage_gb: extractStorageGb(combined),
    price_nzd: price,
    is_auction: isAuction,
    buy_now_available: hasBuyNow,
    ends_at: endsAt,
    location: raw.Region || null,
    seller_type: sellerType,
    scraped_at: scrapedAt,
  };
}
