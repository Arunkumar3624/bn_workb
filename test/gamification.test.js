import test from "node:test";
import assert from "node:assert/strict";
import { calculateLevel, calculateProgressBar, getTierData } from "../src/utils/gamification.js";

test("calculateLevel starts fresh users at Level 1 with zero/negative/garbage XP", () => {
  assert.equal(calculateLevel(0).currentLevel, 1);
  assert.equal(calculateLevel(-500).currentLevel, 1);
  assert.equal(calculateLevel(undefined).currentLevel, 1);
  assert.equal(calculateLevel(null).currentLevel, 1);
  assert.equal(calculateLevel("not-a-number").currentLevel, 1);
  assert.equal(calculateLevel(NaN).currentLevel, 1);
});

test("calculateLevel never throws across the full realistic XP range", () => {
  for (const xp of [0, 1, 10, 2480, 244000, 1760000, 5590000, 12670000, Number.MAX_SAFE_INTEGER]) {
    assert.doesNotThrow(() => calculateLevel(xp));
  }
});

test("calculateLevel is monotonic — more XP never means a lower level", () => {
  let previousLevel = 1;
  for (const xp of [0, 100, 5000, 50000, 500000, 5000000, 50000000]) {
    const { currentLevel } = calculateLevel(xp);
    assert.ok(currentLevel >= previousLevel, `level regressed at xp=${xp}`);
    previousLevel = currentLevel;
  }
});

test("calculateLevel caps at Level 200 (the design's hard prestige cap) even with absurd XP", () => {
  assert.equal(calculateLevel(1e12).currentLevel, 200);
  const { xpForCurrentLevel, xpForNextLevel } = calculateLevel(1e12);
  assert.equal(xpForCurrentLevel, xpForNextLevel); // no "next level" once maxed
});

test("calculateLevel's xpForCurrentLevel/xpForNextLevel bracket the input XP correctly", () => {
  const xp = 300000;
  const { currentLevel, xpForCurrentLevel, xpForNextLevel } = calculateLevel(xp);
  assert.ok(xp >= xpForCurrentLevel, `xp ${xp} should be >= its own level's floor ${xpForCurrentLevel}`);
  assert.ok(xp < xpForNextLevel, `xp ${xp} should be < the next level's floor ${xpForNextLevel}`);
  assert.ok(currentLevel >= 1 && currentLevel <= 200);
});

test("getTierData maps the exact tier boundaries from MASTER_ECONOMY_PLAN.md Part 5a", () => {
  assert.equal(getTierData(1).tier, "Standard");
  assert.equal(getTierData(49).tier, "Standard");
  assert.equal(getTierData(50).tier, "Silver");
  assert.equal(getTierData(99).tier, "Silver");
  assert.equal(getTierData(100).tier, "Gold");
  assert.equal(getTierData(149).tier, "Gold");
  assert.equal(getTierData(150).tier, "Platinum");
  assert.equal(getTierData(199).tier, "Platinum");
  assert.equal(getTierData(200).tier, "Diamond");
  assert.equal(getTierData(500).tier, "Diamond"); // above cap still reads as Diamond, doesn't throw
});

test("getTierData never returns a raw fee percentage — the Abstracted Ladder's whole point", () => {
  for (const level of [1, 50, 100, 150, 200]) {
    const data = getTierData(level);
    const keys = Object.keys(data);
    assert.deepEqual(keys.sort(), ["colorTheme", "tier"]);
    assert.ok(!("platform_fee_pct" in data) && !("fee" in data) && !("feePct" in data));
  }
});

test("calculateProgressBar stays within [0, 100] across the full XP range, never NaN", () => {
  for (const xp of [0, -100, 1, 2480, 244000, 12670000, 1e12, NaN, undefined]) {
    const pct = calculateProgressBar(xp);
    assert.ok(Number.isFinite(pct), `progress bar returned non-finite value for xp=${xp}`);
    assert.ok(pct >= 0 && pct <= 100, `progress ${pct}% out of range for xp=${xp}`);
  }
});

test("calculateProgressBar returns exactly 100 at the Level 200 cap — no division by zero", () => {
  assert.equal(calculateProgressBar(1e12), 100);
});
