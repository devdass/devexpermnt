#!/usr/bin/env node
// Writes site/version.json based on current git state.
// Run before committing to embed the build number in the site.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../site/version.json");

const commitCount = execSync("git rev-list --count HEAD").toString().trim();
const shortSha    = execSync("git rev-parse --short HEAD").toString().trim();
const builtAt     = new Date().toISOString();

// The *next* commit will be commitCount + 1; include that as the build number.
const number = `v${parseInt(commitCount, 10) + 1}`;

writeFileSync(OUT, JSON.stringify({ number, sha: shortSha, built_at: builtAt }, null, 2) + "\n");
console.log(`[version] wrote ${OUT}: ${number} · ${shortSha}`);
