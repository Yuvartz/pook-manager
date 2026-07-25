/**
 * Generates the 6 scale icons for pook manager with OpenAI gpt-image-1.
 * Same pattern as 13_Pokemon/scripts/generate-assets.mjs: one shared
 * character+style block repeated verbatim for consistency, mood varies.
 *
 * Key auto-loads from the user-scope OPENAI_API_KEY env var (never printed).
 * Raw 1024px PNGs land in raw/, downscaled 160px copies in the app's
 * public/scales/. Idempotent: existing outputs are skipped.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "scales");
const RAW_DIR = join(ROOT, "..", "scale-icons-raw"); // 1024px sources, kept out of the repo

let API_KEY = process.env.OPENAI_API_KEY ?? null;
if (!API_KEY) {
  // session shell predates setx — read the user-scope value quietly
  API_KEY = execSync(
    `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User')"`,
    { encoding: "utf8" }
  ).trim() || null;
}

const CHARACTER =
  "A cute cartoon peach shaped like a plump round bottom seen from behind - two chubby " +
  "rounded coral-pink cheeks with a short cleft line down the middle - cheekily letting " +
  "out a small puff of gas drawn as three round cartoon cloud puffs drifting away to the " +
  "left, getting smaller. ";

const STYLE =
  " Flat vector sticker illustration, bold chunky shapes, thick clean dark outlines, very " +
  "few details so it stays readable at 40 pixels, single centered subject with generous " +
  "margin, flat fills only, no gradients, no drop shadows, no 3D, vivid saturated colors " +
  "that pop against a dark background, playful cheeky humor, cute not gross, clean " +
  "transparent background, no text, no letters, no numbers, no watermark.";

const ASSETS = {
  major:
    CHARACTER +
    "Mood: bright sunny happiness - a bold yellow cartoon sun with chunky triangular rays " +
    "shines above the peach, the gas puff is warm golden-yellow." +
    STYLE,
  minor:
    CHARACTER +
    "Mood: melancholy night - a bold pale-blue crescent moon hangs above the peach, the gas " +
    "puff is cool blue-violet, one small round teardrop falls from the peach, dusty blue and " +
    "lavender palette." +
    STYLE,
  penta:
    CHARACTER +
    "Mood: calm zen garden - a simple bold green bamboo stalk with a few leaves stands beside " +
    "the peach, and the escaping gas is exactly five jade-green round dots trailing in a " +
    "gentle arc, serene jade and cream palette." +
    STYLE,
  blues:
    CHARACTER +
    "Mood: smoky late-night blues club - the peach wears tiny dark cartoon sunglasses, a " +
    "small bold golden saxophone leans beside it, the gas puff is deep indigo-blue, moody " +
    "indigo and brass-gold palette." +
    STYLE,
  dorian:
    CHARACTER +
    "Mood: dreamy floating breeze - a single bold curled green leaf drifts beside the peach " +
    "with gentle curved motion lines, the gas puff is soft teal, airy mint and teal palette." +
    STYLE,
  harmonic:
    CHARACTER +
    "Mood: warm desert night - a small bold cartoon camel with two humps, drawn with the same " +
    "thick dark outline as everything else, stands beside the peach, a crescent moon and one " +
    "four-pointed star above, the gas puff is warm sand-orange, terracotta and burnt-orange " +
    "desert palette. Every single shape MUST have a thick dark-brown outline, crisp hard " +
    "vector edges, absolutely no glow, no blur, no soft light, no halo effect." +
    STYLE,
};

const only = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1] : null;
})();

async function generate(name, prompt) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
      background: "transparent",
      output_format: "png",
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for ${name}: ${detail.slice(0, 400)}`);
  }
  const payload = await response.json();
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image data for ${name}`);

  const rawPath = join(RAW_DIR, `${name}.png`);
  writeFileSync(rawPath, Buffer.from(b64, "base64"));

  // 160px is plenty: rendered ~40px, leaves 4x for high-DPI screens.
  const outPath = join(OUT_DIR, `${name}.png`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", rawPath,
    "-vf", "scale=160:-1:flags=lanczos", outPath]);
  const kb = Math.round(statSync(outPath).size / 1024);
  console.log(`${name}: ok (${kb}KB)`);
}

async function main() {
  if (!API_KEY) {
    console.error("OPENAI_API_KEY is not set.");
    process.exit(1);
  }
  mkdirSync(RAW_DIR, { recursive: true });

  let failed = 0;
  for (const [name, prompt] of Object.entries(ASSETS)) {
    if (only && name !== only) continue;
    const outPath = join(OUT_DIR, `${name}.png`);
    if (!only && existsSync(outPath) && statSync(outPath).size > 1000) {
      console.log(`${name}: skipped (exists)`);
      continue;
    }
    try {
      await generate(name, prompt);
    } catch (error) {
      failed++;
      console.error(String(error));
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
