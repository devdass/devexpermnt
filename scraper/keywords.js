// Word-boundary aware token check — avoids matching M1 inside HDMI etc.
function hasToken(text, tokens) {
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").test(text)) {
      return true;
    }
  }
  return false;
}

const CHIP_TOKENS = ["M1", "M2", "M3", "M4"];
const MODEL_TOKENS = ["MacBook Air", "MacBook Pro", "Mac mini", "Mac Studio", "iMac", "Mac Pro"];
const EXCLUDE_TITLE_TOKENS = [
  "iPad", "iPhone", "Apple Watch", "AirPods",
  "case", "cover", "charger", "cable", "adapter", "stand",
  "parts", "broken", "faulty", "for parts", "not working", "repair",
];
// Years <= 2020 that indicate Intel if no chip token present
const OLD_YEAR_RE = /\b(20[012]\d|1[0-9]{3})\b/;
const VALID_YEAR_RE = /\b(2021|2022|2023|2024|2025|2026)\b/;

export function shouldInclude(title, body) {
  const combined = `${title} ${body}`;

  // Must have a chip token somewhere
  if (!hasToken(combined, CHIP_TOKENS)) return false;

  // Must have a Mac model token somewhere
  if (!hasToken(combined, MODEL_TOKENS)) return false;

  // Exclude if title contains any exclude token
  for (const token of EXCLUDE_TITLE_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").test(title)) {
      return false;
    }
  }

  // Exclude if title has a year <= 2020 and no chip token in title OR body
  // (Catches Intel Macs with misleading year; M1 MacBook Air 2020 has chip token in body)
  const yearMatch = title.match(OLD_YEAR_RE);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year <= 2020 && !hasToken(title, CHIP_TOKENS) && !hasToken(body, CHIP_TOKENS)) return false;
  }

  return true;
}
