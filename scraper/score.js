import { BANDWIDTH_TABLE } from "./bandwidth-table.js";

const AUCTION_SOON_HOURS = 24;

export function scoreListing(normalized) {
  const { chip, ram_gb, price_nzd, is_auction, ends_at } = normalized;

  const notes = [];
  let bandwidth_gbs = null;
  let inference_score = null;
  let price_per_gb_ram = null;

  if (chip !== null) {
    if (Object.prototype.hasOwnProperty.call(BANDWIDTH_TABLE, chip)) {
      bandwidth_gbs = BANDWIDTH_TABLE[chip];
    } else {
      console.warn(`[score] Unknown chip "${chip}" — skipping score. Add it to bandwidth-table.js.`);
      notes.push(`Unknown chip: ${chip}`);
    }
  } else {
    notes.push("Chip not specified");
  }

  if (ram_gb === null) notes.push("RAM not specified");
  if (ram_gb !== null && ram_gb < 16) notes.push("Below 16GB — limited inference use");

  if (bandwidth_gbs !== null && ram_gb !== null && price_nzd > 0) {
    inference_score = (ram_gb * bandwidth_gbs) / price_nzd;
    price_per_gb_ram = price_nzd / ram_gb;
  }

  if (is_auction && ends_at) {
    const hoursRemaining = (new Date(ends_at) - Date.now()) / 3_600_000;
    if (hoursRemaining > AUCTION_SOON_HOURS) {
      notes.push("Auction — price not final");
    }
  }

  return {
    ...normalized,
    bandwidth_gbs,
    inference_score,
    price_per_gb_ram,
    inference_viable: ram_gb !== null && ram_gb >= 16,
    notes,
  };
}

export function rankListings(listings) {
  const scored = listings.filter((l) => l.inference_score !== null);
  const unscored = listings.filter((l) => l.inference_score === null);

  scored.sort((a, b) => b.inference_score - a.inference_score);
  unscored.sort((a, b) => a.price_nzd - b.price_nzd);

  return [...scored, ...unscored];
}
