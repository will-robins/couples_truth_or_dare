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
const WILD_MULT = 5;
const renderWild = (w) => w.text.replace(/\{self\}/g, w.self * WILD_MULT).replace(/\{steal\}/g, Math.abs(w.partner) * WILD_MULT);
const wildByText = new Map(deck.wild.map((w) => [renderWild(w), w]));

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
  await page.check("#s-partial"); // default depends on time of day
  await page.fill("#s-start", "2026-10-11"); await page.fill("#s-days", String(days));
  await click(page, '[data-act="savesetup"]');
  await page.waitForSelector('[data-act="claim"]');
  await claim(page, "coral");
  await page.waitForSelector(".tabs");
}
async function claim(page, seat) {
  await click(page, `[data-act="claim"][data-p="${seat}"]`);
  await page.waitForSelector(".tabs, .nick", { timeout: 3000 });
  if (await page.locator(".nick").count()) await click(page, `.nick[data-n="${seat === "coral" ? "Coral" : "Riptide"}"]`);
  await page.waitForSelector(".tabs", { timeout: 3000 });
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
    } else if (await page.locator(`${sec} #ans-d${d}-${key}`).count()) {
      await page.fill(`#ans-d${d}-${key}`, `answer d${d} ${key}`); await click(page, `${sec} [data-act="done"]`);
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
check((await page.locator("#d-list li", { hasText: "1111" }).count()) === 0, "wrong PIN not added as item");
eq(await page.inputValue("#d-input"), "", "wrong PIN clears the field");
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
  if (night.name === "Night dare") {
    // night ramp: regular nights are days 1-4 here, so day 4 maps to 1.0
    const np = Math.min(1, (d - 1) / 3), nc = byText.get(night.text);
    if (nc) check(nc.minProgress <= np + 1e-9, `day${d} night card minProgress ${nc.minProgress} <= ${np.toFixed(2)}`);
    if (nc && d === 4) check(nc.minProgress >= 0.8, `day4 night card is from the top of the ramp (minProgress ${nc.minProgress})`);
  }

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
    eq((await page.textContent('.slot:has([data-slot="day"]) [data-act="skip"]')).trim(), "Skip -15", "skip label shows Skip -15");
    await click(page, '.slot:has([data-slot="day"]) [data-act="skip"]');
    check(await page.locator(".forfeit").count() === 1, "skip shows a forfeit");
    const s1 = await scores(page);
    eq(s1.coral, s0.coral - 15, "skip costs 15");
    await click(page, '.slot:has([data-slot="day"]) [data-act="undo"]');
    eq((await scores(page)).coral, s0.coral, "undo restores score");
    check(await page.locator(".forfeit").count() === 0, "forfeit gone after undo");
    // wild card needs a skipped card's forfeit to be paid
    await click(page, '.slot:has([data-slot="day"]) [data-act="skip"]');
    await completeAll(page, d);
    check(await page.locator('[data-act="wild"]').count() === 0, "wild card locked while a forfeit is unpaid");
    await page.locator('.forfeit input[type="checkbox"]').check(); await pause(page);
    check(await page.locator('[data-act="wild"]').count() === 1, "wild card unlocks once the forfeit is paid");
    await click(page, '.slot:has([data-slot="day"]) [data-act="undo"]');
    check(await page.locator('[data-act="wild"]').count() === 0, "wild card hidden again after undo");
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
    check(!/[{}]/.test(wt), `wild card text has no tokens ("${wt.slice(0, 50)}")`);
    await click(page, '[data-act="playwild"]');
    const toastTxt = await page.textContent("#toast");
    check(toastTxt.startsWith(`${w.self >= 0 ? "+" : ""}${w.self * WILD_MULT} for you`), `wild toast shows self*5 (${toastTxt})`);
    const s1 = await scores(page);
    eq(s1.coral - s0.coral, w.self * WILD_MULT, "Play it adjusts own score by wild.self * 5");
  }
  if (d === 2) {
    const sc = await scores(page);
    check(sc.coral >= 100, `gross >=100 after day 2 (score ${sc.coral})`);
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
    await claim(page, "riptide");
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
    await claim(page, "coral");
    await page.waitForSelector(".tabs");
  }
}
// after week
eq((await scores(page)).coral > 0, true, "coral has points");
check(await page.locator("#toast").count() === 1, "toast showing before lock");
await click(page, '[data-act="lock"]');
eq(await page.locator("#toast").count(), 0, "lock removes the toast");
await unlock(page);

/* Winner's Choice leader is fixed by scores before that day; custom cards skip quickie/WC/hotter slots */
console.log("Winner's Choice / custom rules");
await click(page, '[data-tab="write"]');
await page.locator('input[name="wkind"][value="night"]').check();
await page.locator('input[name="wtier"][value="naughty"]').check();
await page.fill("#w-text", "CUSTOM-NIGHT-2 for Riptide");
await click(page, '[data-act="addcard"]');
eq(await page.locator('input[name="wkind"]:checked').getAttribute("value"), "night", "write form keeps kind after render");
eq(await page.locator('input[name="wtier"]:checked').getAttribute("value"), "naughty", "write form keeps tier after render");
eq(await page.inputValue("#w-text"), "", "write box cleared after adding");
await click(page, '[data-tab="settings"]'); await click(page, '[data-act="release"]'); await claim(page, "riptide");
await page.waitForSelector(".tabs");
await setDay(page, 1);
await click(page, '.slot:has([data-slot="night"]) [data-act="flip"]');
check(!(await slots(page)).find((s) => s.name === "Night dare").text.startsWith("CUSTOM-NIGHT-2"), "naughty custom card not used in a teasing slot");
await setDay(page, 5);
await click(page, '.slot:has([data-slot="night"]) [data-act="flip"]');
const wcr = (await slots(page)).find((s) => s.name === "Winner's Choice night");
check(/say yes/.test(wcr.text) && !wcr.text.startsWith("CUSTOM"), "Riptide sees say-yes when Coral leads (custom not used)");
await setDay(page, 6);
await click(page, '.slot:has([data-slot="night"]) [data-act="flip"]');
const qn = (await slots(page)).find((s) => s.name === "Last-night quickie");
check(deck.quick.some((c) => c.text === qn.text), "custom card not used on the quickie night");

// tie, then points on the WC day itself must not change the leader
const pt = await newPage();
await firstSetup(pt, 6);
await setDay(pt, 5);
await click(pt, '.slot:has([data-slot="night"]) [data-act="flip"]');
check(/tied/.test((await slots(pt)).find((s) => s.name === "Winner's Choice night").text), "tie going into WC night");
await completeAll(pt, 5);
await click(pt, '[data-tab="settings"]'); await click(pt, '[data-act="release"]'); await claim(pt, "riptide");
await pt.waitForSelector(".tabs");
await setDay(pt, 5);
await click(pt, '.slot:has([data-slot="night"]) [data-act="flip"]');
check(/tied/.test((await slots(pt)).find((s) => s.name === "Winner's Choice night").text), "WC tie unchanged by Coral's points on the same day");
await pt.context().close();

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

/* ===================== partner confirm (local) ===================== */
console.log("Partner confirm");
{
  const pc = await newPage();
  await firstSetup(pc, 6);
  await setDay(pc, 1);
  const sec = (k) => `.slot:has([data-slot="${k}"])`;
  const swap = async (p) => { await click(pc, '[data-tab="settings"]'); await click(pc, '[data-act="release"]'); await claim(pc, p); await click(pc, '[data-tab="today"]'); };
  const toConfirm = async () => { const b = pc.locator('.partnerline [data-tab="scores"]'); return (await b.count()) ? await b.textContent() : null; };
  await click(pc, `${sec("day")} [data-act="flip"]`);
  const cardText = (await slots(pc)).find((s) => s.name === "Daytime dare").text;
  const base = await scores(pc);
  await click(pc, `${sec("day")} [data-act="done"]`);
  check(/Waiting for Riptide to confirm/.test(await pc.textContent(sec("day"))), "confirm: Coral's card waits for Riptide");
  const afterDone = await scores(pc);
  const tierPts = afterDone.coral - base.coral;
  eq(tierPts, 15, "confirm: flirty daytime dare gives dFlirty 15 before confirm");
  await swap("riptide");
  eq((await toConfirm() || "").trim(), "1 dare to confirm", "confirm: Riptide's Today shows 1 dare to confirm");
  await click(pc, '.partnerline [data-tab="scores"]');
  eq(await pc.locator('[data-act="confirm"]').count(), 1, "confirm: exactly one confirm button (truths have none)");
  check(/Confirm it happened \(\+10 for Coral\)/.test(await pc.locator('[data-act="confirm"]').textContent()), "confirm: button label");
  await click(pc, '[data-act="confirm"]');
  eq(await pc.locator('[data-act="confirm"]').count(), 0, "confirm: button gone after confirming");
  check(/Confirmed by Riptide/.test(await pc.locator(".hrow", { hasText: cardText.slice(0, 30) }).first().textContent()), "confirm: row says Confirmed by Riptide");
  await click(pc, '[data-tab="today"]');
  eq(await toConfirm(), null, "confirm: Riptide's to-confirm count drops to 0");
  const conf = await scores(pc);
  eq(conf.coral, afterDone.coral + 10, "confirm: Coral score +10");
  eq(conf.riptide, base.riptide, "confirm: Riptide score unchanged");
  await swap("coral");
  check(/Confirmed by Riptide, \+10 bonus/.test(await pc.textContent(sec("day"))), "confirm: Coral's card shows Confirmed by Riptide, +10 bonus");
  // undo removes the bonus
  await click(pc, `${sec("day")} [data-act="undo"]`);
  const undone = await scores(pc);
  eq(undone.coral, base.coral, "confirm: undo drops tier + bonus");
  // re-done with the same card brings it back
  check((await slots(pc)).find((s) => s.name === "Daytime dare").text === cardText, "confirm: same card after undo");
  await click(pc, `${sec("day")} [data-act="done"]`);
  const redone = await scores(pc);
  eq(redone.coral, conf.coral, "confirm: bonus returns on re-Done with same card");
  // bonus value from Setup
  await click(pc, '[data-tab="settings"]');
  await pc.fill("#s-p-confirm", "20"); await click(pc, '[data-act="savesetup"]');
  const two = await scores(pc);
  eq(two.coral, conf.coral + 10, "confirm: bonus 20 raises score by 10 more");
  check(/\+20 bonus/.test(await pc.textContent(sec("day"))), "confirm: card shows +20 bonus");
  await pc.context().close();
}

/* ===================== points scale ===================== */
console.log("Points scale");
{
  const pp = await newPage();
  await firstSetup(pp, 6);
  await setDay(pp, 1);
  const sl = await flipAll(pp);
  const tr = sl.find((s) => s.name === "Afternoon truth"), dd = sl.find((s) => s.name === "Daytime dare");
  eq(tr.chip, "Flirty", "points: day1 truth flirty"); eq(dd.chip, "Flirty", "points: day1 daytime flirty");
  const z = (await scores(pp)).coral;
  await pp.fill("#ans-d1-truth", "a"); await click(pp, '.slot:has([data-slot="truth"]) [data-act="done"]');
  const afterT = (await scores(pp)).coral;
  eq(afterT - z, 10, "flirty truth +10");
  await click(pp, '.slot:has([data-slot="day"]) [data-act="done"]');
  const afterD = (await scores(pp)).coral;
  eq(afterD - afterT, 15, "flirty daytime dare +15 (differs from truth)");
  await click(pp, '.slot:has([data-slot="night"]) [data-act="done"]');
  eq((await scores(pp)).coral - afterD, 20, "teasing night dare +20");

  await click(pp, '[data-tab="settings"]');
  const want = { tFlirty: 10, dFlirty: 15, tTeasing: 15, dTeasing: 20, tNaughty: 25, dNaughty: 40, custom: 5, confirm: 10, skip: -15, wild: 5, coupon: 100 };
  for (const [k, v] of Object.entries(want)) eq(await pp.inputValue("#s-p-" + k), String(v), `setup default s-p-${k}`);
  eq(await pp.locator("#s-p-flirty").count(), 0, "old s-p-flirty input gone");
  const total = (await scores(pp)).coral;
  await click(pp, '[data-tab="wallet"]');
  eq(await pp.locator(".coupon").count(), 0, "no coupon below 100 points");
  await click(pp, '[data-tab="settings"]');
  await pp.fill("#s-p-coupon", "15"); await click(pp, '[data-act="savesetup"]');
  await click(pp, '[data-tab="wallet"]');
  eq(await pp.locator(".coupon").count(), Math.floor(total / 15), "coupon count follows s-p-coupon (15)");
  check(/One coupon for every 15 points/.test(await pp.textContent("#game")), "wallet text uses coupon setting");
  await pp.context().close();

  // old-style saved points scale is replaced by new defaults (inject before load)
  const op = await newPage();
  await firstSetup(op, 6);
  await op.evaluate(() => {
    const l = JSON.parse(localStorage.getItem("ptl_local"));
    l.state.points = { flirty: 1, teasing: 2, naughty: 3, custom: 1, confirm: 2, skip: -2, wild: 1, coupon: 10 };
    localStorage.setItem("ptl_local", JSON.stringify(l));
  });
  await setDay(op, 1);
  await flipAll(op);
  eq((await op.textContent('.slot:has([data-slot="day"]) [data-act="skip"]')).trim(), "Skip -15", "old points: skip label uses new default");
  const o0 = (await scores(op)).coral;
  await op.fill("#ans-d1-truth", "a"); await click(op, '.slot:has([data-slot="truth"]) [data-act="done"]');
  eq((await scores(op)).coral - o0, 10, "old-style saved points scored with new defaults (flirty truth +10)");
  await click(op, '[data-tab="settings"]');
  eq(await op.inputValue("#s-p-coupon"), "100", "old points: setup shows new coupon default");
  await op.context().close();
}

/* ===================== db mode (fake window.claude, shared in-memory store) ===================== */
console.log("db mode");
const dbStore = new Map(); const dbPages = new Set();
const dmerge = (a, b) => { const o = { ...(a || {}) }; for (const k of Object.keys(b)) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && o[k] && typeof o[k] === "object" ? dmerge(o[k], b[k]) : b[k]; return o; };
const dbSnap = () => JSON.stringify([...dbStore]);
async function dbBroadcast() { const s = dbSnap(); await Promise.all([...dbPages].map((p) => p.evaluate((x) => window.__notify(x), s).catch(() => {}))); }
function fakeClaude({ uid, hold }) {
  window.__uid = uid; window.__hold = hold; window.__store = new Map(); const ls = new Set();
  const snapOf = (path) => { const v = window.__store.get(path); return { exists: v !== undefined, data: () => v === undefined ? undefined : JSON.parse(JSON.stringify(v)), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const colSnap = (c) => ({ docs: [...window.__store].filter(([k]) => k.startsWith(c + "/")).map(([k, v]) => ({ id: k.slice(c.length + 1), data: () => JSON.parse(JSON.stringify(v)) })), metadata: { fromCache: false, hasPendingWrites: false } });
  const fire = () => ls.forEach((f) => f());
  window.__notify = (s) => { window.__store = new Map(JSON.parse(s)); fire(); };
  window.__release = () => { window.__hold = false; fire(); };
  const op = (o, path, data) => window.__op(o, path, data == null ? null : JSON.stringify(data));
  const doc = (path) => ({ set: (d) => op("set", path, d), update: (d) => op("update", path, d), delete: () => op("delete", path),
    onSnapshot(cb) { const f = () => { if (window.__hold && path === "game/state") cb({ exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } }); else cb(snapOf(path)); }; ls.add(f); setTimeout(f, 0); return () => ls.delete(f); } });
  const col = (c) => ({ onSnapshot(cb) { const f = () => cb(colSnap(c)); ls.add(f); setTimeout(f, 0); return () => ls.delete(f); } });
  const dbo = { doc, collection: col };
  window.claude = { use: async (n) => { if (n === "user") return { id: async () => window.__uid, can: async () => true }; await window.__sync(); return dbo; } };
}
async function newDbPage(uid, hold = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  await page.exposeFunction("__op", async (o, path, json) => {
    const d = json == null ? null : JSON.parse(json);
    if (o === "set") dbStore.set(path, d); else if (o === "update") { if (!dbStore.has(path)) throw Object.assign(new Error("nf"), { code: "not_found" }); dbStore.set(path, dmerge(dbStore.get(path), d)); } else dbStore.delete(path);
    await dbBroadcast();
  });
  await page.exposeFunction("__sync", async () => { await page.evaluate((x) => { window.__store = new Map(JSON.parse(x)); }, dbSnap()); });
  await page.addInitScript(fakeClaude, { uid, hold });
  dbPages.add(page);
  await page.goto(URL_);
  return page;
}
async function pinSetup(page) {
  await page.fill("#d-input", "##"); await page.press("#d-input", "Enter");
  await page.fill("#d-pin-a", "4321"); await page.fill("#d-pin-b", "4321"); await click(page, "#d-pin-save");
}
{
  // M3: a cache-only "missing" snapshot never shows first-setup
  const h = await newDbPage("u_h", true);
  await pinSetup(h); await pause(h, 200);
  check(/Connecting/.test(await h.textContent("#game")) && (await h.locator("#s-start").count()) === 0, "db: Connecting… (no setup screen) until a server snapshot");
  await h.evaluate(() => window.__release()); await pause(h, 100);
  check((await h.locator("#s-start").count()) === 1, "db: setup screen after server says no game");
  await h.context().close(); dbPages.delete(h);

  const A = await newDbPage("u_a");
  await pinSetup(A); await A.waitForSelector("#s-start");
  await A.fill("#s-start", "2026-10-11"); await A.fill("#s-days", "6");
  await click(A, '[data-act="savesetup"]'); await A.waitForSelector('[data-act="claim"]');
  check(dbStore.has("game/state"), "db: setup creates game/state");
  await claim(A, "coral"); await A.waitForSelector(".tabs");
  const ck = dbStore.get("game/state").claims.coral;
  check(/^u_a:/.test(ck), "db: coral claimed with uid:device key");

  const B = await newDbPage("u_b");
  await pinSetup(B); await B.waitForSelector('[data-act="claim"]');
  check((await B.locator("#s-start").count()) === 0, "db: second phone sees the picker, not setup");
  const cb = B.locator('[data-act="claim"][data-p="coral"]');
  check(/Taken/.test(await cb.textContent()) && !(await cb.isDisabled()), "db: taken slot is tappable and labelled Taken");
  await claim(B, "riptide"); await B.waitForSelector(".tabs");

  // flip persists
  await click(A, '[data-tab="today"]'); await click(A, '[data-act="flip"]');
  check([...dbStore.keys()].some((k) => k.startsWith("plays/")), "db: flip writes a plays doc");

  // partner confirm, live across two phones (A = Coral, B = Riptide)
  await click(A, '[data-tab="today"]');
  await click(A, '.slot:has([data-slot="night"]) [data-act="flip"]');
  await click(A, '.slot:has([data-slot="night"]) [data-act="done"]');
  const aScore = async () => { await click(A, '[data-tab="scores"]'); const n = await A.$$eval(".score .n", (e) => e.map((x) => +x.textContent)); return n[0]; };
  const before = await aScore();
  await click(B, '[data-tab="scores"]');
  eq(await B.locator('[data-act="confirm"]').count(), 1, "db confirm: Riptide sees the confirm button live");
  await click(B, '[data-act="confirm"]');
  check([...dbStore.keys()].some((k) => /^confirms\/e\d+_riptide$/.test(k)), "db confirm: writes confirms/e{epoch}_riptide");
  await pause(A, 150);
  eq(await aScore(), before + 10, "db confirm: Coral's score updates live (+10)");
  check(/Confirmed by Riptide/.test(await A.textContent("#game")), "db confirm: Coral sees Confirmed by Riptide");

  // M1: release nulls the slot (key kept)
  await click(A, '[data-tab="settings"]'); await click(A, '[data-act="release"]');
  await A.waitForSelector('[data-act="claim"]');
  let cl = dbStore.get("game/state").claims;
  check("coral" in cl && cl.coral === null && /^u_b:/.test(cl.riptide), "db: release sets coral to null, keeps riptide");
  // M2: take over riptide in two taps
  const rb = A.locator('[data-act="claim"][data-p="riptide"]');
  await rb.click(); await pause(A);
  check(/Tap again to take over/.test(await rb.textContent()), "db: first tap asks to confirm takeover");
  check(/^u_b:/.test(dbStore.get("game/state").claims.riptide), "db: first tap does not claim");
  await rb.click(); await pause(A, 100);
  cl = dbStore.get("game/state").claims;
  check(/^u_a:/.test(cl.riptide) && cl.coral === null, "db: second tap takes over riptide");
  check((await A.locator(".tabs").count()) === 1 && (await B.locator('[data-act="claim"]').count()) === 2, "db: A plays, B is bounced to picker");
  await A.context().close(); await B.context().close();

  // (6) db mode: nickname chosen on one phone shows live on the other
  {
    const A2 = await newDbPage("u_a"), B2 = await newDbPage("u_b");
    dbStore.clear(); await dbBroadcast();
    await pinSetup(A2); await A2.waitForSelector("#s-start");
    await A2.fill("#s-start", "2026-10-11"); await A2.fill("#s-days", "6");
    await click(A2, '[data-act="savesetup"]'); await A2.waitForSelector('[data-act="claim"]');
    await pinSetup(B2); await B2.waitForSelector('[data-act="claim"]');
    await click(A2, '[data-act="claim"][data-p="coral"]'); await A2.waitForSelector(".nick");
    await click(B2, '[data-act="claim"][data-p="riptide"]'); await B2.waitForSelector(".nick");
    await A2.fill("#nick-own", "Sandbar"); await click(A2, '[data-act="nickown"]'); await A2.waitForSelector(".tabs");
    await pause(B2, 200);
    check(dbStore.get("game/state").names?.coral === "Sandbar", "db nick: names.coral stored");
    check(await B2.locator(".nick[data-n=\"Mermaid\"]").count() === 1, "db nick: B still on picker");
    await B2.fill("#nick-own", "sandbar"); await click(B2, '[data-act="nickown"]');
    check(/already has that name/.test(await B2.textContent("#toast")), "db nick: B cannot take A's name");
    await B2.fill("#nick-own", "Driftwood"); await click(B2, '[data-act="nickown"]'); await B2.waitForSelector(".tabs");
    await click(B2, '[data-tab="today"]'); await click(A2, '[data-tab="today"]'); await pause(A2, 200);
    check(/Driftwood/.test(await A2.textContent(".partnerline")), "db nick: A sees B's nickname live");
    check(/Sandbar/.test(await B2.textContent(".partnerline")), "db nick: B sees A's nickname live");
    eq(await A2.textContent(".who b"), "Sandbar", "db nick: A header");
    await A2.context().close(); await B2.context().close(); dbPages.delete(A2); dbPages.delete(B2);
  }
}

/* ===================== nicknames ===================== */
console.log("Nicknames");
{
  const np = await newPage();
  await np.fill("#d-input", "##"); await np.press("#d-input", "Enter");
  await np.waitForSelector("#d-pin:not([hidden])");
  await np.fill("#d-pin-a", "4321"); await np.fill("#d-pin-b", "4321"); await click(np, "#d-pin-save");
  await np.waitForSelector("#s-start");
  await np.check("#s-partial"); await np.fill("#s-start", "2026-10-11"); await np.fill("#s-days", "6");
  await click(np, '[data-act="savesetup"]'); await np.waitForSelector('[data-act="claim"]');
  eq((await np.textContent('[data-act="claim"][data-p="coral"]')).includes("Player 1"), true, "pick screen shows Player 1");
  check((await np.textContent('[data-act="claim"][data-p="riptide"]')).includes("Player 2"), "pick screen shows Player 2");
  // (1) picker after first claim, no tab bar
  await click(np, '[data-act="claim"][data-p="coral"]');
  await np.waitForSelector(".nick");
  eq(await np.locator(".tabs").count(), 0, "nickname screen has no tab bar");
  eq(await np.locator(".nick").count(), 12, "12 preset nicknames");
  eq(await np.locator("#nick-own").count(), 1, "custom nickname input present");
  await np.screenshot({ path: join(SHOTS, "nick.png") }); await overflow(np, "nick picker");
  // (2) custom name
  await np.fill("#nick-own", "Sandbar"); await click(np, '[data-act="nickown"]');
  await np.waitForSelector(".tabs");
  eq(await np.textContent(".who b"), "Sandbar", "header shows custom nickname");
  // partner-facing: other seat sees Sandbar disabled-free? (partner name shown in text and disabled in their picker)
  await click(np, '[data-tab="settings"]'); await click(np, '[data-act="release"]');
  await np.waitForSelector('[data-act="claim"]');
  check((await np.textContent('[data-act="claim"][data-p="coral"]')).includes("Sandbar"), "pick screen shows chosen nickname for the seat");
  await click(np, '[data-act="claim"][data-p="riptide"]'); await np.waitForSelector(".nick");
  eq(await np.locator(".tabs").count(), 0, "no tab bar for second seat picker");
  eq(await np.locator(".nick[disabled]").count(), 0, "custom partner name is not a preset, nothing disabled");
  // (4) duplicate of partner's name refused, case-insensitive
  await np.fill("#nick-own", "SANDBAR"); await click(np, '[data-act="nickown"]');
  check(/already has that name/.test(await np.textContent("#toast")), "duplicate of partner's name refused with toast");
  eq(await np.locator(".tabs").count(), 0, "still on picker after refused duplicate");
  // (3) sanitization
  await np.fill("#nick-own", "<b>x</b>"); await click(np, '[data-act="nickown"]');
  await np.waitForSelector(".tabs");
  eq(await np.textContent(".who b"), "bxb", "sanitized name strips < > /");
  eq(await np.locator(".who b b, .who > b > *").count(), 0, "no HTML injected in .who");
  eq(await np.locator("#game b").evaluateAll((e) => e.filter((x) => x.textContent === "x").length), 0, "no <b>x</b> element created");
  // partner-facing text: Riptide seat's partner is Sandbar
  await click(np, '[data-tab="today"]');
  check(/Sandbar/.test(await np.textContent(".partnerline")), "partnerline shows partner's custom nickname");
  await click(np, '[data-tab="scores"]');
  check(/Sandbar/.test(await np.textContent("#game")) && /bxb/.test(await np.textContent("#game")), "Scores shows both nicknames");
  // (5) Change nickname from Setup, and Cancel
  await click(np, '[data-tab="settings"]'); await click(np, '[data-act="gonick"]');
  await np.waitForSelector(".nick");
  eq(await np.locator(".tabs").count(), 1, "tab bar kept when changing nickname");
  check(await np.locator(".nick.on").count() === 0, "custom name not highlighted among presets");
  await click(np, '[data-tab="settings"]');
  eq(await np.locator('[data-act="gonick"]').count(), 1, "Cancel returns to Setup");
  await click(np, '[data-act="gonick"]');
  await click(np, '.nick[data-n="Mermaid"]');
  eq(await np.textContent(".who b"), "Mermaid", "preset nickname applied from Setup");
  eq(await np.locator('[data-act="gonick"]').count(), 1, "returns to Setup after choosing");
  check((await np.textContent("#game")).includes("Switch player"), "Switch player button label");
  // coral seat: Mermaid is disabled for partner
  await click(np, '[data-act="release"]'); await claim(np, "coral");
  await click(np, '[data-tab="settings"]'); await click(np, '[data-act="gonick"]');
  eq(await np.locator('.nick[data-n="Mermaid"]').isDisabled(), true, "partner's preset nickname disabled");
  await np.context().close();
}

/* ===================== wrap up ===================== */
check(consoleErrors.length === 0, "no console/page errors: " + consoleErrors.join(" | "));
await browser.close();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
