import { chromium } from "playwright";

const BASE_URL = "https://www.trademe.co.nz";
// Apple computers category — human should verify this path is correct
const SEARCH_URL = `${BASE_URL}/a/marketplace/computers/apple`;
const MAX_LISTINGS = 500;
const PAGE_DELAY_MS = 2000;

// Parse NZD price strings like "$1,299.00" or "Reserve not met $650.00" → number
function parsePrice(str) {
  if (!str) return null;
  const m = str.replace(/,/g, "").match(/\$(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Parse relative/absolute end-time strings TradeMe shows on cards
// e.g. "Closes in 3 days", "Closes Sun 27 Apr, 10:00am" → ISO string or null
function parseEndDate(str) {
  if (!str) return null;
  // If it contains an absolute date, try to parse it
  const absMatch = str.match(/(\w{3}\s+\d{1,2}\s+\w{3}(?:\s+\d{4})?(?:,\s*\d{1,2}:\d{2}[ap]m)?)/i);
  if (absMatch) {
    const d = new Date(absMatch[1]);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // Relative: "Closes in Xd Yh" → approximate
  const relMatch = str.match(/(\d+)\s*day/i);
  if (relMatch) {
    const d = new Date(Date.now() + parseInt(relMatch[1]) * 86_400_000);
    return d.toISOString();
  }
  const hrMatch = str.match(/(\d+)\s*hour/i);
  if (hrMatch) {
    const d = new Date(Date.now() + parseInt(hrMatch[1]) * 3_600_000);
    return d.toISOString();
  }
  return null;
}

// Scrape a single listing detail page for body text and extra fields.
async function scrapeListingDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const body = await page.evaluate(() => {
      // TradeMe description is usually in a div with id="ListingDescription" or
      // a data-testid="description" element. Try both.
      const el =
        document.querySelector('[data-testid="listing-description"]') ||
        document.querySelector("#ListingDescription") ||
        document.querySelector('[class*="description"]') ||
        document.querySelector('[class*="Description"]');
      return el ? el.innerText.trim() : "";
    });
    return body;
  } catch {
    return "";
  }
}

export async function scrapeListings({ maxListings = MAX_LISTINGS, visitDetailPages = true } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-NZ",
  });
  const page = await context.newPage();

  const allRaw = [];
  let pageNum = 1;

  try {
    while (allRaw.length < maxListings) {
      const url = pageNum === 1 ? SEARCH_URL : `${SEARCH_URL}?page=${pageNum}`;
      console.log(`[scraper] Fetching page ${pageNum}: ${url}`);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

      // Wait for listing cards to appear
      await page.waitForSelector('[data-testid="card"], [class*="listing-card"], article', {
        timeout: 15_000,
      }).catch(() => {});

      const cards = await page.evaluate(() => {
        const results = [];

        // TradeMe renders cards as <li> or <article> elements containing an <a> to the listing.
        // We anchor on links whose href contains "/listing/" to find all listing cards.
        const links = Array.from(document.querySelectorAll('a[href*="/listing/"]'));
        const seen = new Set();

        for (const link of links) {
          const href = link.href;
          const idMatch = href.match(/\/listing\/(\d+)/);
          if (!idMatch) continue;
          const id = idMatch[1];
          if (seen.has(id)) continue;
          seen.add(id);

          // Walk up to find the card container
          const card = link.closest("li, article, [class*='card'], [class*='Card']") || link.parentElement;

          const title =
            card.querySelector("h3, h2, strong, [class*='title'], [class*='Title']")?.innerText?.trim() ||
            link.innerText.trim();

          // Price: look for NZD $ amounts in the card
          const allText = card.innerText || "";
          const priceMatches = allText.match(/\$[\d,]+(?:\.\d{2})?/g) || [];

          // Detect auction vs buy-now
          const isAuction =
            /\b(bid|auction|closes|reserve)\b/i.test(allText) &&
            !/\bbuy now\b/i.test(allText.toLowerCase());
          const hasBuyNow = /\bbuy now\b/i.test(allText);

          // End time
          const closesMatch = allText.match(/closes[^\n]*/i);
          const endText = closesMatch ? closesMatch[0] : null;

          // Location — often the last short line in the card
          const locationMatch = allText.match(/\b(Auckland|Wellington|Canterbury|Otago|Waikato|Bay of Plenty|Hawke's Bay|Manawatu|Northland|Southland|Taranaki|Nelson|Marlborough|Gisborne|West Coast|Tasman|Whanganui)\b/i);
          const location = locationMatch ? locationMatch[0] : null;

          const isDealer = /\bdealer\b/i.test(allText);

          results.push({
            ListingId: parseInt(id),
            Title: title,
            Body: "",
            StartPrice: priceMatches[0] ? parseFloat(priceMatches[0].replace(/[$,]/g, "")) : null,
            BuyNowPrice: hasBuyNow && priceMatches[1]
              ? parseFloat(priceMatches[1].replace(/[$,]/g, ""))
              : hasBuyNow && priceMatches[0]
              ? parseFloat(priceMatches[0].replace(/[$,]/g, ""))
              : null,
            IsAuction: isAuction,
            HasBuyNow: hasBuyNow,
            IsBuyNow: !isAuction && hasBuyNow,
            EndDate: endText,
            Region: location,
            SellerType: isDealer ? "dealer" : "private",
            MemberProfile: { IsDealer: isDealer },
            _url: href,
          });
        }

        return results;
      });

      if (cards.length === 0) {
        console.log(`[scraper] No cards found on page ${pageNum} — stopping`);
        break;
      }

      console.log(`[scraper] Found ${cards.length} cards on page ${pageNum}`);

      // Post-process EndDate strings to ISO
      for (const card of cards) {
        card.EndDate = parseEndDate(card.EndDate);
      }

      allRaw.push(...cards);

      // Check if there's a next page
      const hasNextPage = await page.evaluate(() => {
        return !!document.querySelector('[aria-label="Next page"], [class*="next"], a[rel="next"]');
      });
      if (!hasNextPage) break;

      pageNum++;
      await page.waitForTimeout(PAGE_DELAY_MS);
    }

    // Visit individual listing pages for body text (RAM often in description)
    if (visitDetailPages) {
      for (const listing of allRaw) {
        if (!listing._url) continue;
        // Skip if title already has RAM info
        if (/\d+\s*GB\s+(?:RAM|Unified|Memory)/i.test(listing.Title)) continue;
        console.log(`[scraper] Fetching detail: ${listing._url}`);
        listing.Body = await scrapeListingDetail(page, listing._url);
        await page.waitForTimeout(1000);
      }
    }
  } finally {
    await browser.close();
  }

  return allRaw.slice(0, maxListings);
}
