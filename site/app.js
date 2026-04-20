function app() {
  return {
    loading: true,
    error: null,
    allListings: [],
    stats: {},
    scrapedAt: "",
    version: "",

    chipFamilies: ["M1", "M2", "M3", "M4"],
    ramSteps: [8, 16, 32, 64, 96, 128, 192],

    filters: {
      chips: ["M1", "M2", "M3", "M4"],
      minRam: 8,
      maxPrice: null,
      hideAuctions: false,
      hideBelow16: false,
    },

    sort: { key: "inference_score", dir: "desc" },

    columns: [
      { key: "title",           label: "Listing"    },
      { key: "inference_score", label: "Score"      },
      { key: "price_nzd",       label: "Price (NZD)"},
      { key: "ram_gb",          label: "RAM"        },
      { key: "chip",            label: "Chip"       },
      { key: "model",           label: "Model"      },
      { key: "ends_at",         label: "Ends"       },
    ],

    async init() {
      try {
        const [listingsRes, statsRes, versionRes] = await Promise.all([
          fetch("../data/listings.json"),
          fetch("../data/stats.json"),
          fetch("./version.json"),
        ]);
        if (!listingsRes.ok) throw new Error(`Failed to load listings.json: ${listingsRes.status}`);
        const data = await listingsRes.json();
        this.allListings = data.listings || [];
        this.scrapedAt = data.scraped_at
          ? new Date(data.scraped_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" })
          : "";
        if (statsRes.ok) this.stats = await statsRes.json();
        if (versionRes.ok) {
          const v = await versionRes.json();
          this.version = `${v.number} · ${v.sha}`;
        }
      } catch (e) {
        this.error = `Could not load data: ${e.message}`;
      } finally {
        this.loading = false;
      }
    },

    get filtered() {
      let out = this.allListings.filter((l) => {
        // Chip family filter
        const family = l.chip ? l.chip.split(" ")[0] : null;
        if (family && !this.filters.chips.includes(family)) return false;

        // Min RAM
        if (l.ram_gb !== null && l.ram_gb < this.filters.minRam) return false;

        // Max price
        if (this.filters.maxPrice && l.price_nzd > this.filters.maxPrice) return false;

        // Hide auctions
        if (this.filters.hideAuctions && l.is_auction) return false;

        // Hide <16GB
        if (this.filters.hideBelow16 && (l.ram_gb === null || l.ram_gb < 16)) return false;

        return true;
      });

      // Sort
      out = [...out].sort((a, b) => {
        const key = this.sort.key;
        let av = a[key];
        let bv = b[key];

        // Nulls always last
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;

        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();

        if (av < bv) return this.sort.dir === "asc" ? -1 : 1;
        if (av > bv) return this.sort.dir === "asc" ? 1 : -1;
        return 0;
      });

      return out;
    },

    setSort(key) {
      if (this.sort.key === key) {
        this.sort.dir = this.sort.dir === "desc" ? "asc" : "desc";
      } else {
        this.sort.key = key;
        this.sort.dir = key === "price_nzd" ? "asc" : "desc";
      }
    },

    // Returns 'below', 'above', or null based on median for this chip/ram bucket
    medianBadge(listing) {
      if (!listing.chip || !listing.ram_gb) return null;
      const bucket = [8, 16, 32, 64, 96, 128, 192].reduce((best, b) => listing.ram_gb >= b ? b : best, 8);
      const key = `${listing.chip}__${bucket}`;
      const stat = this.stats[key];
      if (!stat || stat.count < 2) return null;
      return listing.price_nzd < stat.median_price ? "below" : "above";
    },

    formatEnds(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      const now = Date.now();
      const diffH = (d - now) / 3_600_000;
      if (diffH < 0) return "Ended";
      if (diffH < 1) return `${Math.round(diffH * 60)}m left`;
      if (diffH < 24) return `${Math.round(diffH)}h left`;
      return d.toLocaleDateString("en-NZ", { month: "short", day: "numeric" });
    },
  };
}
