// End-to-end test: node test/e2e.mjs  (needs a built index.html; globally installed playwright)
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { const req = createRequire(import.meta.url); chromium = req(join(execSync("npm root -g").toString().trim(), "playwright")).chromium; }

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = pathToFileURL(join(root, "index.html")).href;
const SHOTS = "/tmp/claude-0/-home-user-couples-truth-or-dare/c4dd1df9-d264-5b78-8194-ca4620ab22ed/scratchpad/shots";
mkdirSync(SHOTS, { recursive: true });
const deck = JSON.parse(readFileSync(join(root, "deck.json"), "utf8"));
const byText = new Map();
for (const k of ["truth", "day", "night", "quick"]) deck[k].forEach((c) => byText.set(c.text, { ...c, pool: k }));
const wildByText = new Map(deck.wild.map((w) => [w.text, w]));

let passed = 0; const failures = [];
function check(cond, msg) { if (cond) { passed++; } else { failures.push(msg); console.log("  FAIL: " + msg); } }
const eq = (a, b, msg) => check(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

let browser;
try { browser = await chromium.launch(); }
catch { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }

const consoleErrors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // offline: fonts are cosmetic
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push("console: " + m.text()); });
  await page.goto(URL_);
  return page;
}
const pause = (page, ms = 40) => page.waitForTimeout(ms);
async function click(page, sel) { await page.locator(sel).first().click(); await pause(page); }
async function overflow(page, label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no horizontal overflow (${label}: scrollWidth ${w})`);
}
async function typeIntoDecoy(page, v) { await page.fill("#d-input", v); await page.press("#d-input", "Enter"); await pause(page, 120); }
async function unlock(page, pin = "4321") {
  await typeIntoDecoy(page, pin);
  await page.waitForSelector("#game:not([hidden]) .g-head h1", { timeout: 3000 });
  await pause(page, 80);
}
async function setDay(page, d) {
  await page.evaluate((v) => localStorage.setItem("ptl_debug_today", JSON.stringify(v)), `2026-10-${String(10 + d).padStart(2, "0")}`);
  await page.reload();
  await unlock(page);
  await click(page, '[data-tab="today"]');
}
async function firstSetup(page, days, pin = "4321") {
  await page.fill("#d-input", "##"); await page.press("#d-input", "Enter");
  await page.waitForSelector("#d-pin:not([hidden])");
  await page.fill("#d-pin-a", pin); await page.fill("#d-pin-b", pin); await click(page, "#d-pin-save");
  await page.waitForSelector("#s-start");
  if (days === 6) { eq(await page.inputValue("#s-days"), "6", "default days is 6"); eq(await page.inputValue("#s-wc"), "5", "default Winner's Choice night 5"); }
  await page.fill("#s-start", "2026-10-11"); await page.fill("#s-days", String(days));
  await click(page, '[data-act="savesetup"]');
  await page.waitForSelector('[data-act="claim"]');
  await click(page, '[data-act="claim"][data-p="coral"]');
  await page.waitForSelector(".tabs");
}
async function slots(page) {
  return page.$$eval(".slot:not(.wild)", (els) => els.map((e) => ({
    name: e.querySelector(".slot-name")?.textContent.trim(), chip: e.querySelector(".chip")?.textContent.trim(),
    text: e.querySelector(".cardtext")?.textContent.trim() ?? null, flip: !!e.querySelector('[data-act="flip"]') })));
}
async function flipAll(page) {
  for (let i = 0; i < 10 && await page.locator('[data-act="flip"]').count(); i++) await click(page, '[data-act="flip"]');
  return slots(page);
}
async function scores(page) {
  await click(page, '[data-tab="scores"]');
  const n = await page.$$eval(".score .n", (e) => e.map((x) => +x.textContent));
  await click(page, '[data-tab="today"]');
  return { coral: n[0], riptide: n[1] };
}
async function completeAll(page, d) {
  for (const s of await slots(page)) {
    const key = s.name === "Pillow talk truth" ? "pillow" : /truth/i.test(s.name) ? "truth" : /Daytime/.test(s.name) ? "day" : "night";
    const sec = `.slot:has([data-slot="${key}"])`;
    if (await page.locator(`${sec} [data-act="wcdone"]`).count()) {
      await page.locator(`${sec} input[name="wcopt"]`).first().check();
      await click(page, `${sec} [data-act="wcdone"]`);
    } else if (await page.locator(`${sec} #ans-${key}`).count()) {
      await page.fill(`#ans-${key}`, `answer d${d} ${key}`); await click(page, `${sec} [data-act="done"]`);
    } else if (await page.locator(`${sec} [data-act="done"]`).count()) await click(page, `${sec} [data-act="done"]`);
  }
}

/* ===================== 1. decoy, PIN, setup, lock ===================== */
console.log("Decoy / PIN / lock");
let page = await newPage();
eq(await page.textContent("#decoy h1"), "Beach Week Packing List", "decoy title");
check((await page.locator("#d-list li").count()) >= 5, "decoy renders items");
await typeIntoDecoy(page, "Sun hat spare");
check((await page.locator("#d-list li", { hasText: "Sun hat spare" }).count()) === 1, "normal item added");
await page.screenshot({ path: join(SHOTS, "decoy.png") });
await overflow(page, "decoy");
await firstSetup(page, 6);
eq(await page.textContent(".g-head h1"), "Tide & Tell", "game header after unlock");
await overflow(page, "after setup");

await click(page, '[data-act="lock"]');
check(await page.isVisible("#decoy"), "lock shows decoy");
eq(await page.evaluate(() => document.getElementById("game").innerHTML), "", "lock clears #game");
await typeIntoDecoy(page, "1111");
check(await page.isHidden("#game"), "wrong PIN does not unlock");
check((await page.locator("#d-list li", { hasText: "1111" }).count()) === 1, "wrong PIN added as item");
await unlock(page);
check(await page.isVisible("#game"), "4321 unlocks");
await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await pause(page);
check(await page.isVisible("#decoy") && (await page.evaluate(() => document.getElementById("game").innerHTML)) === "", "visibilitychange hidden locks");
await page.evaluate(() => { delete document.hidden; });

/* ===================== 2. six-day week as Coral ===================== */
console.log("Six-day week");
const EXP = {
  1: { truth: ["Afternoon truth", "Flirty"], day: ["Daytime dare", "Flirty"], night: ["Night dare", "Teasing"] },
  2: { truth: ["Morning truth", "Teasing"], day: ["Daytime dare", "Flirty"], night: ["Night dare", "Naughty"] },
  3: { truth: ["Morning truth", "Naughty"], day: ["Daytime dare", "Teasing"], night: ["Night dare", "Naughty"] },
  4: { truth: ["Morning truth", "Naughty"], day: ["Daytime dare", "Teasing"], night: ["Night dare", "Naughty"] },
  5: { truth: ["Morning truth", "Naughty"], day: ["Daytime dare", "Teasing"], night: ["Winner's Choice night", "Naughty"] },
  6: { truth: ["Morning truth", "Naughty"], day: ["Daytime dare", "Teasing"], night: ["Last-night quickie", "Naughty"] },
};
const seenTexts = new Map(); // text -> "day/slot"
const note = (t, where) => { if (t) { check(!seenTexts.has(t), `no repeat: "${t.slice(0, 40)}" at ${where} (first ${seenTexts.get(t)})`); seenTexts.set(t, where); } };

for (let d = 1; d <= 6; d++) {
  await setDay(page, d);
  const sl = await flipAll(page);
  const e = EXP[d];
  const by = (n) => sl.find((s) => s.name === n);
  const truth = sl.find((s) => s.name === e.truth[0]);
  const day = sl.find((s) => s.name === "Daytime dare");
  const night = sl.find((s) => s.name === e.night[0]);
  check(truth && truth.chip === e.truth[1], `day${d} ${e.truth[0]} chip ${e.truth[1]} (got ${truth?.chip})`);
  check(day && day.chip === e.day[1], `day${d} daytime dare chip ${e.day[1]} (got ${day?.chip})`);
  check(night && night.chip === e.night[1], `day${d} ${e.night[0]} chip ${e.night[1]} (got ${night?.chip})`);
  const pillow = by("Pillow talk truth");
  if (d >= 2) check(pillow && pillow.chip === "Naughty", `day${d} pillow talk present & naughty`); else check(!pillow, "day1 has no pillow talk");
  eq(sl.length, d >= 2 ? 4 : 3, `day${d} slot count`);
  // deck-level tier check
  for (const s of sl) { const c = byText.get(s.text); if (c) check(c.tier.toLowerCase() === s.chip.toLowerCase(), `day${d} ${s.name} card tier matches chip`); }
  if (night.name.startsWith("Last-night")) check(deck.quick.some((c) => c.text === night.text), "day6 night card from quick pool");
  sl.forEach((s) => note(s.text, `d${d} ${s.name}`));
  await overflow(page, `day ${d} flipped`);

  if (d === 3) {
    await page.screenshot({ path: join(SHOTS, "today-day3.png") });
    // free swap on night card
    const before = night.text;
    await click(page, '[data-act="swap"]');
    const after = (await slots(page)).find((s) => s.name === "Night dare");
    check(after.text !== before, "Not tonight swap changes night text");
    check((await page.locator('[data-act="swap"]').count()) === 0, "swap only once");
    note(after.text, "d3 swapped night");
    // skip / undo on daytime dare
    const s0 = await scores(page);
    await click(page, '.slot:has([data-slot="day"]) [data-act="skip"]');
    check(await page.locator(".forfeit").count() === 1, "skip shows a forfeit");
    const s1 = await scores(page);
    eq(s1.coral, s0.coral - 2, "skip costs 2");
    await click(page, '.slot:has([data-slot="day"]) [data-act="undo"]');
    eq((await scores(page)).coral, s0.coral, "undo restores score");
    check(await page.locator(".forfeit").count() === 0, "forfeit gone after undo");
  }
  await completeAll(page, d);
  check((await page.locator(".slot:not(.wild) .chip.done, .slot:not(.wild) .chip.skipped").count()) === sl.length, `day${d} all slots resolved`);
  if (d === 5) check((await page.locator('input[name="wcopt"]').count()) === 0 && /Winner's Choice/.test(await page.textContent(".stack")), "WC night done (day 5)");

  if (d === 3) {
    check(await page.locator('[data-act="wild"]').count() === 1, "wild card offered after all resolved");
    const s0 = await scores(page);
    await click(page, '[data-act="wild"]');
    const wt = (await page.textContent(".slot.wild .cardtext")).trim();
    const w = wildByText.get(wt); check(!!w, "wild card text in deck");
    await click(page, '[data-act="playwild"]');
    const s1 = await scores(page);
    eq(s1.coral - s0.coral, w.self, "Play it adjusts own score by wild.self");
  }
  if (d === 2) {
    const sc = await scores(page);
    check(sc.coral >= 10, `gross >=10 after day 2 (score ${sc.coral})`);
    await click(page, '[data-tab="wallet"]');
    check((await page.locator(".coupon").count()) >= 1, "wallet shows a coupon");
    await click(page, '.coupon [data-act="redeem"]');
    check((await page.locator(".coupon.used").count()) === 1, "redeem marks used");
    await click(page, '.coupon [data-act="unredeem"]');
    check((await page.locator(".coupon.used").count()) === 0, "redeem toggles back");
    await click(page, '.coupon [data-act="redeem"]');
    check((await page.locator(".coupon.used").count()) === 1, "redeem toggles again");
    await click(page, '[data-tab="today"]');
  }
  if (d === 3) {
    await click(page, '[data-tab="scores"]'); await page.screenshot({ path: join(SHOTS, "scores.png") }); await overflow(page, "scores");
    await click(page, '[data-tab="wallet"]'); await page.screenshot({ path: join(SHOTS, "wallet.png") }); await overflow(page, "wallet");
    await click(page, '[data-tab="settings"]'); await overflow(page, "settings");
    // custom card for Riptide
    await click(page, '[data-tab="write"]'); await overflow(page, "write");
    await page.locator('input[name="wkind"][value="night"]').check();
    await page.locator('input[name="wtier"][value="naughty"]').check();
    await page.fill("#w-text", "CUSTOM-NIGHT-DARE for Riptide only");
    await click(page, '[data-act="addcard"]');
    check((await page.locator(".hist .hrow", { hasText: "CUSTOM-NIGHT-DARE" }).count()) === 1, "custom card listed under cards you've written");
    // switch to Riptide
    await click(page, '[data-tab="settings"]');
    await click(page, '[data-act="release"]');
    await click(page, '[data-act="claim"][data-p="riptide"]');
    await page.waitForSelector(".tabs");
    check((await page.textContent(".who")).includes("Riptide"), "now playing as Riptide");
    await setDay(page, 4);
    await click(page, '.slot:has([data-slot="night"]) [data-act="flip"]');
    const n = (await slots(page)).find((s) => s.name === "Night dare");
    eq(n.text, "CUSTOM-NIGHT-DARE for Riptide only", "Riptide night draw is the custom text");
    check((await page.textContent(".from")).includes("Written for you by Coral"), "'Written for you by Coral' shown");
    // back to Coral
    await click(page, '[data-tab="settings"]');
    await click(page, '[data-act="release"]');
    await click(page, '[data-act="claim"][data-p="coral"]');
    await page.waitForSelector(".tabs");
  }
}
// after week
eq((await scores(page)).coral > 0, true, "coral has points");

/* ===================== 3. 3-day and 10-day ===================== */
const tierRank = { Flirty: 1, Teasing: 2, Naughty: 3 };
for (const days of [3, 10]) {
  console.log(`${days}-day week`);
  const p2 = await newPage();
  await firstSetup(p2, days);
  const prevTruth = [], texts = new Set();
  let wcDay = days >= 5 ? 5 : days - 1; // saveSetup clamps wc > days to days-1
  for (let d = 1; d <= days; d++) {
    await setDay(p2, d);
    const sl = await flipAll(p2);
    const pr = days > 1 ? (d - 1) / (days - 1) : 1;
    const wantTruth = pr < 0.2 ? "Flirty" : pr < 0.4 ? "Teasing" : "Naughty";
    const t = sl.find((s) => /^(Morning|Afternoon) truth$/.test(s.name));
    eq(t.chip, wantTruth, `${days}d day${d} truth tier`);
    prevTruth.push(tierRank[t.chip]);
    const dd = sl.find((s) => s.name === "Daytime dare");
    eq(dd.chip, pr < 0.4 ? "Flirty" : "Teasing", `${days}d day${d} daytime tier`);
    const nn = sl.find((s) => /Night dare|Winner|quickie/.test(s.name));
    if (d === days) eq(nn.name, "Last-night quickie", `${days}d final night is quick`);
    else if (d === wcDay) eq(nn.name, "Winner's Choice night", `${days}d WC night on ${wcDay}`);
    else eq(nn.chip, pr < 0.2 ? "Teasing" : "Naughty", `${days}d day${d} night tier`);
    sl.forEach((s) => { check(!texts.has(s.text), `${days}d no repeat d${d} ${s.name}`); texts.add(s.text); });
    await overflow(p2, `${days}d day ${d}`);
    await completeAll(p2, d);
  }
  check(prevTruth.every((v, i) => i === 0 || v >= prevTruth[i - 1]), `${days}d truth tiers ramp monotonically`);
  await p2.context().close();
}

/* ===================== wrap up ===================== */
check(consoleErrors.length === 0, "no console/page errors: " + consoleErrors.join(" | "));
await browser.close();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
