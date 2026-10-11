// Build index.html from template.html + deck.json (Node 22, no deps).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const errors = [];
const err = (m) => errors.push(m);

let deck;
try { deck = JSON.parse(readFileSync(join(root, "deck.json"), "utf8")); }
catch (e) { console.error("deck.json: cannot parse: " + e.message); process.exit(1); }

const TIERS = ["flirty", "teasing", "naughty"];
const pools = ["truth", "day", "night", "quick", "forfeit", "wild", "coupon"];
const seen = new Map();
for (const p of pools) {
  if (!Array.isArray(deck[p])) { err(`pool "${p}" missing or not an array`); continue; }
  for (const c of deck[p]) {
    if (!c || typeof c.id !== "string" || !c.id) { err(`pool "${p}": card without string id`); continue; }
    if (seen.has(c.id)) err(`duplicate id "${c.id}" in "${p}" (also in "${seen.get(c.id)}")`);
    seen.set(c.id, p);
    if (typeof c.text !== "string" || !c.text.trim()) err(`${c.id}: missing text`);
    if (["truth", "day", "night", "quick"].includes(p)) {
      if (!TIERS.includes(c.tier)) err(`${c.id}: bad tier "${c.tier}"`);
      if (typeof c.minProgress !== "number" || !(c.minProgress >= 0 && c.minProgress <= 1)) err(`${c.id}: minProgress must be a number 0..1`);
      if (p === "day" && c.tier === "naughty") err(`${c.id}: day cards must not be naughty`);
    }
    if (p === "wild" && (typeof c.self !== "number" || typeof c.partner !== "number")) err(`${c.id}: wild card needs numeric self/partner`);
  }
}
if (!Array.isArray(deck.winnersChoice) || !deck.winnersChoice.every((s) => typeof s === "string")) err("winnersChoice must be an array of strings");

if (errors.length) { console.error("Deck validation failed:\n - " + errors.join("\n - ")); process.exit(1); }

const tpl = readFileSync(join(root, "template.html"), "utf8");
const MARK = "/*DECK*/null";
if (!tpl.includes(MARK)) { console.error("template.html: placeholder " + MARK + " not found"); process.exit(1); }
// Escape "<" so "</script>" in card text can never end the script block; use a function replacer to avoid $-patterns.
const json = JSON.stringify(deck).replace(/</g, "\\u003c");
writeFileSync(join(root, "index.html"), tpl.replace(MARK, () => json));
console.log(`index.html written (${seen.size} cards).`);
