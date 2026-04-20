import crypto from "node:crypto";

const TRADEME_API_BASE = "https://api.trademe.co.nz/v1";
// NOTE: Human must verify this category ID before first live run.
const APPLE_CATEGORY = "0001-0008-0168-";
const MAX_LISTINGS = 500;
const PAGE_SIZE = 100;
const RATE_LIMIT_MS = 1000;

function percentEncode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader({ consumerKey, consumerSecret, token, tokenSecret }, method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const allParams = { ...extraParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createClient({ consumerKey, consumerSecret, token, tokenSecret, fetchFn = fetch }) {
  const creds = { consumerKey, consumerSecret, token, tokenSecret };

  async function fetchPage(page) {
    const params = {
      category: APPLE_CATEGORY,
      rows: String(PAGE_SIZE),
      page: String(page),
      return_metadata: "true",
    };

    const queryString = new URLSearchParams(params).toString();
    const url = `${TRADEME_API_BASE}/Search/General.json`;
    const fullUrl = `${url}?${queryString}`;

    const authHeader = buildOAuthHeader(creds, "GET", url, params);

    console.log(`[trademe-client] GET page=${page} category=${APPLE_CATEGORY}`);

    const res = await fetchFn(fullUrl, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`TradeMe API error: ${res.status} ${res.statusText} on page ${page}`);
    }

    return res.json();
  }

  async function fetchAllListings() {
    const allListings = [];
    let page = 1;

    while (allListings.length < MAX_LISTINGS) {
      const data = await fetchPage(page);
      const listings = data.List || [];

      if (listings.length === 0) break;

      allListings.push(...listings);
      console.log(`[trademe-client] Fetched ${allListings.length} listings so far`);

      const totalCount = data.TotalCount || 0;
      if (allListings.length >= totalCount) break;
      if (allListings.length >= MAX_LISTINGS) break;

      page++;
      await sleep(RATE_LIMIT_MS);
    }

    return allListings.slice(0, MAX_LISTINGS);
  }

  return { fetchAllListings };
}
